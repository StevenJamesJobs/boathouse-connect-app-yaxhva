import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { MenuItemSearchPicker, PickedMenuItem } from '@/components/MenuItemSearchPicker';
import { RedemptionRequestCard, RedemptionRequestRow, RedemptionType } from '@/components/RedemptionRequestCard';
import { useOrganization } from '@/contexts/OrganizationContext';

const SECTION_COST = 10;
const SIDE_WORK_COST = 5;
const SIDE_WORK_FREE_COST = 25;

type ShiftPeriod = 'AM' | 'PM';

interface OptionCardData {
  type: RedemptionType;
  titleKey: string;
  costLabel: string;
  iosIcon: string;
  androidIcon: string;
  descriptionKey: string;
}

const OPTIONS: OptionCardData[] = [
  {
    type: 'food_beverage',
    titleKey: 'rewards_ui:redeem_food_title',
    costLabel: 'Item price',
    iosIcon: 'fork.knife',
    androidIcon: 'restaurant',
    descriptionKey: 'rewards_ui:redeem_food_desc',
  },
  {
    type: 'section',
    titleKey: 'rewards_ui:redeem_section_title',
    costLabel: '$10',
    iosIcon: 'mappin.and.ellipse',
    androidIcon: 'place',
    descriptionKey: 'rewards_ui:redeem_section_desc',
  },
  {
    type: 'side_work',
    titleKey: 'rewards_ui:redeem_sidework_title',
    costLabel: '$5',
    iosIcon: 'list.bullet.clipboard',
    androidIcon: 'assignment',
    descriptionKey: 'rewards_ui:redeem_sidework_desc',
  },
  {
    type: 'side_work_free',
    titleKey: 'rewards_ui:redeem_freeshift_title',
    costLabel: '$25',
    iosIcon: 'sparkles',
    androidIcon: 'auto_awesome',
    descriptionKey: 'rewards_ui:redeem_freeshift_desc',
  },
];

export default function EmployeeRedeemScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    prefillItemId?: string;
    prefillItemSource?: string;
    prefillItemName?: string;
    prefillItemPrice?: string;
  }>();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { sendNotification } = useNotification();
  const { organizationId } = useOrganization();

  const [balance, setBalance] = useState(0);
  const [pending, setPending] = useState<RedemptionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [activeOption, setActiveOption] = useState<RedemptionType | null>(null);
  const [showMenuPicker, setShowMenuPicker] = useState(false);
  const [pickedItem, setPickedItem] = useState<PickedMenuItem | null>(null);
  const [shiftDate, setShiftDate] = useState<Date>(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [shiftPeriod, setShiftPeriod] = useState<ShiftPeriod>('AM');
  const [comment, setComment] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const reservedBucks = useMemo(
    () => pending.reduce((sum, r) => sum + r.bucks_amount, 0),
    [pending]
  );
  const available = balance - reservedBucks;

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: u } = await (supabase
        .from('users') as any)
        .select('mcloones_bucks')
        .eq('id', user.id)
        .single();
      setBalance((u as any)?.mcloones_bucks ?? 0);

      const { data: rows } = await (supabase
        .from('redemption_requests' as any) as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const today = new Date().toISOString().slice(0, 10);
      const filtered = ((rows as any[]) || []).filter((r) => {
        if (r.request_type === 'food_beverage') return true;
        return !r.shift_date || r.shift_date >= today;
      });
      setPending(filtered as RedemptionRequestRow[]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`redeem_user_${user?.id || 'none'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'redemption_requests', filter: `user_id=eq.${user?.id}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh, user?.id]);

  // Pre-fill food redemption when arriving from a Menu detail modal
  const prefilledRef = React.useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    if (!params?.prefillItemId || !params?.prefillItemPrice || !params?.prefillItemName) return;
    const trimmed = String(params.prefillItemPrice).trim();
    const m = trimmed.match(/^\$?(\d+(?:\.\d{1,2})?)$/);
    if (!m) return;
    const n = parseFloat(m[1]);
    if (!isFinite(n) || n <= 0) return;
    const bucks = Math.ceil(n);
    setActiveOption('food_beverage');
    setPickedItem({
      source: (params.prefillItemSource as 'menu_items' | 'weekly_specials') || 'menu_items',
      id: String(params.prefillItemId),
      name: String(params.prefillItemName),
      category: '',
      priceText: String(params.prefillItemPrice),
      bucksCost: bucks,
    });
    setShowConfirm(true);
    prefilledRef.current = true;
  }, [params?.prefillItemId, params?.prefillItemPrice, params?.prefillItemName, params?.prefillItemSource]);

  const resetForm = () => {
    setActiveOption(null);
    setPickedItem(null);
    setComment('');
    setShiftDate(new Date());
    setShiftPeriod('AM');
  };

  const onPickOption = (type: RedemptionType) => {
    setActiveOption(type);
    if (type === 'food_beverage') {
      setShowMenuPicker(true);
    }
  };

  const requestedBucks = (() => {
    if (activeOption === 'food_beverage') return pickedItem?.bucksCost ?? 0;
    if (activeOption === 'section') return SECTION_COST;
    if (activeOption === 'side_work') return SIDE_WORK_COST;
    if (activeOption === 'side_work_free') return SIDE_WORK_FREE_COST;
    return 0;
  })();

  const canConfirm = (() => {
    if (!activeOption) return false;
    if (activeOption === 'food_beverage') return !!pickedItem;
    return !!shiftDate && !!shiftPeriod;
  })();

  const onSubmit = async () => {
    if (!user?.id || !activeOption) return;
    if (requestedBucks > available) {
      Alert.alert(
        'Not enough bucks',
        `You need $${requestedBucks} but have $${available} available (after pending requests).`
      );
      return;
    }
    setSubmitting(true);
    try {
      const isFood = activeOption === 'food_beverage';
      const dateStr = isFood ? null : shiftDate.toISOString().slice(0, 10);

      const { data: requestId, error } = await (supabase.rpc as any)('submit_redemption_request', {
        p_user_id: user.id,
        p_request_type: activeOption,
        p_bucks_amount: requestedBucks,
        p_menu_item_id: isFood && pickedItem?.source === 'menu_items' ? pickedItem.id : null,
        p_weekly_special_id: isFood && pickedItem?.source === 'weekly_specials' ? pickedItem.id : null,
        p_item_name_snapshot: isFood ? pickedItem?.name ?? null : null,
        p_shift_date: dateStr,
        p_shift_period: isFood ? null : shiftPeriod,
        p_comment: isFood ? null : comment || null,
      });

      if (error) {
        Alert.alert('Could not submit request', error.message);
        return;
      }

      const optionMatch = OPTIONS.find((o) => o.type === activeOption);
      const optionLabel = optionMatch ? t(optionMatch.titleKey) : 'Redemption';
      const notifTitle = '💰 Redemption Request';
      const notifBody = `${user.name || 'An employee'} requested ${optionLabel} ($${requestedBucks}).`;

      // Log to managers' notification shade (single broadcast row, filtered by targetRole on read)
      try {
        await (supabase.from('custom_notifications') as any).insert({
          title: notifTitle,
          body: notifBody,
          sent_by: user.id,
          organization_id: organizationId,
          data: {
            type: 'custom',
            destination: 'approvals',
            notificationType: 'redemption_requested',
            requestId,
            targetRole: 'manager',
            requesterId: user.id,
          },
        });
      } catch (err) {
        console.error('Failed to log redemption request to shade:', err);
      }

      // Push to all managers
      try {
        const { data: managers } = await supabase
          .from('users')
          .select('id')
          .eq('organization_id', organizationId)
          .in('role', ['manager', 'owner'])
          .eq('is_active', true);
        const managerIds = (managers || []).map((m: any) => m.id);
        if (managerIds.length > 0) {
          await sendNotification({
            userIds: managerIds,
            notificationType: 'custom',
            title: notifTitle,
            body: notifBody,
            data: { type: 'custom', destination: 'approvals' },
          });
        }
      } catch (err) {
        console.error('Notify managers failed:', err);
      }

      setShowConfirm(false);
      resetForm();
      refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerText, { color: colors.text }]}>Redeem Rewards</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.balanceCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Available McLoone&apos;s Bucks</Text>
          <Text style={[styles.balanceAmount, { color: colors.primary }]}>${available}</Text>
          {reservedBucks > 0 && (
            <Text style={[styles.reservedText, { color: colors.textSecondary }]}>
              (${reservedBucks} held in pending requests)
            </Text>
          )}
        </View>

        <View style={[styles.aboutCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.aboutTitle, { color: colors.text }]}>What you can redeem</Text>
          <Text style={[styles.aboutLine, { color: colors.textSecondary }]}>
            • Food & Beverages — at the item&apos;s menu price
          </Text>
          <Text style={[styles.aboutLine, { color: colors.textSecondary }]}>
            • Choose Your Own Section — $10
          </Text>
          <Text style={[styles.aboutLine, { color: colors.textSecondary }]}>
            • Choose Your Own Side Work — $5
          </Text>
          <Text style={[styles.aboutLine, { color: colors.textSecondary }]}>
            • Side Work Free Shift — $25
          </Text>
          <Text style={[styles.aboutFooter, { color: colors.textSecondary }]}>
            All redemptions need manager approval before bucks are deducted.
          </Text>
        </View>

        {OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.type}
            style={[styles.optionCard, { backgroundColor: colors.card }]}
            onPress={() => onPickOption(opt.type)}
            activeOpacity={0.7}
          >
            <View style={[styles.optionIcon, { backgroundColor: colors.primary + '15' }]}>
              <IconSymbol
                ios_icon_name={opt.iosIcon as any}
                android_material_icon_name={opt.androidIcon as any}
                size={24}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>{t(opt.titleKey)}</Text>
              <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>{t(opt.descriptionKey)}</Text>
            </View>
            <Text style={[styles.optionCost, { color: colors.primary }]}>{opt.costLabel}</Text>
          </TouchableOpacity>
        ))}

        <Text style={[styles.sectionHeader, { color: colors.text }]}>Pending Requests</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : pending.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            You have no pending redemption requests.
          </Text>
        ) : (
          pending.map((r) => <RedemptionRequestCard key={r.id} row={r} />)
        )}
      </ScrollView>

      {/* Menu picker for food/bev option */}
      <MenuItemSearchPicker
        visible={showMenuPicker}
        onClose={() => {
          setShowMenuPicker(false);
          if (!pickedItem) setActiveOption(null);
        }}
        onSelect={(item) => {
          setPickedItem(item);
          setShowMenuPicker(false);
          setShowConfirm(true);
        }}
      />

      {/* Shift form for non-food options */}
      <Modal
        visible={!!activeOption && activeOption !== 'food_beverage' && !showConfirm}
        animationType="slide"
        transparent
        onRequestClose={resetForm}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {(() => { const m = OPTIONS.find((o) => o.type === activeOption); return m ? t(m.titleKey) : ''; })()}
              </Text>
              <TouchableOpacity onPress={resetForm}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Shift Date</Text>
              <TouchableOpacity
                style={[styles.fieldRow, { backgroundColor: colors.card }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={{ color: colors.text }}>{shiftDate.toLocaleDateString()}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <View style={styles.datePickerWrap}>
                  <DateTimePicker
                    value={shiftDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    minimumDate={new Date()}
                    onChange={(_, d) => {
                      if (Platform.OS !== 'ios') setShowDatePicker(false);
                      if (d) setShiftDate(d);
                    }}
                    style={styles.datePicker}
                  />
                </View>
              )}

              <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 16 }]}>Shift</Text>
              <View style={styles.shiftRow}>
                {(['AM', 'PM'] as ShiftPeriod[]).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.shiftBtn,
                      {
                        backgroundColor: shiftPeriod === p ? colors.primary : colors.card,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => setShiftPeriod(p)}
                  >
                    <Text style={{ color: shiftPeriod === p ? '#fff' : colors.text, fontWeight: '700' }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 16 }]}>
                {activeOption === 'section'
                  ? 'Which section?'
                  : activeOption === 'side_work'
                  ? 'Which side work?'
                  : 'Notes (optional)'}
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.card, color: colors.text }]}
                placeholder={
                  activeOption === 'section'
                    ? 'e.g. Patio Section 3'
                    : activeOption === 'side_work'
                    ? 'e.g. Bar runner'
                    : 'Optional notes for the manager'
                }
                placeholderTextColor={colors.textSecondary}
                value={comment}
                onChangeText={setComment}
                multiline
              />
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: canConfirm ? colors.primary : colors.border }]}
                disabled={!canConfirm}
                onPress={() => setShowConfirm(true)}
              >
                <Text style={styles.confirmText}>Review (${requestedBucks})</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Confirmation */}
      <Modal visible={showConfirm} animationType="fade" transparent onRequestClose={() => setShowConfirm(false)}>
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>Confirm redemption</Text>
            {activeOption === 'food_beverage' ? (
              <Text style={[styles.confirmLine, { color: colors.text }]}>
                {pickedItem?.name} — {pickedItem?.priceText} ({pickedItem?.bucksCost} bucks)
              </Text>
            ) : (
              <>
                <Text style={[styles.confirmLine, { color: colors.text }]}>
                  {(() => { const m = OPTIONS.find((o) => o.type === activeOption); return m ? t(m.titleKey) : ''; })()} — ${requestedBucks}
                </Text>
                <Text style={[styles.confirmLine, { color: colors.textSecondary }]}>
                  {shiftDate.toLocaleDateString()} {shiftPeriod}
                </Text>
                {comment ? (
                  <Text style={[styles.confirmLine, { color: colors.textSecondary }]}>“{comment}”</Text>
                ) : null}
              </>
            )}
            <Text style={[styles.confirmFootnote, { color: colors.textSecondary }]}>
              A manager will review and approve.
            </Text>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmBtnSm, { backgroundColor: colors.border }]}
                onPress={() => setShowConfirm(false)}
                disabled={submitting}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtnSm, { backgroundColor: colors.primary }]}
                onPress={onSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
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
  scroll: { padding: 16, paddingBottom: 120 },
  balanceCard: {
    borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)', elevation: 3,
  },
  balanceLabel: { fontSize: 14, marginBottom: 4 },
  balanceAmount: { fontSize: 42, fontWeight: '800' },
  reservedText: { fontSize: 12, marginTop: 4 },
  aboutCard: {
    borderRadius: 12, padding: 16, marginBottom: 16,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)', elevation: 2,
  },
  aboutTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  aboutLine: { fontSize: 13, marginBottom: 4 },
  aboutFooter: { fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, padding: 14, marginBottom: 10,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)', elevation: 2,
  },
  optionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  optionDesc: { fontSize: 12 },
  optionCost: { fontSize: 14, fontWeight: '800' },
  sectionHeader: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  empty: { textAlign: 'center', fontSize: 13, marginTop: 12 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { height: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  fieldRow: { padding: 12, borderRadius: 10 },
  datePickerWrap: {
    marginHorizontal: -16,
    marginTop: 8,
    width: SCREEN_WIDTH,
    alignSelf: 'center',
  },
  datePicker: { width: SCREEN_WIDTH },
  shiftRow: { flexDirection: 'row', gap: 8 },
  shiftBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 2, alignItems: 'center' },
  textInput: {
    borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top',
  },
  modalFooter: { padding: 16, borderTopWidth: 1 },
  confirmBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  confirmOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24,
  },
  confirmCard: { borderRadius: 16, padding: 20 },
  confirmTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  confirmLine: { fontSize: 14, marginBottom: 6 },
  confirmFootnote: { fontSize: 12, marginTop: 12, fontStyle: 'italic' },
  confirmActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  confirmBtnSm: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
});
