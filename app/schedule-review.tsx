import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Animated,
  LayoutAnimation,
  UIManager,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const ROLE_OPTIONS = [
  'Server', 'Bartender', 'Busser', 'Runner', 'Host',
  'Barback', 'Expo', 'Cook', 'Dishwasher', 'Manager',
];

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
  const scrollViewRef = useRef<ScrollView>(null);

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

  // A-Z filter
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

  // Collapsed state for employee cards (collapsed by default)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Section layout positions for letter jump
  const [sectionPositions, setSectionPositions] = useState<Record<string, number>>({});

  // Add/Edit Shift Modal state
  const [addShiftModalVisible, setAddShiftModalVisible] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null); // null = adding, string = editing
  const [addShiftEmployee, setAddShiftEmployee] = useState<string>('');
  const [addShiftUserId, setAddShiftUserId] = useState<string | null>(null);
  const [addShiftDate, setAddShiftDate] = useState(new Date());
  const [addShiftStartTime, setAddShiftStartTime] = useState(new Date());
  const [addShiftEndTime, setAddShiftEndTime] = useState(new Date());
  const [addShiftRole, setAddShiftRole] = useState('Server');
  const [addShiftIsCloser, setAddShiftIsCloser] = useState(false);
  const [addShiftIsOpener, setAddShiftIsOpener] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);

  // New Schedule flow (pick employee first, then add shifts)
  const [newScheduleModalVisible, setNewScheduleModalVisible] = useState(false);
  const [newScheduleSearch, setNewScheduleSearch] = useState('');

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

  // Filter by selected letter
  const filteredGroups = React.useMemo(() => {
    if (!selectedLetter) return groupedShifts;
    return groupedShifts.filter((g) => {
      const displayName = g.user_name || g.employee_name;
      return displayName.charAt(0).toUpperCase() === selectedLetter;
    });
  }, [groupedShifts, selectedLetter]);

  const unmatchedCount = groupedShifts.filter((g) => !g.user_id).length;
  const matchedCount = groupedShifts.filter((g) => g.user_id).length;

  // Get available letters for A-Z nav
  const availableLetters = React.useMemo(() => {
    const letters = new Set<string>();
    groupedShifts.forEach((g) => {
      const displayName = g.user_name || g.employee_name;
      if (displayName) letters.add(displayName.charAt(0).toUpperCase());
    });
    return letters;
  }, [groupedShifts]);

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

  const formatDateDisplay = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTimeDisplay = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const toggleCardExpanded = (employeeName: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(employeeName)) {
        next.delete(employeeName);
      } else {
        next.add(employeeName);
      }
      return next;
    });
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

  // Add/Edit Shift handlers
  const openAddShiftModal = (employeeName: string, userId: string | null) => {
    setEditingShiftId(null); // Adding mode
    setAddShiftEmployee(employeeName);
    setAddShiftUserId(userId);

    // Default date to start of the week range
    if (weekStart) {
      setAddShiftDate(new Date(weekStart + 'T12:00:00'));
    } else {
      setAddShiftDate(new Date());
    }

    // Default times
    const startDefault = new Date();
    startDefault.setHours(16, 30, 0, 0);
    setAddShiftStartTime(startDefault);

    const endDefault = new Date();
    endDefault.setHours(22, 0, 0, 0);
    setAddShiftEndTime(endDefault);

    setAddShiftRole('Server');
    setAddShiftIsCloser(false);
    setAddShiftIsOpener(false);
    setShowDatePicker(false);
    setShowStartTimePicker(false);
    setShowEndTimePicker(false);
    setShowRolePicker(false);
    setAddShiftModalVisible(true);
  };

  const openEditShiftModal = (shift: ShiftRecord) => {
    setEditingShiftId(shift.id); // Editing mode
    setAddShiftEmployee(shift.employee_name);
    setAddShiftUserId(shift.user_id);

    // Parse existing date
    setAddShiftDate(new Date(shift.shift_date + 'T12:00:00'));

    // Parse existing start time
    const [startH, startM] = shift.start_time.split(':').map(Number);
    const startDate = new Date();
    startDate.setHours(startH, startM, 0, 0);
    setAddShiftStartTime(startDate);

    // Parse existing end time
    const [endH, endM] = shift.end_time.split(':').map(Number);
    const endDate = new Date();
    endDate.setHours(endH, endM, 0, 0);
    setAddShiftEndTime(endDate);

    setAddShiftRole(shift.roles.length > 0 ? shift.roles[0] : 'Server');
    setAddShiftIsCloser(shift.is_closer);
    setAddShiftIsOpener(shift.is_opener);
    setShowDatePicker(false);
    setShowStartTimePicker(false);
    setShowEndTimePicker(false);
    setShowRolePicker(false);
    setAddShiftModalVisible(true);
  };

  // New Schedule flow — select employee then open add shift
  const handleNewScheduleSelectUser = (user: UserRecord) => {
    setNewScheduleModalVisible(false);
    openAddShiftModal(user.name, user.id);
  };

  const filteredNewScheduleUsers = users.filter((u) => {
    if (!newScheduleSearch.trim()) return true;
    const search = newScheduleSearch.toLowerCase();
    return (
      (u.name && u.name.toLowerCase().includes(search)) ||
      (u.username && u.username.includes(search))
    );
  });

  const handleSaveShift = async () => {
    try {
      setSaving(true);
      setAddShiftModalVisible(false);

      const shiftDate = addShiftDate.toISOString().split('T')[0];
      const startHours = addShiftStartTime.getHours().toString().padStart(2, '0');
      const startMins = addShiftStartTime.getMinutes().toString().padStart(2, '0');
      const endHours = addShiftEndTime.getHours().toString().padStart(2, '0');
      const endMins = addShiftEndTime.getMinutes().toString().padStart(2, '0');

      const shiftData = {
        shift_date: shiftDate,
        start_time: `${startHours}:${startMins}`,
        end_time: `${endHours}:${endMins}`,
        roles: [addShiftRole],
        is_closer: addShiftIsCloser,
        is_opener: addShiftIsOpener,
      };

      if (editingShiftId) {
        // UPDATE existing shift
        const { error } = await supabase
          .from('staff_schedules')
          .update(shiftData)
          .eq('id', editingShiftId);

        if (error) throw error;
        await loadData();
        Alert.alert('Shift Updated', `Updated shift for ${addShiftEmployee} on ${formatDate(shiftDate)}.`);
      } else {
        // INSERT new shift
        const { error } = await supabase.from('staff_schedules').insert({
          upload_id,
          user_id: addShiftUserId,
          employee_name: addShiftEmployee,
          ...shiftData,
          is_training: false,
          room_assignment: null,
        });

        if (error) throw error;

        // Update shift count
        const newCount = shifts.length + 1;
        await supabase
          .from('schedule_uploads')
          .update({ parsed_shifts_count: newCount })
          .eq('id', upload_id);

        await loadData();
        Alert.alert('Shift Added', `Added shift for ${addShiftEmployee} on ${formatDate(shiftDate)}.`);
      }
    } catch (error: any) {
      console.error('Error saving shift:', error);
      Alert.alert('Error', error.message || 'Failed to save shift.');
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!userSearch.trim()) return true;
    const search = userSearch.toLowerCase();
    return (
      (u.name && u.name.toLowerCase().includes(search)) ||
      (u.username && u.username.includes(search))
    );
  });

  const handleLetterPress = (letter: string) => {
    if (selectedLetter === letter) {
      setSelectedLetter(null);
    } else {
      setSelectedLetter(letter);
    }
  };

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
        <TouchableOpacity
          style={styles.headerAddButton}
          onPress={() => {
            setNewScheduleSearch('');
            setNewScheduleModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={26} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}

      <View style={styles.contentRow}>
        {/* Main scroll content */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
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

          {/* Unmatched section header */}
          {unmatchedCount > 0 && !selectedLetter && (
            <View style={styles.sectionHeader}>
              <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={16} color="#FF9800" />
              <Text style={[styles.sectionTitle, { color: '#FF9800' }]}>
                Unmatched Employees ({unmatchedCount})
              </Text>
            </View>
          )}

          {/* Employee cards */}
          {filteredGroups.map((group) => {
            const isExpanded = expandedCards.has(group.employee_name);

            return (
              <View
                key={group.employee_name}
                style={[
                  styles.employeeCard,
                  { backgroundColor: colors.card },
                  !group.user_id && styles.unmatchedCard,
                ]}
              >
                {/* Employee header — tappable to expand/collapse */}
                <TouchableOpacity
                  style={styles.employeeHeader}
                  onPress={() => toggleCardExpanded(group.employee_name)}
                  activeOpacity={0.7}
                >
                  <View style={styles.employeeHeaderLeft}>
                    {/* Expand/Collapse chevron */}
                    <IconSymbol
                      ios_icon_name={isExpanded ? 'chevron.down' : 'chevron.right'}
                      android_material_icon_name={isExpanded ? 'expand-more' : 'chevron-right'}
                      size={16}
                      color={colors.textSecondary}
                    />
                    <View style={styles.employeeInfo}>
                      <Text style={[styles.employeeName, { color: colors.text }]}>
                        {group.employee_name}
                      </Text>
                      <View style={styles.employeeMeta}>
                        {group.user_id ? (
                          <View style={[styles.matchBadge, { backgroundColor: '#4CAF5015' }]}>
                            <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={10} color="#4CAF50" />
                            <Text style={[styles.matchBadgeText, { color: '#4CAF50' }]}>
                              Matched{group.user_name && group.user_name !== group.employee_name ? ` → ${group.user_name}` : ''}
                            </Text>
                          </View>
                        ) : (
                          <View style={[styles.matchBadge, { backgroundColor: '#FF980015' }]}>
                            <IconSymbol ios_icon_name="exclamationmark.circle.fill" android_material_icon_name="error" size={10} color="#FF9800" />
                            <Text style={[styles.matchBadgeText, { color: '#FF9800' }]}>Not Matched</Text>
                          </View>
                        )}
                        <Text style={[styles.shiftCountText, { color: colors.textSecondary }]}>
                          {group.shifts.length} shift{group.shifts.length !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Action buttons — visible even when collapsed */}
                  <View style={styles.headerActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#4CAF5015' }]}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        openAddShiftModal(group.employee_name, group.user_id);
                      }}
                      activeOpacity={0.7}
                    >
                      <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={13} color="#4CAF50" />
                      <Text style={[styles.actionButtonText, { color: '#4CAF50' }]}>Add</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: group.user_id ? colors.primary + '15' : '#FF980020' }]}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handleAssignUser(group.employee_name);
                      }}
                      activeOpacity={0.7}
                    >
                      <IconSymbol
                        ios_icon_name={group.user_id ? 'arrow.triangle.2.circlepath' : 'person.badge.plus'}
                        android_material_icon_name={group.user_id ? 'swap-horiz' : 'person-add'}
                        size={13}
                        color={group.user_id ? colors.primary : '#FF9800'}
                      />
                      <Text style={[styles.actionButtonText, { color: group.user_id ? colors.primary : '#FF9800' }]}>
                        {group.user_id ? 'Change' : 'Assign'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>

                {/* Expanded shift list */}
                {isExpanded && (
                  <View style={styles.shiftsContainer}>
                    {group.shifts.map((shift, idx) => (
                      <TouchableOpacity
                        key={shift.id}
                        style={[
                          styles.shiftRow,
                          idx < group.shifts.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: 'rgba(128,128,128,0.12)',
                          },
                        ]}
                        onPress={() => openEditShiftModal(shift)}
                        activeOpacity={0.6}
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
                        <View style={styles.shiftActions}>
                          <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={13} color={colors.primary + '80'} />
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation?.();
                              handleDeleteShift(shift);
                            }}
                            style={styles.deleteShiftButton}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={16} color="rgba(128,128,128,0.4)" />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {/* Matched section label */}
          {unmatchedCount > 0 && matchedCount > 0 && !selectedLetter && (
            <View style={[styles.sectionHeader, { marginTop: 8 }]}>
              <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={16} color="#4CAF50" />
              <Text style={[styles.sectionTitle, { color: '#4CAF50' }]}>
                Matched Employees ({matchedCount})
              </Text>
            </View>
          )}

          {filteredGroups.length === 0 && selectedLetter && (
            <View style={styles.emptyFilter}>
              <Text style={[styles.emptyFilterText, { color: colors.textSecondary }]}>
                No employees starting with "{selectedLetter}"
              </Text>
            </View>
          )}
        </ScrollView>

        {/* A-Z Navigation Bar */}
        <View style={[styles.alphabetNav, { backgroundColor: colors.card }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.alphabetNavContent}>
            <TouchableOpacity
              style={[
                styles.alphabetButton,
                selectedLetter === null && styles.alphabetButtonActive,
              ]}
              onPress={() => setSelectedLetter(null)}
            >
              <Text
                style={[
                  styles.alphabetButtonText,
                  { color: colors.textSecondary },
                  selectedLetter === null && [styles.alphabetButtonTextActive, { color: '#FFFFFF' }],
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            {ALPHABET.map((letter) => {
              const hasEmployees = availableLetters.has(letter);
              return (
                <TouchableOpacity
                  key={letter}
                  style={[
                    styles.alphabetButton,
                    selectedLetter === letter && styles.alphabetButtonActive,
                  ]}
                  onPress={() => handleLetterPress(letter)}
                  disabled={!hasEmployees}
                >
                  <Text
                    style={[
                      styles.alphabetButtonText,
                      { color: hasEmployees ? colors.textSecondary : 'rgba(128,128,128,0.2)' },
                      selectedLetter === letter && [styles.alphabetButtonTextActive, { color: '#FFFFFF' }],
                    ]}
                  >
                    {letter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

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

      {/* Add/Edit Shift Modal */}
      <Modal visible={addShiftModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setAddShiftModalVisible(false)} style={styles.modalCancel}>
              <Text style={[styles.modalCancelText, { color: colors.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editingShiftId ? 'Edit Shift' : 'Add Shift'}</Text>
            <TouchableOpacity onPress={handleSaveShift} style={styles.modalSave}>
              <Text style={[styles.modalSaveText, { color: colors.primary }]}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.addShiftForm} contentContainerStyle={styles.addShiftFormContent}>
            {/* Employee name */}
            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Employee</Text>
              <Text style={[styles.formValue, { color: colors.text }]}>{addShiftEmployee}</Text>
            </View>

            {/* Date picker */}
            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Date</Text>
              <TouchableOpacity
                style={[styles.formPickerButton, { backgroundColor: colors.card }]}
                onPress={() => setShowDatePicker(!showDatePicker)}
              >
                <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={18} color={colors.primary} />
                <Text style={[styles.formPickerText, { color: colors.text }]}>{formatDateDisplay(addShiftDate)}</Text>
                <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={addShiftDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant="light"
                  onChange={(event, date) => {
                    if (Platform.OS === 'android') setShowDatePicker(false);
                    if (date) setAddShiftDate(date);
                  }}
                  style={styles.datePicker}
                />
              )}
            </View>

            {/* Start Time */}
            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Start Time</Text>
              <TouchableOpacity
                style={[styles.formPickerButton, { backgroundColor: colors.card }]}
                onPress={() => setShowStartTimePicker(!showStartTimePicker)}
              >
                <IconSymbol ios_icon_name="clock" android_material_icon_name="schedule" size={18} color={colors.primary} />
                <Text style={[styles.formPickerText, { color: colors.text }]}>{formatTimeDisplay(addShiftStartTime)}</Text>
                <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {showStartTimePicker && (
                <DateTimePicker
                  value={addShiftStartTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant="light"
                  minuteInterval={5}
                  onChange={(event, date) => {
                    if (Platform.OS === 'android') setShowStartTimePicker(false);
                    if (date) setAddShiftStartTime(date);
                  }}
                  style={styles.datePicker}
                />
              )}
            </View>

            {/* End Time */}
            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>End Time</Text>
              <TouchableOpacity
                style={[styles.formPickerButton, { backgroundColor: colors.card }]}
                onPress={() => setShowEndTimePicker(!showEndTimePicker)}
              >
                <IconSymbol ios_icon_name="clock.fill" android_material_icon_name="schedule" size={18} color={colors.primary} />
                <Text style={[styles.formPickerText, { color: colors.text }]}>{formatTimeDisplay(addShiftEndTime)}</Text>
                <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {showEndTimePicker && (
                <DateTimePicker
                  value={addShiftEndTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant="light"
                  minuteInterval={5}
                  onChange={(event, date) => {
                    if (Platform.OS === 'android') setShowEndTimePicker(false);
                    if (date) setAddShiftEndTime(date);
                  }}
                  style={styles.datePicker}
                />
              )}
            </View>

            {/* Role picker */}
            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Job Title / Role</Text>
              <TouchableOpacity
                style={[styles.formPickerButton, { backgroundColor: colors.card }]}
                onPress={() => setShowRolePicker(!showRolePicker)}
              >
                <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={18} color={colors.primary} />
                <Text style={[styles.formPickerText, { color: colors.text }]}>{addShiftRole}</Text>
                <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {showRolePicker && (
                <View style={[styles.rolePickerList, { backgroundColor: colors.card }]}>
                  {ROLE_OPTIONS.map((role) => (
                    <TouchableOpacity
                      key={role}
                      style={[
                        styles.rolePickerItem,
                        addShiftRole === role && { backgroundColor: colors.primary + '15' },
                      ]}
                      onPress={() => {
                        setAddShiftRole(role);
                        setShowRolePicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.rolePickerText,
                          { color: addShiftRole === role ? colors.primary : colors.text },
                        ]}
                      >
                        {role}
                      </Text>
                      {addShiftRole === role && (
                        <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Closer/Opener toggles */}
            <View style={styles.formSection}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Shift Tags</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    { backgroundColor: addShiftIsOpener ? '#4CAF5020' : colors.card },
                    addShiftIsOpener && { borderColor: '#4CAF50', borderWidth: 1 },
                  ]}
                  onPress={() => {
                    setAddShiftIsOpener(!addShiftIsOpener);
                    if (!addShiftIsOpener) setAddShiftIsCloser(false);
                  }}
                >
                  <IconSymbol
                    ios_icon_name="sunrise.fill"
                    android_material_icon_name="wb-sunny"
                    size={16}
                    color={addShiftIsOpener ? '#4CAF50' : colors.textSecondary}
                  />
                  <Text style={[styles.toggleText, { color: addShiftIsOpener ? '#4CAF50' : colors.textSecondary }]}>
                    Opener
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    { backgroundColor: addShiftIsCloser ? '#FF980020' : colors.card },
                    addShiftIsCloser && { borderColor: '#FF9800', borderWidth: 1 },
                  ]}
                  onPress={() => {
                    setAddShiftIsCloser(!addShiftIsCloser);
                    if (!addShiftIsCloser) setAddShiftIsOpener(false);
                  }}
                >
                  <IconSymbol
                    ios_icon_name="moon.fill"
                    android_material_icon_name="nightlight-round"
                    size={16}
                    color={addShiftIsCloser ? '#FF9800' : colors.textSecondary}
                  />
                  <Text style={[styles.toggleText, { color: addShiftIsCloser ? '#FF9800' : colors.textSecondary }]}>
                    Closer
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* New Schedule — Pick Employee Modal */}
      <Modal visible={newScheduleModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setNewScheduleModalVisible(false)} style={styles.modalCancel}>
              <Text style={[styles.modalCancelText, { color: colors.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add New Schedule</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.modalSubheader}>
            <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
              Select an employee to add shifts for
            </Text>
          </View>

          {/* Search */}
          <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
            <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search by name or ID..."
              placeholderTextColor={colors.textSecondary}
              value={newScheduleSearch}
              onChangeText={setNewScheduleSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {newScheduleSearch.length > 0 && (
              <TouchableOpacity onPress={() => setNewScheduleSearch('')}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* User list */}
          <FlatList
            data={filteredNewScheduleUsers}
            keyExtractor={(item) => item.id}
            style={styles.userList}
            contentContainerStyle={styles.userListContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              // Check if this employee already has shifts in this upload
              const existingGroup = groupedShifts.find((g) => g.user_id === item.id);
              return (
                <TouchableOpacity
                  style={[styles.userOption, { backgroundColor: colors.card }]}
                  onPress={() => handleNewScheduleSelectUser(item)}
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
                      {existingGroup ? ` • ${existingGroup.shifts.length} shifts already` : ''}
                    </Text>
                  </View>
                  {existingGroup && (
                    <View style={[styles.matchBadge, { backgroundColor: '#4CAF5015' }]}>
                      <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={10} color="#4CAF50" />
                      <Text style={[styles.matchBadgeText, { color: '#4CAF50' }]}>Has shifts</Text>
                    </View>
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
  headerAddButton: {
    padding: 4,
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
  contentRow: {
    flex: 1,
    flexDirection: 'row',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingRight: 8,
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
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden',
  },
  unmatchedCard: {
    borderWidth: 1,
    borderColor: '#FF980030',
  },
  employeeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  employeeHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  employeeInfo: {
    flex: 1,
  },
  employeeName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  employeeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shiftCountText: {
    fontSize: 11,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    gap: 3,
  },
  matchBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    gap: 3,
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  shiftsContainer: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.12)',
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
  shiftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 4,
  },
  deleteShiftButton: {
    padding: 2,
  },
  emptyFilter: {
    alignItems: 'center',
    padding: 32,
  },
  emptyFilterText: {
    fontSize: 14,
  },
  // A-Z Navigation
  alphabetNav: {
    width: 36,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: -1, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 3,
  },
  alphabetNavContent: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  alphabetButton: {
    width: 28,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 1,
    borderRadius: 14,
  },
  alphabetButtonActive: {
    backgroundColor: '#D4A843',
  },
  alphabetButtonText: {
    fontSize: 10,
    fontWeight: '600',
  },
  alphabetButtonTextActive: {
    fontWeight: '700',
  },
  // Modals
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
  modalSave: {
    width: 60,
    alignItems: 'flex-end',
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
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
  // Add Shift Form
  addShiftForm: {
    flex: 1,
  },
  addShiftFormContent: {
    padding: 16,
    paddingBottom: 40,
  },
  formSection: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formValue: {
    fontSize: 17,
    fontWeight: '600',
  },
  formPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  formPickerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  datePicker: {
    marginTop: 8,
  },
  rolePickerList: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  rolePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.1)',
  },
  rolePickerText: {
    fontSize: 15,
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
