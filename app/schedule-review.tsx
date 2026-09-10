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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import PremiumGate from '@/components/PremiumGate';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import ScheduleGearChip from '@/components/schedule/ScheduleGearChip';
import ScheduleNavSheet from '@/components/schedule/ScheduleNavSheet';
import ScheduleSegTabs, { type SegTab } from '@/components/schedule/ScheduleSegTabs';
import ShiftRow from '@/components/schedule/ShiftRow';
import ShiftEditSheet, { type ShiftLike } from '@/components/schedule/ShiftEditSheet';
import EmployeePickerSheet, { type PickedEmployee } from '@/components/schedule/EmployeePickerSheet';
import { scheduleHue } from '@/components/schedule/scheduleVisuals';
import { getOrgDirectory } from '@/utils/orgDirectory';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { translateServerError } from '@/utils/serverErrors';
import { formatDateShort, formatWeekRange, initialsOf, localeFor, parseISODate } from '@/utils/schedule/format';
import { fonts } from '@/constants/fonts';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// A-Z rail initial, accent-folded: ALPHABET holds no accented letters, so an
// unfolded 'Á' ("Ángela") matches no button AND renders no button of its own —
// the employee is invisible under every letter and reachable only via "All".
// Folding to the base letter files her under A. Used by BOTH the letter jump
// and the available-letters set so the two always agree.
const initialLetter = (name: string) =>
  name.charAt(0).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// A sheet that hands off to ANOTHER root-level Modal (or an Alert) must wait
// for its own dismissal to finish — UIKit drops a presentation issued while a
// dismissal animates. EmployeePickerSheet exposes no onDismiss, so this mirrors
// GlassSheet's DISMISSED_MS timer instead.
const HANDOFF_MS = Platform.OS === 'ios' ? 500 : 300;

type ReviewTab = 'matched' | 'unmatched';

interface GroupedShifts {
  employee_name: string;
  user_id: string | null;
  user_name: string | null;
  shifts: ShiftLike[];
}

type PickerState = { kind: 'assign'; name: string; userId: string | null } | { kind: 'add' } | null;

type EditorTarget =
  | { mode: 'add'; employeeName: string; userId: string | null }
  | { mode: 'edit'; shift: ShiftLike };

/** The header's Save chip — the labelled twin of the 38pt gear chip, primary-filled. */
function SaveChip({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      style={[styles.saveChip, { backgroundColor: colors.primary, borderColor: colors.primary }, disabled && styles.dimmed]}
    >
      <Text style={[styles.saveChipText, { color: colors.fireText }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** One glass stat tile: display number over a mono uppercase label. */
function StatTile({ n, label, hue, strong = false }: { n: number; label: string; hue?: string; strong?: boolean }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.tile, { backgroundColor: colors.glass, borderColor: strong && hue ? hue + '66' : colors.glassBorder }]}>
      <Text style={[styles.tileN, { color: hue ?? colors.text }]}>{n}</Text>
      <Text style={[styles.tileL, { color: strong && hue ? hue : colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** One schedule name from the upload: avatar · name · matched/not-matched pill · shift count · Add / Assign chips · the shifts when expanded. */
function EmployeeCard({
  group,
  expanded,
  onToggle,
  onAdd,
  onAssign,
  onEdit,
  onDelete,
  onLayout,
}: {
  group: GroupedShifts;
  expanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onAssign: () => void;
  onEdit: (shift: ShiftLike) => void;
  onDelete: (shift: ShiftLike) => void;
  onLayout: (y: number) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const matched = !!group.user_id;
  const accent = matched ? colors.primary : scheduleHue('pending', isDark);
  const pillLabel = matched
    ? group.user_name && group.user_name !== group.employee_name
      ? group.user_name
      : t('schedule_review.badge_matched')
    : t('schedule_review.not_matched');

  return (
    <View style={styles.cardWrap} onLayout={(e) => onLayout(e.nativeEvent.layout.y)}>
      <GlassCard variant="surface" radius={16}>
        <Pressable onPress={onToggle} style={styles.cardHead}>
          <View style={[styles.avatar, { backgroundColor: accent + '2E' }]}>
            <Text style={[styles.avatarText, { color: accent }]}>{initialsOf(group.employee_name)}</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
              {group.employee_name}
            </Text>
            <View style={styles.metaRow}>
              <View style={[styles.pill, { backgroundColor: accent + '24', borderColor: accent + '42' }]}>
                {matched && <IconSymbol ios_icon_name="link" android_material_icon_name="link" size={10} color={accent} />}
                <Text style={[styles.pillText, { color: accent }]} numberOfLines={1}>
                  {pillLabel}
                </Text>
              </View>
              <Text style={[styles.count, { color: colors.textSecondary }]} numberOfLines={1}>
                {t('manual_schedule.shifts_count', { count: group.shifts.length })}
              </Text>
            </View>
          </View>
          <IconSymbol
            ios_icon_name={expanded ? 'chevron.down' : 'chevron.right'}
            android_material_icon_name={expanded ? 'expand-more' : 'chevron-right'}
            size={16}
            color={colors.textSecondary}
          />
        </Pressable>

        <View style={styles.chipRow}>
          <Pressable onPress={onAdd} hitSlop={4} style={[styles.chip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={13} color={colors.primary} />
            <Text style={[styles.chipText, { color: colors.text }]}>{t('schedule_review.add')}</Text>
          </Pressable>
          <Pressable onPress={onAssign} hitSlop={4} style={[styles.chip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <IconSymbol
              ios_icon_name={matched ? 'arrow.triangle.2.circlepath' : 'person.badge.plus'}
              android_material_icon_name={matched ? 'swap-horiz' : 'person-add'}
              size={13}
              color={colors.primary}
            />
            <Text style={[styles.chipText, { color: colors.text }]}>
              {matched ? t('schedule_review.change') : t('schedule_review.assign')}
            </Text>
          </Pressable>
        </View>

        {expanded && (
          <View style={[styles.shiftList, { borderTopColor: colors.hairline }]}>
            {group.shifts.map((shift, idx) => (
              <ShiftRow
                key={shift.id}
                shift={shift}
                first={idx === 0}
                onPress={() => onEdit(shift)}
                trailing={
                  <View style={styles.rowActions}>
                    <Pressable onPress={() => onEdit(shift)} hitSlop={8} style={styles.rowBtn}>
                      <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={14} color={colors.primary} />
                    </Pressable>
                    <Pressable onPress={() => onDelete(shift)} hitSlop={8} style={styles.rowBtn}>
                      <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={16} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                }
              />
            ))}
          </View>
        )}
      </GlassCard>
    </View>
  );
}

export default function ScheduleReviewScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const locale = localeFor(language);
  const { user } = useAuth();
  const { hasPremium } = useSubscription();
  const { upload_id } = useLocalSearchParams<{ upload_id: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const [shifts, setShifts] = useState<ShiftLike[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [uploadLabel, setUploadLabel] = useState('');
  const [tab, setTab] = useState<ReviewTab>('matched');
  const [navOpen, setNavOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // The full-page spinner only on the FIRST load; reloads after an assign /
  // edit / delete are silent (the Saving… toast covers the assign).
  const loadedOnce = useRef(false);
  // Card y within the scroll content, measured by onLayout — the A-Z jump target.
  const cardYs = useRef<Record<string, number>>({});
  const handoff = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (handoff.current) clearTimeout(handoff.current);
    },
    []
  );

  const loadData = useCallback(async () => {
    if (!user?.id || !upload_id) return;
    try {
      if (!loadedOnce.current) setLoading(true);

      // Upload info (manager-gated; the upload must belong to the actor's org)
      const { data: uploadRows } = await supabase.rpc('get_org_uploads', {
        p_actor_id: user.id,
        p_upload_id: upload_id,
      });
      const upload = Array.isArray(uploadRows) ? uploadRows[0] : null;
      if (upload) {
        setWeekStart(upload.week_start);
        setWeekEnd(upload.week_end);
        setUploadLabel(upload.title || upload.file_name || '');
      }

      const { data: shiftData, error: shiftError } = await supabase.rpc('get_upload_shifts', {
        p_actor_id: user.id,
        p_upload_id: upload_id,
      });
      if (shiftError) throw shiftError;
      setShifts(shiftData || []);

      // The directory resolves linked user ids to display names
      const directory = await getOrgDirectory(user.id);
      setUsers(directory.map((r) => ({ id: r.id, name: r.name })));
    } catch (error) {
      console.error('Error loading review data:', error);
      Alert.alert(t('common.error'), t('schedule_review.load_failed'));
    } finally {
      loadedOnce.current = true;
      setLoading(false);
    }
  }, [user?.id, upload_id, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Group shifts by the schedule name, alphabetical (the tabs split matched / unmatched)
  const groups = useMemo<GroupedShifts[]>(() => {
    const map = new Map<string, GroupedShifts>();
    for (const shift of shifts) {
      let g = map.get(shift.employee_name);
      if (!g) {
        const linked = shift.user_id ? users.find((u) => u.id === shift.user_id) : null;
        g = { employee_name: shift.employee_name, user_id: shift.user_id, user_name: linked?.name || null, shifts: [] };
        map.set(shift.employee_name, g);
      }
      g.shifts.push(shift);
    }
    const out = Array.from(map.values());
    out.forEach((g) =>
      g.shifts.sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time))
    );
    return out.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  }, [shifts, users]);

  const matchedCount = useMemo(() => groups.filter((g) => !!g.user_id).length, [groups]);
  const unmatchedCount = groups.length - matchedCount;

  const visibleGroups = useMemo(
    () => groups.filter((g) => (tab === 'matched' ? !!g.user_id : !g.user_id)),
    [groups, tab]
  );

  // Letters present in the CURRENT tab's list
  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    visibleGroups.forEach((g) => letters.add(initialLetter(g.employee_name)));
    return letters;
  }, [visibleGroups]);

  // userId → the schedule name already linked to them in this upload (the picker's warning line)
  const assignedNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of groups) if (g.user_id) map[g.user_id] = g.employee_name;
    return map;
  }, [groups]);
  const pickerAssignedNames = useMemo(() => {
    if (picker?.kind !== 'assign') return assignedNames;
    const out: Record<string, string> = {};
    for (const [uid, name] of Object.entries(assignedNames)) if (name !== picker.name) out[uid] = name;
    return out;
  }, [assignedNames, picker]);

  // Stable Date — ShiftEditSheet re-seeds its form whenever defaultDate changes identity
  const weekStartDate = useMemo(() => (weekStart ? parseISODate(weekStart) : undefined), [weekStart]);

  const okHue = scheduleHue('ok', isDark);
  const goldHue = scheduleHue('pending', isDark);

  const segTabs: SegTab<ReviewTab>[] = [
    { key: 'matched', label: t('schedule_review.tab_matched'), count: matchedCount },
    { key: 'unmatched', label: t('schedule_review.tab_unmatched'), count: unmatchedCount, live: unmatchedCount > 0 },
  ];

  const changeTab = (next: ReviewTab) => {
    setTab(next);
    setSelectedLetter(null);
  };

  const toggleExpanded = (employeeName: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(employeeName)) next.delete(employeeName);
      else next.add(employeeName);
      return next;
    });
  };

  const jumpToLetter = (letter: string) => {
    setSelectedLetter(letter);
    const target = visibleGroups.find((g) => initialLetter(g.employee_name) === letter);
    const y = target ? cardYs.current[target.employee_name] : undefined;
    if (typeof y === 'number') scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

  const jumpToTop = () => {
    setSelectedLetter(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const openEditor = (target: EditorTarget) => {
    setEditor(target);
    setEditorOpen(true);
  };

  // One gated RPC updates every shift for this name in this upload AND
  // recomputes unmatched_employees server-side from what's actually linked.
  const runAssign = async (employeeName: string, emp: PickedEmployee | null) => {
    if (!user?.id || !upload_id) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('assign_upload_shifts', {
        p_actor_id: user.id,
        p_upload_id: upload_id,
        p_employee_name: employeeName,
        p_user_id: emp?.id ?? undefined,
      });
      if (error) throw error;
      await loadData();
    } catch (error: any) {
      console.error('Error assigning user:', error);
      // The picker is still sliding out — an Alert issued now can be dropped.
      if (handoff.current) clearTimeout(handoff.current);
      handoff.current = setTimeout(() => {
        Alert.alert(t('common.error'), translateServerError(error, t('schedule_review.assign_failed')));
      }, HANDOFF_MS);
    } finally {
      setSaving(false);
    }
  };

  const onPickerSelect = (emp: PickedEmployee | null) => {
    const current = picker;
    setPicker(null);
    if (!current) return;
    if (current.kind === 'assign') {
      void runAssign(current.name, emp);
      return;
    }
    // Add employee: the picker closes, then the editor opens for that person
    if (!emp) return;
    if (handoff.current) clearTimeout(handoff.current);
    handoff.current = setTimeout(() => openEditor({ mode: 'add', employeeName: emp.name, userId: emp.id }), HANDOFF_MS);
  };

  const confirmDelete = (shift: ShiftLike) => {
    Alert.alert(
      t('schedule_review.delete_title'),
      t('schedule_review.delete_message', { employee: shift.employee_name, date: formatDateShort(shift.shift_date, locale) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            try {
              // Gated delete; parsed_shifts_count is resynced inside the RPC.
              const { error } = await supabase.rpc('delete_shift', { p_actor_id: user.id, p_shift_id: shift.id });
              if (error) throw error;
              await loadData();
            } catch (error: any) {
              console.error('Delete shift error:', error);
              Alert.alert(t('common.error'), translateServerError(error, t('schedule_review.delete_failed')));
            }
          },
        },
      ]
    );
  };

  const saveReview = async () => {
    if (!user?.id || !upload_id || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('mark_schedule_upload_reviewed', { p_actor_id: user.id, p_upload_id: upload_id });
      if (error) throw error;
      // pop back to the Schedules page already in the stack (Schedules → Upload → Review);
      // when it isn't there (Review reached from the ⚙ nav), this behaves like replace
      if (typeof (router as any).dismissTo === 'function') (router as any).dismissTo('/manual-schedule');
      else router.replace('/manual-schedule');
    } catch (error: any) {
      console.error('Error marking upload reviewed:', error);
      Alert.alert(t('common.error'), translateServerError(error, t('schedule_review.save_failed')));
    } finally {
      setSaving(false);
    }
  };

  const gated = !hasPremium;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('schedule_review.title')}
        rightWide
        right={
          <View style={styles.headerRight}>
            <ScheduleGearChip compact onPress={() => setNavOpen(true)} />
            {!gated && !loading && <SaveChip label={t('schedule_review.save')} onPress={saveReview} disabled={saving} />}
          </View>
        }
      />

      {gated ? (
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
      ) : loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
      ) : (
        <>
          {saving && (
            <View style={styles.toastRow}>
              <View style={[styles.toast, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.toastText, { color: colors.text }]} numberOfLines={1}>
                  {t('schedule_review.saving')}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.contentRow}>
            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Summary */}
              <GlassCard variant="surface" radius={16} style={styles.summary}>
                <Text style={[styles.summaryTitle, { color: colors.text }]} numberOfLines={1}>
                  {weekStart && weekEnd ? formatWeekRange(weekStart, weekEnd, locale) : ''}
                </Text>
                {!!uploadLabel && (
                  <Text style={[styles.summarySub, { color: colors.textSecondary }]} numberOfLines={1}>
                    {uploadLabel}
                  </Text>
                )}
                <View style={styles.stats}>
                  <StatTile n={shifts.length} label={t('schedule_review.stat_shifts')} />
                  <StatTile n={matchedCount} label={t('schedule_review.stat_matched')} hue={okHue} />
                  {unmatchedCount > 0 && (
                    <StatTile n={unmatchedCount} label={t('schedule_review.stat_unmatched')} hue={goldHue} strong />
                  )}
                  <StatTile n={groups.length} label={t('schedule_review.stat_employees')} />
                </View>
              </GlassCard>

              <View style={styles.seg}>
                <ScheduleSegTabs<ReviewTab> tabs={segTabs} value={tab} onChange={changeTab} />
              </View>

              {/* List header row */}
              <View style={styles.listHead}>
                <Text style={[styles.listHint, { color: colors.textSecondary }]} numberOfLines={2}>
                  {tab === 'matched' ? t('schedule_review.hint_matched') : t('schedule_review.hint_unmatched')}
                </Text>
                <Pressable
                  onPress={() => setPicker({ kind: 'add' })}
                  hitSlop={4}
                  style={[styles.addChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                >
                  <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={13} color={colors.primary} />
                  <Text style={[styles.addChipText, { color: colors.text }]} numberOfLines={1}>
                    {t('schedule_review.add_employee')}
                  </Text>
                </Pressable>
              </View>

              {visibleGroups.length === 0 && (
                <View style={styles.empty}>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    {tab === 'matched' ? t('schedule_review.empty_matched') : t('schedule_review.empty_unmatched')}
                  </Text>
                </View>
              )}

              {visibleGroups.map((group) => (
                <EmployeeCard
                  key={group.employee_name}
                  group={group}
                  expanded={expanded.has(group.employee_name)}
                  onToggle={() => toggleExpanded(group.employee_name)}
                  onAdd={() => openEditor({ mode: 'add', employeeName: group.employee_name, userId: group.user_id })}
                  onAssign={() => setPicker({ kind: 'assign', name: group.employee_name, userId: group.user_id })}
                  onEdit={(shift) => openEditor({ mode: 'edit', shift })}
                  onDelete={confirmDelete}
                  onLayout={(y) => {
                    cardYs.current[group.employee_name] = y;
                  }}
                />
              ))}
            </ScrollView>

            {/* A-Z rail — letters present in the current tab light up; taps scroll to the first card */}
            <GlassCard variant="glass" radius={12} style={styles.rail}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.railContent}>
                <Pressable onPress={jumpToTop} style={[styles.railBtn, selectedLetter === null && { backgroundColor: colors.primary }]}>
                  <Text
                    // "All" -> "Todos" fills the 28pt rail button; keep it on one line.
                    numberOfLines={1}
                    style={[styles.railAll, { color: selectedLetter === null ? colors.fireText : colors.textSecondary }]}
                  >
                    {t('schedule_review.all_letters')}
                  </Text>
                </Pressable>
                {ALPHABET.map((letter) => {
                  const has = availableLetters.has(letter);
                  const on = selectedLetter === letter;
                  return (
                    <Pressable
                      key={letter}
                      disabled={!has}
                      onPress={() => jumpToLetter(letter)}
                      style={[styles.railBtn, on && { backgroundColor: colors.primary }]}
                    >
                      <Text
                        style={[
                          styles.railLetter,
                          { color: on ? colors.fireText : has ? colors.primary : colors.textSecondary },
                          !has && styles.railDim,
                        ]}
                      >
                        {letter}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </GlassCard>
          </View>
        </>
      )}

      <ScheduleNavSheet visible={navOpen} onClose={() => setNavOpen(false)} current="review" />

      <EmployeePickerSheet
        visible={!!picker}
        onClose={() => setPicker(null)}
        onSelect={onPickerSelect}
        selectedId={picker?.kind === 'assign' ? picker.userId : undefined}
        allowUnassign={picker?.kind === 'assign' && !!picker.userId}
        assignedNames={pickerAssignedNames}
        title={picker?.kind === 'add' ? t('schedule_review.add_employee_title') : t('schedule_review.assign_title')}
      />

      <ShiftEditSheet
        visible={editorOpen}
        mode={editor?.mode ?? 'add'}
        shift={editor?.mode === 'edit' ? editor.shift : undefined}
        employeeName={editor?.mode === 'add' ? editor.employeeName : undefined}
        userId={editor?.mode === 'add' ? editor.userId : undefined}
        uploadId={upload_id}
        defaultDate={weekStartDate}
        lockEmployee={editor?.mode === 'add'}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          void loadData();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dimmed: { opacity: 0.6 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveChip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveChipText: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
  spinner: { marginTop: 60 },
  // The Saving… toast sits IN the layout flow under the header (never pinned to a header height)
  toastRow: { alignItems: 'center', paddingBottom: 8 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  toastText: { fontFamily: fonts.mono.semibold, fontSize: 11, letterSpacing: 0.4 },
  contentRow: { flex: 1, flexDirection: 'row' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingRight: 8, paddingBottom: 40 },
  // Summary
  summary: { padding: 14 },
  summaryTitle: { fontFamily: fonts.display.bold, fontSize: 18, letterSpacing: -0.2 },
  summarySub: { fontFamily: fonts.mono.medium, fontSize: 11, marginTop: 3 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tile: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  tileN: { fontFamily: fonts.display.bold, fontSize: 20, lineHeight: 22 },
  tileL: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  seg: { marginTop: 12 },
  // List header row
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 10, paddingLeft: 2 },
  listHint: { flex: 1, fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 16 },
  addChip: {
    height: 32,
    paddingLeft: 9,
    paddingRight: 11,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  addChipText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16 },
  emptyText: { fontFamily: fonts.body.regular, fontSize: 13, textAlign: 'center' },
  // Employee card
  cardWrap: { marginBottom: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 8 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display.bold, fontSize: 12 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontFamily: fonts.display.semibold, fontSize: 15 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    maxWidth: 150,
    flexShrink: 1,
  },
  pillText: { fontFamily: fonts.body.semibold, fontSize: 10.5, flexShrink: 1 },
  count: { fontFamily: fonts.mono.medium, fontSize: 10.5 },
  chipRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  chip: {
    height: 32,
    paddingLeft: 9,
    paddingRight: 11,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  shiftList: { paddingHorizontal: 12, paddingBottom: 4, borderTopWidth: StyleSheet.hairlineWidth },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 2 },
  rowBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  // A-Z rail
  rail: { width: 36, marginRight: 8, marginTop: 16, marginBottom: 16 },
  railContent: { paddingVertical: 6, alignItems: 'center' },
  railBtn: { width: 28, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginVertical: 1 },
  railAll: { fontFamily: fonts.mono.semibold, fontSize: 8 },
  railLetter: { fontFamily: fonts.mono.semibold, fontSize: 10 },
  railDim: { opacity: 0.3 },
});
