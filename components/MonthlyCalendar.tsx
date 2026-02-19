import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  getMonthCalendarDays,
  getWeekDays,
  getShortDayName,
  isSameDay,
  isSameMonth,
  isToday,
  formatMonthYear,
  eventFallsOnDate,
  addMonths,
} from '@/utils/dateUtils';
import { IconSymbol } from '@/components/IconSymbol';

interface UpcomingEvent {
  id: string;
  start_date_time: string | null;
  end_date_time: string | null;
}

interface MonthlyCalendarProps {
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
}

export default function MonthlyCalendar({
  selectedDate,
  onSelectDate,
  colors,
  events,
}: MonthlyCalendarProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';

  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());

  const translateX = useSharedValue(0);
  const SWIPE_THRESHOLD = 50;

  const calendarDays = getMonthCalendarDays(currentYear, currentMonth);
  // Use the first week of the current month to get day name headers
  const headerDate = new Date(currentYear, currentMonth, 1);
  const dayHeaders = getWeekDays(headerDate).map(d => getShortDayName(d, locale));
  // But we actually want Sun-Sat regardless, so use a known Sunday
  const sundayRef = new Date(2026, 0, 4); // A known Sunday
  const dayHeaderDates = getWeekDays(sundayRef);

  const monthLabel = formatMonthYear(new Date(currentYear, currentMonth, 1), locale);

  const goToNextMonth = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = addMonths(new Date(currentYear, currentMonth, 1), 1);
    setCurrentYear(next.getFullYear());
    setCurrentMonth(next.getMonth());
  }, [currentYear, currentMonth]);

  const goToPrevMonth = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const prev = addMonths(new Date(currentYear, currentMonth, 1), -1);
    setCurrentYear(prev.getFullYear());
    setCurrentMonth(prev.getMonth());
  }, [currentYear, currentMonth]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (event.translationX < -SWIPE_THRESHOLD) {
        runOnJS(goToNextMonth)();
      } else if (event.translationX > SWIPE_THRESHOLD) {
        runOnJS(goToPrevMonth)();
      }
      translateX.value = withTiming(0, { duration: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

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

  // Split calendar days into rows of 7
  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {/* Month/Year header with nav arrows */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={goToPrevMonth}
          style={styles.navButton}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="chevron-left"
            size={20}
            color={colors.primary}
          />
        </TouchableOpacity>

        <Text style={[styles.monthLabel, { color: colors.text }]}>
          {monthLabel}
        </Text>

        <TouchableOpacity
          onPress={goToNextMonth}
          style={styles.navButton}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={20}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* View Top Events button */}
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

      {/* Day name headers */}
      <View style={styles.dayHeaderRow}>
        {dayHeaderDates.map((d, i) => (
          <View key={i} style={styles.dayHeaderCell}>
            <Text style={[styles.dayHeaderText, { color: colors.textSecondary }]}>
              {getShortDayName(d, locale)}
            </Text>
          </View>
        ))}
      </View>

      {/* Calendar grid with swipe */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={styles.weekRow}>
              {week.map((day, dayIndex) => {
                const inMonth = isSameMonth(day, currentYear, currentMonth);
                const today = isToday(day);
                const selected = selectedDate !== null && isSameDay(selectedDate, day);
                const hasEvents = dayHasEvents(day);

                return (
                  <TouchableOpacity
                    key={dayIndex}
                    style={styles.dayCell}
                    onPress={() => handleDatePress(day)}
                    activeOpacity={0.7}
                  >
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
                          { color: inMonth ? colors.text : colors.textSecondary + '50' },
                          today && !selected && { color: colors.primary, fontWeight: '700' },
                          selected && styles.selectedDayNumber,
                        ]}
                      >
                        {day.getDate()}
                      </Text>
                    </View>
                    <View style={styles.dotContainer}>
                      {hasEvents && inMonth && (
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
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  navButton: {
    padding: 8,
  },
  monthLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
  viewTopButton: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 8,
  },
  viewTopButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
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
    boxShadow: '0px 1px 3px rgba(0,0,0,0.2)',
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '500',
  },
  selectedDayNumber: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dotContainer: {
    height: 5,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
