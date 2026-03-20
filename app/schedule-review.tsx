import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useTranslation } from 'react-i18next';

interface ShiftRecord {
  id: string;
  user_id: string | null;
  employee_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[];
  is_closer: boolean;
  is_opener: boolean;
  is_training: boolean;
  room_assignment: string | null;
}

interface UserRecord {
  id: string;
  name: string;
  username: string;
}

interface GroupedShifts {
  employee_name: string;
  user_id: string | null;
  user_name: string | null;
  shifts: ShiftRecord[];
}

export default function ScheduleReviewScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { upload_id } = useLocalSearchParams<{ upload_id: string }>();

  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');

  // Employee assignment modal
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    loadData();
  }, [upload_id]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load upload info
      const { data: uploadData } = await supabase
        .from('schedule_uploads')
        .select('week_start, week_end')
        .eq('id', upload_id)
        .single();

      if (uploadData) {
        setWeekStart(uploadData.week_start);
        setWeekEnd(uploadData.week_end);
      }

      // Load shifts for this upload
      const { data: shiftData, error: shiftError } = await supabase
        .from('staff_schedules')
        .select('*')
        .eq('upload_id', upload_id)
        .order('employee_name', { ascending: true })
        .order('shift_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (shiftError) throw shiftError;
      setShifts(shiftData || []);

      // Load all users for assignment
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, name, username')
        .order('name', { ascending: true });

      if (userError) throw userError;
      setUsers(userData || []);
    } catch (error) {
      console.error('Error loading review data:', error);
      Alert.alert('Error', 'Failed to load schedule data.');
    } finally {
      setLoading(false);
    }
  };

  // Group shifts by employee
  const groupedShifts: GroupedShifts[] = React.useMemo(() => {
    const groups: Record<string, GroupedShifts> = {};

    for (const shift of shifts) {
      if (!groups[shift.employee_name]) {
        const matchedUser = shift.user_id
          ? users.find((u) => u.id === shift.user_id)
          : null;
        groups[shift.employee_name] = {
          employee_name: shift.employee_name,
          user_id: shift.user_id,
          user_name: matchedUser?.name || null,
          shifts: [],
        };
      }
      groups[shift.employee_name].shifts.push(shift);
    }

    // Sort: unmatched first, then alphabetical
    return Object.values(groups).sort((a, b) => {
      if (!a.user_id && b.user_id) return -1;
      if (a.user_id && !b.user_id) return 1;
      return a.employee_name.localeCompare(b.employee_name);
    });
  }, [shifts, users]);

  const unmatchedCount = groupedShifts.filter((g) => !g.user_id).length;
  const matchedCount = groupedShifts.filter((g) => g.user_id).length;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const formatWeekDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Handle assigning a user to an employee's shifts
  const handleAssignUser = (employeeName: string) => {
    setSelectedEmployee(employeeName);
    setUserSearch('');
    setAssignModalVisible(true);
  };

  const handleSelectUser = async (userId: string | null) => {
    try {
      setSaving(true);
      setAssignModalVisible(false);

      // Update all shifts for this employee in this upload
      const { error } = await supabase
        .from('staff_schedules')
        .update({ user_id: userId })
        .eq('upload_id', upload_id)
        .eq('employee_name', selectedEmployee);

      if (error) throw error;

      // Update unmatched_employees in upload record
      const newUnmatched = groupedShifts
        .filter((g) => {
          if (g.employee_name === selectedEmployee) return userId === null;
          return !g.user_id;
        })
        .map((g) => g.employee_name);

      await supabase
        .from('schedule_uploads')
        .update({ unmatched_employees: newUnmatched })
        .eq('id', upload_id);

      // Reload data
      await loadData();

      Alert.alert(
        'Updated',
        userId
          ? `Assigned ${selectedEmployee} to ${users.find((u) => u.id === userId)?.name || 'user'}.`
          : `Unassigned ${selectedEmployee}.`
      );
    } catch (error: any) {
      console.error('Error assigning user:', error);
      Alert.alert('Error', error.message || 'Failed to update assignment.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = (shift: ShiftRecord) => {
    Alert.alert(
      'Delete Shift',
      `Remove ${shift.employee_name}'s shift on ${formatDate(shift.shift_date)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('staff_schedules').delete().eq('id', shift.id);

              // Update count
              const newCount = shifts.length - 1;
              await supabase
                .from('schedule_uploads')
                .update({ parsed_shifts_count: newCount })
                .eq('id', upload_id);

              await loadData();
            } catch (error) {
              console.error('Delete shift error:', error);
            }
          },
        },
      ]
    );
  };

  const filteredUsers = users.filter((u) => {
    if (!userSearch.trim()) return true;
    const search = userSearch.toLowerCase();
    return (
      (u.name && u.name.toLowerCase().includes(search)) ||
      (u.username && u.username.includes(search))
    );
  });

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Review Schedule</Text>
          <View style={styles.headerRight} />
        </View>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Review Schedule</Text>
        <View style={styles.headerRight} />
      </View>

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>
            {formatWeekDate(weekStart)} – {formatWeekDate(weekEnd)}
          </Text>
          <View style={styles.summaryStats}>
            <View style={styles.summaryStatItem}>
              <Text style={[styles.summaryStatNumber, { color: colors.primary }]}>{shifts.length}</Text>
              <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>Shifts</Text>
            </View>
            <View style={styles.summaryStatItem}>
              <Text style={[styles.summaryStatNumber, { color: '#4CAF50' }]}>{matchedCount}</Text>
              <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>Matched</Text>
            </View>
            {unmatchedCount > 0 && (
              <View style={styles.summaryStatItem}>
                <Text style={[styles.summaryStatNumber, { color: '#FF9800' }]}>{unmatchedCount}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>Unmatched</Text>
              </View>
            )}
            <View style={styles.summaryStatItem}>
              <Text style={[styles.summaryStatNumber, { color: colors.text }]}>{groupedShifts.length}</Text>
              <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>Employees</Text>
            </View>
          </View>
        </View>

        {/* Unmatched section */}
        {unmatchedCount > 0 && (
          <View style={styles.sectionHeader}>
            <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={16} color="#FF9800" />
            <Text style={[styles.sectionTitle, { color: '#FF9800' }]}>
              Unmatched Employees ({unmatchedCount})
            </Text>
          </View>
        )}

        {/* Employee cards */}
        {groupedShifts.map((group) => (
          <View
            key={group.employee_name}
            style={[
              styles.employeeCard,
              { backgroundColor: colors.card },
              !group.user_id && styles.unmatchedCard,
            ]}
          >
            {/* Employee header */}
            <View style={styles.employeeHeader}>
              <View style={styles.employeeInfo}>
                <Text style={[styles.employeeName, { color: colors.text }]}>
                  {group.employee_name}
                </Text>
                {group.user_id ? (
                  <View style={[styles.matchBadge, { backgroundColor: '#4CAF5015' }]}>
                    <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={12} color="#4CAF50" />
                    <Text style={[styles.matchBadgeText, { color: '#4CAF50' }]}>
                      Matched{group.user_name && group.user_name !== group.employee_name ? ` → ${group.user_name}` : ''}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.matchBadge, { backgroundColor: '#FF980015' }]}>
                    <IconSymbol ios_icon_name="exclamationmark.circle.fill" android_material_icon_name="error" size={12} color="#FF9800" />
                    <Text style={[styles.matchBadgeText, { color: '#FF9800' }]}>Not Matched</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.assignButton, { backgroundColor: group.user_id ? colors.primary + '15' : '#FF980020' }]}
                onPress={() => handleAssignUser(group.employee_name)}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name={group.user_id ? 'arrow.triangle.2.circlepath' : 'person.badge.plus'}
                  android_material_icon_name={group.user_id ? 'swap-horiz' : 'person-add'}
                  size={14}
                  color={group.user_id ? colors.primary : '#FF9800'}
                />
                <Text style={[styles.assignButtonText, { color: group.user_id ? colors.primary : '#FF9800' }]}>
                  {group.user_id ? 'Change' : 'Assign'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Shifts list */}
            {group.shifts.map((shift, idx) => (
              <View
                key={shift.id}
                style={[
                  styles.shiftRow,
                  idx < group.shifts.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: 'rgba(128,128,128,0.12)',
                  },
                ]}
              >
                <Text style={[styles.shiftDate, { color: colors.text }]}>
                  {formatDate(shift.shift_date)}
                </Text>
                <Text style={[styles.shiftTime, { color: colors.textSecondary }]}>
                  {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                </Text>
                <View style={styles.shiftMeta}>
                  {shift.roles.length > 0 && (
                    <View style={[styles.roleBadge, { backgroundColor: colors.primary + '15' }]}>
                      <Text style={[styles.roleText, { color: colors.primary }]}>{shift.roles[0]}</Text>
                    </View>
                  )}
                  {shift.is_closer && (
                    <View style={[styles.flagBadge, { backgroundColor: '#FF980020' }]}>
                      <Text style={[styles.flagText, { color: '#FF9800' }]}>C</Text>
                    </View>
                  )}
                  {shift.is_opener && (
                    <View style={[styles.flagBadge, { backgroundColor: '#4CAF5020' }]}>
                      <Text style={[styles.flagText, { color: '#4CAF50' }]}>O</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteShift(shift)}
                  style={styles.deleteShiftButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={16} color="rgba(128,128,128,0.4)" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}

        {/* Matched section label */}
        {unmatchedCount > 0 && matchedCount > 0 && (
          <View style={[styles.sectionHeader, { marginTop: 8 }]}>
            <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={16} color="#4CAF50" />
            <Text style={[styles.sectionTitle, { color: '#4CAF50' }]}>
              Matched Employees ({matchedCount})
            </Text>
          </View>
        )}
      </ScrollView>

      {/* User Assignment Modal */}
      <Modal visible={assignModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setAssignModalVisible(false)} style={styles.modalCancel}>
              <Text style={[styles.modalCancelText, { color: colors.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Assign Employee</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.modalSubheader}>
            <Text style={[styles.modalEmployeeName, { color: colors.text }]}>
              {selectedEmployee}
            </Text>
            <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
              Select the staff member this name belongs to
            </Text>
          </View>

          {/* Search */}
          <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
            <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search by name or ID..."
              placeholderTextColor={colors.textSecondary}
              value={userSearch}
              onChangeText={setUserSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {userSearch.length > 0 && (
              <TouchableOpacity onPress={() => setUserSearch('')}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Unassign option */}
          <TouchableOpacity
            style={[styles.userOption, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
            onPress={() => handleSelectUser(null)}
          >
            <View style={[styles.userAvatar, { backgroundColor: '#F4433620' }]}>
              <IconSymbol ios_icon_name="person.slash.fill" android_material_icon_name="person-off" size={18} color="#F44336" />
            </View>
            <View style={styles.userOptionInfo}>
              <Text style={[styles.userOptionName, { color: '#F44336' }]}>Unassign</Text>
              <Text style={[styles.userOptionSub, { color: colors.textSecondary }]}>Remove employee match</Text>
            </View>
          </TouchableOpacity>

          {/* User list */}
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            style={styles.userList}
            contentContainerStyle={styles.userListContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              // Check if this user is already assigned to a different employee in this upload
              const assignedTo = groupedShifts.find(
                (g) => g.user_id === item.id && g.employee_name !== selectedEmployee
              );

              return (
                <TouchableOpacity
                  style={[styles.userOption, { backgroundColor: colors.card }]}
                  onPress={() => handleSelectUser(item.id)}
                >
                  <View style={[styles.userAvatar, { backgroundColor: colors.primary + '15' }]}>
                    <Text style={[styles.userAvatarText, { color: colors.primary }]}>
                      {(item.name || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.userOptionInfo}>
                    <Text style={[styles.userOptionName, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.userOptionSub, { color: colors.textSecondary }]}>
                      ID: {item.username}
                      {assignedTo ? ` • Already assigned to ${assignedTo.employee_name}` : ''}
                    </Text>
                  </View>
                  {assignedTo && (
                    <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={16} color="#FF9800" />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
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
  savingOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 66,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
  },
  savingText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  summaryCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryStatItem: {
    alignItems: 'center',
  },
  summaryStatNumber: {
    fontSize: 22,
    fontWeight: '700',
  },
  summaryStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  employeeCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  unmatchedCard: {
    borderWidth: 1,
    borderColor: '#FF980030',
  },
  employeeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  employeeInfo: {
    flex: 1,
    marginRight: 8,
  },
  employeeName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  matchBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  assignButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 6,
  },
  shiftDate: {
    fontSize: 12,
    fontWeight: '600',
    width: 80,
  },
  shiftTime: {
    fontSize: 11,
    flex: 1,
  },
  shiftMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  roleBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  roleText: {
    fontSize: 9,
    fontWeight: '600',
  },
  flagBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: {
    fontSize: 9,
    fontWeight: '700',
  },
  deleteShiftButton: {
    padding: 2,
    marginLeft: 4,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 16 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCancel: {
    width: 60,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalSubheader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalEmployeeName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalHint: {
    fontSize: 13,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  userList: {
    flex: 1,
  },
  userListContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  userOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 1,
    borderRadius: 10,
    gap: 12,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  userOptionInfo: {
    flex: 1,
  },
  userOptionName: {
    fontSize: 15,
    fontWeight: '600',
  },
  userOptionSub: {
    fontSize: 12,
    marginTop: 1,
  },
});
