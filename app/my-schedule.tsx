import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  FlatList,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getWeekStartDate, getWeekDays, addWeeks, isSameDay } from '@/utils/dateUtils';

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

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function MyScheduleScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { t } = useTranslation();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPageIndex, setCurrentPageIndex] = useState(INITIAL_INDEX);
  const [lastUploadAt, setLastUploadAt] = useState<string | null>(null);
  const pagerRef = useRef<FlatList>(null);

  // The anchor week is the week containing today (Sunday). Pages are offsets from it.
  const anchorWeekStart = useMemo(() => getWeekStartDate(new Date()), []);

  // Build the list of week-start dates for all pages.
  const weekStarts = useMemo(() => {
    return Array.from({ length: TOTAL_WEEKS }, (_, i) =>
      addWeeks(anchorWeekStart, i - WEEKS_BEFORE)
    );
  }, [anchorWeekStart]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) loadSchedule();
    }, [user?.id])
  );

  const loadSchedule = async () => {
    try {
      setLoading(true);

      // Fetch shifts for the full pager range (one query instead of per-page).
      const rangeStart = weekStarts[0];
      const rangeEnd = new Date(weekStarts[weekStarts.length - 1]);
      rangeEnd.setDate(rangeEnd.getDate() + 6);

      const { data, error } = await supabase
        .from('staff_schedules')
        .select('id, shift_date, start_time, end_time, roles, is_closer, is_opener, is_training, room_assignment')
        .eq('user_id', user?.id as string)
        .gte('shift_date', toISODate(rangeStart))
        .lte('shift_date', toISODate(rangeEnd))
        .order('shift_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      setShifts(data || []);

      const { data: uploadData } = await (supabase as any)
        .from('schedule_uploads')
        .select('created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1);
      setLastUploadAt(uploadData?.[0]?.created_at ?? null);
    } catch (error) {
      console.error('Error loading schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const getShiftDuration = (start: string, end: string) => {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

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

  const formatWeekHeader = (weekStart: Date) => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const sameMonth = weekStart.getMonth() === end.getMonth();
    const startFmt = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endFmt = sameMonth
      ? end.toLocaleDateString('en-US', { day: 'numeric' })
      : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startFmt} – ${endFmt}`;
  };

  const currentWeekStart = weekStarts[currentPageIndex];

  const renderWeekPage = ({ item: weekStart }: { item: Date }) => {
    const days = getWeekDays(weekStart);

    return (
      <View style={{ width: SCREEN_WIDTH }}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {days.map((day) => {
            const dayIso = toISODate(day);
            const dayShifts = shifts.filter((s) => s.shift_date === dayIso);
            const isTodayDay = isSameDay(day, new Date());

            return (
              <DayRow
                key={dayIso}
                day={day}
                shifts={dayShifts}
                isToday={isTodayDay}
                colors={colors}
                t={t}
                formatTime={formatTime}
                getShiftDuration={getShiftDuration}
              />
            );
          })}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('my_schedule.title', 'My Schedule')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Week navigation header */}
      <View style={[styles.weekNavBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={goToPrevWeek} style={styles.weekNavArrow} activeOpacity={0.6}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="chevron-left"
            size={20}
            color={colors.primary}
          />
        </TouchableOpacity>
        <View style={styles.weekNavCenter}>
          <IconSymbol
            ios_icon_name="calendar"
            android_material_icon_name="event"
            size={16}
            color={colors.primary}
          />
          <Text style={[styles.weekNavLabel, { color: colors.text }]}>
            {formatWeekHeader(currentWeekStart)}
          </Text>
        </View>
        <TouchableOpacity onPress={goToNextWeek} style={styles.weekNavArrow} activeOpacity={0.6}>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={20}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Last updated + R365 note */}
      <View style={[styles.disclaimerBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <IconSymbol ios_icon_name="clock.fill" android_material_icon_name="schedule" size={14} color={colors.primary} />
        <View style={{ flex: 1 }}>
          {lastUploadAt && (
            <Text style={[styles.lastUpdatedText, { color: colors.text }]}>
              {t('my_schedule.last_updated', 'Last Updated')} {new Date(lastUploadAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} {t('my_schedule.at', 'at')} {new Date(lastUploadAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </Text>
          )}
          <Text style={[styles.disclaimerText, { color: colors.textSecondary, marginTop: lastUploadAt ? 2 : 0 }]}>
            {t('my_schedule.r365_note', 'Please see R365 for any Shift Offers, Trades, Approvals and Changes to your schedule after the date above.')}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loadingIndicator} />
      ) : (
        <FlatList
          ref={pagerRef}
          style={{ flex: 1 }}
          data={weekStarts}
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
    </View>
  );
}

// -------- DayRow: one row per day (full cards or "Not scheduled") --------

interface DayRowProps {
  day: Date;
  shifts: Shift[];
  isToday: boolean;
  colors: any;
  t: any;
  formatTime: (s: string) => string;
  getShiftDuration: (s: string, e: string) => string;
}

function DayRow({ day, shifts, isToday, colors, t, formatTime, getShiftDuration }: DayRowProps) {
  const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNumber = day.getDate();
  const hasShifts = shifts.length > 0;

  // Build the sub-tag for a shift: priority Opener/Closer/Training → room → nothing
  const getShiftTag = (shift: Shift): string | null => {
    if (shift.is_opener) return t('my_schedule.opener', 'Opener');
    if (shift.is_closer) return t('my_schedule.closer', 'Closer');
    if (shift.is_training) return t('my_schedule.training', 'Training');
    if (shift.room_assignment) return shift.room_assignment;
    return null;
  };

  const dateBoxBg = isToday ? colors.primary : colors.card;
  const dateBoxBorder = isToday
    ? colors.primary
    : colors.border || 'rgba(128,128,128,0.15)';
  const dateBoxTextColor = isToday ? '#FFFFFF' : colors.primary;
  const accentColor = isToday ? colors.primary : 'transparent';

  const renderDateBox = (dimmed: boolean) => (
    <View
      style={[
        styles.dateBox,
        {
          backgroundColor: dateBoxBg,
          borderColor: dateBoxBorder,
          opacity: dimmed ? 0.35 : 1,
        },
      ]}
    >
      <Text style={[styles.dateBoxDay, { color: dateBoxTextColor }]}>
        {dayName}
      </Text>
      <Text style={[styles.dateBoxNumber, { color: dateBoxTextColor }]}>
        {dayNumber}
      </Text>
    </View>
  );

  if (!hasShifts) {
    return (
      <View style={styles.dayShiftStack}>
        <View
          style={[
            styles.itemCard,
            {
              backgroundColor: colors.card,
              borderLeftColor: accentColor,
            },
          ]}
        >
          {renderDateBox(false)}
          <View style={styles.itemCardContent}>
            <Text style={[styles.emptyDayText, { color: colors.textSecondary }]}>
              {t('my_schedule.not_scheduled', 'Not scheduled')}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.dayShiftStack}>
      {shifts.map((shift, idx) => {
        const tag = getShiftTag(shift);
        const primaryRole = shift.roles.length > 0 ? shift.roles[0] : null;
        return (
          <View
            key={shift.id}
            style={[
              styles.itemCard,
              {
                backgroundColor: colors.card,
                borderLeftColor: accentColor,
              },
            ]}
          >
            {renderDateBox(idx > 0)}
            <View style={styles.itemCardContent}>
              <View style={styles.shiftCardMain}>
                <Text style={[styles.shiftTimeText, { color: colors.text }]}>
                  {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                </Text>
                {primaryRole && (
                  <Text style={[styles.shiftRoleText, { color: colors.textSecondary }]}>
                    {primaryRole}
                  </Text>
                )}
                {tag && (
                  <Text style={[styles.shiftTagText, { color: colors.textSecondary }]}>
                    {tag}
                  </Text>
                )}
              </View>
              <View style={styles.shiftDurationBadge}>
                <Text style={[styles.shiftDurationText, { color: colors.textSecondary }]}>
                  {getShiftDuration(shift.start_time, shift.end_time)}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    width: 40,
  },
  weekNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekNavArrow: {
    padding: 6,
    width: 40,
    alignItems: 'center',
  },
  weekNavCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weekNavLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  disclaimerBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  lastUpdatedText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  disclaimerText: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '400',
  },
  loadingIndicator: {
    marginTop: 40,
  },
  dayShiftStack: {
    gap: 6,
    marginBottom: 10,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  dateBox: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBoxDay: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateBoxNumber: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 2,
  },
  itemCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  shiftCardMain: {
    flex: 1,
  },
  shiftTimeText: {
    fontSize: 15,
    fontWeight: '700',
  },
  shiftRoleText: {
    fontSize: 13,
    marginTop: 2,
  },
  shiftTagText: {
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic',
  },
  shiftDurationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.08)',
  },
  shiftDurationText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyDayText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});
