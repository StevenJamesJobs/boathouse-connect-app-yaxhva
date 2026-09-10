import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Dimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { IconSymbol } from '@/components/IconSymbol';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import { StorageExpoImage } from '@/components/StorageImage';
import WeeklyCalendarStrip from '@/components/WeeklyCalendarStrip';
import PortalTabBarStatic from '@/components/PortalTabBarStatic';
import ScheduleGearChip from '@/components/schedule/ScheduleGearChip';
import ScheduleNavSheet from '@/components/schedule/ScheduleNavSheet';
import ShiftRow from '@/components/schedule/ShiftRow';
import ShiftEditSheet, { type ShiftLike } from '@/components/schedule/ShiftEditSheet';
import { scheduleHue } from '@/components/schedule/scheduleVisuals';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import { useScheduleSettings } from '@/hooks/useScheduleSettings';
import { isManagerOrOwner } from '@/utils/roles';
import { getOrgDirectory, type OrgDirectoryRow } from '@/utils/orgDirectory';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import {
  localeFor,
  toISODate,
  isSameDay,
  formatDateLong,
  shiftHalf,
  initialsOf,
} from '@/utils/schedule/format';

/**
 * Roster (s83 glass rebuild) — who's on, one HALF-DAY per page.
 *
 * The pager is `days × 2`: a swipe goes AM → PM → next day AM → PM …, so the
 * AM / PM pills both REFLECT the pager (which half is on screen) and DRIVE it
 * (tap = jump within the day). The strip follows the day and a strip tap lands
 * on that day's AM. Shifts are fetched and cached BY DAY (get_org_roster) and
 * split client-side against the org's AM/PM cutoff (Schedule Settings, default
 * noon — the split the roster has always used).
 */
interface RosterShift extends ShiftLike {
  upload_id: string;
}

type DayPart = 'AM' | 'PM';

interface RosterPage {
  dayIndex: number;
  part: DayPart;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAYS_BEFORE = 30;
const DAYS_AFTER = 30;
const TOTAL_DAYS = DAYS_BEFORE + DAYS_AFTER + 1;
const INITIAL_INDEX = DAYS_BEFORE;
const TOTAL_PAGES = TOTAL_DAYS * 2;

const pageIndexOf = (dayIndex: number, part: DayPart) => dayIndex * 2 + (part === 'PM' ? 1 : 0);

/** The half-day pages, fixed for the lifetime of the module (days are derived from the index). */
const PAGES: RosterPage[] = Array.from({ length: TOTAL_PAGES }, (_, i) => ({
  dayIndex: Math.floor(i / 2),
  part: i % 2 === 1 ? 'PM' : 'AM',
}));

function groupByRole(shifts: RosterShift[], fallback: string): { role: string; shifts: RosterShift[] }[] {
  const map = new Map<string, RosterShift[]>();
  shifts.forEach((s) => {
    const role = s.roles && s.roles.length ? s.roles[0] : fallback;
    const list = map.get(role) ?? [];
    list.push(s);
    map.set(role, list);
  });
  return Array.from(map.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((role) => ({
      role,
      shifts: (map.get(role) ?? []).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    }));
}

/** 34pt initials avatar (profile picture when the directory has one). */
function RosterAvatar({
  name,
  pictureUrl,
  onPress,
}: {
  name: string;
  pictureUrl?: string | null;
  onPress?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={4}
      style={[styles.avatar, { backgroundColor: colors.primary + '2E' }]}
    >
      {pictureUrl ? (
        <StorageExpoImage source={{ uri: pictureUrl }} style={styles.avatarImage} contentFit="cover" />
      ) : (
        <Text style={[styles.avatarText, { color: colors.primary }]}>{initialsOf(name)}</Text>
      )}
    </Pressable>
  );
}

/** One of the two 38pt AM / PM glass segments — active = the day-part hue tint. */
function DayPartPill({
  part,
  label,
  count,
  active,
  hue,
  onPress,
}: {
  part: DayPart;
  label: string;
  count: number;
  active: boolean;
  hue: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const ink = active ? hue : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} ${count}`}
      style={[
        styles.pill,
        { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        active && { backgroundColor: hexToRgba(hue, 0.18), borderColor: hexToRgba(hue, 0.4) },
      ]}
    >
      <IconSymbol
        ios_icon_name={part === 'AM' ? 'sun.max.fill' : 'moon.fill'}
        android_material_icon_name={part === 'AM' ? 'wb-sunny' : 'nightlight-round'}
        size={15}
        color={ink}
      />
      <Text style={[styles.pillLabel, { color: ink }]}>{label}</Text>
      <View style={[styles.bubble, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <Text style={[styles.bubbleText, { color: ink }]}>{count}</Text>
      </View>
    </Pressable>
  );
}

/** Mono stat pill on the date line (Total · AM · PM), 18% fill / 40% border of its hue. */
function StatPill({ value, label, hue }: { value: number; label: string; hue: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: hexToRgba(hue, 0.18), borderColor: hexToRgba(hue, 0.4) }]}>
      <Text style={[styles.statValue, { color: hue }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: hue }]}>{label}</Text>
    </View>
  );
}

/** The role rule — the SectionRule grammar (mono uppercase + line) with a primary label and a count bubble. */
function RoleRule({ label, count }: { label: string; count: number }) {
  const colors = useThemeColors();
  return (
    <View style={styles.rule}>
      <Text style={[styles.ruleLabel, { color: colors.primary }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.ruleLine, { backgroundColor: colors.hairline }]} />
      <View style={[styles.ruleBubble, { backgroundColor: colors.blue + '38' }]}>
        <Text style={[styles.ruleBubbleText, { color: colors.blueText }]}>{count}</Text>
      </View>
    </View>
  );
}

function EmptyHalf({ part, hue }: { part: DayPart; hue: string }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <GlassCard variant="surface" radius={16} style={styles.emptyCard}>
      <View style={[styles.emptyGlyph, { backgroundColor: hexToRgba(hue, 0.18), borderColor: hexToRgba(hue, 0.4) }]}>
        <IconSymbol
          ios_icon_name={part === 'AM' ? 'sun.max.fill' : 'moon.fill'}
          android_material_icon_name={part === 'AM' ? 'wb-sunny' : 'nightlight-round'}
          size={22}
          color={hue}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {part === 'AM' ? t('roster.empty_am') : t('roster.empty_pm')}
      </Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
        {part === 'AM' ? t('roster.empty_am_body') : t('roster.empty_pm_body')}
      </Text>
    </GlassCard>
  );
}

export default function TodaysRosterScreen() {
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const locale = localeFor(language);
  const { user } = useAuth();
  // Roster is view-all; only managers/owners can add or edit shifts.
  const canEdit = isManagerOrOwner(user);
  const { open: openMiniProfile } = useMiniProfile();
  const { settings } = useScheduleSettings();
  const cutoff = settings.rosterPmCutoff;
  const amHue = scheduleHue('am', isDark);
  const pmHue = scheduleHue('pm', isDark);

  // Build the ±30 day window anchored on today (stable for the lifetime of the screen).
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: TOTAL_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + (i - DAYS_BEFORE));
      return d;
    });
  }, []);

  // The pager index is a HALF-DAY: dayIndex * 2 + (PM ? 1 : 0).
  const [pageIndex, setPageIndex] = useState(INITIAL_INDEX * 2);
  const currentDay = Math.floor(pageIndex / 2);
  const currentPart: DayPart = pageIndex % 2 === 1 ? 'PM' : 'AM';
  const selectedDate = days[currentDay];
  const currentIso = toISODate(selectedDate);
  const currentDayRef = useRef(currentDay);
  currentDayRef.current = currentDay;

  // Per-DAY cache (the RPC is per day; the halves are split client-side).
  const [shiftsByDate, setShiftsByDate] = useState<Record<string, RosterShift[]>>({});
  const inFlightRef = useRef<Set<string>>(new Set());
  const [directory, setDirectory] = useState<Record<string, OrgDirectoryRow>>({});

  const [navOpen, setNavOpen] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetMode, setSheetMode] = useState<'add' | 'edit'>('add');
  const [sheetShift, setSheetShift] = useState<RosterShift | undefined>(undefined);

  const pagerRef = useRef<FlatList<RosterPage>>(null);

  const loadDay = useCallback(
    async (iso: string, force = false) => {
      if (!user?.id) return;
      if (!force && inFlightRef.current.has(iso)) return;
      inFlightRef.current.add(iso);
      try {
        // Member-gated org roster (the server enforces the owner's staff_can_view_roster
        // setting for employees; managers/owners always pass).
        const { data, error } = await supabase.rpc('get_org_roster', {
          p_actor_id: user.id,
          p_date: iso,
        });
        if (error) throw error;
        setShiftsByDate((prev) => ({ ...prev, [iso]: (data || []) as RosterShift[] }));
      } catch (e) {
        console.error('[roster] get_org_roster error:', e);
        // Never leave a page spinning: an unreadable day reads as empty.
        setShiftsByDate((prev) => (prev[iso] === undefined ? { ...prev, [iso]: [] } : prev));
      } finally {
        inFlightRef.current.delete(iso);
      }
    },
    [user?.id]
  );

  // Prefetch by DAY — [d-1, d, d+1] whenever the day changes (AM ↔ PM never refetches).
  useEffect(() => {
    [currentDay - 1, currentDay, currentDay + 1]
      .filter((i) => i >= 0 && i < TOTAL_DAYS)
      .forEach((i) => {
        const iso = toISODate(days[i]);
        if (shiftsByDate[iso] === undefined) loadDay(iso);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDay, loadDay]);

  // On focus, reload the current day so edits made elsewhere (Schedules, Review)
  // show up immediately when returning to the Roster.
  useFocusEffect(
    useCallback(() => {
      loadDay(toISODate(days[currentDayRef.current]), true);
    }, [days, loadDay])
  );

  // The org directory, once — avatars for the rows that resolved to a user.
  useEffect(() => {
    let alive = true;
    getOrgDirectory(user?.id).then((rows) => {
      if (!alive) return;
      const map: Record<string, OrgDirectoryRow> = {};
      rows.forEach((r) => {
        map[r.id] = r;
      });
      setDirectory(map);
    });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const goToPage = useCallback(
    (target: number) => {
      const idx = Math.max(0, Math.min(TOTAL_PAGES - 1, target));
      if (idx === pageIndex) return;
      // Animate short hops (within the day / the neighbours); a far strip jump
      // would scroll through pages the window hasn't rendered yet.
      pagerRef.current?.scrollToIndex({ index: idx, animated: Math.abs(idx - pageIndex) <= 3 });
      setPageIndex(idx);
    },
    [pageIndex]
  );

  // Strip tap → that day's AM.
  const handleSelectDate = (date: Date | null) => {
    if (!date) return;
    const idx = days.findIndex((d) => isSameDay(d, date));
    if (idx >= 0) goToPage(pageIndexOf(idx, 'AM'));
  };

  // Swipe → derive { dayIndex, part } from the page; the strip and the pills follow.
  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (idx >= 0 && idx < TOTAL_PAGES && idx !== pageIndex) setPageIndex(idx);
  };

  const currentShifts = shiftsByDate[currentIso] ?? [];
  const amCount = currentShifts.filter((s) => shiftHalf(s.start_time, cutoff) === 'AM').length;
  const pmCount = currentShifts.length - amCount;
  const isViewingToday = isSameDay(selectedDate, new Date());
  const dateStr = formatDateLong(currentIso, locale);

  const openAddShift = () => {
    setSheetMode('add');
    setSheetShift(undefined);
    setSheetVisible(true);
  };

  const openEditShift = (shift: RosterShift) => {
    setSheetMode('edit');
    setSheetShift(shift);
    setSheetVisible(true);
  };

  // After save/delete: the editor can move a shift to another day, so refresh the
  // visible neighbourhood and drop the rest of the cache (it refills on arrival).
  const handleShiftSaved = () => {
    const keep = [currentDay - 1, currentDay, currentDay + 1]
      .filter((i) => i >= 0 && i < TOTAL_DAYS)
      .map((i) => toISODate(days[i]));
    setShiftsByDate((prev) => {
      const next: Record<string, RosterShift[]> = {};
      keep.forEach((iso) => {
        if (prev[iso] !== undefined) next[iso] = prev[iso];
      });
      return next;
    });
    keep.forEach((iso) => loadDay(iso, true));
  };

  const renderPage = ({ item }: { item: RosterPage }) => {
    const iso = toISODate(days[item.dayIndex]);
    const dayShifts = shiftsByDate[iso];
    const hue = item.part === 'AM' ? amHue : pmHue;

    if (dayShifts === undefined) {
      return (
        <View style={styles.page}>
          <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
        </View>
      );
    }

    const half = dayShifts.filter((s) => shiftHalf(s.start_time, cutoff) === item.part);
    const groups = groupByRole(half, t('roster.other'));

    return (
      <View style={styles.page}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {half.length === 0 ? (
            <EmptyHalf part={item.part} hue={hue} />
          ) : (
            groups.map((group, gi) => (
              <View key={group.role} style={gi > 0 && styles.groupGap}>
                <RoleRule label={group.role} count={group.shifts.length} />
                <GlassCard variant="surface" radius={16} style={styles.card}>
                  {group.shifts.map((shift, i) => {
                    const person = shift.user_id ? directory[shift.user_id] : undefined;
                    const openProfile = shift.user_id
                      ? () => openMiniProfile(shift.user_id as string)
                      : undefined;
                    return (
                      <ShiftRow
                        key={shift.id}
                        first={i === 0}
                        showDay={false}
                        // The role lives in the rule above — the row's pill would repeat it
                        // and take the room the employee name needs.
                        shift={{ ...shift, roles: [] }}
                        leading={
                          <View style={styles.lead}>
                            <RosterAvatar
                              name={shift.employee_name}
                              pictureUrl={person?.profile_picture_url}
                              onPress={openProfile}
                            />
                            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                              {shift.employee_name}
                            </Text>
                          </View>
                        }
                        // Managers tap the row to edit; everyone else opens the coworker's
                        // mini-profile (managers still reach it through the avatar).
                        onPress={canEdit ? () => openEditShift(shift) : openProfile}
                      />
                    );
                  })}
                </GlassCard>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('roster.title')}
        rightWide
        right={<ScheduleGearChip onPress={() => setNavOpen(true)} />}
      />

      {/* Weekly calendar strip — edge-to-edge, its geometry is locked. `card` is
          transparent on purpose: the strip's own card band read as a pre-glass
          leftover against the AmbientGlow (Steve's device round, s83). */}
      <WeeklyCalendarStrip
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        colors={{
          primary: colors.primary,
          fireText: colors.fireText,
          background: colors.background,
          text: colors.text,
          textSecondary: colors.textSecondary,
          card: 'transparent',
        }}
        events={[]}
        edgeToEdge
        hideViewTopEvents
      />

      {/* Date + stats line */}
      <GlassCard variant="glass" radius={16} style={styles.dateCard}>
        <Text style={[styles.dateText, { color: colors.text }]} numberOfLines={1}>
          {isViewingToday ? `${t('roster.today')} · ` : ''}
          {dateStr}
        </Text>
        <View style={styles.statsRow}>
          <StatPill value={currentShifts.length} label={t('roster.total')} hue={colors.primary} />
          <StatPill value={amCount} label={t('roster.am')} hue={amHue} />
          <StatPill value={pmCount} label={t('roster.pm')} hue={pmHue} />
        </View>
      </GlassCard>

      {/* AM / PM pills — reflect and drive the half-day pager */}
      <View style={styles.pills}>
        <DayPartPill
          part="AM"
          label={t('roster.am')}
          count={amCount}
          active={currentPart === 'AM'}
          hue={amHue}
          onPress={() => goToPage(pageIndexOf(currentDay, 'AM'))}
        />
        <DayPartPill
          part="PM"
          label={t('roster.pm')}
          count={pmCount}
          active={currentPart === 'PM'}
          hue={pmHue}
          onPress={() => goToPage(pageIndexOf(currentDay, 'PM'))}
        />
      </View>

      {/* Horizontal half-day pager — AM → PM → next day AM → PM … */}
      <FlatList
        ref={pagerRef}
        data={PAGES}
        keyExtractor={(p) => `${p.dayIndex}-${p.part}`}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={INITIAL_INDEX * 2}
        getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        extraData={{ shiftsByDate, directory, cutoff, canEdit }}
        removeClippedSubviews={false}
        windowSize={5}
        style={styles.pager}
      />

      {/* Floating + — managers/owners only; sits above the floating tab bar */}
      {canEdit && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={openAddShift}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('roster.add_shift')}
        >
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={28} color={colors.fireText} />
        </TouchableOpacity>
      )}

      {/* Floating tab bar — the caller's portal bar, navigates back on tap */}
      <PortalTabBarStatic />

      <ShiftEditSheet
        visible={sheetVisible}
        mode={sheetMode}
        shift={sheetShift}
        defaultDate={selectedDate}
        onClose={() => setSheetVisible(false)}
        onSaved={handleShiftSaved}
      />

      <ScheduleNavSheet visible={navOpen} onClose={() => setNavOpen(false)} current="roster" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  dateCard: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  dateText: { fontFamily: fonts.display.semibold, fontSize: 15, letterSpacing: -0.2 },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  statValue: { fontFamily: fonts.mono.semibold, fontSize: 12, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: fonts.mono.medium, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },

  pills: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 10 },
  pill: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  pillLabel: { fontFamily: fonts.body.semibold, fontSize: 13 },
  bubble: {
    minWidth: 18,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 5,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleText: { fontFamily: fonts.mono.semibold, fontSize: 9 },

  pager: { flex: 1 },
  page: { width: SCREEN_WIDTH },
  loading: { marginTop: 40 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 200 },
  groupGap: { marginTop: 16 },

  rule: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginHorizontal: 2 },
  ruleLabel: { fontFamily: fonts.mono.semibold, fontSize: 11, letterSpacing: 1.5, flexShrink: 1 },
  ruleLine: { flex: 1, height: 1 },
  ruleBubble: { minWidth: 17, height: 16, borderRadius: 8, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  ruleBubbleText: { fontFamily: fonts.mono.semibold, fontSize: 9 },

  card: { paddingHorizontal: 12, paddingVertical: 3 },
  lead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 34, height: 34, borderRadius: 17 },
  avatarText: { fontFamily: fonts.display.bold, fontSize: 12 },
  name: { fontFamily: fonts.body.semibold, fontSize: 13, width: 92 },

  emptyCard: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 6 },
  emptyGlyph: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontFamily: fonts.display.semibold, fontSize: 16 },
  emptyBody: { fontFamily: fonts.body.regular, fontSize: 13, lineHeight: 18, textAlign: 'center' },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 110,
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1001,
  },
});
