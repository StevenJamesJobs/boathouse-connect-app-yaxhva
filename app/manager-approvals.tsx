import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { refreshAllPendingApprovals } from '@/hooks/usePendingApprovals';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { RedemptionRequestCard, RedemptionRequestRow } from '@/components/RedemptionRequestCard';
import { useOrganization } from '@/contexts/OrganizationContext';
import { bothLanguages } from '@/utils/notificationHelpers';
import i18n from '@/i18n';
import { getOrgDirectory } from '@/utils/orgDirectory';
import AmbientGlow from '@/components/AmbientGlow';
import { fonts } from '@/constants/fonts';
import { translateServerError } from '@/utils/serverErrors';

// Same keys the redeem screen's option cards use — EN values byte-identical
// to the old hardcoded labels; ES comes along for free (s62).
const TYPE_LABEL_KEYS: Record<string, string> = {
  food_beverage: 'rewards_ui:redeem_food_title',
  section: 'rewards_ui:redeem_section_title',
  side_work: 'rewards_ui:redeem_sidework_title',
  side_work_free: 'rewards_ui:redeem_freeshift_title',
};

const typeLabel = (requestType: string, lng?: string): string => {
  const key = TYPE_LABEL_KEYS[requestType];
  return key
    ? i18n.t(key, lng ? { lng } : undefined)
    : i18n.t('notifications.redemption_fallback_option', lng ? { lng } : undefined);
};

export default function ManagerApprovalsScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const dateLocale = i18n.language === 'es' ? 'es-ES' : 'en-US';
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { sendNotification } = useNotification();

  const [rows, setRows] = useState<RedemptionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const [detailRow, setDetailRow] = useState<RedemptionRequestRow | null>(null);
  const [decisionMode, setDecisionMode] = useState<'approve' | 'deny' | null>(null);
  const [reason, setReason] = useState('');

  const refresh = useCallback(async (silent = false) => {
    // Logout teardown: user clears before the redirect unmounts this screen —
    // supabase-js drops an undefined named arg and PostgREST 404s the overload (PGRST202).
    if (!user?.id) {
      setRows([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const { data: reqs, error } = await supabase.rpc('get_pending_redemptions', {
        p_actor_id: user.id,
      });

      // Without this the fetch failure fell through as `undefined` rows and
      // rendered the empty state — a broken queue that looked like a clear one.
      if (error) {
        console.error('manager-approvals: failed to load pending redemptions', error);
        setLoadError(translateServerError(error));
        setRows([]);
        return;
      }
      setLoadError(null);

      const today = new Date().toISOString().slice(0, 10);
      const filtered = (reqs || []).filter((r) => {
        if (r.request_type === 'food_beverage') return true;
        return !r.shift_date || r.shift_date >= today;
      });

      const userIds = [...new Set(filtered.map((r) => r.user_id))];
      const userMap = new Map<string, string>();
      if (userIds.length) {
        const users = (await getOrgDirectory(user.id)).filter((r) => userIds.includes(r.id));
        (users || []).forEach((u: any) => userMap.set(u.id, u.name));
      }
      setRows(
        filtered.map((r) => ({
          ...r,
          user_name: userMap.get(r.user_id) || t('rewards_ui:req_employee_fallback', 'Employee'),
        })) as RedemptionRequestRow[]
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id, organizationId, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refetch when the screen regains focus — this route stays mounted below
  // pushed screens, so requests submitted while away otherwise never re-trigger
  // the mount effect. Silent: no spinner (loading blanks the whole queue), the
  // skip ref leaves the initial load to the mount effect.
  const focusSkipRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (focusSkipRef.current) { focusSkipRef.current = false; return; }
      if (user?.id) refresh(true);
    }, [refresh, user?.id])
  );

  const decide = async (row: RedemptionRequestRow, mode: 'approve' | 'deny', withReason: string | null) => {
    if (!user?.id) return;
    setWorking(true);
    try {
      const rpc = mode === 'approve' ? 'approve_redemption_request' : 'deny_redemption_request';
      const { error } = await supabase.rpc(rpc, {
        p_request_id: row.id,
        p_manager_id: user.id,
        p_reason: withReason,
        p_organization_id: organizationId,
      });
      if (error) {
        Alert.alert(
          mode === 'approve'
            ? t('rewards_ui:approvals_could_not_approve', 'Could not approve')
            : t('rewards_ui:approvals_could_not_deny', 'Could not deny'),
          translateServerError(error)
        );
        return;
      }

      // Both language copies (s62) — the employee sees the decision in THEIR
      // language; the manager-typed reason stays verbatim in both.
      const decisionTitle = bothLanguages(
        mode === 'approve' ? 'notifications.redemption_approved_title' : 'notifications.redemption_denied_title'
      );
      const bodyKey =
        mode === 'approve'
          ? 'notifications.redemption_approved_body'
          : withReason
            ? 'notifications.redemption_denied_body_reason'
            : 'notifications.redemption_denied_body';
      const decisionBodyEn = i18n.t(bodyKey, { lng: 'en', option: typeLabel(row.request_type, 'en'), amount: row.bucks_amount, reason: withReason });
      const decisionBodyEs = i18n.t(bodyKey, { lng: 'es', option: typeLabel(row.request_type, 'es'), amount: row.bucks_amount, reason: withReason });

      // Clear the pending shade entry across all managers + log the decision row for the requester
      try {
        await supabase.rpc('clear_redemption_request_notifications', {
          p_actor_id: user.id,
          p_request_id: row.id,
        });

        await supabase.rpc('create_notification', {
          p_actor_id: user.id,
          p_title: decisionTitle.en,
          p_body: decisionBodyEn,
          p_data: {
            type: 'custom',
            destination: 'redeem',
            notificationType: 'redemption_decision',
            targetUserId: row.user_id,
            requestId: row.id,
            status: mode,
            title_es: decisionTitle.es,
            body_es: decisionBodyEs,
          },
        });
      } catch (err) {
        console.error('Failed to update shade entries:', err);
      }

      // Push to the employee
      try {
        await sendNotification({
          userIds: [row.user_id],
          notificationType: 'custom',
          title: decisionTitle.en,
          body: decisionBodyEn,
          title_es: decisionTitle.es,
          body_es: decisionBodyEs,
          data: { type: 'custom', destination: 'redeem' },
        });
      } catch (err) {
        console.error('Notify employee failed:', err);
      }

      setDetailRow(null);
      setDecisionMode(null);
      setReason('');
      refresh();
      refreshAllPendingApprovals();
    } finally {
      setWorking(false);
    }
  };

  const onInlineApprove = (row: RedemptionRequestRow) => decide(row, 'approve', null);
  const onInlineDeny = (row: RedemptionRequestRow) => decide(row, 'deny', null);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <View style={[styles.header, { backgroundColor: 'transparent', borderBottomWidth: 0 }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' }]}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text
          style={[styles.headerText, { color: colors.text, fontFamily: fonts.display.bold }]}
          numberOfLines={1}
        >
          {t('rewards_ui:approvals_title', 'Redemption Approvals')}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {loadError ? (
            <View style={styles.emptyWrap}>
              <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={44} color="#F44336" />
              <Text style={[styles.empty, { color: '#F44336' }]}>
                {t('rewards_ui:approvals_load_failed', 'Could not load redemption requests.')}
              </Text>
              {/* The server detail, mapped through translateServerError where it
                  is a known RAISE and passed through raw (debuggable) otherwise. */}
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{loadError}</Text>
              <TouchableOpacity
                style={[styles.retryBtn, { borderColor: colors.border }]}
                onPress={() => refresh()}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{t('common:retry', 'Retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : rows.length === 0 ? (
            <View style={styles.emptyWrap}>
              <IconSymbol ios_icon_name="tray" android_material_icon_name="inbox" size={48} color={colors.textSecondary} />
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                {t('rewards_ui:approvals_empty', 'No pending redemption requests.')}
              </Text>
            </View>
          ) : (
            rows.map((r) => (
              <RedemptionRequestCard
                key={r.id}
                row={r}
                managerView
                onApprove={onInlineApprove}
                onDeny={onInlineDeny}
                onPress={(row) => setDetailRow(row)}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Detail modal */}
      <Modal
        visible={!!detailRow}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setDetailRow(null);
          setDecisionMode(null);
          setReason('');
        }}
      >
        <View style={styles.overlay}>
          <View style={[styles.detailCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.detailTitle, { color: colors.text }]}>
              {detailRow ? typeLabel(detailRow.request_type) : ''}
            </Text>
            {detailRow && (
              <>
                <Text style={[styles.detailLine, { color: colors.text }]}>
                  {t('rewards_ui:approvals_employee_label', {
                    name: detailRow.user_name ?? '',
                    defaultValue: 'Employee: {{name}}',
                  })}
                </Text>
                <Text style={[styles.detailLine, { color: colors.text }]}>
                  {t('rewards_ui:approvals_cost_label', {
                    amount: detailRow.bucks_amount,
                    defaultValue: 'Cost: ${{amount}}',
                  })}
                </Text>
                {detailRow.request_type === 'food_beverage' ? (
                  <Text style={[styles.detailLine, { color: colors.text }]}>
                    {t('rewards_ui:approvals_item_label', {
                      item: detailRow.item_name_snapshot ?? '',
                      defaultValue: 'Item: {{item}}',
                    })}
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.detailLine, { color: colors.text }]}>
                      {t('rewards_ui:approvals_shift_label', {
                        // 'T00:00:00' keeps a date-only string on the LOCAL day
                        // (bare ISO dates parse as UTC midnight → off by one).
                        date: detailRow.shift_date
                          ? new Date(detailRow.shift_date + 'T00:00:00').toLocaleDateString(dateLocale)
                          : '',
                        period: detailRow.shift_period ?? '',
                        defaultValue: 'Shift: {{date}} {{period}}',
                      })}
                    </Text>
                    {detailRow.comment ? (
                      <Text style={[styles.detailLine, { color: colors.textSecondary }]}>
                        {t('rewards_ui:approvals_note_label', {
                          note: detailRow.comment,
                          defaultValue: 'Note: {{note}}',
                        })}
                      </Text>
                    ) : null}
                  </>
                )}
                <Text style={[styles.detailLine, { color: colors.textSecondary, fontStyle: 'italic', marginTop: 8 }]}>
                  {t('rewards_ui:approvals_submitted', {
                    when: new Date(detailRow.created_at).toLocaleString(dateLocale),
                    defaultValue: 'Submitted {{when}}',
                  })}
                </Text>
              </>
            )}

            {decisionMode ? (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>
                  {decisionMode === 'deny'
                    ? t('rewards_ui:approvals_reason_optional', 'Reason (optional)')
                    : t('rewards_ui:approvals_reason_optional_note', 'Reason (optional note)')}
                </Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.background, color: colors.text }]}
                  value={reason}
                  onChangeText={setReason}
                  placeholder={
                    decisionMode === 'deny'
                      ? t('rewards_ui:approvals_deny_ph', 'e.g. Section already taken')
                      : t('rewards_ui:approvals_approve_ph', 'Optional note for the employee')
                  }
                  placeholderTextColor={colors.textSecondary}
                  multiline
                />
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.border }]}
                    disabled={working}
                    onPress={() => {
                      setDecisionMode(null);
                      setReason('');
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{t('common:back', 'Back')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      { backgroundColor: decisionMode === 'approve' ? '#4CAF50' : '#F44336' },
                    ]}
                    disabled={working}
                    onPress={() => detailRow && decide(detailRow, decisionMode, reason || null)}
                  >
                    {working ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {decisionMode === 'approve'
                          ? t('rewards_ui:req_approve', 'Approve')
                          : t('rewards_ui:req_deny', 'Deny')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#F4433620', borderWidth: 1, borderColor: '#F44336' }]}
                  onPress={() => setDecisionMode('deny')}
                >
                  <Text style={{ color: '#F44336', fontWeight: '700' }}>{t('rewards_ui:req_deny', 'Deny')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#4CAF5020', borderWidth: 1, borderColor: '#4CAF50' }]}
                  onPress={() => setDecisionMode('approve')}
                >
                  <Text style={{ color: '#4CAF50', fontWeight: '700' }}>{t('rewards_ui:req_approve', 'Approve')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.border }]}
                  onPress={() => setDetailRow(null)}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{t('common:close', 'Close')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 48, paddingBottom: 14, borderBottomWidth: 1,
  },
  backBtn: { padding: 4, width: 32 },
  // flex:1 between the two width-38 slots keeps the title optically centered
  // (as space-between already did) AND gives numberOfLines={1} something to
  // shrink into — without it the longer ES title would overflow the row.
  headerText: { flex: 1, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  scroll: { padding: 16, paddingBottom: 80 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  empty: { fontSize: 14, textAlign: 'center' },
  retryBtn: {
    marginTop: 6, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, borderWidth: 1,
  },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  detailCard: { borderRadius: 16, padding: 20 },
  detailTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  detailLine: { fontSize: 14, marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  textInput: {
    borderRadius: 10, padding: 12, fontSize: 14, minHeight: 70, textAlignVertical: 'top',
  },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
});
