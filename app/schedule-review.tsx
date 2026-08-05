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
import { useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import PremiumGate from '@/components/PremiumGate';
import { getOrgDirectory } from '@/utils/orgDirectory';
import { useTranslation } from 'react-i18next';
import ShiftEditForm from '@/components/ShiftEditForm';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { translateServerError } from '@/utils/serverErrors';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// A-Z rail initial, accent-folded: ALPHABET holds no accented letters, so an
// unfolded 'Á' ("Ángela") matches no button AND renders no button of its own —
// the employee is invisible under every letter and reachable only via "All".
// Folding to the base letter files her under A. Used by BOTH the letter filter
// and the available-letters set so the two always agree.
const initialLetter = (name: string) =>
  name.charAt(0).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
  useRequireManagerRoute();
  const colors = useThemeColors();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'es' ? 'es-ES' : 'en-US';
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const { hasPremium } = useSubscription();
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

  // Add/Edit Shift Modal state — actual form lives in <ShiftEditForm />
  const [shiftFormVisible, setShiftFormVisible] = useState(false);
  const [shiftFormMode, setShiftFormMode] = useState<'add' | 'edit'>('add');
  const [shiftFormTarget, setShiftFormTarget] = useState<{
    shift?: ShiftRecord;
    employeeName?: string;
    userId?: string | null;
  }>({});

  // New Schedule flow (pick employee first, then add shifts)
  const [newScheduleModalVisible, setNewScheduleModalVisible] = useState(false);
  const [newScheduleSearch, setNewScheduleSearch] = useState('');

  useEffect(() => {
    loadData();
  }, [upload_id]);

  const loadData = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      // Load upload info (manager-gated; upload must belong to the actor's org)
      const { data: uploadRows } = await supabase.rpc('get_org_uploads', {
        p_actor_id: user.id,
        p_upload_id: upload_id,
      });
      const uploadData = Array.isArray(uploadRows) ? uploadRows[0] : uploadRows;

      if (uploadData) {
        setWeekStart(uploadData.week_start);
        setWeekEnd(uploadData.week_end);
      }

      // Load shifts for this upload
      const { data: shiftData, error: shiftError } = await supabase.rpc('get_upload_shifts', {
        p_actor_id: user.id,
        p_upload_id: upload_id,
      });

      if (shiftError) throw shiftError;
      setShifts(shiftData || []);

      // Load all users for assignment
      const directory = await getOrgDirectory(user?.id);
      const userData = directory
        .map((r) => ({ id: r.id, name: r.name, username: r.username }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      setUsers(userData || []);
    } catch (error) {
      console.error('Error loading review data:', error);
      Alert.alert(
        t('common.error', 'Error'),
        t('schedule_review.load_failed', 'Failed to load schedule data.')
      );
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
      return initialLetter(displayName) === selectedLetter;
    });
  }, [groupedShifts, selectedLetter]);

  const unmatchedCount = groupedShifts.filter((g) => !g.user_id).length;
  const matchedCount = groupedShifts.filter((g) => g.user_id).length;

  // Get available letters for A-Z nav
  const availableLetters = React.useMemo(() => {
    const letters = new Set<string>();
    groupedShifts.forEach((g) => {
      const displayName = g.user_name || g.employee_name;
      if (displayName) letters.add(initialLetter(displayName));
    });
    return letters;
  }, [groupedShifts]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString(dateLocale, { weekday: 'short', month: 'numeric', day: 'numeric' });
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
    return date.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' });
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
    if (!user?.id) return;
    try {
      setSaving(true);
      setAssignModalVisible(false);

      // One gated RPC updates every shift for this employee in this upload AND
      // recomputes unmatched_employees server-side from what's actually linked.
      const { error } = await supabase.rpc('assign_upload_shifts', {
        p_actor_id: user.id,
        p_upload_id: upload_id,
        p_employee_name: selectedEmployee,
        p_user_id: userId ?? undefined,
      });

      if (error) throw error;

      // Reload data
      await loadData();

      Alert.alert(
        t('schedule_review.updated_title', 'Updated'),
        userId
          ? t('schedule_review.assigned_msg', {
              defaultValue: 'Assigned {{employee}} to {{name}}.',
              employee: selectedEmployee,
              name:
                users.find((u) => u.id === userId)?.name ||
                t('schedule_review.unknown_user', 'user'),
            })
          : t('schedule_review.unassigned_msg', {
              defaultValue: 'Unassigned {{employee}}.',
              employee: selectedEmployee,
            })
      );
    } catch (error: any) {
      console.error('Error assigning user:', error);
      Alert.alert(
        t('common.error', 'Error'),
        translateServerError(error, t('schedule_review.assign_failed', 'Failed to update assignment.'))
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = (shift: ShiftRecord) => {
    Alert.alert(
      t('schedule_review.delete_title', 'Delete Shift'),
      t('schedule_review.delete_message', {
        defaultValue: "Remove {{employee}}'s shift on {{date}}?",
        employee: shift.employee_name,
        date: formatDate(shift.shift_date),
      }),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            try {
              // Gated delete; parsed_shifts_count is resynced inside the RPC.
              const { error } = await supabase.rpc('delete_shift', {
                p_actor_id: user.id,
                p_shift_id: shift.id,
              });
              if (error) throw error;

              await loadData();
            } catch (error: any) {
              console.error('Delete shift error:', error);
              Alert.alert(
                t('common.error', 'Error'),
                translateServerError(error, t('schedule_review.delete_failed', 'Failed to delete shift.'))
              );
            }
          },
        },
      ]
    );
  };

  // Add/Edit Shift handlers — actual form lives in <ShiftEditForm />
  const openAddShiftModal = (employeeName: string, userId: string | null) => {
    setShiftFormMode('add');
    setShiftFormTarget({ employeeName, userId });
    setShiftFormVisible(true);
  };

  const openEditShiftModal = (shift: ShiftRecord) => {
    setShiftFormMode('edit');
    setShiftFormTarget({ shift });
    setShiftFormVisible(true);
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

  if (!hasPremium) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('schedule_review.title', 'Review Schedule')} />
        <PremiumGate
          desc={t('schedule_upload.premium_desc')}
          bullets={[
            t('schedule_upload.premium_b1'),
            t('schedule_upload.premium_b2'),
            t('schedule_upload.premium_b3'),
            t('schedule_upload.premium_b4'),
            t('schedule_upload.premium_b5'),
          ]}
          footer={t('schedule_upload.premium_footer')}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('schedule_review.title', 'Review Schedule')} />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      {/* Header */}
      <ScreenHeader
        title={t('schedule_review.title', 'Review Schedule')}
        right={
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
        }
      />

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.savingText}>{t('schedule_review.saving', 'Saving...')}</Text>
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
                <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>
                  {t('schedule_review.stat_shifts', 'Shifts')}
                </Text>
              </View>
              <View style={styles.summaryStatItem}>
                <Text style={[styles.summaryStatNumber, { color: '#4CAF50' }]}>{matchedCount}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>
                  {t('schedule_review.stat_matched', 'Matched')}
                </Text>
              </View>
              {unmatchedCount > 0 && (
                <View style={styles.summaryStatItem}>
                  <Text style={[styles.summaryStatNumber, { color: '#FF9800' }]}>{unmatchedCount}</Text>
                  <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>
                    {t('schedule_review.stat_unmatched', 'Unmatched')}
                  </Text>
                </View>
              )}
              <View style={styles.summaryStatItem}>
                <Text style={[styles.summaryStatNumber, { color: colors.text }]}>{groupedShifts.length}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>
                  {t('schedule_review.stat_employees', 'Employees')}
                </Text>
              </View>
            </View>
          </View>

          {/* Unmatched section header */}
          {unmatchedCount > 0 && !selectedLetter && (
            <View style={styles.sectionHeader}>
              <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={16} color="#FF9800" />
              <Text style={[styles.sectionTitle, { color: '#FF9800' }]}>
                {t('schedule_review.unmatched_section', {
                  defaultValue: 'Unmatched Employees ({{count}})',
                  count: unmatchedCount,
                })}
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
                              {t('schedule_review.badge_matched', 'Matched')}
                              {group.user_name && group.user_name !== group.employee_name ? ` → ${group.user_name}` : ''}
                            </Text>
                          </View>
                        ) : (
                          <View style={[styles.matchBadge, { backgroundColor: '#FF980015' }]}>
                            <IconSymbol ios_icon_name="exclamationmark.circle.fill" android_material_icon_name="error" size={10} color="#FF9800" />
                            <Text style={[styles.matchBadgeText, { color: '#FF9800' }]}>
                              {t('schedule_review.badge_not_matched', 'Not Matched')}
                            </Text>
                          </View>
                        )}
                        <Text style={[styles.shiftCountText, { color: colors.textSecondary }]}>
                          {t('manual_schedule.shifts_count', { count: group.shifts.length })}
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
                      <Text style={[styles.actionButtonText, { color: '#4CAF50' }]}>
                        {t('schedule_review.add', 'Add')}
                      </Text>
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
                        {group.user_id
                          ? t('schedule_review.change', 'Change')
                          : t('schedule_review.assign', 'Assign')}
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
                          {shift.roles.length > 0 && (
                            <View style={[styles.roleBadge, { backgroundColor: colors.primary + '15' }]}>
                              <Text style={[styles.roleText, { color: colors.primary }]}>{shift.roles[0]}</Text>
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
                {t('schedule_review.matched_section', {
                  defaultValue: 'Matched Employees ({{count}})',
                  count: matchedCount,
                })}
              </Text>
            </View>
          )}

          {filteredGroups.length === 0 && selectedLetter && (
            <View style={styles.emptyFilter}>
              <Text style={[styles.emptyFilterText, { color: colors.textSecondary }]}>
                {t('schedule_review.no_employees_letter', {
                  defaultValue: 'No employees starting with "{{letter}}"',
                  letter: selectedLetter,
                })}
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
                // "All" -> "Todos" fills the 28pt rail button; keep it on one line.
                numberOfLines={1}
                style={[
                  styles.alphabetButtonText,
                  { color: colors.textSecondary },
                  selectedLetter === null && [styles.alphabetButtonTextActive, { color: '#FFFFFF' }],
                ]}
              >
                {t('schedule_review.all_letters', 'All')}
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
              <Text style={[styles.modalCancelText, { color: colors.primary }]}>
                {t('common.cancel', 'Cancel')}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t('schedule_review.assign_title', 'Assign Employee')}
            </Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.modalSubheader}>
            <Text style={[styles.modalEmployeeName, { color: colors.text }]}>
              {selectedEmployee}
            </Text>
            <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
              {t('schedule_review.assign_hint', 'Select the staff member this name belongs to')}
            </Text>
          </View>

          {/* Search */}
          <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
            <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={t('schedule_review.search_placeholder', 'Search by name or ID...')}
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
              <Text style={[styles.userOptionName, { color: '#F44336' }]}>
                {t('schedule_review.unassign', 'Unassign')}
              </Text>
              <Text style={[styles.userOptionSub, { color: colors.textSecondary }]}>
                {t('schedule_review.unassign_sub', 'Remove employee match')}
              </Text>
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
                      {t('schedule_review.user_id', {
                        defaultValue: 'ID: {{username}}',
                        username: item.username,
                      })}
                      {assignedTo
                        ? ` • ${t('schedule_review.already_assigned_to', {
                            defaultValue: 'Already assigned to {{name}}',
                            name: assignedTo.employee_name,
                          })}`
                        : ''}
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

      {/* Add/Edit Shift Modal — reusable form */}
      <ShiftEditForm
        visible={shiftFormVisible}
        mode={shiftFormMode}
        shift={shiftFormTarget.shift}
        employeeName={shiftFormTarget.employeeName}
        userId={shiftFormTarget.userId}
        uploadId={upload_id}
        defaultDate={weekStart ? new Date(weekStart + 'T12:00:00') : undefined}
        colors={colors}
        onClose={() => setShiftFormVisible(false)}
        onSaved={() => {
          setShiftFormVisible(false);
          loadData();
        }}
      />

      {/* New Schedule — Pick Employee Modal */}
      <Modal visible={newScheduleModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setNewScheduleModalVisible(false)} style={styles.modalCancel}>
              <Text style={[styles.modalCancelText, { color: colors.primary }]}>
                {t('common.cancel', 'Cancel')}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t('schedule_review.new_title', 'Add New Schedule')}
            </Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.modalSubheader}>
            <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
              {t('schedule_review.new_hint', 'Select an employee to add shifts for')}
            </Text>
          </View>

          {/* Search */}
          <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
            <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={t('schedule_review.search_placeholder', 'Search by name or ID...')}
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
                      {t('schedule_review.user_id', {
                        defaultValue: 'ID: {{username}}',
                        username: item.username,
                      })}
                      {existingGroup
                        ? ` • ${t('schedule_review.already_has_shifts', {
                            defaultValue: '{{count}} shifts already',
                            count: existingGroup.shifts.length,
                          })}`
                        : ''}
                    </Text>
                  </View>
                  {existingGroup && (
                    <View style={[styles.matchBadge, { backgroundColor: '#4CAF5015' }]}>
                      <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={10} color="#4CAF50" />
                      <Text style={[styles.matchBadgeText, { color: '#4CAF50' }]}>
                        {t('schedule_review.has_shifts_badge', 'Has shifts')}
                      </Text>
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
  headerAddButton: {
    padding: 4,
  },
  savingOverlay: {
    position: 'absolute',
    // Pinned just under <ScreenHeader />, which is platform-invariant:
    // paddingTop 48 + 38pt back chip + paddingBottom 12 = 98pt tall. The old
    // solid header measured (ios ? 60 : 16) + 40 + 12, and this overlay sat 2pt
    // above its bottom edge on both platforms — 98 - 2 keeps that exact overlap.
    top: 96,
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
