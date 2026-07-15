import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgDirectory } from '@/utils/orgDirectory';
import ShiftEditForm from '@/components/ShiftEditForm';
import * as Haptics from 'expo-haptics';
import { useSubscription } from '@/contexts/SubscriptionContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface ShiftRecord {
  id: string;
  upload_id: string;
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
  job_title: string | null;
  job_titles: string[] | null;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekBounds(date: Date): { start: Date; end: Date; startStr: string; endStr: string } {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const diffToSun = day;
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - diffToSun);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return {
    start: sunday,
    end: saturday,
    startStr: toISODate(sunday),
    endStr: toISODate(saturday),
  };
}

function formatWeekLabel(startStr: string, endStr: string): string {
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  const sMonth = s.toLocaleDateString('en-US', { month: 'long' });
  const eMonth = e.toLocaleDateString('en-US', { month: 'long' });
  const sDay = s.getDate();
  const eDay = e.getDate();
  const nth = (d: number) => {
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
  };
  if (sMonth === eMonth) {
    return `${sMonth} ${sDay}${nth(sDay)} - ${eDay}${nth(eDay)}`;
  }
  return `${sMonth} ${sDay}${nth(sDay)} - ${eMonth} ${eDay}${nth(eDay)}`;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
}

function formatTime(timeStr: string) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

export default function ManualScheduleScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const { hasPremium } = useSubscription();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Week navigation
  const [currentWeek, setCurrentWeek] = useState(() => getWeekBounds(new Date()));

  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Shift form state
  const [shiftFormVisible, setShiftFormVisible] = useState(false);
  const [shiftFormMode, setShiftFormMode] = useState<'add' | 'edit'>('add');
  const [shiftFormTarget, setShiftFormTarget] = useState<{
    shift?: ShiftRecord;
    employeeName?: string;
    userId?: string | null;
  }>({});

  useEffect(() => {
    loadUsers();
  }, [organizationId]);

  useEffect(() => {
    loadShifts();
  }, [currentWeek.startStr, currentWeek.endStr]);

  const loadUsers = async () => {
    try {
      const directory = await getOrgDirectory(user?.id);
      const data = directory
        .filter((r) => r.is_active)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadShifts = async () => {
    try {
      setLoading(true);
      // Manager-gated org schedule for the visible week (org derived server-side).
      const { data, error } = await supabase.rpc('get_org_schedule', {
        p_actor_id: user?.id ?? '',
        p_start_date: currentWeek.startStr,
        p_end_date: currentWeek.endStr,
      });

      if (error) throw error;
      setShifts((data || []) as any);
    } catch (error) {
      console.error('Error loading shifts:', error);
      Alert.alert('Error', 'Failed to load schedule data.');
    } finally {
      setLoading(false);
    }
  };

  const goToPrevWeek = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentWeek((prev) => {
      const d = new Date(prev.start);
      d.setDate(d.getDate() - 7);
      return getWeekBounds(d);
    });
  }, []);

  const goToNextWeek = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentWeek((prev) => {
      const d = new Date(prev.start);
      d.setDate(d.getDate() + 7);
      return getWeekBounds(d);
    });
  }, []);

  const handlePremiumFeature = () => {
    if (hasPremium) {
      // AI Schedule Upload is live — open the uploader (PDF/image → AI parse).
      router.push('/schedule-upload' as any);
    } else {
      Alert.alert(
        'Premium Feature',
        'AI Schedule Upload requires the Premium plan ($15/mo). Upgrade to unlock this and other premium features.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/subscription-management' as any) },
        ]
      );
    }
  };

  const employeeRows = useMemo(() => {
    const shiftsByUserId: Record<string, ShiftRecord[]> = {};
    const unassignedShifts: ShiftRecord[] = [];

    for (const shift of shifts) {
      if (shift.user_id) {
        if (!shiftsByUserId[shift.user_id]) shiftsByUserId[shift.user_id] = [];
        shiftsByUserId[shift.user_id].push(shift);
      } else {
        unassignedShifts.push(shift);
      }
    }

    const rows = users.map((u) => ({
      userId: u.id,
      name: u.name,
      jobTitles: u.job_titles || (u.job_title ? [u.job_title] : []),
      shifts: shiftsByUserId[u.id] || [],
    }));

    const unassignedGroups: Record<string, ShiftRecord[]> = {};
    for (const shift of unassignedShifts) {
      const key = shift.employee_name;
      if (!unassignedGroups[key]) unassignedGroups[key] = [];
      unassignedGroups[key].push(shift);
    }
    for (const [name, groupShifts] of Object.entries(unassignedGroups)) {
      if (!rows.some((r) => r.name === name)) {
        rows.push({
          userId: null as any,
          name,
          jobTitles: [],
          shifts: groupShifts,
        });
      }
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [users, shifts]);

  const filteredEmployeeRows = useMemo(() => {
    if (!selectedLetter) return employeeRows;
    return employeeRows.filter((r) => r.name.charAt(0).toUpperCase() === selectedLetter);
  }, [employeeRows, selectedLetter]);

  const totalShifts = shifts.length;
  const employeesWithShifts = useMemo(() => {
    const ids = new Set(shifts.map((s) => s.user_id).filter(Boolean));
    return ids.size;
  }, [shifts]);

  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    employeeRows.forEach((r) => {
      if (r.name) letters.add(r.name.charAt(0).toUpperCase());
    });
    return letters;
  }, [employeeRows]);

  const toggleCardExpanded = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openAddShift = (employeeName: string, userId: string | null) => {
    setShiftFormMode('add');
    setShiftFormTarget({ employeeName, userId });
    setShiftFormVisible(true);
  };

  const openEditShift = (shift: ShiftRecord) => {
    setShiftFormMode('edit');
    setShiftFormTarget({ shift });
    setShiftFormVisible(true);
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
              const { error } = await supabase.rpc('delete_shift', {
                p_actor_id: user?.id ?? '',
                p_shift_id: shift.id,
              });
              if (error) throw error;
              loadShifts();
            } catch (error) {
              console.error('Delete shift error:', error);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Schedules</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Premium Upload Section */}
      <View style={[styles.premiumSection, { backgroundColor: colors.card }]}>
        <View style={styles.premiumButtons}>
          <TouchableOpacity
            style={[styles.premiumButton, { backgroundColor: colors.primary + '12' }]}
            onPress={handlePremiumFeature}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="doc.fill" android_material_icon_name="description" size={16} color={colors.primary} />
            <Text style={[styles.premiumButtonText, { color: colors.primary }]}>Upload File</Text>
            {!hasPremium && <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={11} color={colors.primary + '60'} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.premiumButton, { backgroundColor: colors.primary + '12' }]}
            onPress={handlePremiumFeature}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="photo.fill" android_material_icon_name="photo-library" size={16} color={colors.primary} />
            <Text style={[styles.premiumButtonText, { color: colors.primary }]}>Upload Images</Text>
            {!hasPremium && <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={11} color={colors.primary + '60'} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.premiumButton, { backgroundColor: colors.primary + '12' }]}
            onPress={handlePremiumFeature}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="clock.arrow.circlepath" android_material_icon_name="history" size={16} color={colors.primary} />
            <Text style={[styles.premiumButtonText, { color: colors.primary }]}>History</Text>
            {!hasPremium && <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={11} color={colors.primary + '60'} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Week Navigation Strip */}
      <View style={[styles.weekNav, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          onPress={goToPrevWeek}
          style={styles.weekArrow}
          activeOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>

        <View style={styles.weekLabelContainer}>
          <Text style={[styles.weekLabel, { color: colors.text }]}>
            {formatWeekLabel(currentWeek.startStr, currentWeek.endStr)}
          </Text>
          <View style={styles.weekStats}>
            <Text style={[styles.weekStatText, { color: colors.primary }]}>{totalShifts} shifts</Text>
            <Text style={[styles.weekStatDot, { color: colors.textSecondary }]}> · </Text>
            <Text style={[styles.weekStatText, { color: '#4CAF50' }]}>{employeesWithShifts} scheduled</Text>
            <Text style={[styles.weekStatDot, { color: colors.textSecondary }]}> · </Text>
            <Text style={[styles.weekStatText, { color: colors.textSecondary }]}>{users.length} employees</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={goToNextWeek}
          style={styles.weekArrow}
          activeOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading && !shifts.length ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.contentRow}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredEmployeeRows.map((row) => {
              const cardKey = row.userId || row.name;
              const isExpanded = expandedCards.has(cardKey);
              const shiftCount = row.shifts.length;

              return (
                <View key={cardKey} style={[styles.employeeCard, { backgroundColor: colors.card }]}>
                  <TouchableOpacity
                    style={styles.employeeHeader}
                    onPress={() => toggleCardExpanded(cardKey)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.employeeHeaderLeft}>
                      <IconSymbol
                        ios_icon_name={isExpanded ? 'chevron.down' : 'chevron.right'}
                        android_material_icon_name={isExpanded ? 'expand-more' : 'chevron-right'}
                        size={16}
                        color={colors.textSecondary}
                      />
                      <View style={styles.employeeInfo}>
                        <Text style={[styles.employeeName, { color: colors.text }]}>{row.name}</Text>
                        <View style={styles.employeeMeta}>
                          {row.jobTitles.length > 0 && (
                            <View style={[styles.jobBadge, { backgroundColor: colors.primary + '15' }]}>
                              <Text style={[styles.jobBadgeText, { color: colors.primary }]}>
                                {row.jobTitles[0]}
                              </Text>
                            </View>
                          )}
                          <Text style={[styles.shiftCountText, { color: colors.textSecondary }]}>
                            {shiftCount} shift{shiftCount !== 1 ? 's' : ''}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[styles.addButton, { backgroundColor: '#4CAF5015' }]}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        openAddShift(row.name, row.userId);
                      }}
                      activeOpacity={0.7}
                    >
                      <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={13} color="#4CAF50" />
                      <Text style={[styles.addButtonText, { color: '#4CAF50' }]}>Add</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.shiftsContainer}>
                      {row.shifts.length === 0 ? (
                        <Text style={[styles.noShiftsText, { color: colors.textSecondary }]}>
                          No shifts this week
                        </Text>
                      ) : (
                        row.shifts.map((shift, idx) => (
                          <TouchableOpacity
                            key={shift.id}
                            style={[
                              styles.shiftRow,
                              idx < row.shifts.length - 1 && {
                                borderBottomWidth: StyleSheet.hairlineWidth,
                                borderBottomColor: 'rgba(128,128,128,0.12)',
                              },
                            ]}
                            onPress={() => openEditShift(shift)}
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
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {filteredEmployeeRows.length === 0 && selectedLetter && (
              <View style={styles.emptyFilter}>
                <Text style={[styles.emptyFilterText, { color: colors.textSecondary }]}>
                  No employees starting with "{selectedLetter}"
                </Text>
              </View>
            )}
          </ScrollView>

          {/* A-Z Navigation */}
          <View style={[styles.alphabetNav, { backgroundColor: colors.card }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.alphabetNavContent}>
              <TouchableOpacity
                style={[styles.alphabetButton, selectedLetter === null && styles.alphabetButtonActive]}
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
                    style={[styles.alphabetButton, selectedLetter === letter && styles.alphabetButtonActive]}
                    onPress={() => setSelectedLetter(selectedLetter === letter ? null : letter)}
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
      )}

      {/* Add/Edit Shift Modal */}
      <ShiftEditForm
        visible={shiftFormVisible}
        mode={shiftFormMode}
        shift={shiftFormTarget.shift}
        employeeName={shiftFormTarget.employeeName}
        userId={shiftFormTarget.userId}
        defaultDate={new Date(currentWeek.startStr + 'T12:00:00')}
        currentUserId={user?.id}
        colors={colors}
        onClose={() => setShiftFormVisible(false)}
        onSaved={() => {
          setShiftFormVisible(false);
          loadShifts();
        }}
      />
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
  premiumSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  premiumButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  premiumButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    gap: 4,
  },
  premiumButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  weekArrow: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekLabelContainer: {
    flex: 1,
    alignItems: 'center',
  },
  weekLabel: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 3,
  },
  weekStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekStatText: {
    fontSize: 11,
    fontWeight: '500',
  },
  weekStatDot: {
    fontSize: 11,
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
  jobBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  jobBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  shiftCountText: {
    fontSize: 11,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    gap: 3,
  },
  addButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  shiftsContainer: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.12)',
  },
  noShiftsText: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 8,
    textAlign: 'center',
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
});
