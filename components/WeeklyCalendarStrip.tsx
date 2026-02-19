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
}

export default function WeeklyCalendarStrip({
  selectedDate,
  onSelectDate,
  colors,
  events,
}: WeeklyCalendarStripProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';

  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    getWeekStartDate(new Date())
  );

  const translateX = useSharedValue(0);
  const SWIPE_THRESHOLD = 50;

  const weekDays = getWeekDays(currentWeekStart);

  const goToNextWeek = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentWeekStart(prev => addWeeks(prev, 1));
  }, []);

  const goToPrevWeek = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentWeekStart(prev => addWeeks(prev, -1));
  }, []);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (event.translationX < -SWIPE_THRESHOLD) {
        runOnJS(goToNextWeek)();
      } else if (event.translationX > SWIPE_THRESHOLD) {
        runOnJS(goToPrevWeek)();
      }
      translateX.value = withTiming(0, { duration: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleDatePress = (day: Date) => {
    if (selectedDate && isSameDay(selectedDate, day)) {
      // Tapping the already-selected date deselects it
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

  // Use the middle day of the week for the month/year label
  const monthLabelDate = weekDays[3];

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {/* Month/Year header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.monthLabel, { color: colors.text }]}>
          {formatMonthYear(monthLabelDate, locale)}
        </Text>
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
      </View>

      {/* Week strip with swipe gesture */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.weekRow, animatedStyle]}>
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
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
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
  weekRow: {
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
    boxShadow: '0px 1px 3px rgba(0,0,0,0.2)',
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
