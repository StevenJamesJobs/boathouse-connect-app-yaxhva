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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useTranslation } from 'react-i18next';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { translateServerError } from '@/utils/serverErrors';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import { fonts } from '@/constants/fonts';

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
  useRequireManagerRoute();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ upload_id?: string; onboarding?: string; view?: string }>();
  const uploadId = params.upload_id;
  // Onboarding = the owner's very first menu, so there's nothing to replace —
  // hide the Add/Replace choice and just add it (mode stays 'add').
  const isOnboarding = params.onboarding === '1';
  // s72: read-only viewer for an APPLIED upload — the parsed_result snapshot
  // outlives the apply (and any later replace), so old scans stay browsable.
  const isViewer = params.view === '1';

  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [tree, setTree] = useState<ECat[]>([]);
  const [cocktails, setCocktails] = useState<string[]>([]);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [uploadMeta, setUploadMeta] = useState<{
    items_inserted: number | null;
    target_menu_slot: number | null;
    created_at: string | null;
  }>({ items_inserted: null, target_menu_slot: null, created_at: null });

  const menuOptions = useMemo(
    () => targetMenuOptions(organization.menu_count, organization.menu_category_scope, organization.menu_1_name, organization.menu_2_name),
    [organization]
  );
  const [targetSlot, setTargetSlot] = useState<number>(menuOptions[0].slot);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      if (!uploadId || !organizationId) return;
      try {
        setLoading(true);
        const { data: uplRows, error } = await supabase.rpc('get_menu_uploads', {
          p_actor_id: user.id, p_upload_id: uploadId,
        });
        if (error) throw error;
        if (cancelled) return;
        const data: any = Array.isArray(uplRows) ? uplRows[0] : null;
        setTree(normalizeTree(data?.parsed_result));
        setCocktails(Array.isArray(data?.parsed_result?.flagged_cocktails) ? data.parsed_result.flagged_cocktails : []);
        setUploadMeta({
          items_inserted: data?.items_inserted ?? null,
          target_menu_slot: data?.target_menu_slot ?? null,
          created_at: data?.created_at ?? null,
        });
        if (!isViewer) {
          // existing item names for a duplicate hint (meaningless in the viewer)
          const { data: items } = await supabase.rpc('get_menu_items', { p_actor_id: user.id });
          if (!cancelled && items) setExistingNames(new Set(items.map((i: any) => String(i.name || '').toLowerCase())));
        }
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
    if (!user?.id || !organizationId || !uploadId) return;
    if (includedCount === 0) {
      Alert.alert(t('menu_upload.nothing_title', 'Nothing Selected'), t('menu_upload.nothing_msg', 'Select at least one item to add.'));
      return;
    }
    const targetLabel = menuOptions.find((o) => o.slot === targetSlot)?.label || '';
    const proceed = async () => {
      try {
        setApplying(true);
        const { data, error } = await supabase.rpc('apply_parsed_menu', {
          p_user_id: user.id,
          p_organization_id: organizationId,
          p_upload_id: uploadId,
          p_payload: buildPayload(),
          p_target_slot: targetSlot,
          p_mode: mode,
        });
        if (error) throw error;
        const result = data as { success?: boolean; error?: string; items_inserted?: number; items_deleted?: number; items_skipped?: number } | null;
        if (!result?.success) throw new Error(result?.error || 'Apply failed');
        Alert.alert(
          t('menu_upload.applied_title', 'Menu Updated!'),
          t('menu_upload.applied_msg', {
            defaultValue: 'Added {{ins}} items.{{del}} You can fine-tune anything in the Menu Editor.',
            ins: result.items_inserted,
            del: result.items_deleted ? ` Replaced ${result.items_deleted}.` : (result.items_skipped ? ` Skipped ${result.items_skipped} duplicates.` : ''),
          }),
          [{ text: t('common.ok', 'OK'), onPress: () => router.back() }]
        );
      } catch (e: any) {
        console.error('apply error', e);
        Alert.alert(t('menu_upload.apply_failed', 'Could Not Add Menu'), translateServerError(e, 'Error'));
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
        <AmbientGlow />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AmbientGlow />
      {/* Menu-family rhythm — same chrome height as the upload page behind it. */}
      <ScreenHeader
        title={isViewer ? t('menu_upload.view_title', 'Uploaded Scan') : t('menu_upload.review_title', 'Review Menu')}
        eyebrow={organization?.name}
        topOffset={insets.top + 12}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {isViewer ? (
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            {(() => {
              const date = uploadMeta.created_at
                ? new Date(uploadMeta.created_at).toLocaleDateString(i18n.language === 'es' ? 'es' : 'en', { year: 'numeric', month: 'short', day: 'numeric' })
                : '';
              const menuLabel = menuOptions.find((o) => o.slot === uploadMeta.target_menu_slot)?.label;
              return menuLabel
                ? t('menu_upload.view_added_to', { defaultValue: 'Added {{n}} items to {{menu}} · {{date}}', n: uploadMeta.items_inserted ?? 0, menu: menuLabel, date })
                : t('menu_upload.view_added_plain', { defaultValue: 'Added {{n}} items · {{date}}', n: uploadMeta.items_inserted ?? 0, date });
            })()}
          </Text>
        ) : (
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            {t('menu_upload.review_intro', 'Check what the AI found, edit anything, and uncheck items you don’t want. Nothing is added until you tap “Add to Menu”.')}
          </Text>
        )}

        {/* Target menu + mode */}
        {!isViewer && menuOptions.length > 1 && (
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

        {!isViewer && !isOnboarding && (
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
              <View style={[styles.warnBanner, { backgroundColor: '#FF980018', borderColor: '#FF98004D' }]}>
                <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={15} color="#FF9800" />
                <Text style={[styles.warnText, { color: colors.text }]}>{t('menu_upload.replace_warn', 'Replace deletes this menu’s current items first. Items shared with the other menu are kept.')}</Text>
              </View>
            )}
          </>
        )}

        {/* Flagged cocktails */}
        {cocktails.length > 0 && (
          <View style={[styles.cocktailCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '38' }]}>
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
            <View key={`c-${ci}`} style={[styles.catCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
              <View style={styles.catHeader}>
                <Text style={[styles.catName, { color: colors.text }]}>{cat.name || t('menu_upload.untitled_cat', 'Uncategorized')}</Text>
                {!isViewer && (
                  <View style={styles.catActions}>
                    <TouchableOpacity onPress={() => toggleCategory(ci, true)}><Text style={[styles.catAction, { color: colors.primary }]}>{t('menu_upload.all', 'All')}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => toggleCategory(ci, false)}><Text style={[styles.catAction, { color: colors.textSecondary }]}>{t('menu_upload.none', 'None')}</Text></TouchableOpacity>
                  </View>
                )}
              </View>
              {cat.subcategories.map((sub, si) => (
                <View key={`s-${ci}-${si}`}>
                  {!!sub.name && <Text style={[styles.subName, { color: colors.textSecondary }]}>{sub.name}</Text>}
                  {sub.items.map((it, ii) => {
                    const dup = existingNames.has(it.name.trim().toLowerCase());
                    return (
                      <View key={`i-${ci}-${si}-${ii}`} style={[styles.itemRow, !it.include && { opacity: 0.45 }]}>
                        {!isViewer && (
                          <TouchableOpacity onPress={() => setItem(ci, si, ii, { include: !it.include })} style={styles.checkbox} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <IconSymbol
                              ios_icon_name={it.include ? 'checkmark.square.fill' : 'square'}
                              android_material_icon_name={it.include ? 'check-box' : 'check-box-outline-blank'}
                              size={22}
                              color={it.include ? colors.primary : colors.textSecondary}
                            />
                          </TouchableOpacity>
                        )}
                        <View style={{ flex: 1 }}>
                          <View style={styles.itemTopRow}>
                            <TextInput
                              style={[styles.itemName, { color: colors.text, borderBottomColor: isViewer ? 'transparent' : colors.border }]}
                              value={it.name}
                              onChangeText={(v) => setItem(ci, si, ii, { name: v })}
                              placeholder={isViewer ? undefined : t('menu_upload.item_name', 'Item name')}
                              placeholderTextColor={colors.textSecondary}
                              editable={!isViewer}
                            />
                            <TextInput
                              style={[styles.itemPrice, { color: colors.text, borderBottomColor: isViewer ? 'transparent' : colors.border }]}
                              value={it.price}
                              onChangeText={(v) => setItem(ci, si, ii, { price: v })}
                              placeholder={isViewer ? undefined : "$"}
                              placeholderTextColor={colors.textSecondary}
                              editable={!isViewer}
                            />
                          </View>
                          {(!isViewer || !!it.description) && (
                            <TextInput
                              style={[styles.itemDesc, { color: colors.textSecondary }]}
                              value={it.description}
                              onChangeText={(v) => setItem(ci, si, ii, { description: v })}
                              placeholder={isViewer ? undefined : t('menu_upload.item_desc', 'Description (optional)')}
                              placeholderTextColor={colors.textSecondary}
                              multiline
                              editable={!isViewer}
                            />
                          )}
                          <View style={styles.badgeRow}>
                            {!isViewer && dup && (
                              <View style={[styles.badge, { backgroundColor: '#FF980020' }]}>
                                <Text style={[styles.badgeText, { color: '#E65100' }]}>{t('menu_upload.dup', 'Possible duplicate')}</Text>
                              </View>
                            )}
                            {(!isViewer || it.is_gluten_free) && (
                              <TouchableOpacity disabled={isViewer} onPress={() => setItem(ci, si, ii, { is_gluten_free: !it.is_gluten_free })} style={[styles.badge, { backgroundColor: it.is_gluten_free ? '#4CAF5020' : 'rgba(128,128,128,0.12)' }]}>
                                <Text style={[styles.badgeText, { color: it.is_gluten_free ? '#2E7D32' : colors.textSecondary }]}>{t('menu_upload.gf', 'GF')}</Text>
                              </TouchableOpacity>
                            )}
                            {(!isViewer || it.is_vegetarian) && (
                              <TouchableOpacity disabled={isViewer} onPress={() => setItem(ci, si, ii, { is_vegetarian: !it.is_vegetarian })} style={[styles.badge, { backgroundColor: it.is_vegetarian ? '#4CAF5020' : 'rgba(128,128,128,0.12)' }]}>
                                <Text style={[styles.badgeText, { color: it.is_vegetarian ? '#2E7D32' : colors.textSecondary }]}>{t('menu_upload.veg', 'Veg')}</Text>
                              </TouchableOpacity>
                            )}
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

      {/* Sticky apply bar — Save & Review Later is a deliberate back-out: the
          upload stays ready_for_review either way (s72, Steve's hand-off ask).
          The read-only viewer has no bar at all — the back chip is the exit. */}
      {!isViewer && (
      <View style={[styles.applyBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <Text style={[styles.applyCount, { color: colors.textSecondary }]}>{t('menu_upload.selected_count', { defaultValue: '{{n}} items selected', n: includedCount })}</Text>
        <View style={styles.applyRow}>
          <TouchableOpacity
            style={[styles.saveLaterButton, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, opacity: applying ? 0.6 : 1 }]}
            // ALWAYS lands on the AI Menu Upload page (navigate pops back to it
            // when it's in the stack, pushes it when the review was reached from
            // the ⚙ sheet) — so the "Ready to review" row is right there and the
            // page's location sticks, especially on first use (Steve's s72 call).
            onPress={() => router.navigate({ pathname: '/menu-upload', params: isOnboarding ? { onboarding: '1' } : {} } as any)}
            disabled={applying}
          >
            <Text style={[styles.saveLaterText, { color: colors.text }]}>{t('menu_upload.save_later', 'Save & Review Later')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.applyButton, { backgroundColor: colors.primary, opacity: applying || includedCount === 0 ? 0.6 : 1 }]} onPress={doApply} disabled={applying || includedCount === 0}>
            {applying ? <ActivityIndicator color={colors.fireText} size="small" /> : <Text style={[styles.applyButtonText, { color: colors.fireText }]}>{t('menu_upload.add_to_menu', 'Add to Menu')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
      )}
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 4, paddingBottom: 20 },
  intro: { fontSize: 13, fontFamily: fonts.body.regular, lineHeight: 18, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontFamily: fonts.display.semibold, marginBottom: 8, marginTop: 6 },
  segmentRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.12)' },
  segmentText: { fontSize: 12.5, fontFamily: fonts.body.semibold },
  warnBanner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth + 0.5, marginBottom: 14 },
  warnText: { flex: 1, fontSize: 12, fontFamily: fonts.body.regular, lineHeight: 16 },
  cocktailCard: { padding: 14, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth + 0.5, marginBottom: 16 },
  cocktailTitle: { fontSize: 14, fontFamily: fonts.display.semibold },
  cocktailSub: { fontSize: 12, fontFamily: fonts.body.regular, marginTop: 4, lineHeight: 16 },
  cocktailList: { fontSize: 12.5, fontFamily: fonts.body.semibold, marginTop: 8, lineHeight: 18 },
  catCard: { borderRadius: 17, borderWidth: StyleSheet.hairlineWidth + 0.5, padding: 12, marginBottom: 12 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  catName: { fontSize: 16, fontFamily: fonts.display.semibold, flex: 1 },
  catActions: { flexDirection: 'row', gap: 14 },
  catAction: { fontSize: 12.5, fontFamily: fonts.body.semibold },
  subName: { fontSize: 10.5, fontFamily: fonts.mono.semibold, marginTop: 8, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 },
  itemRow: { flexDirection: 'row', gap: 8, paddingVertical: 8, alignItems: 'flex-start' },
  checkbox: { paddingTop: 2 },
  itemTopRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  itemName: { flex: 1, fontSize: 14, fontFamily: fonts.body.semibold, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 2 },
  itemPrice: { width: 64, fontSize: 13, fontFamily: fonts.mono.medium, textAlign: 'right', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 2 },
  itemDesc: { fontSize: 12.5, fontFamily: fonts.body.regular, marginTop: 4, paddingVertical: 0 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontFamily: fonts.mono.semibold },
  applyBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 26 : 14, borderTopWidth: StyleSheet.hairlineWidth },
  applyCount: { fontSize: 11.5, fontFamily: fonts.mono.medium, textAlign: 'center', marginBottom: 8 },
  applyRow: { flexDirection: 'row', gap: 8 },
  saveLaterButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  saveLaterText: { fontSize: 13, fontFamily: fonts.body.semibold },
  applyButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  applyButtonText: { fontSize: 14, fontFamily: fonts.body.semibold },
});
