import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useTranslation } from 'react-i18next';

interface EItem {
  name: string;
  description: string;
  price: string;
  is_gluten_free: boolean;
  is_vegetarian: boolean;
  glass_price: string;
  bottle_price: string;
  include: boolean;
}
interface ESub { name: string; items: EItem[] }
interface ECat { name: string; subcategories: ESub[] }

function targetMenuOptions(menuCount: number, scope: string, m1: string, m2: string) {
  if (menuCount === 1) return [{ slot: 0, label: m1 }];
  if (scope === 'per_menu') return [{ slot: 1, label: m1 }, { slot: 2, label: m2 }];
  return [{ slot: 1, label: m1 }, { slot: 2, label: m2 }, { slot: 0, label: 'Both menus' }];
}

function normalizeTree(parsed: any): ECat[] {
  const cats = Array.isArray(parsed?.categories) ? parsed.categories : [];
  return cats.map((c: any) => ({
    name: String(c?.name || '').trim(),
    subcategories: (Array.isArray(c?.subcategories) ? c.subcategories : []).map((s: any) => ({
      name: String(s?.name || '').trim(),
      items: (Array.isArray(s?.items) ? s.items : []).map((it: any) => ({
        name: String(it?.name || '').trim(),
        description: String(it?.description || ''),
        price: String(it?.price || ''),
        is_gluten_free: !!it?.is_gluten_free,
        is_vegetarian: !!it?.is_vegetarian,
        glass_price: String(it?.glass_price || ''),
        bottle_price: String(it?.bottle_price || ''),
        include: true,
      })),
    })),
  }));
}

export default function MenuUploadReviewScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ upload_id?: string; onboarding?: string }>();
  const uploadId = params.upload_id;
  // Onboarding = the owner's very first menu, so there's nothing to replace —
  // hide the Add/Replace choice and just add it (mode stays 'add').
  const isOnboarding = params.onboarding === '1';

  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [tree, setTree] = useState<ECat[]>([]);
  const [cocktails, setCocktails] = useState<string[]>([]);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'add' | 'replace'>('add');

  const menuOptions = useMemo(
    () => targetMenuOptions(organization.menu_count, organization.menu_category_scope, organization.menu_1_name, organization.menu_2_name),
    [organization]
  );
  const [targetSlot, setTargetSlot] = useState<number>(menuOptions[0].slot);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uploadId || !organizationId) return;
      try {
        setLoading(true);
        const { data: uplRows, error } = await supabase.rpc('get_menu_uploads', {
          p_actor_id: user?.id ?? '', p_upload_id: uploadId,
        });
        if (error) throw error;
        if (cancelled) return;
        const data: any = Array.isArray(uplRows) ? uplRows[0] : null;
        setTree(normalizeTree(data?.parsed_result));
        setCocktails(Array.isArray(data?.parsed_result?.flagged_cocktails) ? data.parsed_result.flagged_cocktails : []);
        // existing item names for a duplicate hint
        const { data: items } = await supabase.rpc('get_menu_items', { p_actor_id: user?.id ?? '' });
        if (!cancelled && items) setExistingNames(new Set(items.map((i: any) => String(i.name || '').toLowerCase())));
      } catch (e) {
        console.error('load review error', e);
        Alert.alert(t('menu_upload.failed_title', 'Could Not Load'), t('menu_upload.review_load_failed', 'Could not load the parsed menu.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [uploadId, organizationId]);

  const includedCount = useMemo(
    () => tree.reduce((n, c) => n + c.subcategories.reduce((m, s) => m + s.items.filter((i) => i.include && i.name.trim()).length, 0), 0),
    [tree]
  );

  const setItem = (ci: number, si: number, ii: number, patch: Partial<EItem>) => {
    setTree((prev) => {
      const next = prev.map((c) => ({ ...c, subcategories: c.subcategories.map((s) => ({ ...s, items: s.items.slice() })) }));
      next[ci].subcategories[si].items[ii] = { ...next[ci].subcategories[si].items[ii], ...patch };
      return next;
    });
  };

  const toggleCategory = (ci: number, include: boolean) => {
    setTree((prev) => {
      const next = prev.map((c) => ({ ...c, subcategories: c.subcategories.map((s) => ({ ...s, items: s.items.slice() })) }));
      next[ci].subcategories.forEach((s) => s.items.forEach((it, idx) => (s.items[idx] = { ...it, include })));
      return next;
    });
  };

  const buildPayload = () => ({
    categories: tree
      .map((c) => ({
        name: c.name,
        subcategories: c.subcategories
          .map((s) => ({
            name: s.name,
            items: s.items
              .filter((it) => it.include && it.name.trim())
              .map((it) => ({
                name: it.name.trim(),
                description: it.description,
                price: it.price,
                is_gluten_free: it.is_gluten_free,
                is_vegetarian: it.is_vegetarian,
                glass_price: it.glass_price,
                bottle_price: it.bottle_price,
              })),
          }))
          .filter((s) => s.items.length > 0),
      }))
      .filter((c) => c.name && c.subcategories.length > 0),
  });

  const doApply = async () => {
    if (includedCount === 0) {
      Alert.alert(t('menu_upload.nothing_title', 'Nothing Selected'), t('menu_upload.nothing_msg', 'Select at least one item to add.'));
      return;
    }
    const targetLabel = menuOptions.find((o) => o.slot === targetSlot)?.label || '';
    const proceed = async () => {
      try {
        setApplying(true);
        const { data, error } = await (supabase.rpc as any)('apply_parsed_menu', {
          p_user_id: user?.id,
          p_organization_id: organizationId,
          p_upload_id: uploadId,
          p_payload: buildPayload(),
          p_target_slot: targetSlot,
          p_mode: mode,
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Apply failed');
        Alert.alert(
          t('menu_upload.applied_title', 'Menu Updated!'),
          t('menu_upload.applied_msg', {
            defaultValue: 'Added {{ins}} items.{{del}} You can fine-tune anything in the Menu Editor.',
            ins: data.items_inserted,
            del: data.items_deleted ? ` Replaced ${data.items_deleted}.` : (data.items_skipped ? ` Skipped ${data.items_skipped} duplicates.` : ''),
          }),
          [{ text: t('common.ok', 'OK'), onPress: () => router.back() }]
        );
      } catch (e: any) {
        console.error('apply error', e);
        Alert.alert(t('menu_upload.apply_failed', 'Could Not Add Menu'), e.message || 'Error');
      } finally {
        setApplying(false);
      }
    };

    if (mode === 'replace') {
      Alert.alert(
        t('menu_upload.replace_confirm_title', 'Replace Menu?'),
        t('menu_upload.replace_confirm_msg', { defaultValue: 'This deletes {{menu}}’s current items first, then adds these. Items shared with the other menu are kept.', menu: targetLabel }),
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          { text: t('menu_upload.replace_confirm_ok', 'Replace'), style: 'destructive', onPress: proceed },
        ]
      );
    } else {
      proceed();
    }
  };

  const styles = createStyles(colors);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('menu_upload.review_title', 'Review Menu')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          {t('menu_upload.review_intro', 'Check what the AI found, edit anything, and uncheck items you don’t want. Nothing is added until you tap “Add to Menu”.')}
        </Text>

        {/* Target menu + mode */}
        {menuOptions.length > 1 && (
          <>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('menu_upload.target_menu', 'Add to which menu?')}</Text>
            <View style={styles.segmentRow}>
              {menuOptions.map((o) => (
                <TouchableOpacity key={o.slot} style={[styles.segment, targetSlot === o.slot && { backgroundColor: colors.primary }]} onPress={() => setTargetSlot(o.slot)}>
                  <Text style={[styles.segmentText, { color: targetSlot === o.slot ? colors.fireText : colors.text }]} numberOfLines={1}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {!isOnboarding && (
          <>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('menu_upload.mode', 'How should this be added?')}</Text>
            <View style={styles.segmentRow}>
              <TouchableOpacity style={[styles.segment, mode === 'add' && { backgroundColor: colors.primary }]} onPress={() => setMode('add')}>
                <Text style={[styles.segmentText, { color: mode === 'add' ? colors.fireText : colors.text }]}>{t('menu_upload.mode_add', 'Add to menu')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.segment, mode === 'replace' && { backgroundColor: colors.primary }]} onPress={() => setMode('replace')}>
                <Text style={[styles.segmentText, { color: mode === 'replace' ? colors.fireText : colors.text }]}>{t('menu_upload.mode_replace', 'Replace menu')}</Text>
              </TouchableOpacity>
            </View>
            {mode === 'replace' && (
              <View style={[styles.warnBanner, { backgroundColor: '#FFF3E0' }]}>
                <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={15} color="#E65100" />
                <Text style={styles.warnText}>{t('menu_upload.replace_warn', 'Replace deletes this menu’s current items first. Items shared with the other menu are kept.')}</Text>
              </View>
            )}
          </>
        )}

        {/* Flagged cocktails */}
        {cocktails.length > 0 && (
          <View style={[styles.cocktailCard, { backgroundColor: colors.primary + '10' }]}>
            <Text style={[styles.cocktailTitle, { color: colors.primary }]}>{t('menu_upload.cocktails_title', 'Cocktails found')}</Text>
            <Text style={[styles.cocktailSub, { color: colors.textSecondary }]}>
              {t('menu_upload.cocktails_sub', 'These aren’t added here — add cocktails in the Bartender Recipe editors so they get recipes, glassware and garnish:')}
            </Text>
            <Text style={[styles.cocktailList, { color: colors.text }]}>{cocktails.join(' · ')}</Text>
          </View>
        )}

        {/* Editable tree */}
        {tree.map((cat, ci) => {
          const catItemCount = cat.subcategories.reduce((m, s) => m + s.items.length, 0);
          if (catItemCount === 0) return null;
          return (
            <View key={`c-${ci}`} style={[styles.catCard, { backgroundColor: colors.card }]}>
              <View style={styles.catHeader}>
                <Text style={[styles.catName, { color: colors.text }]}>{cat.name || t('menu_upload.untitled_cat', 'Uncategorized')}</Text>
                <View style={styles.catActions}>
                  <TouchableOpacity onPress={() => toggleCategory(ci, true)}><Text style={[styles.catAction, { color: colors.primary }]}>{t('menu_upload.all', 'All')}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleCategory(ci, false)}><Text style={[styles.catAction, { color: colors.textSecondary }]}>{t('menu_upload.none', 'None')}</Text></TouchableOpacity>
                </View>
              </View>
              {cat.subcategories.map((sub, si) => (
                <View key={`s-${ci}-${si}`}>
                  {!!sub.name && <Text style={[styles.subName, { color: colors.textSecondary }]}>{sub.name}</Text>}
                  {sub.items.map((it, ii) => {
                    const dup = existingNames.has(it.name.trim().toLowerCase());
                    return (
                      <View key={`i-${ci}-${si}-${ii}`} style={[styles.itemRow, !it.include && { opacity: 0.45 }]}>
                        <TouchableOpacity onPress={() => setItem(ci, si, ii, { include: !it.include })} style={styles.checkbox} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <IconSymbol
                            ios_icon_name={it.include ? 'checkmark.square.fill' : 'square'}
                            android_material_icon_name={it.include ? 'check-box' : 'check-box-outline-blank'}
                            size={22}
                            color={it.include ? colors.primary : colors.textSecondary}
                          />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                          <View style={styles.itemTopRow}>
                            <TextInput
                              style={[styles.itemName, { color: colors.text, borderBottomColor: colors.border }]}
                              value={it.name}
                              onChangeText={(v) => setItem(ci, si, ii, { name: v })}
                              placeholder={t('menu_upload.item_name', 'Item name')}
                              placeholderTextColor={colors.textSecondary}
                            />
                            <TextInput
                              style={[styles.itemPrice, { color: colors.text, borderBottomColor: colors.border }]}
                              value={it.price}
                              onChangeText={(v) => setItem(ci, si, ii, { price: v })}
                              placeholder="$"
                              placeholderTextColor={colors.textSecondary}
                            />
                          </View>
                          <TextInput
                            style={[styles.itemDesc, { color: colors.textSecondary }]}
                            value={it.description}
                            onChangeText={(v) => setItem(ci, si, ii, { description: v })}
                            placeholder={t('menu_upload.item_desc', 'Description (optional)')}
                            placeholderTextColor={colors.textSecondary}
                            multiline
                          />
                          <View style={styles.badgeRow}>
                            {dup && (
                              <View style={[styles.badge, { backgroundColor: '#FF980020' }]}>
                                <Text style={[styles.badgeText, { color: '#E65100' }]}>{t('menu_upload.dup', 'Possible duplicate')}</Text>
                              </View>
                            )}
                            <TouchableOpacity onPress={() => setItem(ci, si, ii, { is_gluten_free: !it.is_gluten_free })} style={[styles.badge, { backgroundColor: it.is_gluten_free ? '#4CAF5020' : 'rgba(128,128,128,0.12)' }]}>
                              <Text style={[styles.badgeText, { color: it.is_gluten_free ? '#2E7D32' : colors.textSecondary }]}>{t('menu_upload.gf', 'GF')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setItem(ci, si, ii, { is_vegetarian: !it.is_vegetarian })} style={[styles.badge, { backgroundColor: it.is_vegetarian ? '#4CAF5020' : 'rgba(128,128,128,0.12)' }]}>
                              <Text style={[styles.badgeText, { color: it.is_vegetarian ? '#2E7D32' : colors.textSecondary }]}>{t('menu_upload.veg', 'Veg')}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })}

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Sticky apply bar */}
      <View style={[styles.applyBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <Text style={[styles.applyCount, { color: colors.textSecondary }]}>{t('menu_upload.selected_count', { defaultValue: '{{n}} items selected', n: includedCount })}</Text>
        <TouchableOpacity style={[styles.applyButton, { backgroundColor: colors.primary, opacity: applying || includedCount === 0 ? 0.6 : 1 }]} onPress={doApply} disabled={applying || includedCount === 0}>
          {applying ? <ActivityIndicator color={colors.fireText} size="small" /> : <Text style={[styles.applyButtonText, { color: colors.fireText }]}>{t('menu_upload.add_to_menu', 'Add to Menu')}</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 16, paddingBottom: 12, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { padding: 8, width: 40 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerRight: { width: 40 },
  scrollContent: { padding: 16, paddingBottom: 20 },
  intro: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 6 },
  segmentRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.12)' },
  segmentText: { fontSize: 12.5, fontWeight: '600' },
  warnBanner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 8, marginBottom: 14 },
  warnText: { flex: 1, fontSize: 12, color: '#E65100', lineHeight: 16 },
  cocktailCard: { padding: 14, borderRadius: 12, marginBottom: 16 },
  cocktailTitle: { fontSize: 14, fontWeight: '700' },
  cocktailSub: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  cocktailList: { fontSize: 12.5, fontWeight: '600', marginTop: 8, lineHeight: 18 },
  catCard: { borderRadius: 12, padding: 12, marginBottom: 12 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  catName: { fontSize: 16, fontWeight: '700', flex: 1 },
  catActions: { flexDirection: 'row', gap: 14 },
  catAction: { fontSize: 12.5, fontWeight: '600' },
  subName: { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  itemRow: { flexDirection: 'row', gap: 8, paddingVertical: 8, alignItems: 'flex-start' },
  checkbox: { paddingTop: 2 },
  itemTopRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  itemName: { flex: 1, fontSize: 14, fontWeight: '600', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 2 },
  itemPrice: { width: 64, fontSize: 13, fontWeight: '600', textAlign: 'right', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 2 },
  itemDesc: { fontSize: 12.5, marginTop: 4, paddingVertical: 0 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  applyBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 14, borderTopWidth: StyleSheet.hairlineWidth },
  applyCount: { fontSize: 13, fontWeight: '600' },
  applyButton: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10 },
  applyButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
