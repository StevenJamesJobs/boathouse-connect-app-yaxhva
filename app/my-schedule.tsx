import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

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

interface DayGroup {
  date: string;
  shifts: Shift[];
}

export default function MyScheduleScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) loadSchedule();
    }, [user?.id])
  );

  const loadSchedule = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      // Get shifts for the next 14 days
      const twoWeeksLater = new Date();
      twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
      const endDate = twoWeeksLater.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('staff_schedules')
        .select('id, shift_date, start_time, end_time, roles, is_closer, is_opener, is_training, room_assignment')
        .eq('user_id', user?.id)
        .gte('shift_date', today)
        .lte('shift_date', endDate)
        .order('shift_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      setShifts(data || []);
    } catch (error) {
      console.error('Error loading schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group shifts by date
  const dayGroups: DayGroup[] = shifts.reduce<DayGroup[]>((groups, shift) => {
    const existing = groups.find((g) => g.date === shift.shift_date);
    if (existing) {
      existing.shifts.push(shift);
    } else {
      groups.push({ date: shift.shift_date, shifts: [shift] });
    }
    return groups;
  }, []);

  const formatDayHeader = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateObj = new Date(dateStr + 'T00:00:00');
    dateObj.setHours(0, 0, 0, 0);

    let prefix = '';
    if (dateObj.getTime() === today.getTime()) {
      prefix = t('my_schedule.today', 'Today') + ' — ';
    } else if (dateObj.getTime() === tomorrow.getTime()) {
      prefix = t('my_schedule.tomorrow', 'Tomorrow') + ' — ';
    }

    return prefix + date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
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
    if (totalMinutes < 0) totalMinutes += 24 * 60; // overnight shift
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loadingIndicator} />
        ) : dayGroups.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <IconSymbol
              ios_icon_name="calendar"
              android_material_icon_name="event"
              size={48}
              color={colors.textSecondary}
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {t('my_schedule.no_schedule', 'No Upcoming Shifts')}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {t('my_schedule.no_schedule_desc', 'Your schedule hasn\'t been uploaded yet. Check back soon!')}
            </Text>
          </View>
        ) : (
          dayGroups.map((group) => (
            <View key={group.date} style={styles.dayGroup}>
              {/* Day header */}
              <Text style={[styles.dayHeader, { color: colors.text }]}>
                {formatDayHeader(group.date)}
              </Text>

              {/* Shift cards */}
              {group.shifts.map((shift) => (
                <View
                  key={shift.id}
                  style={[styles.shiftCard, { backgroundColor: colors.card }]}
                >
                  <View style={styles.shiftTimeSection}>
                    <View style={[styles.timeDot, { backgroundColor: colors.primary }]} />
                    <View style={[styles.timeLine, { backgroundColor: colors.primary + '30' }]} />
                    <View style={[styles.timeDot, { backgroundColor: colors.primary + '60' }]} />
                  </View>

                  <View style={styles.shiftDetails}>
                    <View style={styles.timeRow}>
                      <Text style={[styles.timeText, { color: colors.text }]}>
                        {formatTime(shift.start_time)}
                      </Text>
                      <Text style={[styles.durationText, { color: colors.textSecondary }]}>
                        {getShiftDuration(shift.start_time, shift.end_time)}
                      </Text>
                    </View>

                    {/* Roles */}
                    <View style={styles.rolesRow}>
                      {[...new Set(shift.roles)].map((role, idx) => (
                        <View key={idx} style={[styles.roleBadge, { backgroundColor: colors.primary + '15' }]}>
                          <Text style={[styles.roleText, { color: colors.primary }]}>{role}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.timeRow}>
                      <Text style={[styles.endTimeText, { color: colors.textSecondary }]}>
                        {formatTime(shift.end_time)}
                      </Text>
                    </View>

                    {/* Flags */}
                    <View style={styles.flagsRow}>
                      {shift.is_opener && (
                        <View style={[styles.flagBadge, { backgroundColor: '#4CAF5020' }]}>
                          <Text style={[styles.flagText, { color: '#4CAF50' }]}>
                            {t('my_schedule.opener', 'Opener')}
                          </Text>
                        </View>
                      )}
                      {shift.is_closer && (
                        <View style={[styles.flagBadge, { backgroundColor: '#FF980020' }]}>
                          <Text style={[styles.flagText, { color: '#FF9800' }]}>
                            {t('my_schedule.closer', 'Closer')}
                          </Text>
                        </View>
                      )}
                      {shift.is_training && (
                        <View style={[styles.flagBadge, { backgroundColor: '#2196F320' }]}>
                          <Text style={[styles.flagText, { color: '#2196F3' }]}>
                            {t('my_schedule.training', 'Training')}
                          </Text>
                        </View>
                      )}
                      {shift.room_assignment && (
                        <View style={[styles.flagBadge, { backgroundColor: '#9C27B020' }]}>
                          <Text style={[styles.flagText, { color: '#9C27B0' }]}>
                            {shift.room_assignment}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingIndicator: {
    marginTop: 40,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 12,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  dayGroup: {
    marginBottom: 20,
  },
  dayHeader: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  shiftCard: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  shiftTimeSection: {
    alignItems: 'center',
    width: 12,
    marginRight: 12,
    paddingVertical: 2,
  },
  timeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timeLine: {
    width: 2,
    flex: 1,
    marginVertical: 2,
  },
  shiftDetails: {
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 15,
    fontWeight: '600',
  },
  endTimeText: {
    fontSize: 13,
  },
  durationText: {
    fontSize: 12,
  },
  rolesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginVertical: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  flagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  flagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  flagText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
