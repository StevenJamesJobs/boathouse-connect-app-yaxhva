import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import GlassCard from '@/components/GlassCard';
import AmbientGlow from '@/components/AmbientGlow';
import { fonts } from '@/constants/fonts';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useTranslation } from 'react-i18next';
import { translateTexts } from '@/utils/translateContent';
import { useMenuCategories } from '@/hooks/useMenuCategories';

interface CustomOption {
  id: string;
  label: string;
  label_es?: string | null;
  cost: number;
  is_active: boolean;
  display_order: number;
}

// Built-in defaults match the migration (used when no settings row exists yet).
const DEFAULTS = {
  redemptions_enabled: true,
  food_enabled: true,
  food_mode: 'full' as 'full' | 'half',
  section_enabled: true,
  section_cost: 10,
  sidework_enabled: true,
  sidework_cost: 5,
  freeshift_enabled: true,
  freeshift_cost: 25,
};

export default function RedeemSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const currencyName = organization.reward_currency_name;
  const { categories } = useMenuCategories();
  const specialsName = useMemo(() => {
    const c = categories.find((cat: any) => cat.filter_behavior === 'weekly_specials');
    return c?.display_name || t('redeem_settings.featured_special', 'featured special');
  }, [categories, t]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState({ ...DEFAULTS });
  const [customs, setCustoms] = useState<CustomOption[]>([]);

  // Add/edit custom modal
  const [showCustom, setShowCustom] = useState(false);
  const [editingCustom, setEditingCustom] = useState<CustomOption | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [customLabelEs, setCustomLabelEs] = useState('');
  const [customCost, setCustomCost] = useState('');
  const [translating, setTranslating] = useState(false);

  const autoTranslateCustom = async () => {
    if (!customLabel.trim()) return;
    setTranslating(true);
    try {
      const [es] = await translateTexts([customLabel.trim()]);
      if (es) setCustomLabelEs(es);
    } catch (e) {
      console.warn('translate custom option', e);
    } finally {
      setTranslating(false);
    }
  };

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [rowRes, optsRes] = await Promise.all([
        supabase.from('organization_redemption_settings' as any).select('*').eq('organization_id', organizationId).maybeSingle(),
        supabase.from('redemption_custom_options' as any).select('*').eq('organization_id', organizationId).order('display_order', { ascending: true }),
      ]);
      const row: any = rowRes.data;
      const opts: any[] = (optsRes.data as any) || [];
      if (row) {
        setS({
          redemptions_enabled: row.redemptions_enabled,
          food_enabled: row.food_enabled,
          food_mode: row.food_mode,
          section_enabled: row.section_enabled,
          section_cost: row.section_cost,
          sidework_enabled: row.sidework_enabled,
          sidework_cost: row.sidework_cost,
          freeshift_enabled: row.freeshift_enabled,
          freeshift_cost: row.freeshift_cost,
        });
      }
      setCustoms(opts as CustomOption[]);
    } catch (e) {
      console.error('load redemption settings', e);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('update_redemption_settings', {
        p_user_id: user?.id,
        p_organization_id: organizationId,
        p_redemptions_enabled: s.redemptions_enabled,
        p_food_enabled: s.food_enabled,
        p_food_mode: s.food_mode,
        p_section_enabled: s.section_enabled,
        p_section_cost: parseInt(String(s.section_cost)) || 0,
        p_sidework_enabled: s.sidework_enabled,
        p_sidework_cost: parseInt(String(s.sidework_cost)) || 0,
        p_freeshift_enabled: s.freeshift_enabled,
        p_freeshift_cost: parseInt(String(s.freeshift_cost)) || 0,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason || 'save failed');
      Alert.alert(t('common:success'), t('redeem_settings.saved', 'Redeem settings saved.'));
      router.back();
    } catch (e: any) {
      Alert.alert(t('common:error'), e.message || t('redeem_settings.save_error', 'Could not save settings.'));
    } finally {
      setSaving(false);
    }
  };

  const openAddCustom = () => { setEditingCustom(null); setCustomLabel(''); setCustomLabelEs(''); setCustomCost(''); setShowCustom(true); };
  const openEditCustom = (o: CustomOption) => { setEditingCustom(o); setCustomLabel(o.label); setCustomLabelEs(o.label_es || ''); setCustomCost(String(o.cost)); setShowCustom(true); };

  const saveCustom = async () => {
    if (!customLabel.trim()) { Alert.alert(t('common:error'), t('redeem_settings.label_required', 'Enter a name for the option.')); return; }
    try {
      const { data, error } = await (supabase as any).rpc('upsert_redemption_custom_option', {
        p_user_id: user?.id,
        p_organization_id: organizationId,
        p_id: editingCustom?.id ?? null,
        p_label: customLabel.trim(),
        p_cost: parseInt(customCost) || 0,
        p_is_active: editingCustom?.is_active ?? true,
        p_label_es: customLabelEs.trim() || null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason || 'save failed');
      setShowCustom(false);
      load();
    } catch (e: any) {
      Alert.alert(t('common:error'), e.message || 'Could not save option.');
    }
  };

  const toggleCustomActive = async (o: CustomOption) => {
    try {
      await (supabase as any).rpc('upsert_redemption_custom_option', {
        p_user_id: user?.id, p_organization_id: organizationId,
        p_id: o.id, p_label: o.label, p_cost: o.cost, p_is_active: !o.is_active,
      });
      load();
    } catch (e) { console.warn('toggle custom', e); }
  };

  const deleteCustom = (o: CustomOption) => {
    Alert.alert(t('redeem_settings.delete_option_title', 'Delete option?'), o.label, [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('common:delete'), style: 'destructive', onPress: async () => {
          try {
            await (supabase as any).rpc('delete_redemption_custom_option', { p_user_id: user?.id, p_organization_id: organizationId, p_id: o.id });
            load();
          } catch (e) { console.warn('delete custom', e); }
        },
      },
    ]);
  };

  const Toggle = ({ on, onPress }: { on: boolean; onPress: () => void }) => (
    <Pressable style={[styles.tsw, { backgroundColor: on ? '#34C759' : colors.glassBorder }]} onPress={onPress}>
      <View style={[styles.tswKnob, { alignSelf: on ? 'flex-end' : 'flex-start' }]} />
    </Pressable>
  );

  const CostRow = ({ label, on, cost, onToggle, onCost }: { label: string; on: boolean; cost: number; onToggle: () => void; onCost: (v: string) => void }) => (
    <GlassCard variant="surface" radius={15} style={styles.optCard}>
      <View style={styles.optRow}>
        <Text style={[styles.optLabel, !on && { opacity: 0.5 }]}>{label}</Text>
        <Toggle on={on} onPress={onToggle} />
      </View>
      {on && (
        <View style={styles.costRow}>
          <Text style={styles.costLbl}>{t('redeem_settings.cost_label', 'Cost')}</Text>
          <TextInput style={styles.costInput} value={String(cost)} onChangeText={onCost} keyboardType="numeric" placeholderTextColor={colors.textSecondary} />
          <Text style={styles.costSuffix}>{currencyName}</Text>
        </View>
      )}
    </GlassCard>
  );

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <AmbientGlow />
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AmbientGlow />
      <View style={[styles.idbar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.bk} onPress={() => router.back()} hitSlop={8}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.idTitle}>{t('redeem_settings.title', 'Redeem Settings')}</Text>
          <Text style={styles.idSub}>{t('redeem_settings.subtitle', 'Cash-in options')}</Text>
        </View>
      </View>

      <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
        {/* Master toggle */}
        <GlassCard variant="glass" radius={18} style={styles.masterCard}>
          <View style={styles.optRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.masterTitle}>{t('redeem_settings.enable_title', 'Enable Redemptions')}</Text>
              <Text style={styles.masterSub}>{t('redeem_settings.enable_sub', 'Let staff cash in their bucks. When off, the Redeem button is hidden everywhere.')}</Text>
            </View>
            <Toggle on={s.redemptions_enabled} onPress={() => setS({ ...s, redemptions_enabled: !s.redemptions_enabled })} />
          </View>
        </GlassCard>

        {s.redemptions_enabled && (
          <>
            {/* Food & Beverage */}
            <Text style={styles.zlabel}>{t('redeem_settings.builtin_title', 'Built-in options')}</Text>
            <GlassCard variant="surface" radius={15} style={styles.optCard}>
              <View style={styles.optRow}>
                <Text style={[styles.optLabel, !s.food_enabled && { opacity: 0.5 }]}>{t('rewards_ui:redeem_food_title', 'Food & Beverage')}</Text>
                <Toggle on={s.food_enabled} onPress={() => setS({ ...s, food_enabled: !s.food_enabled })} />
              </View>
              {s.food_enabled && (
                <>
                  <Text style={styles.foodNote}>
                    {s.food_mode === 'half'
                      ? t('redeem_settings.food_half_note', { currencyName, specialsName, defaultValue: `Staff redeem any menu item or ${specialsName} at HALF its price in ${currencyName}.` })
                      : t('redeem_settings.food_full_note', { currencyName, specialsName, defaultValue: `Staff redeem any menu item or ${specialsName} at its full price in ${currencyName}.` })}
                  </Text>
                  <View style={styles.modeSeg}>
                    <Pressable style={[styles.modeOpt, s.food_mode === 'full' && styles.modeOn]} onPress={() => setS({ ...s, food_mode: 'full' })}>
                      <Text style={[styles.modeTxt, s.food_mode === 'full' && { color: colors.fireText }]}>{t('redeem_settings.full_price', 'Full Price')}</Text>
                    </Pressable>
                    <Pressable style={[styles.modeOpt, s.food_mode === 'half' && styles.modeOn]} onPress={() => setS({ ...s, food_mode: 'half' })}>
                      <Text style={[styles.modeTxt, s.food_mode === 'half' && { color: colors.fireText }]}>{t('redeem_settings.half_price', 'Half Price')}</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </GlassCard>

            <CostRow label={t('rewards_ui:redeem_section_title', 'Choose Your Own Section')} on={s.section_enabled} cost={s.section_cost}
              onToggle={() => setS({ ...s, section_enabled: !s.section_enabled })} onCost={(v) => setS({ ...s, section_cost: parseInt(v) || 0 })} />
            <CostRow label={t('rewards_ui:redeem_sidework_title', 'Choose Your Own Side Work')} on={s.sidework_enabled} cost={s.sidework_cost}
              onToggle={() => setS({ ...s, sidework_enabled: !s.sidework_enabled })} onCost={(v) => setS({ ...s, sidework_cost: parseInt(v) || 0 })} />
            <CostRow label={t('rewards_ui:redeem_freeshift_title', 'Side Work Free Shift')} on={s.freeshift_enabled} cost={s.freeshift_cost}
              onToggle={() => setS({ ...s, freeshift_enabled: !s.freeshift_enabled })} onCost={(v) => setS({ ...s, freeshift_cost: parseInt(v) || 0 })} />

            {/* Custom options */}
            <Text style={styles.zlabel}>{t('redeem_settings.custom_title', 'Custom options')}</Text>
            {customs.map((o) => (
              <GlassCard key={o.id} variant="surface" radius={15} style={styles.customCard}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.optLabel, !o.is_active && { opacity: 0.5 }]} numberOfLines={1}>{o.label}</Text>
                  <Text style={styles.customCost}>{o.cost} {currencyName}</Text>
                </View>
                <Toggle on={o.is_active} onPress={() => toggleCustomActive(o)} />
                <Pressable onPress={() => openEditCustom(o)} hitSlop={6} style={{ marginLeft: 12 }}>
                  <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={17} color={colors.tint} />
                </Pressable>
                <Pressable onPress={() => deleteCustom(o)} hitSlop={6} style={{ marginLeft: 12 }}>
                  <IconSymbol ios_icon_name="trash.fill" android_material_icon_name="delete" size={17} color="#FF6B6B" />
                </Pressable>
              </GlassCard>
            ))}
            <Pressable style={styles.addCustom} onPress={openAddCustom}>
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={19} color={colors.tint} />
              <Text style={styles.addCustomTxt}>{t('redeem_settings.add_custom', 'Add Custom Option')}</Text>
            </Pressable>

            <Text style={styles.approvalNote}>{t('redeem_settings.approval_note', 'All redemptions need manager approval before bucks are deducted.')}</Text>
          </>
        )}

        <Pressable style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.fireText} /> : <Text style={styles.saveTxt}>{t('redeem_settings.save', 'Save Settings')}</Text>}
        </Pressable>
      </ScrollView>

      <Modal visible={showCustom} transparent animationType="slide" onRequestClose={() => setShowCustom(false)}>
        <View style={styles.sheetWrap}>
          <Pressable style={styles.scrim} onPress={() => setShowCustom(false)} />
          <GlassCard variant="glass" radius={26} intensity={32} style={styles.sheet}>
            <View style={styles.grab} />
            <Text style={styles.mtitle}>{editingCustom ? t('redeem_settings.edit_option', 'Edit Option') : t('redeem_settings.new_option', 'New Option')}</Text>
            <Text style={styles.flbl}>{t('redeem_settings.option_name', 'Option name')}</Text>
            <TextInput style={styles.finput} value={customLabel} onChangeText={setCustomLabel} placeholder={t('redeem_settings.option_name_ph', 'e.g. Leave 30 min early')} placeholderTextColor={colors.textSecondary} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 7, marginHorizontal: 2 }}>
              <Text style={{ fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textSecondary }}>{t('redeem_settings.option_name_es', 'Spanish name')}</Text>
              <Pressable onPress={autoTranslateCustom} disabled={!customLabel.trim() || translating} style={{ opacity: !customLabel.trim() || translating ? 0.5 : 1 }} hitSlop={8}>
                <Text style={{ fontFamily: fonts.display.semibold, fontSize: 12, color: colors.tint }}>{translating ? t('redeem_settings.translating', 'Translating…') : t('redeem_settings.translate', 'Translate')}</Text>
              </Pressable>
            </View>
            <TextInput style={styles.finput} value={customLabelEs} onChangeText={setCustomLabelEs} placeholder={t('redeem_settings.option_name_es_ph', 'Spanish translation (optional)')} placeholderTextColor={colors.textSecondary} />
            <Text style={styles.flbl}>{t('redeem_settings.cost_label', 'Cost')} ({currencyName})</Text>
            <TextInput style={styles.finput} value={customCost} onChangeText={setCustomCost} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textSecondary} />
            <Pressable style={styles.saveBtn} onPress={saveCustom}>
              <Text style={styles.saveTxt}>{editingCustom ? t('common:save') : t('redeem_settings.add', 'Add Option')}</Text>
            </Pressable>
          </GlassCard>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    idbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 6, zIndex: 5 },
    bk: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' },
    idTitle: { fontFamily: fonts.display.bold, fontSize: 19, color: colors.text, letterSpacing: -0.3 },
    idSub: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.tint, marginTop: 2 },
    screen: { flex: 1, zIndex: 2 },
    screenContent: { paddingHorizontal: 16, paddingBottom: 60, paddingTop: 8 },
    masterCard: { padding: 16 },
    masterTitle: { fontFamily: fonts.display.bold, fontSize: 16, color: colors.text },
    masterSub: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 17, paddingRight: 10 },
    zlabel: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.textSecondary, marginTop: 20, marginBottom: 9, marginHorizontal: 2 },
    optCard: { padding: 14, marginBottom: 9 },
    optRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    optLabel: { fontFamily: fonts.display.semibold, fontSize: 14.5, color: colors.text, flex: 1 },
    foodNote: { fontFamily: fonts.body.regular, fontSize: 11.5, color: colors.textSecondary, marginTop: 8, lineHeight: 16 },
    modeSeg: { flexDirection: 'row', gap: 8, marginTop: 11 },
    modeOpt: { flex: 1, height: 40, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center' },
    modeOn: { backgroundColor: colors.primary, borderColor: 'transparent' },
    modeTxt: { fontFamily: fonts.display.semibold, fontSize: 13, color: colors.textSecondary },
    costRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 11 },
    costLbl: { fontFamily: fonts.mono.medium, fontSize: 10, textTransform: 'uppercase', color: colors.textSecondary },
    costInput: { width: 70, height: 40, borderRadius: 11, backgroundColor: colors.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.mono.semibold, fontSize: 15, textAlign: 'center' },
    costSuffix: { fontFamily: fonts.mono.medium, fontSize: 11, color: colors.textSecondary },
    customCard: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 9 },
    customCost: { fontFamily: fonts.mono.semibold, fontSize: 12, color: colors.tint, marginTop: 3 },
    addCustom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth + 0.5, borderColor: colors.tint + '52', backgroundColor: colors.tint + '14', borderStyle: 'dashed' },
    addCustomTxt: { fontFamily: fonts.display.semibold, fontSize: 13.5, color: colors.tint },
    approvalNote: { fontFamily: fonts.body.regular, fontSize: 11.5, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 18, lineHeight: 16, paddingHorizontal: 16 },
    saveBtn: { height: 52, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
    saveTxt: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.fireText },
    tsw: { width: 46, height: 27, borderRadius: 14, padding: 3, justifyContent: 'center' },
    tswKnob: { width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff' },
    sheetWrap: { flex: 1, justifyContent: 'flex-end' },
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,10,18,0.5)' },
    sheet: { paddingHorizontal: 18, paddingBottom: 28, paddingTop: 8 },
    grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.glassBorder, alignSelf: 'center', marginTop: 6, marginBottom: 14 },
    mtitle: { fontFamily: fonts.display.bold, fontSize: 18, color: colors.text },
    flbl: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textSecondary, marginTop: 16, marginBottom: 7, marginHorizontal: 2 },
    finput: { height: 46, borderRadius: 13, backgroundColor: colors.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 14, color: colors.text, fontSize: 14, fontFamily: fonts.body.regular },
  });
