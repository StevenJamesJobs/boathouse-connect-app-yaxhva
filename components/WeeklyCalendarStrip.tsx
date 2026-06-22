import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  getWeekStartDate,
  getWeekDays,
  isSameDay,
  isToday,
  formatMonthYear,
  getShortDayName,
  eventFallsOnDate,
  addWeeks,
} from '@/utils/dateUtils';

interface UpcomingEvent {
  id: string;
  start_date_time: string | null;
  end_date_time: string | null;
}

interface WeeklyCalendarStripProps {
  selectedDate: Date | null;
  onSelectDate: (date: Date | null) => void;
  colors: {
    primary: string;
    background: string;
    text: string;
    textSecondary: string;
    card: string;
    fireText: string;
  };
  events: UpcomingEvent[];
  onViewAll?: () => void;
  /** When provided, shows a "New Added" pill button to the left of "View All". */
  onNewAdded?: () => void;
  children?: React.ReactNode;
  /** When true, removes the card container styling (margins, border radius, shadow) for edge-to-edge layouts. */
  edgeToEdge?: boolean;
  /** When true, hides the "View Top Events" button even when a date is selected. */
  hideViewTopEvents?: boolean;
  /** Optional handler for an "expand to month" calendar icon button on the right of the header. */
  onMonthExpand?: () => void;
  /** Called whenever the displayed week changes (arrow navigation or selectedDate sync). */
  onWeekChange?: (weekStart: Date, weekEnd: Date) => void;
}

export default function WeeklyCalendarStrip({
  selectedDate,
  onSelectDate,
  colors,
  events,
  onViewAll,
  onNewAdded,
  children,
  edgeToEdge = false,
  hideViewTopEvents = false,
  onMonthExpand,
  onWeekChange,
}: WeeklyCalendarStripProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  // Glass tokens (surface/surfaceBorder/blue) come from the theme directly — the
  // `colors` prop is a subset that predates them, so avoid threading them through.
  const tc = useThemeColors();

  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    getWeekStartDate(selectedDate || new Date())
  );

  // Keep the visible week in sync when selectedDate is changed externally
  // (e.g. by swiping between days on the Roster page).
  useEffect(() => {
    if (!selectedDate) return;
    const targetWeekStart = getWeekStartDate(selectedDate);
    if (!isSameDay(targetWeekStart, currentWeekStart)) {
      setCurrentWeekStart(targetWeekStart);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (onWeekChange) {
      const days = getWeekDays(currentWeekStart);
      onWeekChange(days[0], days[6]);
    }
  }, [currentWeekStart]);

  const weekDays = getWeekDays(currentWeekStart);

  const goToNextWeek = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentWeekStart(prev => addWeeks(prev, 1));
  }, []);

  const goToPrevWeek = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentWeekStart(prev => addWeeks(prev, -1));
  }, []);

  const handleDatePress = (day: Date) => {
    if (selectedDate && isSameDay(selectedDate, day)) {
      onSelectDate(null);
    } else {
      onSelectDate(day);
    }
  };

  const handleViewTopEvents = () => {
    onSelectDate(null);
  };

  const dayHasEvents = (day: Date): boolean => {
    return events.some(event =>
      eventFallsOnDate(event.start_date_time, event.end_date_time, day)
    );
  };

  const monthLabelDate = weekDays[3];

  return (
    <View
      style={[
        styles.container,
        edgeToEdge && styles.containerEdgeToEdge,
        { backgroundColor: colors.card },
      ]}
    >
      {/* Month/Year header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.monthLabel, { color: colors.text }]}>
          {formatMonthYear(monthLabelDate, locale)}
        </Text>
        <View style={styles.headerRight}>
          {selectedDate !== null && !hideViewTopEvents && (
            <TouchableOpacity
              style={[styles.viewTopButton, { backgroundColor: colors.primary + '18' }]}
              onPress={handleViewTopEvents}
              activeOpacity={0.7}
            >
              <Text style={[styles.viewTopButtonText, { color: colors.primary }]}>
                {t('upcoming_events.view_top_events')}
              </Text>
            </TouchableOpacity>
          )}
          {onNewAdded && (
            <TouchableOpacity
              style={[styles.newAddedButton, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}
              onPress={onNewAdded}
              activeOpacity={0.7}
            >
              <Text style={[styles.newAddedText, { color: '#EF4444' }]}>
                ✦ New Added
              </Text>
            </TouchableOpacity>
          )}
          {onViewAll && (
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={onViewAll}
              activeOpacity={0.7}
            >
              <Text style={[styles.viewAllText, { color: colors.primary }]}>
                {t('manager_home.view_all', 'View All')}
              </Text>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={14}
                color={colors.primary}
              />
            </TouchableOpacity>
          )}
          {onMonthExpand && (
            <TouchableOpacity
              onPress={onMonthExpand}
              style={styles.monthExpandButton}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol
                ios_icon_name="calendar"
                android_material_icon_name="calendar-month"
                size={20}
                color={colors.primary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Week strip with arrow navigation */}
      <View style={styles.weekRowWithArrows}>
        <TouchableOpacity
          onPress={goToPrevWeek}
          style={styles.arrowButton}
          activeOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="chevron-left"
            size={18}
            color={colors.primary}
          />
        </TouchableOpacity>

        <View style={styles.weekRow}>
          {weekDays.map((day, index) => {
            const today = isToday(day);
            const selected = selectedDate !== null && isSameDay(selectedDate, day);
            const hasEvents = dayHasEvents(day);

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayColumn,
                  {
                    backgroundColor: selected ? colors.primary : tc.surface,
                    borderColor: selected ? colors.primary : tc.surfaceBorder,
                  },
                ]}
                onPress={() => handleDatePress(day)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayName,
                    { color: selected ? colors.fireText : colors.textSecondary },
                  ]}
                >
                  {getShortDayName(day, locale)}
                </Text>
                <View
                  style={[
                    styles.dayCircle,
                    today && !selected && [styles.todayCircle, { borderColor: colors.primary }],
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      { color: selected ? colors.fireText : today ? colors.primary : colors.text },
                      (selected || today) && { fontWeight: '700' },
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </View>
                <View style={styles.dotContainer}>
                  {hasEvents && (
                    <View
                      style={[
                        styles.eventDot,
                        { backgroundColor: selected ? colors.fireText : tc.blue },
                      ]}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={goToNextWeek}
          style={styles.arrowButton}
          activeOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={18}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Nested content (e.g. Events/Entertainment tabs) */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
    // Subtle shadow for card look
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  containerEdgeToEdge: {
    marginHorizontal: 0,
    marginTop: 0,
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  viewTopButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  viewTopButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newAddedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  newAddedText: {
    fontSize: 12,
    fontWeight: '700',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  monthExpandButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  weekRowWithArrows: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  dayColumn: {
    alignItems: 'center',
    flex: 1,
    paddingTop: 5,
    paddingBottom: 8,
    marginHorizontal: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  dayName: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  todayCircle: {
    borderWidth: 2,
  },
  selectedCircle: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  dayNumber: {
    fontSize: 15,
    fontWeight: '500',
  },
  selectedDayNumber: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dotContainer: {
    height: 6,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
