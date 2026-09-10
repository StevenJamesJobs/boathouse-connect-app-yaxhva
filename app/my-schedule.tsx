import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getWeekStartDate, getWeekDays, addWeeks } from '@/utils/dateUtils';
import { fonts } from '@/constants/fonts';
import { IS_MCLOONES } from '@/constants/buildVariant';
import { isManagerOrOwner } from '@/utils/roles';
import { translateServerError } from '@/utils/serverErrors';
import {
  toISODate,
  todayISO,
  addDays,
  isSameDay,
  localeFor,
  formatWeekRange,
  shiftHours,
  type AppLocale,
} from '@/utils/schedule/format';
import { notifyShiftReleased } from '@/utils/schedule/notify';
import { useScheduleSettings } from '@/hooks/useScheduleSettings';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import ShiftRow from '@/components/schedule/ShiftRow';
import ScheduleGearChip from '@/components/schedule/ScheduleGearChip';
import ScheduleNavSheet from '@/components/schedule/ScheduleNavSheet';
import { scheduleHue } from '@/components/schedule/scheduleVisuals';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Pager spans ~1 year: 26 weeks back, 26 weeks forward, centered on today's week.
const WEEKS_BEFORE = 26;
const WEEKS_AFTER = 26;
const TOTAL_WEEKS = WEEKS_BEFORE + WEEKS_AFTER + 1;
const INITIAL_INDEX = WEEKS_BEFORE;

interface Shift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[];
  is_closer: boolean;
  is_opener: boolean;
  is_training: boolean;
  room_assignment: string | null;
}

/** One row of get_my_shift_releases (live + recently decided). */
interface ShiftRelease {
  release_id: string;
  shift_id: string;
  status: string;
  claimed_by: string | null;
  claimed_by_name: string | null;
  decided_at: string | null;
  decision_reason: string | null;
}

/**
 * Only LIVE rows drive the pills. A denied pick-up re-opens server-side (a
 * fresh `open` row is inserted), so the denied row itself never wins; a shift
 * with nothing live simply shows the Release chip again.
 */
function liveReleasesByShift(rows: ShiftRelease[]): Record<string, ShiftRelease> {
  const map: Record<string, ShiftRelease> = {};
  for (const r of rows) {
    if (r.status !== 'open' && r.status !== 'claimed') continue;
    const prev = map[r.shift_id];
    if (!prev || (r.status === 'claimed' && prev.status !== 'claimed')) map[r.shift_id] = r;
  }
  return map;
}

export default function MyScheduleScreen() {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { user } = useAuth();
  const { language } = useLanguage();
  const locale = localeFor(language);
  const { t } = useTranslation();
  const { settings } = useScheduleSettings();
  const showGear = isManagerOrOwner(user);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPageIndex, setCurrentPageIndex] = useState(INITIAL_INDEX);
  const [lastUploadAt, setLastUploadAt] = useState<string | null>(null);
  const [releases, setReleases] = useState<Record<string, ShiftRelease>>({});
  const [busyShiftId, setBusyShiftId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const pagerRef = useRef<FlatList<Date>>(null);

  // The anchor week is the week containing today (Sunday). Pages are offsets from it.
  const anchorWeekStart = useMemo(() => getWeekStartDate(new Date()), []);

  // Build the list of week-start dates for all pages.
  const weekStarts = useMemo(() => {
    return Array.from({ length: TOTAL_WEEKS }, (_, i) =>
      addWeeks(anchorWeekStart, i - WEEKS_BEFORE)
    );
  }, [anchorWeekStart]);

  const loadReleases = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.rpc('get_my_shift_releases', { p_actor_id: user.id });
    if (error) {
      console.error('Error loading shift releases:', error);
      return;
    }
    setReleases(liveReleasesByShift((data || []) as ShiftRelease[]));
  }, [user?.id]);

  const loadSchedule = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Fetch shifts for the full pager range (one query instead of per-page).
      const rangeStart = weekStarts[0];
      const rangeEnd = addDays(weekStarts[weekStarts.length - 1], 6);

      // Self-only RPC: the server returns the acting user's shifts, nobody else's.
      const { data, error } = await supabase.rpc('get_my_shifts', {
        p_actor_id: user.id,
        p_start_date: toISODate(rangeStart),
        p_end_date: toISODate(rangeEnd),
      });

      if (error) throw error;
      setShifts(data || []);

      const { data: uploadAt } = await supabase.rpc('get_latest_schedule_upload_at', {
        p_actor_id: user.id,
      });
      setLastUploadAt((uploadAt as string | null) ?? null);
    } catch (error) {
      console.error('Error loading schedule:', error);
    } finally {
      // The spinner only guards the FIRST load; later focuses refresh in place so
      // the pager keeps its page (a remount would snap back to today's week).
      setLoading(false);
    }
  }, [user?.id, weekStarts]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        loadSchedule();
        loadReleases();
      }
    }, [user?.id, loadSchedule, loadReleases])
  );

  // ─── Release actions ───

  const doRelease = useCallback(
    async (shift: Shift) => {
      if (!user?.id) return;
      setBusyShiftId(shift.id);
      try {
        const { data: releaseId, error } = await supabase.rpc('release_shift', {
          p_actor_id: user.id,
          p_shift_id: shift.id,
        });
        if (error) throw error;
        if (releaseId) {
          // fire-and-forget: the release already succeeded
          void notifyShiftReleased({ id: user.id, name: user.name }, releaseId, shift);
        }
        await loadReleases();
      } catch (e) {
        Alert.alert(
          t('common.error'),
          translateServerError(e as { message?: string | null }, t('my_schedule.release_failed'))
        );
      } finally {
        setBusyShiftId(null);
      }
    },
    [user?.id, user?.name, loadReleases, t]
  );

  const confirmRelease = useCallback(
    (shift: Shift) => {
      Alert.alert(t('my_schedule.release_confirm_title'), t('my_schedule.release_confirm_msg'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('my_schedule.release'), onPress: () => doRelease(shift) },
      ]);
    },
    [t, doRelease]
  );

  const doCancelRelease = useCallback(
    async (shift: Shift, release: ShiftRelease) => {
      if (!user?.id) return;
      setBusyShiftId(shift.id);
      try {
        const { error } = await supabase.rpc('cancel_shift_release', {
          p_actor_id: user.id,
          p_release_id: release.release_id,
        });
        if (error) throw error;
        await loadReleases();
      } catch (e) {
        Alert.alert(
          t('common.error'),
          translateServerError(e as { message?: string | null }, t('my_schedule.cancel_release_failed'))
        );
      } finally {
        setBusyShiftId(null);
      }
    },
    [user?.id, loadReleases, t]
  );

  const confirmCancelRelease = useCallback(
    (shift: Shift, release: ShiftRelease) => {
      Alert.alert(t('my_schedule.cancel_release_title'), t('my_schedule.cancel_release_msg'), [
        { text: t('common.not_now'), style: 'cancel' },
        {
          text: t('my_schedule.cancel_release'),
          style: 'destructive',
          onPress: () => doCancelRelease(shift, release),
        },
      ]);
    },
    [t, doCancelRelease]
  );

  // ─── Pager mechanics (unchanged) ───

  const onMomentumScrollEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SCREEN_WIDTH);
    if (newIndex >= 0 && newIndex < TOTAL_WEEKS && newIndex !== currentPageIndex) {
      setCurrentPageIndex(newIndex);
    }
  };

  const goToPrevWeek = () => {
    if (currentPageIndex > 0) {
      pagerRef.current?.scrollToIndex({ index: currentPageIndex - 1, animated: true });
    }
  };

  const goToNextWeek = () => {
    if (currentPageIndex < TOTAL_WEEKS - 1) {
      pagerRef.current?.scrollToIndex({ index: currentPageIndex + 1, animated: true });
    }
  };

  const currentWeekStart = weekStarts[currentPageIndex];
  const weekLabel = formatWeekRange(toISODate(currentWeekStart), toISODate(addDays(currentWeekStart, 6)), locale);

  const today = todayISO();
  const releaseEnabled = settings.shiftReleaseEnabled;

  // Everything a page reads besides its own week — handed to the FlatList as
  // extraData so the cells re-render when a release lands or shifts reload.
  const pageData = useMemo(
    () => ({ shifts, releases, releaseEnabled, busyShiftId }),
    [shifts, releases, releaseEnabled, busyShiftId]
  );

  const stampText = useMemo(() => {
    if (!lastUploadAt) return null;
    const d = new Date(lastUploadAt);
    return t('my_schedule.last_updated_at', {
      date: d.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }),
    });
  }, [lastUploadAt, locale, t]);

  const renderWeekPage = ({ item: weekStart }: { item: Date }) => {
    const days = getWeekDays(weekStart);
    const now = new Date();

    return (
      <View style={{ width: SCREEN_WIDTH }}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {days.map((day) => {
            const dayIso = toISODate(day);
            const dayShifts = pageData.shifts.filter((s) => s.shift_date === dayIso);
            return (
              <DayCard
                key={dayIso}
                day={day}
                dayIso={dayIso}
                shifts={dayShifts}
                isToday={isSameDay(day, now)}
                isFuture={dayIso >= today}
                releases={pageData.releases}
                releaseEnabled={pageData.releaseEnabled}
                busyShiftId={pageData.busyShiftId}
                locale={locale}
                isDark={isDark}
                onRelease={confirmRelease}
                onCancelRelease={confirmCancelRelease}
              />
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const prevDisabled = currentPageIndex <= 0;
  const nextDisabled = currentPageIndex >= TOTAL_WEEKS - 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('my_schedule.title')}
        right={showGear ? <ScheduleGearChip onPress={() => setNavOpen(true)} /> : undefined}
        rightWide={showGear}
      />

      {/* Week navigation */}
      <View style={styles.weekNavBar}>
        <Pressable
          onPress={goToPrevWeek}
          disabled={prevDisabled}
          hitSlop={6}
          accessibilityRole="button"
          style={[
            styles.weekNavChip,
            { backgroundColor: colors.glass, borderColor: colors.glassBorder },
            prevDisabled && styles.weekNavChipDisabled,
          ]}
        >
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.weekNavCenter}>
          <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={15} color={colors.tint} />
          <Text style={[styles.weekNavLabel, { color: colors.text }]} numberOfLines={1}>
            {weekLabel}
          </Text>
        </View>
        <Pressable
          onPress={goToNextWeek}
          disabled={nextDisabled}
          hitSlop={6}
          accessibilityRole="button"
          style={[
            styles.weekNavChip,
            { backgroundColor: colors.glass, borderColor: colors.glassBorder },
            nextDisabled && styles.weekNavChipDisabled,
          ]}
        >
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Last updated stamp + variant note */}
      <GlassCard variant="glass" radius={12} style={styles.stampCard}>
        <View style={styles.stampRow}>
          <IconSymbol ios_icon_name="clock.fill" android_material_icon_name="schedule" size={14} color={colors.tint} />
          <View style={styles.stampBody}>
            {!!stampText && (
              <Text style={[styles.stampText, { color: colors.text }]}>{stampText}</Text>
            )}
            <Text style={[styles.stampNote, { color: colors.textSecondary }]}>
              {IS_MCLOONES ? t('my_schedule.r365_note') : t('my_schedule.tools_note')}
            </Text>
          </View>
        </View>
      </GlassCard>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loadingIndicator} />
      ) : (
        <FlatList
          ref={pagerRef}
          style={{ flex: 1 }}
          data={weekStarts}
          extraData={pageData}
          keyExtractor={(item) => toISODate(item)}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          initialScrollIndex={INITIAL_INDEX}
          renderItem={renderWeekPage}
        />
      )}

      <ScheduleNavSheet visible={navOpen} onClose={() => setNavOpen(false)} current="my-schedule" />
    </View>
  );
}

// -------- DayCard: one glass surface per day (date tile + shift rows / "Not scheduled") --------

interface DayCardProps {
  day: Date;
  dayIso: string;
  shifts: Shift[];
  isToday: boolean;
  isFuture: boolean;
  releases: Record<string, ShiftRelease>;
  releaseEnabled: boolean;
  busyShiftId: string | null;
  locale: AppLocale;
  isDark: boolean;
  onRelease: (shift: Shift) => void;
  onCancelRelease: (shift: Shift, release: ShiftRelease) => void;
}

function DayCard({
  day,
  shifts,
  isToday,
  isFuture,
  releases,
  releaseEnabled,
  busyShiftId,
  locale,
  isDark,
  onRelease,
  onCancelRelease,
}: DayCardProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const weekday = day.toLocaleDateString(locale, { weekday: 'short' });
  const dayNumber = day.getDate();
  const gold = scheduleHue('pending', isDark);

  // the row's right-edge control: Release chip · "Released · open" (tap = cancel) ·
  // "Awaiting approval" with the claimer's name underneath
  const renderReleaseControl = (shift: Shift): React.ReactNode => {
    if (!releaseEnabled || !isFuture) return undefined;
    const release = releases[shift.id];
    const busy = busyShiftId === shift.id;

    if (!release) {
      return (
        <View style={styles.releaseCol}>
          <Pressable
            onPress={() => onRelease(shift)}
            disabled={busy}
            hitSlop={4}
            accessibilityRole="button"
            style={[
              styles.releaseChip,
              { backgroundColor: colors.glass, borderColor: colors.primary + '40' },
              busy && styles.busy,
            ]}
          >
            <IconSymbol
              ios_icon_name="arrow.left.arrow.right"
              android_material_icon_name="swap-horiz"
              size={13}
              color={colors.primary}
            />
            <Text style={[styles.releaseChipText, { color: colors.primary }]}>{t('my_schedule.release')}</Text>
          </Pressable>
        </View>
      );
    }

    const pill = (
      <View style={[styles.statusPill, { backgroundColor: gold + '29', borderColor: gold + '57' }, busy && styles.busy]}>
        <Text style={[styles.statusPillText, { color: gold }]} numberOfLines={1}>
          {release.status === 'claimed' ? t('my_schedule.awaiting_approval') : t('my_schedule.released_open')}
        </Text>
      </View>
    );

    if (release.status === 'claimed') {
      return (
        <View style={styles.releaseCol}>
          {pill}
          {!!release.claimed_by_name && (
            <Text style={[styles.releaseSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('my_schedule.claimed_by', { name: release.claimed_by_name })}
            </Text>
          )}
        </View>
      );
    }

    // open → tap to cancel while it's still open
    return (
      <View style={styles.releaseCol}>
        <Pressable
          onPress={() => onCancelRelease(shift, release)}
          disabled={busy}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('my_schedule.cancel_release')}
        >
          {pill}
        </Pressable>
      </View>
    );
  };

  return (
    <GlassCard variant="surface" radius={16} style={styles.dayCard}>
      <View style={styles.dayCardRow}>
        <View
          style={[
            styles.dateTile,
            isToday
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
          ]}
        >
          <Text style={[styles.dateTileDay, { color: isToday ? colors.fireText : colors.textSecondary }]} numberOfLines={1}>
            {weekday}
          </Text>
          <Text style={[styles.dateTileNumber, { color: isToday ? colors.fireText : colors.text }]}>{dayNumber}</Text>
        </View>

        <View style={styles.dayCardBody}>
          {shifts.length === 0 ? (
            <Text style={[styles.emptyDayText, { color: colors.textSecondary }]}>{t('my_schedule.not_scheduled')}</Text>
          ) : (
            shifts.map((shift, idx) => (
              // stacked: time + hours on line one, role + O/C/T tags under them, the
              // Release control alone on the right (Steve's device round, s83)
              <ShiftRow
                key={shift.id}
                shift={shift}
                showDay={false}
                first={idx === 0}
                stacked
                timeTrailing={
                  <View style={[styles.durationBadge, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                    <Text style={[styles.durationText, { color: colors.textSecondary }]}>
                      {t('my_schedule.hours_short', { n: shiftHours(shift.start_time, shift.end_time) })}
                    </Text>
                  </View>
                }
                trailing={renderReleaseControl(shift)}
              />
            ))
          )}
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  weekNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 2,
    gap: 10,
  },
  weekNavChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekNavChipDisabled: {
    opacity: 0.4,
  },
  weekNavCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  weekNavLabel: {
    fontFamily: fonts.display.semibold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  stampCard: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  stampRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stampBody: {
    flex: 1,
    gap: 2,
  },
  stampText: {
    fontFamily: fonts.body.semibold,
    fontSize: 12.5,
    lineHeight: 17,
  },
  stampNote: {
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    lineHeight: 16,
  },
  loadingIndicator: {
    marginTop: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 8,
  },
  dayCard: {
    // GlassCard owns the fill/border; this is the inner spacing
  },
  dayCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
  },
  dateTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateTileDay: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  dateTileNumber: {
    fontFamily: fonts.display.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    marginTop: 1,
  },
  dayCardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  emptyDayText: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
  },
  durationBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  durationText: {
    fontFamily: fonts.mono.medium,
    fontSize: 10.5,
    fontVariant: ['tabular-nums'],
  },
  releaseCol: {
    alignItems: 'flex-end',
    gap: 4,
    maxWidth: 150,
  },
  releaseSub: {
    maxWidth: 150,
    fontFamily: fonts.body.regular,
    fontSize: 11,
    textAlign: 'right',
  },
  releaseChip: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  releaseChipText: {
    fontFamily: fonts.body.semibold,
    fontSize: 12,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  statusPillText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  busy: {
    opacity: 0.5,
  },
});
