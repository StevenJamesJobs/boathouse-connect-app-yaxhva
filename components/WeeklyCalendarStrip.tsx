import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/IconSymbol';
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
  };
  events: UpcomingEvent[];
  onViewAll?: () => void;
  children?: React.ReactNode;
}

export default function WeeklyCalendarStrip({
  selectedDate,
  onSelectDate,
  colors,
  events,
  onViewAll,
  children,
}: WeeklyCalendarStripProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';

  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    getWeekStartDate(new Date())
  );

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
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {/* Month/Year header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.monthLabel, { color: colors.text }]}>
          {formatMonthYear(monthLabelDate, locale)}
        </Text>
        <View style={styles.headerRight}>
          {selectedDate !== null && (
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
                style={styles.dayColumn}
                onPress={() => handleDatePress(day)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayName,
                    { color: colors.textSecondary },
                    selected && { color: colors.primary },
                  ]}
                >
                  {getShortDayName(day, locale)}
                </Text>
                <View
                  style={[
                    styles.dayCircle,
                    today && !selected && [
                      styles.todayCircle,
                      { borderColor: colors.primary },
                    ],
                    selected && [
                      styles.selectedCircle,
                      { backgroundColor: colors.primary },
                    ],
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      { color: colors.text },
                      today && !selected && { color: colors.primary, fontWeight: '700' },
                      selected && styles.selectedDayNumber,
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
                        { backgroundColor: selected ? colors.primary : colors.textSecondary },
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
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
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
    paddingVertical: 4,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
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
