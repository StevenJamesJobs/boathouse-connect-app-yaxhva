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
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

interface RosterShift {
  id: string;
  employee_name: string;
  user_id: string | null;
  start_time: string;
  end_time: string;
  roles: string[];
  is_closer: boolean;
  is_opener: boolean;
  is_training: boolean;
}

export default function TodaysRosterScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'am' | 'pm'>('am');

  useFocusEffect(
    useCallback(() => {
      loadTodaysShifts();
    }, [])
  );

  const loadTodaysShifts = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('staff_schedules')
        .select('id, employee_name, user_id, start_time, end_time, roles, is_closer, is_opener, is_training')
        .eq('shift_date', today)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setShifts(data || []);
    } catch (error) {
      console.error('Error loading roster:', error);
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

  // Split shifts into AM (start before 12pm) and PM (start at 12pm or later)
  const amShifts = shifts.filter((s) => {
    const [hours] = s.start_time.split(':').map(Number);
    return hours < 12;
  });

  const pmShifts = shifts.filter((s) => {
    const [hours] = s.start_time.split(':').map(Number);
    return hours >= 12;
  });

  const activeShifts = activeTab === 'am' ? amShifts : pmShifts;

  // Group active shifts by primary role, sorted alphabetically
  const roleGroups: { role: string; shifts: RosterShift[] }[] = (() => {
    const map: Record<string, RosterShift[]> = {};
    activeShifts.forEach((shift) => {
      const role = shift.roles.length > 0 ? [...new Set(shift.roles)][0] : 'Other';
      if (!map[role]) map[role] = [];
      map[role].push(shift);
    });
    // Sort roles alphabetically, then sort employees within each role
    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .map((role) => ({
        role,
        shifts: map[role].sort((a, b) => a.start_time.localeCompare(b.start_time)),
      }));
  })();

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const getPrimaryRole = (shift: RosterShift) => {
    if (shift.roles.length === 0) return '';
    return [...new Set(shift.roles)][0];
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Today's Roster</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Date and stats */}
      <View style={[styles.dateBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.dateText, { color: colors.text }]}>{todayStr}</Text>
        <View style={styles.statsRow}>
          <View style={[styles.statBadge, { backgroundColor: colors.primary + '12' }]}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{shifts.length}</Text>
            <Text style={[styles.statLabel, { color: colors.primary }]}>Total</Text>
          </View>
          <View style={[styles.statBadge, { backgroundColor: '#FF980012' }]}>
            <Text style={[styles.statNumber, { color: '#FF9800' }]}>{amShifts.length}</Text>
            <Text style={[styles.statLabel, { color: '#FF9800' }]}>AM</Text>
          </View>
          <View style={[styles.statBadge, { backgroundColor: '#7C4DFF12' }]}>
            <Text style={[styles.statNumber, { color: '#7C4DFF' }]}>{pmShifts.length}</Text>
            <Text style={[styles.statLabel, { color: '#7C4DFF' }]}>PM</Text>
          </View>
        </View>
      </View>

      {/* AM / PM Tab Selector */}
      <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'am' && { backgroundColor: '#FF9800' }]}
          onPress={() => setActiveTab('am')}
        >
          <IconSymbol
            ios_icon_name="sun.max.fill"
            android_material_icon_name="wb-sunny"
            size={16}
            color={activeTab === 'am' ? '#FFFFFF' : '#FF9800'}
          />
          <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'am' && { color: '#FFFFFF' }]}>
            AM ({amShifts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pm' && { backgroundColor: '#7C4DFF' }]}
          onPress={() => setActiveTab('pm')}
        >
          <IconSymbol
            ios_icon_name="moon.fill"
            android_material_icon_name="nightlight-round"
            size={16}
            color={activeTab === 'pm' ? '#FFFFFF' : '#7C4DFF'}
          />
          <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'pm' && { color: '#FFFFFF' }]}>
            PM ({pmShifts.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loadingIndicator} />
        ) : activeShifts.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <IconSymbol
              ios_icon_name={activeTab === 'am' ? 'sun.max.fill' : 'moon.fill'}
              android_material_icon_name={activeTab === 'am' ? 'wb-sunny' : 'nightlight-round'}
              size={36}
              color={colors.textSecondary}
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No {activeTab === 'am' ? 'Morning' : 'Evening'} Shifts
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              No staff scheduled for the {activeTab === 'am' ? 'AM' : 'PM'} shift today.
            </Text>
          </View>
        ) : (
          roleGroups.map((group) => (
            <View key={group.role} style={styles.roleGroup}>
              {/* Role section header */}
              <View style={styles.roleGroupHeader}>
                <View style={[styles.roleGroupBadge, { backgroundColor: colors.primary + '12' }]}>
                  <Text style={[styles.roleGroupTitle, { color: colors.primary }]}>{group.role}</Text>
                </View>
                <View style={[styles.roleGroupLine, { backgroundColor: colors.primary + '15' }]} />
                <Text style={[styles.roleGroupCount, { color: colors.textSecondary }]}>
                  {group.shifts.length}
                </Text>
              </View>

              {/* Shift cards for this role */}
              {group.shifts.map((shift) => (
                <View
                  key={shift.id}
                  style={[styles.shiftCard, { backgroundColor: colors.card }]}
                >
                  <View style={styles.shiftCardTop}>
                    <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
                      <Text style={[styles.avatarText, { color: colors.primary }]}>
                        {(shift.employee_name || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.shiftInfo}>
                      <Text style={[styles.employeeName, { color: colors.text }]}>
                        {shift.employee_name}
                      </Text>
                      <Text style={[styles.timeRange, { color: colors.textSecondary }]}>
                        {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                        {'  '}
                        <Text style={styles.duration}>{getShiftDuration(shift.start_time, shift.end_time)}</Text>
                      </Text>
                    </View>

                    {/* Flag badges on the right */}
                    <View style={styles.flagsColumn}>
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
    padding: 4,
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    width: 40,
  },
  dateBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  statNumber: {
    fontSize: 15,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
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
    gap: 6,
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
  roleGroup: {
    marginBottom: 16,
  },
  roleGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  roleGroupBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleGroupTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  roleGroupLine: {
    flex: 1,
    height: 1,
  },
  roleGroupCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  shiftCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  shiftCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  shiftInfo: {
    flex: 1,
    marginLeft: 10,
  },
  employeeName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 1,
  },
  timeRange: {
    fontSize: 12,
  },
  duration: {
    fontSize: 11,
    fontWeight: '500',
  },
  flagsColumn: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 6,
  },
  flagBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
