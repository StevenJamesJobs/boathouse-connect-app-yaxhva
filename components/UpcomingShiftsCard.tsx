import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/app/integrations/supabase/client';
import { useThemeColors } from '@/hooks/useThemeColors';
import GlassCard from '@/components/GlassCard';
import { fonts } from '@/constants/fonts';

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
}

/**
 * The Schedule-tab shifts card: up to 7 upcoming shifts as compact one-line
 * rows (day · time · opener/closer/training flag · role). Self-themed via
 * useThemeColors; the Full Schedule / View Roster buttons live in the Schedule
 * section so managers with no shift still reach them.
 */
export default function UpcomingShiftsCard({ userId }: UpcomingShiftsCardProps) {
  const colors = useThemeColors();
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
        .limit(7);

      if (error) throw error;
      setShifts(data || []);
    } catch (error) {
      console.error('Error loading shifts:', error);
    } finally {
      setLoading(false);
    }
  };

  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();

  const formatShiftDate = (dateStr: string) => {
    if (dateStr === todayStr) return t('upcoming_shifts.today_label', 'Today');
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const getPrimaryRole = (shift: Shift) => {
    if (!shift.roles || shift.roles.length === 0) return shift.room_assignment || '';
    return [...new Set(shift.roles)][0];
  };

  if (loading && shifts.length === 0) return null;

  if (!loading && shifts.length === 0) {
    return (
      <GlassCard variant="surface" style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          {t('upcoming_shifts.no_shifts', 'No upcoming shifts')}
        </Text>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="surface" style={styles.card}>
      {shifts.map((shift, i) => {
        const role = getPrimaryRole(shift);
        const last = i === shifts.length - 1;
        return (
          <View
            key={shift.id}
            style={[
              styles.srow,
              !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
            ]}
          >
            <Text style={[styles.d, { color: colors.text }]} numberOfLines={1}>
              {formatShiftDate(shift.shift_date)}
            </Text>
            <Text style={[styles.tm, { color: colors.textSecondary }]} numberOfLines={1}>
              {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
            </Text>
            {shift.is_closer && (
              <View style={[styles.flag, { backgroundColor: colors.tint + '38' }]}>
                <Text style={[styles.flagText, { color: colors.tint }]}>C</Text>
              </View>
            )}
            {shift.is_opener && (
              <View style={[styles.flag, { backgroundColor: colors.blue + '33' }]}>
                <Text style={[styles.flagText, { color: colors.blueText }]}>O</Text>
              </View>
            )}
            {shift.is_training && (
              <View style={[styles.flag, { backgroundColor: colors.blue + '33' }]}>
                <Text style={[styles.flagText, { color: colors.blueText }]}>T</Text>
              </View>
            )}
            {!!role && (
              <View style={[styles.role, { backgroundColor: colors.tint + '28' }]}>
                <Text style={[styles.roleText, { color: colors.tint }]} numberOfLines={1}>
                  {role}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 11,
  },
  empty: {
    marginBottom: 11,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: fonts.mono.medium,
    fontSize: 12,
  },
  srow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  d: {
    fontFamily: fonts.display.semibold,
    fontSize: 12.5,
    width: 54,
  },
  tm: {
    flex: 1,
    fontFamily: fonts.mono.medium,
    fontSize: 11.5,
  },
  flag: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    fontWeight: '800',
  },
  role: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
  },
  roleText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    fontWeight: '700',
  },
});
