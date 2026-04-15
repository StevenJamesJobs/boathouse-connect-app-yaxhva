import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

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

interface UpcomingShiftsCardProps {
  userId: string | undefined;
  isManager?: boolean;
  colors: {
    primary: string;
    background: string;
    text: string;
    textSecondary: string;
    card: string;
  };
}

export default function UpcomingShiftsCard({ userId, isManager = false, colors }: UpcomingShiftsCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (userId) loadShifts();
    }, [userId])
  );

  const loadShifts = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('staff_schedules')
        .select('id, shift_date, start_time, end_time, roles, is_closer, is_opener, is_training, room_assignment')
        .eq('user_id', userId)
        .gte('shift_date', today)
        .order('shift_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(5);

      if (error) throw error;
      setShifts(data || []);
    } catch (error) {
      console.error('Error loading shifts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Don't render if loading or no shifts
  if (loading && shifts.length === 0) return null;
  if (!loading && shifts.length === 0) return null;

  const formatShiftDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const getPrimaryRole = (shift: Shift) => {
    if (shift.roles.length === 0) return '';
    const uniqueRoles = [...new Set(shift.roles)];
    return uniqueRoles[0];
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <IconSymbol
            ios_icon_name="calendar.badge.clock"
            android_material_icon_name="schedule"
            size={18}
            color={colors.primary}
          />
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('upcoming_shifts.your_next_shifts', 'Your Next Shifts')}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.fullScheduleButton}
          onPress={() => router.push('/my-schedule')}
          activeOpacity={0.7}
        >
          <Text style={[styles.fullScheduleText, { color: colors.primary }]}>
            {t('upcoming_shifts.full_schedule', 'Full Schedule')}
          </Text>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={14}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Shift rows */}
      {shifts.map((shift, index) => (
        <View
          key={shift.id}
          style={[
            styles.shiftRow,
            index < shifts.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: 'rgba(128,128,128,0.12)',
            },
          ]}
        >
          <Text style={[styles.shiftDate, { color: colors.text }]}>
            {formatShiftDate(shift.shift_date)}
          </Text>
          <Text style={[styles.shiftTime, { color: colors.textSecondary }]}>
            {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
          </Text>
          <View style={styles.shiftMeta}>
            {shift.is_opener && (
              <View style={[styles.flagBadge, { backgroundColor: '#4CAF5020' }]}>
                <Text style={[styles.flagText, { color: '#4CAF50' }]}>O</Text>
              </View>
            )}
            {shift.is_closer && (
              <View style={[styles.flagBadge, { backgroundColor: '#FF980020' }]}>
                <Text style={[styles.flagText, { color: '#FF9800' }]}>C</Text>
              </View>
            )}
            {shift.is_training && (
              <View style={[styles.flagBadge, { backgroundColor: '#2196F320' }]}>
                <Text style={[styles.flagText, { color: '#2196F3' }]}>T</Text>
              </View>
            )}
            {getPrimaryRole(shift) ? (
              <View style={[styles.roleBadge, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[styles.roleText, { color: colors.primary }]}>
                  {getPrimaryRole(shift)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}

      {/* Manager-only: View Today's Roster */}
      {isManager && (
        <TouchableOpacity
          style={[styles.rosterButton, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.12)' }]}
          onPress={() => router.push('/todays-roster')}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="person.3.fill"
            android_material_icon_name="groups"
            size={15}
            color={colors.primary}
          />
          <Text style={[styles.rosterButtonText, { color: colors.primary }]}>
            {t('upcoming_shifts.view_todays_roster', "View Today's Roster")}
          </Text>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={13}
            color={colors.primary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 12,
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
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  fullScheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  fullScheduleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  shiftDate: {
    fontSize: 13,
    fontWeight: '600',
    width: 70,
  },
  shiftTime: {
    fontSize: 12,
    flex: 1,
  },
  shiftMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '600',
  },
  flagBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  rosterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    marginTop: 4,
    gap: 6,
  },
  rosterButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
