import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';

export type RedemptionStatus = 'pending' | 'approved' | 'denied' | 'expired';
export type RedemptionType = 'food_beverage' | 'section' | 'side_work' | 'side_work_free';

export interface RedemptionRequestRow {
  id: string;
  user_id: string;
  user_name?: string;
  request_type: RedemptionType;
  bucks_amount: number;
  status: RedemptionStatus;
  item_name_snapshot?: string | null;
  shift_date?: string | null;
  shift_period?: 'AM' | 'PM' | null;
  comment?: string | null;
  decision_reason?: string | null;
  decided_at?: string | null;
  created_at: string;
}

interface Props {
  row: RedemptionRequestRow;
  /** When true, shows requester name + Approve/Deny inline buttons. */
  managerView?: boolean;
  onApprove?: (row: RedemptionRequestRow) => void;
  onDeny?: (row: RedemptionRequestRow) => void;
  onPress?: (row: RedemptionRequestRow) => void;
}

// The same keys the redeem screen's option cards and the approvals detail
// modal use (app/manager-approvals.tsx) — so all three finally agree.
const TYPE_LABEL_KEY: Record<RedemptionType, string> = {
  food_beverage: 'rewards_ui:redeem_food_title',
  section: 'rewards_ui:redeem_section_title',
  side_work: 'rewards_ui:redeem_sidework_title',
  side_work_free: 'rewards_ui:redeem_freeshift_title',
};

const TYPE_ICON: Record<RedemptionType, { ios: string; android: string }> = {
  food_beverage: { ios: 'fork.knife', android: 'restaurant' },
  section: { ios: 'mappin.and.ellipse', android: 'place' },
  side_work: { ios: 'list.bullet.clipboard', android: 'assignment' },
  side_work_free: { ios: 'sparkles', android: 'auto_awesome' },
};

const STATUS_COLOR: Record<RedemptionStatus, string> = {
  pending: '#FF9800',
  approved: '#4CAF50',
  denied: '#F44336',
  expired: '#9E9E9E',
};

export function RedemptionRequestCard({ row, managerView, onApprove, onDeny, onPress }: Props) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const dateLocale = language === 'es' ? 'es-ES' : 'en-US';
  const icon = TYPE_ICON[row.request_type] || { ios: 'star.circle.fill', android: 'stars' };
  // Custom options aren't in the built-in maps — their name IS the snapshot.
  const isCustom = !TYPE_LABEL_KEY[row.request_type];
  const typeLabel = TYPE_LABEL_KEY[row.request_type]
    ? t(TYPE_LABEL_KEY[row.request_type])
    : row.item_name_snapshot || t('rewards_ui:req_custom_reward', 'Custom Reward');

  const STATUS_LABEL: Record<RedemptionStatus, string> = {
    pending: t('rewards_ui:req_status_pending', 'Pending'),
    approved: t('rewards_ui:req_status_approved', 'Approved'),
    denied: t('rewards_ui:req_status_denied', 'Denied'),
    expired: t('rewards_ui:req_status_expired', 'Expired'),
  };

  const detailLine = (() => {
    if (row.request_type === 'food_beverage') {
      return row.item_name_snapshot || t('rewards_ui:req_menu_item', 'Menu item');
    }
    if (isCustom) return '';
    const parts: string[] = [];
    if (row.shift_date) parts.push(new Date(row.shift_date + 'T00:00:00').toLocaleDateString(dateLocale));
    if (row.shift_period) parts.push(row.shift_period);
    if (row.comment) parts.push(`— ${row.comment}`);
    return parts.join(' ').trim() || t('rewards_ui:req_no_details', 'No details');
  })();

  const Wrap: any = onPress ? TouchableOpacity : View;
  const wrapProps: any = onPress ? { onPress: () => onPress(row), activeOpacity: 0.7 } : {};

  return (
    <Wrap {...wrapProps} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + '15' }]}>
          <IconSymbol
            ios_icon_name={icon.ios as any}
            android_material_icon_name={icon.android as any}
            size={20}
            color={colors.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          {managerView && row.user_name ? (
            <Text style={[styles.requester, { color: colors.text }]}>{row.user_name}</Text>
          ) : null}
          <Text style={[styles.typeLabel, { color: colors.text }]}>{typeLabel}</Text>
          {!!detailLine && (
            <Text style={[styles.detail, { color: colors.textSecondary }]} numberOfLines={2}>
              {detailLine}
            </Text>
          )}
        </View>
        <View style={styles.amountCol}>
          <Text style={[styles.amount, { color: colors.primary }]}>${row.bucks_amount}</Text>
          <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[row.status] + '22' }]}>
            {/* ?? keeps an unexpected server enum visible rather than blank. */}
            <Text style={[styles.statusText, { color: STATUS_COLOR[row.status] }]}>
              {STATUS_LABEL[row.status] ?? row.status}
            </Text>
          </View>
        </View>
      </View>

      {managerView && row.status === 'pending' && (onApprove || onDeny) ? (
        <View style={styles.actionsRow}>
          {onDeny ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#F4433620', borderColor: '#F44336' }]}
              onPress={() => onDeny(row)}
            >
              <Text style={[styles.actionText, { color: '#F44336' }]}>{t('rewards_ui:req_deny', 'Deny')}</Text>
            </TouchableOpacity>
          ) : null}
          {onApprove ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#4CAF5020', borderColor: '#4CAF50' }]}
              onPress={() => onApprove(row)}
            >
              <Text style={[styles.actionText, { color: '#4CAF50' }]}>{t('rewards_ui:req_approve', 'Approve')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {row.status === 'denied' && row.decision_reason ? (
        <Text style={[styles.reason, { color: colors.textSecondary }]} numberOfLines={3}>
          {t('rewards_ui:req_reason', { reason: row.decision_reason, defaultValue: 'Reason: {{reason}}' })}
        </Text>
      ) : null}
    </Wrap>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 15,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  requester: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  typeLabel: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  detail: { fontSize: 13 },
  amountCol: { alignItems: 'flex-end', gap: 6 },
  amount: { fontSize: 18, fontWeight: '800' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1,
  },
  actionText: { fontSize: 13, fontWeight: '700' },
  reason: { fontSize: 12, marginTop: 8, fontStyle: 'italic' },
});
