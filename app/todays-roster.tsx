import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  FlatList,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import WeeklyCalendarStrip from '@/components/WeeklyCalendarStrip';
import ManagerTabBarStatic from '@/components/ManagerTabBarStatic';
import ShiftEditForm, { ShiftLike } from '@/components/ShiftEditForm';
import { isSameDay } from '@/utils/dateUtils';

interface RosterShift {
  id: string;
  upload_id: string;
  employee_name: string;
  user_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[];
  is_closer: boolean;
  is_opener: boolean;
  is_training: boolean;
  room_assignment: string | null;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAYS_BEFORE = 30;
const DAYS_AFTER = 30;
const TOTAL_DAYS = DAYS_BEFORE + DAYS_AFTER + 1;
const INITIAL_INDEX = DAYS_BEFORE;

export default function TodaysRosterScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { user } = useAuth();

  // Build the ±30 day window anchored on today (stable for the lifetime of the screen).
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: TOTAL_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + (i - DAYS_BEFORE));
      return d;
    });
  }, []);

  const [currentIndex, setCurrentIndex] = useState(INITIAL_INDEX);
  const selectedDate = days[currentIndex];

  const [shiftsByDate, setShiftsByDate] = useState<Record<string, RosterShift[]>>({});
  const [loadingByDate, setLoadingByDate] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'am' | 'pm'>('am');

  // Shift edit form state
  const [shiftFormVisible, setShiftFormVisible] = useState(false);
  const [shiftFormMode, setShiftFormMode] = useState<'add' | 'edit'>('add');
  const [shiftFormShift, setShiftFormShift] = useState<ShiftLike | undefined>(undefined);

  const pagerRef = useRef<FlatList<Date>>(null);

  const loadShiftsForDate = useCallback(async (date: Date, force = false) => {
    const iso = toISODate(date);
    setLoadingByDate((prev) => ({ ...prev, [iso]: true }));
    try {
      const { data, error } = await supabase
        .from('staff_schedules')
        .select(
          'id, upload_id, employee_name, user_id, shift_date, start_time, end_time, roles, is_closer, is_opener, is_training, room_assignment'
        )
        .eq('shift_date', iso)
        .order('start_time', { ascending: true });
      if (error) throw error;
      setShiftsByDate((prev) => ({ ...prev, [iso]: (data || []) as RosterShift[] }));
    } catch (error) {
      console.error('Error loading roster:', error);
      if (force) {
        setShiftsByDate((prev) => ({ ...prev, [iso]: [] }));
      }
    } finally {
      setLoadingByDate((prev) => ({ ...prev, [iso]: false }));
    }
  }, []);

  // Prefetch current day + neighbors whenever the visible index changes.
  useEffect(() => {
    const indexes = [currentIndex - 1, currentIndex, currentIndex + 1].filter(
      (i) => i >= 0 && i < TOTAL_DAYS
    );
    indexes.forEach((i) => {
      const iso = toISODate(days[i]);
      if (shiftsByDate[iso] === undefined && !loadingByDate[iso]) {
        loadShiftsForDate(days[i]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // On focus, invalidate and reload the current day so edits made elsewhere (e.g. Review Schedule)
  // show up immediately when returning to the Roster.
  useFocusEffect(
    useCallback(() => {
      loadShiftsForDate(days[currentIndex], true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentIndex])
  );

  const handleSelectDate = (date: Date | null) => {
    if (!date) return;
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    const idx = days.findIndex((d) => isSameDay(d, normalized));
    if (idx >= 0 && idx !== currentIndex) {
      pagerRef.current?.scrollToIndex({ index: idx, animated: true });
      setCurrentIndex(idx);
    }
  };

  const handleMomentumScrollEnd = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (idx !== currentIndex && idx >= 0 && idx < TOTAL_DAYS) {
      setCurrentIndex(idx);
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
    let totalMinutes = endH * 60 + endM - (startH * 60 + startM);
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const currentIso = toISODate(selectedDate);
  const currentShifts = shiftsByDate[currentIso] || [];
  const currentLoading = loadingByDate[currentIso] || shiftsByDate[currentIso] === undefined;

  const amCount = currentShifts.filter((s) => Number(s.start_time.split(':')[0]) < 12).length;
  const pmCount = currentShifts.filter((s) => Number(s.start_time.split(':')[0]) >= 12).length;

  const dateStr = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const isViewingToday = isSameDay(selectedDate, new Date());

  const openAddShift = () => {
    setShiftFormMode('add');
    setShiftFormShift(undefined);
    setShiftFormVisible(true);
  };

  const openEditShift = (shift: RosterShift) => {
    setShiftFormMode('edit');
    setShiftFormShift(shift);
    setShiftFormVisible(true);
  };

  const handleShiftSaved = () => {
    setShiftFormVisible(false);
    // Invalidate and reload so the visible page reflects the change immediately.
    loadShiftsForDate(days[currentIndex], true);
  };

  const renderDayPage = ({ item: day }: { item: Date }) => {
    const iso = toISODate(day);
    const dayShifts = shiftsByDate[iso] || [];
    const isLoading = loadingByDate[iso] || shiftsByDate[iso] === undefined;

    const amShifts = dayShifts.filter((s) => Number(s.start_time.split(':')[0]) < 12);
    const pmShifts = dayShifts.filter((s) => Number(s.start_time.split(':')[0]) >= 12);
    const active = activeTab === 'am' ? amShifts : pmShifts;

    const roleGroups: { role: string; shifts: RosterShift[] }[] = (() => {
      const map: Record<string, RosterShift[]> = {};
      active.forEach((shift) => {
        const role = shift.roles.length > 0 ? [...new Set(shift.roles)][0] : 'Other';
        if (!map[role]) map[role] = [];
        map[role].push(shift);
      });
      return Object.keys(map)
        .sort((a, b) => a.localeCompare(b))
        .map((role) => ({
          role,
          shifts: map[role].sort((a, b) => a.start_time.localeCompare(b.start_time)),
        }));
    })();

    return (
      <View style={{ width: SCREEN_WIDTH }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.loadingIndicator} />
          ) : active.length === 0 ? (
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
                No staff scheduled for the {activeTab === 'am' ? 'AM' : 'PM'} shift on this day.
              </Text>
            </View>
          ) : (
            roleGroups.map((group) => (
              <View key={group.role} style={styles.roleGroup}>
                <View style={styles.roleGroupHeader}>
                  <View style={[styles.roleGroupBadge, { backgroundColor: colors.primary + '12' }]}>
                    <Text style={[styles.roleGroupTitle, { color: colors.primary }]}>{group.role}</Text>
                  </View>
                  <View style={[styles.roleGroupLine, { backgroundColor: colors.primary + '15' }]} />
                  <Text style={[styles.roleGroupCount, { color: colors.textSecondary }]}>
                    {group.shifts.length}
                  </Text>
                </View>

                {group.shifts.map((shift) => (
                  <TouchableOpacity
                    key={shift.id}
                    style={[styles.shiftCard, { backgroundColor: colors.card }]}
                    onPress={() => openEditShift(shift)}
                    activeOpacity={0.7}
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
                          <Text style={styles.duration}>
                            {getShiftDuration(shift.start_time, shift.end_time)}
                          </Text>
                        </Text>
                      </View>

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
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Roster</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Weekly calendar strip — edge-to-edge to match the header */}
      <WeeklyCalendarStrip
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        colors={{
          primary: colors.primary,
          background: colors.background,
          text: colors.text,
          textSecondary: colors.textSecondary,
          card: colors.card,
        }}
        events={[]}
        edgeToEdge
        hideViewTopEvents
      />

      {/* Date and stats */}
      <View style={[styles.dateBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.dateText, { color: colors.text }]}>
          {isViewingToday ? 'Today — ' : ''}
          {dateStr}
        </Text>
        <View style={styles.statsRow}>
          <View style={[styles.statBadge, { backgroundColor: colors.primary + '12' }]}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{currentShifts.length}</Text>
            <Text style={[styles.statLabel, { color: colors.primary }]}>Total</Text>
          </View>
          <View style={[styles.statBadge, { backgroundColor: '#FF980012' }]}>
            <Text style={[styles.statNumber, { color: '#FF9800' }]}>{amCount}</Text>
            <Text style={[styles.statLabel, { color: '#FF9800' }]}>AM</Text>
          </View>
          <View style={[styles.statBadge, { backgroundColor: '#7C4DFF12' }]}>
            <Text style={[styles.statNumber, { color: '#7C4DFF' }]}>{pmCount}</Text>
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
            AM ({amCount})
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
            PM ({pmCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal day pager — swipe left/right to navigate between days */}
      <FlatList
        ref={pagerRef}
        data={days}
        keyExtractor={(d) => toISODate(d)}
        renderItem={renderDayPage}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={INITIAL_INDEX}
        getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        extraData={{ activeTab, shiftsByDate, loadingByDate }}
        removeClippedSubviews={false}
        style={styles.pager}
      />

      {/* Floating + button — positioned above the floating tab bar */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.highlight || colors.primary }]}
        onPress={openAddShift}
        activeOpacity={0.85}
      >
        <IconSymbol
          ios_icon_name="plus"
          android_material_icon_name="add"
          size={28}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* Floating tab bar — matches the manager portal's nav bar, navigates back on tap */}
      <ManagerTabBarStatic />

      {/* Shift edit form */}
      <ShiftEditForm
        visible={shiftFormVisible}
        mode={shiftFormMode}
        shift={shiftFormShift}
        defaultDate={selectedDate}
        currentUserId={user?.id}
        colors={colors}
        onClose={() => setShiftFormVisible(false)}
        onSaved={handleShiftSaved}
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
  pager: {
    flex: 1,
    marginTop: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 200,
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 110,
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1001,
  },
});
