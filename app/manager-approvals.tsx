import React, { useCallback, useEffect, useState } from 'react';
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
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { RedemptionRequestCard, RedemptionRequestRow } from '@/components/RedemptionRequestCard';
import { useOrganization } from '@/contexts/OrganizationContext';

const TYPE_LABELS: Record<string, string> = {
  food_beverage: 'Food & Beverages',
  section: 'Choose Your Own Section',
  side_work: 'Choose Your Own Side Work',
  side_work_free: 'Side Work Free Shift',
};

export default function ManagerApprovalsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { sendNotification } = useNotification();

  const [rows, setRows] = useState<RedemptionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const [detailRow, setDetailRow] = useState<RedemptionRequestRow | null>(null);
  const [decisionMode, setDecisionMode] = useState<'approve' | 'deny' | null>(null);
  const [reason, setReason] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data: reqs } = await (supabase
        .from('redemption_requests' as any) as any)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const today = new Date().toISOString().slice(0, 10);
      const filtered = ((reqs as any[]) || []).filter((r) => {
        if (r.request_type === 'food_beverage') return true;
        return !r.shift_date || r.shift_date >= today;
      });

      const userIds = [...new Set(filtered.map((r) => r.user_id))];
      const userMap = new Map<string, string>();
      if (userIds.length) {
        const { data: users } = await supabase
          .from('users')
          .select('id, name')
          .in('id', userIds);
        (users || []).forEach((u: any) => userMap.set(u.id, u.name));
      }
      setRows(
        filtered.map((r) => ({ ...r, user_name: userMap.get(r.user_id) || 'Employee' })) as RedemptionRequestRow[]
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel('approvals_queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'redemption_requests' }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

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
        Alert.alert(`Could not ${mode}`, error.message);
        return;
      }

      const optionLabel = TYPE_LABELS[row.request_type] || 'Redemption';
      const decisionTitle = mode === 'approve' ? '✅ Redemption Approved' : '❌ Redemption Denied';
      const decisionBody =
        mode === 'approve'
          ? `Your ${optionLabel} ($${row.bucks_amount}) was approved.`
          : `Your ${optionLabel} ($${row.bucks_amount}) was denied${withReason ? `: ${withReason}` : ''}.`;

      // Clear the pending shade entry across all managers + log the decision row for the requester
      try {
        const { data: shadeRows } = await (supabase
          .from('custom_notifications') as any)
          .select('id, data')
          .order('created_at', { ascending: false })
          .limit(100);
        const idsToDelete = ((shadeRows as any[]) || [])
          .filter((r) => r.data?.notificationType === 'redemption_requested' && r.data?.requestId === row.id)
          .map((r) => r.id);
        if (idsToDelete.length > 0) {
          await (supabase.from('custom_notifications') as any).delete().in('id', idsToDelete);
        }

        await (supabase.from('custom_notifications') as any).insert({
          title: decisionTitle,
          body: decisionBody,
          sent_by: user.id,
          organization_id: organizationId,
          data: {
            type: 'custom',
            destination: 'redeem',
            notificationType: 'redemption_decision',
            targetUserId: row.user_id,
            requestId: row.id,
            status: mode,
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
          title: decisionTitle,
          body: decisionBody,
          data: { type: 'custom', destination: 'redeem' },
        });
      } catch (err) {
        console.error('Notify employee failed:', err);
      }

      setDetailRow(null);
      setDecisionMode(null);
      setReason('');
      refresh();
    } finally {
      setWorking(false);
    }
  };

  const onInlineApprove = (row: RedemptionRequestRow) => decide(row, 'approve', null);
  const onInlineDeny = (row: RedemptionRequestRow) => decide(row, 'deny', null);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerText, { color: colors.text }]}>Redemption Approvals</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {rows.length === 0 ? (
            <View style={styles.emptyWrap}>
              <IconSymbol ios_icon_name="tray" android_material_icon_name="inbox" size={48} color={colors.textSecondary} />
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                No pending redemption requests.
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
              {detailRow ? TYPE_LABELS[detailRow.request_type] : ''}
            </Text>
            {detailRow && (
              <>
                <Text style={[styles.detailLine, { color: colors.text }]}>
                  Employee: {detailRow.user_name}
                </Text>
                <Text style={[styles.detailLine, { color: colors.text }]}>
                  Cost: ${detailRow.bucks_amount}
                </Text>
                {detailRow.request_type === 'food_beverage' ? (
                  <Text style={[styles.detailLine, { color: colors.text }]}>
                    Item: {detailRow.item_name_snapshot}
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.detailLine, { color: colors.text }]}>
                      Shift: {detailRow.shift_date} {detailRow.shift_period}
                    </Text>
                    {detailRow.comment ? (
                      <Text style={[styles.detailLine, { color: colors.textSecondary }]}>
                        Note: {detailRow.comment}
                      </Text>
                    ) : null}
                  </>
                )}
                <Text style={[styles.detailLine, { color: colors.textSecondary, fontStyle: 'italic', marginTop: 8 }]}>
                  Submitted {new Date(detailRow.created_at).toLocaleString()}
                </Text>
              </>
            )}

            {decisionMode ? (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>
                  Reason ({decisionMode === 'deny' ? 'optional' : 'optional note'})
                </Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.background, color: colors.text }]}
                  value={reason}
                  onChangeText={setReason}
                  placeholder={decisionMode === 'deny' ? 'e.g. Section already taken' : 'Optional note for the employee'}
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
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Back</Text>
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
                        {decisionMode === 'approve' ? 'Approve' : 'Deny'}
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
                  <Text style={{ color: '#F44336', fontWeight: '700' }}>Deny</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#4CAF5020', borderWidth: 1, borderColor: '#4CAF50' }]}
                  onPress={() => setDecisionMode('approve')}
                >
                  <Text style={{ color: '#4CAF50', fontWeight: '700' }}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.border }]}
                  onPress={() => setDetailRow(null)}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Close</Text>
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
  headerText: { fontSize: 20, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 80 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  empty: { fontSize: 14, textAlign: 'center' },

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
