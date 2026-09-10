import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { useScheduleAttention } from '@/hooks/useScheduleAttention';
import { IconSymbol } from '@/components/IconSymbol';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import MenuSearchRow from '@/components/MenuSearchRow';
import ScheduleGearChip from '@/components/schedule/ScheduleGearChip';
import ScheduleNavSheet from '@/components/schedule/ScheduleNavSheet';
import ShiftRow from '@/components/schedule/ShiftRow';
import ShiftEditSheet, { type ShiftLike } from '@/components/schedule/ShiftEditSheet';
import { scheduleHue } from '@/components/schedule/scheduleVisuals';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getOrgDirectory } from '@/utils/orgDirectory';
import { translateServerError } from '@/utils/serverErrors';
import { localeFor, toISODate, initialsOf, formatDateShort } from '@/utils/schedule/format';
import { fonts } from '@/constants/fonts';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// A-Z rail initial, accent-folded (the schedule-review rule): ALPHABET holds no
// accented letters, so an unfolded 'Á' ("Ángela") would match no rail button —
// folding to the base letter files her under A. Used by BOTH the rail's
// available-letters set and the scroll-to lookup so the two always agree.
const initialLetter = (name: string) =>
  name.charAt(0).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

type ShiftRecord = ShiftLike;

interface UserRecord {
  id: string;
  name: string;
  job_title: string | null;
  job_titles: string[] | null;
}

interface EmployeeRow {
  /** stable card key — the user id, or the schedule name for an unmatched group */
  key: string;
  userId: string | null;
  name: string;
  jobTitles: string[];
  shifts: ShiftRecord[];
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

function formatWeekLabel(startStr: string, endStr: string, isES: boolean): string {
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  if (isES) {
    // Spanish mirror-range, month-last: "19 - 25 de julio" / "26 de julio - 1 de agosto".
    // EN keeps its ordinal format below, untouched.
    const sMonthEs = s.toLocaleDateString('es-ES', { month: 'long' });
    const eMonthEs = e.toLocaleDateString('es-ES', { month: 'long' });
    if (sMonthEs === eMonthEs) return `${s.getDate()} - ${e.getDate()} de ${eMonthEs}`;
    return `${s.getDate()} de ${sMonthEs} - ${e.getDate()} de ${eMonthEs}`;
  }
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

/**
 * JobTitleFilterSheet — the Filter slot of the search row. One glass chip per
 * org job title (active titles, plus any role this week's shifts carry that the
 * org list doesn't), multi-select. State-only: toggling never closes the sheet,
 * so no useSheetHandoff is needed; the selection lives in the page and persists
 * until Clear.
 */
function JobTitleFilterSheet({
  visible,
  onClose,
  titles,
  selected,
  onToggle,
  onClear,
}: {
  visible: boolean;
  onClose: () => void;
  titles: string[];
  selected: string[];
  onToggle: (title: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const selectedLower = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('manual_schedule.filter_title')}
      subtitle={t('manual_schedule.filter_sub')}
      footer={
        <View style={styles.sheetFooter}>
          <Pressable
            style={[
              styles.footerBtn,
              { backgroundColor: colors.glass, borderColor: colors.glassBorder },
              !selected.length && styles.footerBtnDisabled,
            ]}
            onPress={onClear}
            disabled={!selected.length}
          >
            <Text style={[styles.footerLabel, { color: colors.textSecondary }]}>{t('common.clear')}</Text>
          </Pressable>
          <Pressable
            style={[styles.footerBtn, styles.footerPrimary, { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={onClose}
          >
            <Text style={[styles.footerLabel, { color: colors.fireText }]}>{t('content_editor.done')}</Text>
          </Pressable>
        </View>
      }
    >
      {titles.length === 0 ? (
        <Text style={[styles.sheetHint, { color: colors.textSecondary }]}>{t('manual_schedule.filter_empty')}</Text>
      ) : (
        <View style={styles.chipsWrap}>
          {titles.map((title) => {
            const on = selectedLower.has(title.toLowerCase());
            return (
              <Pressable
                key={title}
                onPress={() => onToggle(title)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[
                  styles.filterChip,
                  { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                  on && { backgroundColor: colors.primary + '24', borderColor: colors.primary + '80' },
                ]}
              >
                {on && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={12} color={colors.primary} />}
                <Text style={[styles.filterChipText, { color: on ? colors.primary : colors.text }]} numberOfLines={1}>
                  {title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </GlassSheet>
  );
}

/** Glass empty state — one icon disc, a title, a line of copy, optional action. */
function EmptyCard({
  iosIcon,
  androidIcon,
  title,
  sub,
  actionLabel,
  onAction,
}: {
  iosIcon: string;
  androidIcon: string;
  title: string;
  sub: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <GlassCard variant="surface" radius={16} style={styles.emptyCard}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '24' }]}>
        <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={20} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptySub, { color: colors.textSecondary }]}>{sub}</Text>
      {!!onAction && !!actionLabel && (
        <Pressable
          onPress={onAction}
          style={[styles.emptyAction, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          accessibilityRole="button"
        >
          <Text style={[styles.emptyActionLabel, { color: colors.text }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </GlassCard>
  );
}

export default function ManualScheduleScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const isES = i18n.language === 'es';
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { language } = useLanguage();
  const locale = localeFor(language);
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const { hasPremium, isLoading: subLoading } = useSubscription();
  const { perms, loading: permsLoading } = useManagerPermissions();
  const { attention } = useScheduleAttention();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);

  // Week navigation
  const [currentWeek, setCurrentWeek] = useState(() => getWeekBounds(new Date()));
  // Add Shift opens on today when the week on screen holds it, else on the week's Sunday
  const weekHasToday = useMemo(() => {
    const today = toISODate(new Date());
    return today >= currentWeek.startStr && today <= currentWeek.endStr;
  }, [currentWeek.startStr, currentWeek.endStr]);

  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [navOpen, setNavOpen] = useState(false);

  // Search + job-title filter (they compose; the filter persists until Clear)
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
  const [orgTitles, setOrgTitles] = useState<string[]>([]);

  // Shift editor (the shared ShiftEditSheet)
  const [editor, setEditor] = useState<{
    visible: boolean;
    mode: 'add' | 'edit';
    shift?: ShiftRecord;
    employeeName?: string;
    userId?: string | null;
  }>({ visible: false, mode: 'add' });

  // A-Z rail: each card reports its y inside the scroll content on layout.
  const scrollRef = useRef<ScrollView>(null);
  const cardY = useRef<Record<string, number>>({});

  const loadUsers = useCallback(async () => {
    try {
      const directory = await getOrgDirectory(user?.id);
      const data = directory
        .filter((r) => r.is_active)
        .map((r) => ({ id: r.id, name: r.name, job_title: r.job_title, job_titles: r.job_titles }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setUsers(data);
    } catch (error: any) {
      console.error('[manual-schedule] load users error:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, organizationId]);

  const loadTitles = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.rpc('get_org_job_titles', { p_actor_id: user.id });
    if (error) {
      console.error('[manual-schedule] load job titles error:', error);
      return;
    }
    setOrgTitles((data || []).filter((r) => r.is_active !== false).map((r) => r.title));
  }, [user?.id]);

  useEffect(() => {
    loadTitles();
  }, [loadTitles]);

  const loadShifts = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      // Manager-gated org schedule for the visible week (org derived server-side).
      const { data, error } = await supabase.rpc('get_org_schedule', {
        p_actor_id: user.id,
        p_start_date: currentWeek.startStr,
        p_end_date: currentWeek.endStr,
      });
      if (error) throw error;
      setShifts(data || []);
    } catch (error: any) {
      console.error('[manual-schedule] load shifts error:', error);
      Alert.alert(t('common.error'), translateServerError(error, t('manual_schedule.load_failed')));
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [user?.id, currentWeek.startStr, currentWeek.endStr, t]);

  // on focus, not just on mount — Review's Save pops back to THIS instance (dismissTo),
  // and the shifts it edited must show without a manual refresh
  useFocusEffect(
    useCallback(() => {
      loadShifts();
    }, [loadShifts]),
  );

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

  // Uploads chip lock — the manager-permissions grammar (locked, never hidden):
  // base tier wears the Premium lock; a manager without the AI Schedule Uploads
  // grant wears the "Ask the owner" lock. Owners hold every grant.
  // (both wait for their loads — the chip flashed a lock for a beat on the sim smoke, s83)
  const grantLocked = user?.role === 'manager' && !permsLoading && !perms.aiScheduleUpload;
  const uploadLocked = (!hasPremium && !subLoading) || grantLocked;
  const gold = scheduleHue('pending', isDark);

  const onUploadsPress = () => {
    if (!hasPremium) {
      Alert.alert(t('schedule_upload.premium_title'), t('schedule_upload.premium_msg'), [
        { text: t('common.not_now'), style: 'cancel' },
        { text: t('common.upgrade'), onPress: () => router.push('/subscription-management' as any) },
      ]);
      return;
    }
    if (grantLocked) {
      Alert.alert(t('manual_schedule.uploads_locked_title'), t('schedule_nav.ask_owner'));
      return;
    }
    router.push('/schedule-upload' as any);
  };

  const employeeRows = useMemo<EmployeeRow[]>(() => {
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

    const byDateThenTime = (a: ShiftRecord, b: ShiftRecord) =>
      a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time);

    const rows: EmployeeRow[] = users.map((u) => ({
      key: u.id,
      userId: u.id,
      name: u.name,
      jobTitles: u.job_titles || (u.job_title ? [u.job_title] : []),
      shifts: (shiftsByUserId[u.id] || []).sort(byDateThenTime),
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
          key: `name:${name}`,
          userId: null,
          name,
          jobTitles: [],
          shifts: groupShifts.sort(byDateThenTime),
        });
      }
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [users, shifts]);

  const selectedLower = useMemo(() => new Set(selectedTitles.map((s) => s.toLowerCase())), [selectedTitles]);
  const query = search.trim().toLowerCase();
  const hasNarrowing = query.length > 0 || selectedTitles.length > 0;

  // Search (name, case-insensitive) AND filter (holds ANY selected title —
  // job_titles, falling back to job_title; a name-only group with no directory
  // titles matches on the roles its shifts carry, so it stays reachable).
  const visibleRows = useMemo(() => {
    return employeeRows.filter((row) => {
      if (query && !row.name.toLowerCase().includes(query)) return false;
      if (selectedLower.size) {
        const titles = row.jobTitles.length ? row.jobTitles : row.shifts.flatMap((s) => s.roles || []);
        if (!titles.some((jt) => selectedLower.has(jt.toLowerCase()))) return false;
      }
      return true;
    });
  }, [employeeRows, query, selectedLower]);

  // Filter chips: the org's active titles, plus any role on this week's shifts
  // the list lacks, plus anything currently selected (so a stale pick can still
  // be toggled off after the week moves on). De-duped case-insensitively.
  const filterTitles = useMemo(() => {
    const byLower = new Map<string, string>();
    const add = (title: string | null | undefined) => {
      const trimmed = (title || '').trim();
      if (trimmed && !byLower.has(trimmed.toLowerCase())) byLower.set(trimmed.toLowerCase(), trimmed);
    };
    orgTitles.forEach(add);
    shifts.forEach((s) => (s.roles || []).forEach(add));
    selectedTitles.forEach(add);
    return Array.from(byLower.values());
  }, [orgTitles, shifts, selectedTitles]);

  const toggleTitle = useCallback((title: string) => {
    const lower = title.toLowerCase();
    setSelectedTitles((prev) =>
      prev.some((s) => s.toLowerCase() === lower) ? prev.filter((s) => s.toLowerCase() !== lower) : [...prev, title]
    );
  }, []);

  const totalShifts = shifts.length;
  const employeesWithShifts = useMemo(() => {
    const ids = new Set(shifts.map((s) => s.user_id).filter(Boolean));
    return ids.size;
  }, [shifts]);

  // Letters present under the CURRENT search + filter.
  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    visibleRows.forEach((r) => {
      if (r.name) letters.add(initialLetter(r.name));
    });
    return letters;
  }, [visibleRows]);

  const scrollToLetter = (letter: string) => {
    const target = visibleRows.find((r) => initialLetter(r.name) === letter);
    if (!target) return;
    const y = cardY.current[target.key];
    if (y === undefined) return;
    Haptics.selectionAsync();
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 4), animated: true });
  };

  const toggleCardExpanded = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openAddShift = (row: EmployeeRow) => {
    setEditor({ visible: true, mode: 'add', employeeName: row.name, userId: row.userId });
  };

  const openEditShift = (shift: ShiftRecord) => {
    setEditor({ visible: true, mode: 'edit', shift });
  };

  const closeEditor = () => setEditor((prev) => ({ ...prev, visible: false }));

  const confirmDeleteShift = (shift: ShiftRecord) => {
    Alert.alert(
      t('manual_schedule.delete_title'),
      t('manual_schedule.delete_msg', { name: shift.employee_name, date: formatDateShort(shift.shift_date, locale) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            try {
              const { error } = await supabase.rpc('delete_shift', {
                p_actor_id: user.id,
                p_shift_id: shift.id,
              });
              if (error) throw error;
              loadShifts();
            } catch (error: any) {
              console.error('[manual-schedule] delete shift error:', error);
              Alert.alert(t('common.error'), translateServerError(error, t('manual_schedule.delete_failed')));
            }
          },
        },
      ]
    );
  };

  const clearNarrowing = () => {
    setSearch('');
    setSelectedTitles([]);
  };

  const pendingApprovals = attention.pendingApprovals;
  const statLine = [
    t('manual_schedule.shifts_count', { count: totalShifts }),
    t('manual_schedule.scheduled_count', { count: employeesWithShifts }),
    t('manual_schedule.employees_count', { count: users.length }),
  ].join(' · ');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('manual_schedule.title')}
        rightWide
        right={<ScheduleGearChip onPress={() => setNavOpen(true)} />}
      />

      {/* Uploads · Approvals */}
      <View style={styles.chipRow}>
        <Pressable
          onPress={onUploadsPress}
          accessibilityRole="button"
          style={[styles.chip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
        >
          {uploadLocked ? (
            <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={15} color={gold} />
          ) : (
            <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="file-upload" size={16} color={colors.text} />
          )}
          <Text style={[styles.chipLabel, { color: uploadLocked ? colors.textSecondary : colors.text }]} numberOfLines={1}>
            {t('manual_schedule.uploads')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/schedule-approvals' as any)}
          accessibilityRole="button"
          style={[styles.chip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
        >
          <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="task-alt" size={16} color={colors.text} />
          <Text style={[styles.chipLabel, { color: colors.text }]} numberOfLines={1}>
            {t('manual_schedule.approvals')}
          </Text>
          {pendingApprovals > 0 && (
            <View style={[styles.bubble, { backgroundColor: colors.primary }]}>
              <Text style={[styles.bubbleText, { color: colors.fireText }]}>{pendingApprovals > 99 ? '99+' : pendingApprovals}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Week navigation */}
      <View style={styles.weekNav}>
        <Pressable
          onPress={goToPrevWeek}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('manual_schedule.prev_week')}
          style={[styles.weekArrow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
        >
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={20} color={colors.text} />
        </Pressable>

        <View style={styles.weekLabelWrap}>
          <Text style={[styles.weekLabel, { color: colors.text }]} numberOfLines={1}>
            {formatWeekLabel(currentWeek.startStr, currentWeek.endStr, isES)}
          </Text>
          <View style={styles.weekStatsRow}>
            <Text style={[styles.weekStats, { color: colors.textSecondary }]} numberOfLines={1}>
              {statLine}
            </Text>
            {loading && loadedOnce && <ActivityIndicator size="small" color={colors.textSecondary} style={styles.weekSpinner} />}
          </View>
        </View>

        <Pressable
          onPress={goToNextWeek}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('manual_schedule.next_week')}
          style={[styles.weekArrow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
        >
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={colors.text} />
        </Pressable>
      </View>

      <MenuSearchRow
        colors={colors}
        mode="user"
        value={search}
        onChangeText={setSearch}
        placeholder={t('manual_schedule.search_placeholder')}
        onRightPress={() => setFilterOpen(true)}
        filterCount={selectedTitles.length}
      />

      {!loadedOnce ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.initialSpinner} />
      ) : (
        <View style={styles.contentRow}>
          <ScrollView
            ref={scrollRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {totalShifts === 0 && !loading && (
              <EmptyCard
                iosIcon="calendar.badge.exclamationmark"
                androidIcon="event-busy"
                title={t('manual_schedule.empty_week_title')}
                sub={t('manual_schedule.empty_week_sub')}
              />
            )}

            {visibleRows.length === 0 && (
              <EmptyCard
                iosIcon="person.crop.circle.badge.questionmark"
                androidIcon="person-search"
                title={t('manual_schedule.empty_match_title')}
                sub={t('manual_schedule.empty_match_sub')}
                actionLabel={hasNarrowing ? t('common.clear') : undefined}
                onAction={hasNarrowing ? clearNarrowing : undefined}
              />
            )}

            {visibleRows.map((row) => {
              const isExpanded = expandedCards.has(row.key);
              const firstTitle = row.jobTitles[0];

              return (
                <View
                  key={row.key}
                  style={styles.cardWrap}
                  onLayout={(e) => {
                    cardY.current[row.key] = e.nativeEvent.layout.y;
                  }}
                >
                  <GlassCard variant="surface" radius={16}>
                    <Pressable
                      style={styles.cardHeader}
                      onPress={() => toggleCardExpanded(row.key)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isExpanded }}
                    >
                      <View style={[styles.avatar, { backgroundColor: colors.primary + '2E' }]}>
                        <Text style={[styles.avatarText, { color: colors.primary }]}>{initialsOf(row.name)}</Text>
                      </View>

                      <View style={styles.cardBody}>
                        <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
                          {row.name}
                        </Text>
                        <View style={styles.cardMeta}>
                          {firstTitle ? (
                            <View style={[styles.jobPill, { backgroundColor: colors.primary + '24', borderColor: colors.primary + '42' }]}>
                              <Text style={[styles.jobPillText, { color: colors.primary }]} numberOfLines={1}>
                                {firstTitle}
                              </Text>
                            </View>
                          ) : !row.userId ? (
                            <View style={[styles.jobPill, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                              <Text style={[styles.jobPillText, { color: colors.textSecondary }]} numberOfLines={1}>
                                {t('manual_schedule.unmatched')}
                              </Text>
                            </View>
                          ) : null}
                          <Text style={[styles.shiftCount, { color: colors.textSecondary }]} numberOfLines={1}>
                            {t('manual_schedule.shifts_count', { count: row.shifts.length })}
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={() => openAddShift(row)}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={t('manual_schedule.add_shift')}
                        style={[styles.addBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                      >
                        <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color={colors.primary} />
                      </Pressable>

                      <IconSymbol
                        ios_icon_name={isExpanded ? 'chevron.down' : 'chevron.right'}
                        android_material_icon_name={isExpanded ? 'expand-more' : 'chevron-right'}
                        size={16}
                        color={colors.textSecondary}
                      />
                    </Pressable>

                    {isExpanded && (
                      <View style={[styles.cardShifts, { borderTopColor: colors.hairline }]}>
                        {row.shifts.length === 0 ? (
                          <Text style={[styles.noShifts, { color: colors.textSecondary }]}>
                            {t('manual_schedule.no_shifts_employee')}
                          </Text>
                        ) : (
                          row.shifts.map((shift, idx) => (
                            <ShiftRow
                              key={shift.id}
                              shift={shift}
                              showDay
                              stacked
                              first={idx === 0}
                              onPress={() => openEditShift(shift)}
                              trailing={
                                <View style={styles.rowActions}>
                                  <Pressable
                                    onPress={() => openEditShift(shift)}
                                    hitSlop={6}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('manual_schedule.edit_shift')}
                                    style={styles.rowAction}
                                  >
                                    <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={14} color={colors.textSecondary} />
                                  </Pressable>
                                  <Pressable
                                    onPress={() => confirmDeleteShift(shift)}
                                    hitSlop={6}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('manual_schedule.delete_title')}
                                    style={styles.rowAction}
                                  >
                                    <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={14} color={colors.textSecondary} />
                                  </Pressable>
                                </View>
                              }
                            />
                          ))
                        )}
                      </View>
                    )}
                  </GlassCard>
                </View>
              );
            })}
          </ScrollView>

          {/* A-Z rail — letters present under the current search + filter light up;
              a tap scrolls to that letter's first card. */}
          <View style={[styles.rail, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.railContent}>
              {ALPHABET.map((letter) => {
                const on = availableLetters.has(letter);
                return (
                  <Pressable
                    key={letter}
                    onPress={() => scrollToLetter(letter)}
                    disabled={!on}
                    accessibilityRole="button"
                    accessibilityLabel={letter}
                    style={styles.railBtn}
                  >
                    <Text style={[styles.railText, { color: on ? colors.primary : colors.textSecondary, opacity: on ? 1 : 0.35 }]}>
                      {letter}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      <ScheduleNavSheet visible={navOpen} onClose={() => setNavOpen(false)} current="schedules" />

      <JobTitleFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        titles={filterTitles}
        selected={selectedTitles}
        onToggle={toggleTitle}
        onClear={() => setSelectedTitles([])}
      />

      <ShiftEditSheet
        visible={editor.visible}
        mode={editor.mode}
        shift={editor.shift}
        employeeName={editor.employeeName}
        userId={editor.userId}
        lockEmployee={editor.mode === 'add'}
        defaultDate={weekHasToday ? new Date() : currentWeek.start}
        onClose={closeEditor}
        onSaved={loadShifts}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Uploads · Approvals — the mockup's .btnrow / .btn (44pt glass, icon + label)
  chipRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  chipLabel: { fontFamily: fonts.body.semibold, fontSize: 14, flexShrink: 1 },
  bubble: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  bubbleText: { fontFamily: fonts.mono.semibold, fontSize: 10 },

  // Week nav — ‹ › 38pt glass chips, display label, mono stat line
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  weekArrow: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekLabelWrap: { flex: 1, minWidth: 0, alignItems: 'center' },
  weekLabel: { fontFamily: fonts.display.semibold, fontSize: 16, letterSpacing: -0.2, textAlign: 'center' },
  weekStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, maxWidth: '100%' },
  weekStats: { fontFamily: fonts.mono.medium, fontSize: 10.5, fontVariant: ['tabular-nums'], textAlign: 'center', flexShrink: 1 },
  weekSpinner: { transform: [{ scale: 0.7 }] },

  initialSpinner: { marginTop: 40 },
  contentRow: { flex: 1, flexDirection: 'row' },
  scrollView: { flex: 1 },
  scrollContent: { paddingLeft: 16, paddingRight: 8, paddingBottom: 40 },

  // Employee cards
  cardWrap: { marginBottom: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display.semibold, fontSize: 12, letterSpacing: 0.2 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontFamily: fonts.display.semibold, fontSize: 15 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  jobPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    maxWidth: 130,
  },
  jobPillText: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
  shiftCount: { fontFamily: fonts.mono.medium, fontSize: 10.5, fontVariant: ['tabular-nums'], flexShrink: 1 },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardShifts: { paddingHorizontal: 12, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth },
  noShifts: { fontFamily: fonts.mono.medium, fontSize: 11, paddingVertical: 12, textAlign: 'center' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 2 },
  rowAction: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },

  // Empty states
  emptyCard: { padding: 18, alignItems: 'center', gap: 6, marginBottom: 10 },
  emptyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  emptyTitle: { fontFamily: fonts.display.semibold, fontSize: 15, textAlign: 'center' },
  emptySub: { fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 17, textAlign: 'center' },
  emptyAction: {
    marginTop: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionLabel: { fontFamily: fonts.body.semibold, fontSize: 13 },

  // A-Z rail (36pt, glass, r13)
  rail: {
    width: 36,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginRight: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  railContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 6 },
  railBtn: { width: 28, height: 21, alignItems: 'center', justifyContent: 'center' },
  railText: { fontFamily: fonts.mono.semibold, fontSize: 10 },

  // JobTitleFilterSheet
  sheetHint: { fontFamily: fonts.body.regular, fontSize: 13, lineHeight: 18 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    maxWidth: '100%',
  },
  filterChipText: { fontFamily: fonts.body.semibold, fontSize: 12.5, flexShrink: 1 },
  sheetFooter: { flexDirection: 'row', gap: 11, paddingTop: 12 },
  footerBtn: {
    flex: 1,
    height: 47,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  footerBtnDisabled: { opacity: 0.5 },
  footerPrimary: { flex: 1.35 },
  footerLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
