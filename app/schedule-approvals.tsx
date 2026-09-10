import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert, RefreshControl, FlatList, Dimensions,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { FieldLabel, GlassTextInput } from '@/components/content/FormKit';
import ScheduleGearChip from '@/components/schedule/ScheduleGearChip';
import ScheduleNavSheet from '@/components/schedule/ScheduleNavSheet';
import ScheduleSegTabs from '@/components/schedule/ScheduleSegTabs';
import { scheduleHue, APPROVAL_HISTORY_PAGE } from '@/components/schedule/scheduleVisuals';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { refreshAllScheduleAttention } from '@/hooks/useScheduleAttention';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';
import { notifyTimeOffDecision, notifyPickupDecision } from '@/utils/schedule/notify';
import {
  daysBetween, formatDateRange, formatDateShort, formatDayLead, formatStamp, formatTimeRange, initialsOf, localeFor,
} from '@/utils/schedule/format';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';

type Tab = 'time_off' | 'pickup' | 'history';
const PAGES: Tab[] = ['time_off', 'pickup', 'history'];
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ApprovalRow {
  kind: string;
  id: string;
  created_at: string;
  requester_id: string;
  requester_name: string | null;
  requester_avatar: string | null;
  requester_titles: string[] | null;
  start_date: string | null;
  end_date: string | null;
  reason: string | null;
  shift_id: string | null;
  shift_date: string | null;
  start_time: string | null;
  end_time: string | null;
  roles: string[] | null;
  releaser_id: string | null;
  releaser_name: string | null;
  claimer_id: string | null;
  claimer_name: string | null;
  claimer_avatar: string | null;
  conflicts: any;
  is_own: boolean;
}

interface HistoryRow {
  kind: string;
  id: string;
  status: string;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_reason: string | null;
  requester_id: string | null;
  requester_name: string | null;
  start_date: string | null;
  end_date: string | null;
  reason: string | null;
  shift_date: string | null;
  start_time: string | null;
  end_time: string | null;
  roles: string[] | null;
  releaser_name: string | null;
  claimer_name: string | null;
}

interface Conflict {
  date: string;
  start: string;
  end: string;
  roles: string[] | null;
}

/**
 * Approvals (s83, Steve's Design B): Time off | Shift pick-up | History. Compact
 * ledger rows; the decision happens in a GlassSheet with the parties strip, the
 * conflict hints ("also works Fri 5:00 – 1:00 AM"), an optional reason and the
 * Deny / Approve footer. A manager's own request opens read-only — another
 * manager or the owner decides it (the server refuses too). History = the last
 * 50 decided rows, ten at a time, swept after 30 days.
 */
export default function ScheduleApprovalsScreen() {
  useRequireManagerRoute();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { user } = useAuth();
  const { language } = useLanguage();
  const locale = localeFor(language);

  const [tab, setTab] = useState<Tab>('time_off');
  const pagerRef = useRef<FlatList<Tab>>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [pending, setPending] = useState<ApprovalRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyDone, setHistoryDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<ApprovalRow | null>(null);
  const [reason, setReason] = useState('');
  const [deciding, setDeciding] = useState(false);

  const gold = scheduleHue('pending', isDark);
  const ok = scheduleHue('ok', isDark);
  const bad = scheduleHue('bad', isDark);

  const loadPending = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.rpc('get_schedule_approvals', { p_actor_id: user.id });
    if (!error) setPending((data || []) as ApprovalRow[]);
  }, [user?.id]);

  const loadHistory = useCallback(async (reset: boolean) => {
    if (!user?.id) return;
    const offset = reset ? 0 : history.length;
    if (!reset && (historyDone || offset >= 50)) return;
    setLoadingMore(!reset);
    const { data, error } = await supabase.rpc('get_schedule_approval_history', { p_actor_id: user.id, p_limit: APPROVAL_HISTORY_PAGE, p_offset: offset });
    setLoadingMore(false);
    if (error) return;
    const rows = (data || []) as HistoryRow[];
    setHistory((prev) => (reset ? rows : [...prev, ...rows]));
    setHistoryDone(rows.length < APPROVAL_HISTORY_PAGE || offset + rows.length >= 50);
  }, [user?.id, history.length, historyDone]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadPending(), loadHistory(true)]);
    setLoading(false);
  }, [loadPending, loadHistory]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const timeOff = useMemo(() => pending.filter((r) => r.kind === 'time_off'), [pending]);
  const pickups = useMemo(() => pending.filter((r) => r.kind === 'pickup'), [pending]);

  const conflictsOf = (row: ApprovalRow): Conflict[] => (Array.isArray(row.conflicts) ? (row.conflicts as Conflict[]) : []);

  const decide = async (approve: boolean) => {
    if (!selected || !user?.id) return;
    setDeciding(true);
    try {
      if (selected.kind === 'time_off') {
        const { data, error } = await supabase.rpc('decide_time_off_request', {
          p_actor_id: user.id, p_request_id: selected.id, p_approve: approve, p_reason: reason.trim() || null,
        });
        if (error) throw error;
        const res = Array.isArray(data) ? data[0] : null;
        if (res) notifyTimeOffDecision({ id: user.id, name: user.name }, res.user_id, selected.id, approve, res.start_date, res.end_date, reason);
      } else {
        const { data, error } = await supabase.rpc('decide_shift_pickup', {
          p_actor_id: user.id, p_release_id: selected.id, p_approve: approve, p_reason: reason.trim() || null,
        });
        if (error) throw error;
        const res = Array.isArray(data) ? data[0] : null;
        if (res) {
          notifyPickupDecision(
            { id: user.id, name: user.name },
            selected.id,
            approve,
            { releaserId: res.released_by, releaserName: res.releaser_name, claimerId: res.claimed_by, claimerName: res.claimer_name },
            { shift_date: res.shift_date, start_time: res.start_time, end_time: res.end_time, roles: res.roles },
            reason
          );
        }
      }
      setSelected(null);
      setReason('');
      refreshAllScheduleAttention();
      await loadAll();
    } catch (e: any) {
      Alert.alert(t('approvals.decide_failed_title'), translateServerError(e, t('approvals.decide_failed_msg')));
    } finally {
      setDeciding(false);
    }
  };

  const avatar = (name: string | null, hue?: string) => (
    <View style={[styles.avatar, { backgroundColor: hexToRgba(hue ?? colors.primary, 0.18) }]}>
      <Text style={[styles.avatarText, { color: hue ?? colors.primary }]}>{initialsOf(name)}</Text>
    </View>
  );

  const ledgerRow = (row: ApprovalRow) => {
    const isTimeOff = row.kind === 'time_off';
    const l1 = isTimeOff
      ? row.requester_name || t('notifications.an_employee')
      : `${row.releaser_name || t('notifications.an_employee')} → ${row.claimer_name || t('notifications.an_employee')}`;
    const l2 = isTimeOff && row.start_date
      ? `${formatDateRange(row.start_date, row.end_date, locale)} · ${t('approvals.days', { n: daysBetween(row.start_date, row.end_date || row.start_date) })}`
      : row.shift_date && row.start_time && row.end_time
        ? `${formatDateShort(row.shift_date, locale)} · ${formatTimeRange(row.start_time, row.end_time, locale)}${row.roles?.[0] ? ` · ${row.roles[0]}` : ''}`
        : '';
    const conflicts = conflictsOf(row);
    return (
      <Pressable key={row.kind + row.id} onPress={() => { setReason(''); setSelected(row); }}>
        <GlassCard variant="surface" radius={14} style={[styles.led, row.is_own && styles.ledOwn]}>
          {avatar(isTimeOff ? row.requester_name : row.claimer_name)}
          <View style={styles.ledBody}>
            <Text style={[styles.ledL1, { color: colors.text }]} numberOfLines={1}>{l1}</Text>
            <Text style={[styles.ledL2, { color: colors.textSecondary }]} numberOfLines={1}>{l2}</Text>
            {conflicts.length > 0 && (
              <View style={styles.hintRow}>
                <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={12} color={gold} />
                <Text style={[styles.hintText, { color: gold }]} numberOfLines={1}>
                  {isTimeOff ? t('approvals.holds_shifts', { n: conflicts.length }) : t('approvals.same_day_shift', { n: conflicts.length })}
                </Text>
              </View>
            )}
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
        </GlassCard>
      </Pressable>
    );
  };

  /** the claimer's titles that cover this shift's role (the server already guarantees one does); all of them if the shift has no role */
  const matchingTitles = (row: ApprovalRow): string[] => {
    const titles = row.requester_titles || [];
    const roles = (row.roles || []).map((r) => r.toLowerCase());
    if (!roles.length) return titles;
    const hit = titles.filter((tt) => roles.includes(tt.toLowerCase()));
    return hit.length ? hit : titles;
  };

  const historyRow = (row: HistoryRow) => {
    const approved = row.status === 'approved';
    const hue = approved ? ok : bad;
    const isTimeOff = row.kind === 'time_off';
    const who = isTimeOff
      ? row.requester_name || t('notifications.an_employee')
      : `${row.releaser_name || t('notifications.an_employee')} → ${row.claimer_name || t('notifications.an_employee')}`;
    const what = isTimeOff && row.start_date
      ? formatDateRange(row.start_date, row.end_date, locale)
      : row.shift_date && row.start_time && row.end_time
        ? `${formatDateShort(row.shift_date, locale)} · ${formatTimeRange(row.start_time, row.end_time, locale)}${row.roles?.[0] ? ` · ${row.roles[0]}` : ''}`
        : '';
    return (
      <GlassCard key={row.kind + row.id} variant="surface" radius={14} style={styles.led}>
        <View style={[styles.statusPill, { backgroundColor: hexToRgba(hue, 0.16), borderColor: hexToRgba(hue, 0.34) }]}>
          <Text style={[styles.statusText, { color: hue }]}>{approved ? t('approvals.approved') : t('approvals.denied')}</Text>
        </View>
        <View style={styles.ledBody}>
          <Text style={[styles.ledL1, { color: colors.text }]} numberOfLines={1}>{who}</Text>
          {/* two lines: "Shift pick-up · Fri, Sep 11 · 5:00 – 11:00 PM · Bartender" overran a 390pt phone (sim smoke, s83) */}
          <Text style={[styles.ledL2, { color: colors.textSecondary }]} numberOfLines={2}>
            {isTimeOff ? t('approvals.kind_time_off') : t('approvals.kind_pickup')} · {what}
          </Text>
          <Text style={[styles.ledL3, { color: colors.textSecondary }]} numberOfLines={1}>
            {row.decided_at ? formatStamp(row.decided_at, locale) : ''}{row.decided_by_name ? ` · ${row.decided_by_name}` : ''}
          </Text>
          {!!row.decision_reason && <Text style={[styles.quoteSmall, { color: colors.textSecondary }]} numberOfLines={2}>“{row.decision_reason}”</Text>}
        </View>
      </GlassCard>
    );
  };

  const empty = (iosIcon: string, androidIcon: string, title: string, body: string) => (
    <GlassCard variant="surface" radius={16} style={styles.empty}>
      <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={26} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>{body}</Text>
    </GlassCard>
  );

  // ── the pager ──
  const goTab = (key: Tab) => {
    setTab(key);
    pagerRef.current?.scrollToIndex({ index: PAGES.indexOf(key), animated: true });
  };
  const onPagerMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const key = PAGES[Math.max(0, Math.min(PAGES.length - 1, idx))];
    if (key && key !== tab) setTab(key);
  };
  const refreshControl = () => (
    <RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={async () => { setRefreshing(true); await loadAll(); setRefreshing(false); }} />
  );
  const renderPane = (key: Tab) => (
    <ScrollView
      style={{ width: SCREEN_WIDTH }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      refreshControl={refreshControl()}
      onScroll={
        key === 'history'
          ? ({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 80 && !loadingMore && !historyDone) loadHistory(false);
            }
          : undefined
      }
      scrollEventThrottle={200}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
      ) : key === 'time_off' ? (
        timeOff.length ? timeOff.map(ledgerRow) : empty('calendar.badge.checkmark', 'event-available', t('approvals.empty_time_off_title'), t('approvals.empty_time_off_body'))
      ) : key === 'pickup' ? (
        pickups.length ? pickups.map(ledgerRow) : empty('arrow.left.arrow.right', 'swap-horiz', t('approvals.empty_pickup_title'), t('approvals.empty_pickup_body'))
      ) : history.length ? (
        <>
          {history.map(historyRow)}
          {loadingMore && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
          {historyDone && <Text style={[styles.foot, { color: colors.textSecondary }]}>{t('approvals.history_foot')}</Text>}
        </>
      ) : (
        empty('clock.arrow.circlepath', 'history', t('approvals.empty_history_title'), t('approvals.empty_history_body'))
      )}
    </ScrollView>
  );

  const sel = selected;
  const selConflicts = sel ? conflictsOf(sel) : [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={t('approvals.title')} rightWide right={<ScheduleGearChip onPress={() => setNavOpen(true)} />} />
      <ScheduleNavSheet visible={navOpen} onClose={() => setNavOpen(false)} current="approvals" />

      {/* The seg tabs stay FIXED; the three panes ride a horizontal pager under them —
          tap = jump, swipe = the house gesture (Steve's device round, s83). */}
      <View style={styles.segWrap}>
        <ScheduleSegTabs<Tab>
          tabs={[
            { key: 'time_off', label: t('approvals.tab_time_off'), count: timeOff.length, live: timeOff.length > 0 },
            { key: 'pickup', label: t('approvals.tab_pickup'), count: pickups.length, live: pickups.length > 0 },
            { key: 'history', label: t('approvals.tab_history') },
          ]}
          value={tab}
          onChange={goTab}
        />
      </View>

      <FlatList
        ref={pagerRef}
        data={PAGES}
        keyExtractor={(k) => k}
        renderItem={({ item }) => renderPane(item)}
        extraData={{ pending, history, loading, loadingMore, historyDone, refreshing }}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPagerMomentumEnd}
        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
        style={styles.pager}
      />

      {/* THE DECISION SHEET */}
      <GlassSheet
        visible={!!sel}
        onClose={() => setSelected(null)}
        title={sel?.kind === 'time_off' ? t('approvals.sheet_time_off') : t('approvals.sheet_pickup')}
        subtitle={
          sel?.kind === 'time_off' && sel.start_date
            ? formatDateRange(sel.start_date, sel.end_date, locale)
            : sel?.shift_date && sel.start_time && sel.end_time
              ? `${formatDateShort(sel.shift_date, locale)} · ${formatTimeRange(sel.start_time, sel.end_time, locale)}${sel.roles?.[0] ? ` · ${sel.roles[0]}` : ''}`
              : undefined
        }
        footer={
          sel && !sel.is_own ? (
            <View style={styles.footer}>
              <Pressable style={[styles.btn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }, deciding && { opacity: 0.6 }]} disabled={deciding} onPress={() => decide(false)}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={15} color={bad} />
                <Text style={[styles.btnLabel, { color: bad }]}>{t('approvals.deny')}</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnPrimary, { backgroundColor: ok, borderColor: ok }, deciding && { opacity: 0.6 }]} disabled={deciding} onPress={() => decide(true)}>
                {deciding ? <ActivityIndicator size="small" color="#fff" /> : <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={15} color="#fff" />}
                <Text style={[styles.btnLabel, { color: '#fff' }]}>{t('approvals.approve')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.footer}>
              <Pressable style={[styles.btn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]} onPress={() => setSelected(null)}>
                <Text style={[styles.btnLabel, { color: colors.text }]}>{t('common.close', 'Close')}</Text>
              </Pressable>
            </View>
          )
        }
      >
        {!!sel && (
          <>
            <View style={[styles.parties, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              {sel.kind === 'time_off' ? (
                <View style={styles.party}>
                  {avatar(sel.requester_name)}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.partyName, { color: colors.text }]}>{sel.requester_name || t('notifications.an_employee')}</Text>
                    <Text style={[styles.partySub, { color: colors.textSecondary }]}>
                      {(sel.requester_titles || []).join(' · ') || t('approvals.requesting')} · {t('approvals.requested_stamp', { stamp: formatStamp(sel.created_at, locale) })}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.swap}>
                  <View style={styles.party}>
                    {avatar(sel.releaser_name)}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.partyName, { color: colors.text }]} numberOfLines={1}>{sel.releaser_name || t('notifications.an_employee')}</Text>
                      <Text style={[styles.partySub, { color: colors.textSecondary }]}>{t('approvals.releasing')}</Text>
                    </View>
                  </View>
                  <IconSymbol ios_icon_name="arrow.right" android_material_icon_name="arrow-forward" size={18} color={colors.primary} />
                  <View style={styles.party}>
                    {avatar(sel.claimer_name)}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.partyName, { color: colors.text }]} numberOfLines={1}>{sel.claimer_name || t('notifications.an_employee')}</Text>
                      {/* only the title(s) that match the shift — the full list ("Server, Bartender")
                          truncated to "Server…" in the half-width column (sim smoke, s83) */}
                      <Text style={[styles.partySub, { color: colors.textSecondary }]} numberOfLines={1}>
                        {t('approvals.picking_up')}{matchingTitles(sel).length ? ` · ${matchingTitles(sel).join(', ')}` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
              {sel.kind === 'time_off' && sel.start_date && (
                <Text style={[styles.bigRange, { color: colors.text }]}>
                  {formatDateRange(sel.start_date, sel.end_date, locale)}
                  <Text style={[styles.bigRangeSub, { color: colors.textSecondary }]}>  · {t('approvals.days', { n: daysBetween(sel.start_date, sel.end_date || sel.start_date) })}</Text>
                </Text>
              )}
              {!!sel.reason && <Text style={[styles.quote, { color: colors.textSecondary, borderLeftColor: colors.primary + '60' }]}>“{sel.reason}”</Text>}
              {selConflicts.length > 0 && (
                <View style={styles.conflicts}>
                  <View style={styles.hintRow}>
                    <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={13} color={gold} />
                    <Text style={[styles.hintText, { color: gold }]}>
                      {sel.kind === 'time_off' ? t('approvals.conflict_time_off') : t('approvals.conflict_pickup', { name: sel.claimer_name || t('notifications.an_employee') })}
                    </Text>
                  </View>
                  {selConflicts.slice(0, 5).map((c, i) => (
                    <Text key={i} style={[styles.conflictLine, { color: colors.textSecondary }]}>
                      {formatDayLead(c.date, locale)} · {formatTimeRange(c.start, c.end, locale)}{c.roles?.[0] ? ` · ${c.roles[0]}` : ''}
                    </Text>
                  ))}
                </View>
              )}
            </View>

            {sel.is_own ? (
              <View style={[styles.own, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                <IconSymbol ios_icon_name="info.circle" android_material_icon_name="info" size={16} color={colors.primary} />
                <Text style={[styles.ownText, { color: colors.textSecondary }]}>{t('approvals.own_request')}</Text>
              </View>
            ) : (
              <View>
                <FieldLabel label={t('approvals.reason')} trailing={t('approvals.reason_trailing')} />
                <GlassTextInput value={reason} onChangeText={setReason} placeholder={t('approvals.reason_ph')} multiline maxLength={500} style={{ minHeight: 64 }} />
              </View>
            )}
          </>
        )}
      </GlassSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  segWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  pager: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 40, gap: 10 },
  led: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12 },
  ledOwn: { opacity: 0.6 },
  ledBody: { flex: 1, minWidth: 0 },
  ledL1: { fontFamily: fonts.body.semibold, fontSize: 14 },
  ledL2: { fontFamily: fonts.mono.medium, fontSize: 11, marginTop: 2 },
  ledL3: { fontFamily: fonts.mono.medium, fontSize: 10, marginTop: 2 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display.bold, fontSize: 12 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  hintText: { fontFamily: fonts.body.medium, fontSize: 11, flexShrink: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth + 0.5, alignSelf: 'flex-start' },
  statusText: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
  quoteSmall: { fontFamily: fonts.body.regular, fontSize: 11.5, fontStyle: 'italic', marginTop: 3 },
  empty: { alignItems: 'center', padding: 22, gap: 6 },
  emptyTitle: { fontFamily: fonts.display.semibold, fontSize: 15, marginTop: 4 },
  emptyBody: { fontFamily: fonts.body.regular, fontSize: 12.5, textAlign: 'center', lineHeight: 17 },
  foot: { fontFamily: fonts.mono.medium, fontSize: 10, textAlign: 'center', paddingVertical: 12 },
  parties: { borderRadius: 16, padding: 12, borderWidth: StyleSheet.hairlineWidth + 0.5, gap: 10 },
  party: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 },
  partyName: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
  partySub: { fontFamily: fonts.body.regular, fontSize: 11, marginTop: 1 },
  swap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bigRange: { fontFamily: fonts.display.bold, fontSize: 18, letterSpacing: -0.2 },
  bigRangeSub: { fontFamily: fonts.body.regular, fontSize: 12 },
  quote: { paddingLeft: 10, borderLeftWidth: 2, fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 16, fontStyle: 'italic' },
  conflicts: { gap: 3 },
  conflictLine: { fontFamily: fonts.mono.medium, fontSize: 11, marginLeft: 18 },
  own: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth + 0.5 },
  ownText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 16 },
  footer: { flexDirection: 'row', gap: 11, paddingTop: 12 },
  btn: { flex: 1, height: 47, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: StyleSheet.hairlineWidth + 0.5 },
  btnPrimary: { flex: 1.35 },
  btnLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
