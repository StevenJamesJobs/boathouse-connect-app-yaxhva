import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import ScanQuip from '@/components/MenuScanQuips';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { brokerUploadBase64 } from '@/utils/storageBroker';
import { translateServerError } from '@/utils/serverErrors';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { useThemeColors } from '@/hooks/useThemeColors';
import { menuIconAndroid } from '@/constants/menuIcons';
import { fonts } from '@/constants/fonts';

// A PDF costs 3 credits, each photo 1 — the ONE pool the menu upload spends
// (get_menu_upload_quota carries the cost table; the PDF cost is pinned here
// to match its `credits_costs` copy).
const PDF_COST = 3;

export interface LibationUploadSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The book pre-picked by the host (the Winter / Summer editors). */
  defaultSlot?: 1 | 2;
}

interface Quota {
  free_available: boolean;
  credits_remaining: number;
  monthly_allowance: number;
}

/**
 * LibationUploadSheet — the Libations AI Upload (s90, Steve's frame 2). Opened
 * by the Bar Assistant Editor's tile, and by the "Upload Libations" row on the
 * hub's and the two libation editors' To User sheets.
 *
 * Credits strip → pick the BOOK (Menu 1 | Menu 2 libations — Cocktails A-Z and
 * Mixes are curated by hand, never destinations) → three sources → the Recent
 * Uploads row (the AI Menu Upload page's Recent tab lists both kinds). The
 * scan runs inside the sheet (quips rotor); when the parse lands the sheet
 * closes and the Review Libations page opens.
 *
 * Gates (all server-enforced too): base tier → the PremiumGate card with the
 * Upgrade CTA; a manager without premium.ai_libation_upload → the rows LOCKED
 * (the MenuSheet rule: visible, dimmed, "ask your owner"), never hidden.
 *
 * Navigations (the review push, History, Upgrade) and alerts ride the sheet's
 * handoff `defer` — a push under a live Modal lands beneath it and an Alert
 * during a dismissal is dropped by UIKit.
 */
export default function LibationUploadSheet({ visible, onClose, defaultSlot }: LibationUploadSheetProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { hasPremium } = useSubscription();
  const { perms } = useManagerPermissions();
  const { defer, onDismiss } = useSheetHandoff(onClose);

  const isOwner = user?.role === 'owner';
  const canUpload = isOwner || perms.aiLibationUpload;
  const twoMenus = organization?.menu_count === 2 || organization?.menu2_recipes_visible === true;

  const [slot, setSlot] = useState<1 | 2>(defaultSlot ?? 1);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Reset to the host's book + refresh the credits on each OPEN (edge-triggered).
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setSlot(defaultSlot ?? 1);
      if (user?.id && organizationId && canUpload && hasPremium) {
        supabase
          .rpc('get_menu_upload_quota', { p_user_id: user.id, p_organization_id: organizationId })
          .then(({ data }) => {
            const q = data as (Quota & { success?: boolean }) | null;
            if (q?.success) setQuota(q);
          });
      }
    }
    wasVisible.current = visible;
  }, [visible, defaultSlot, user?.id, organizationId, canUpload, hasPremium]);

  // Poll the upload row; the error branch stops the interval instead of
  // polling forever (an RPC error or five straight empty reads).
  useEffect(() => {
    if (!processingId) return;
    let emptyTicks = 0;
    const interval = setInterval(async () => {
      if (!user?.id) return;
      const { data: rows, error } = await supabase.rpc('get_menu_uploads', { p_actor_id: user.id, p_upload_id: processingId });
      const data: any = Array.isArray(rows) ? rows[0] : null;
      if (error || (!data && ++emptyTicks >= 5)) {
        clearInterval(interval);
        setProcessingId(null);
        defer(() => Alert.alert(t('libation_upload.failed_title'), t('menu_upload.poll_failed')));
        return;
      }
      if (!data) return;
      emptyTicks = 0;
      if (data.status !== 'processing') {
        const id = processingId;
        clearInterval(interval);
        setProcessingId(null);
        if (data.status === 'ready_for_review') {
          defer(() => router.push({ pathname: '/libation-upload-review', params: { upload_id: id } } as any));
        } else if (data.status === 'failed') {
          defer(() =>
            Alert.alert(
              t('libation_upload.failed_title'),
              translateServerError({ message: data.error_message }, t('libation_upload.failed_generic')),
            ),
          );
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [processingId, user?.id, t, router, defer]);

  const uploadFile = async (base64: string, fileName: string, contentType: string): Promise<string> => {
    if (!user?.id) throw new Error('Not signed in');
    return await brokerUploadBase64('libation_upload_file', base64, fileName, contentType, user.id);
  };

  const startParse = async (
    fileUrl: string,
    displayName: string,
    mediaType: string,
    sourceType: 'pdf' | 'image',
    pageCount: number,
    additionalImageUrls: string[] = [],
  ) => {
    if (!user?.id) return;
    const { data: newId, error: insertError } = await supabase.rpc('create_menu_upload', {
      p_actor_id: user.id,
      p_file_url: fileUrl,
      p_file_name: displayName,
      p_source_type: sourceType,
      p_page_count: pageCount,
      p_kind: 'libations',
      p_target_slot: slot,
    });
    if (insertError) throw insertError;
    setProcessingId(newId as string);
    const { error: fnError } = await supabase.functions.invoke('parse-libations', {
      body: {
        file_url: fileUrl,
        upload_id: newId,
        user_id: user.id,
        organization_id: organizationId,
        media_type: mediaType,
        source_type: sourceType,
        page_count: pageCount,
        additional_image_urls: additionalImageUrls,
      },
    });
    if (fnError) console.error('parse-libations invoke error:', fnError);
  };

  // Premium + credits pre-guard (the grant is the sheet's own locked state).
  const guardUpload = (minCost: number): boolean => {
    if ((quota?.credits_remaining ?? 0) < minCost) {
      defer(() =>
        Alert.alert(
          t('menu_upload.insufficient_title'),
          t('menu_upload.insufficient_msg', { cost: minCost, have: quota?.credits_remaining ?? 0 }),
        ),
      );
      return false;
    }
    return true;
  };

  const handleChooseFile = async () => {
    if (!guardUpload(PDF_COST)) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      const ext = (file.name || '').toLowerCase().split('.').pop();
      const isImg = ext === 'jpg' || ext === 'jpeg' || ext === 'png';
      const mediaType = file.mimeType || (ext === 'png' ? 'image/png' : isImg ? 'image/jpeg' : 'application/pdf');
      setUploading(true);
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      const fileUrl = await uploadFile(base64, file.name || 'recipes', mediaType);
      await startParse(fileUrl, file.name || t('libation_upload.file_fallback_name'), mediaType, isImg ? 'image' : 'pdf', 1);
    } catch (e: any) {
      console.error('Libation file upload error:', e);
      defer(() => Alert.alert(t('menu_upload.upload_failed'), translateServerError(e, t('libation_upload.failed_generic'))));
    } finally {
      setUploading(false);
    }
  };

  const handleChoosePhotos = async () => {
    if (!guardUpload(1)) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        defer(() => Alert.alert(t('menu_upload.permission_title'), t('menu_upload.permission_msg')));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9, orderedSelection: true });
      if (result.canceled || !result.assets?.length) return;
      const images = result.assets;
      if ((quota?.credits_remaining ?? 0) < images.length) {
        defer(() =>
          Alert.alert(
            t('menu_upload.insufficient_title'),
            t('menu_upload.insufficient_msg', { cost: images.length, have: quota?.credits_remaining ?? 0 }),
          ),
        );
        return;
      }
      setUploading(true);
      const urls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const ext = image.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
        const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const base64 = await FileSystem.readAsStringAsync(image.uri, { encoding: FileSystem.EncodingType.Base64 });
        urls.push(await uploadFile(base64, `recipe-page-${i + 1}.${ext}`, contentType));
      }
      const displayName = images.length > 1
        ? t('libation_upload.photos_name_n', { count: images.length })
        : t('libation_upload.photo_name');
      const primaryType = images[0].uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      await startParse(urls[0], displayName, primaryType, 'image', images.length, urls.slice(1));
    } catch (e: any) {
      console.error('Libation photos upload error:', e);
      defer(() => Alert.alert(t('menu_upload.upload_failed'), translateServerError(e, t('libation_upload.failed_generic'))));
    } finally {
      setUploading(false);
    }
  };

  const handleTakePhoto = async () => {
    if (!guardUpload(1)) return;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        defer(() => Alert.alert(t('menu_upload_sheet.camera_denied_title'), t('menu_upload_sheet.camera_denied_msg')));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (result.canceled || !result.assets?.[0]) return;
      const image = result.assets[0];
      const ext = image.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
      setUploading(true);
      const base64 = await FileSystem.readAsStringAsync(image.uri, { encoding: FileSystem.EncodingType.Base64 });
      const url = await uploadFile(base64, `recipe-page-1.${ext}`, contentType);
      await startParse(url, t('libation_upload.photo_name'), contentType, 'image', 1);
    } catch (e: any) {
      console.error('Libation camera upload error:', e);
      defer(() => Alert.alert(t('menu_upload.upload_failed'), translateServerError(e, t('libation_upload.failed_generic'))));
    } finally {
      setUploading(false);
    }
  };

  const busy = uploading || processingId !== null;

  // Bar-flavoured scan quips (the rotor is MenuScanQuips; same cadence).
  const quips = useMemo(
    () => [
      t('libation_upload.quip_shaking'),
      t('libation_upload.quip_muddling'),
      t('libation_upload.quip_handwriting'),
      t('libation_upload.quip_bitters'),
      t('libation_upload.quip_chilling'),
      t('libation_upload.quip_straining'),
      t('libation_upload.quip_peel'),
      t('libation_upload.quip_garnish'),
    ],
    [t],
  );

  const bookName = (s: 1 | 2) =>
    s === 2
      ? `${organization?.menu_2_name || 'Menu 2'} ${t('bartender_assistant.libation_recipes_suffix')}`
      : `${organization?.menu_1_name || 'Menu 1'} ${t('bartender_assistant.libation_recipes_suffix')}`;

  const sourceRow = (opts: { key: string; ios: string; android: string; label: string; sub: string; cost: string; locked?: boolean; onPress: () => void }) => (
    <Pressable
      key={opts.key}
      onPress={opts.locked || busy ? undefined : opts.onPress}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }, opts.locked && styles.rowLocked]}
    >
      <IconSymbol ios_icon_name={opts.ios} android_material_icon_name={opts.android} size={20} color={colors.textSecondary} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>{opts.label}</Text>
        <Text style={[styles.rowSub, { color: opts.locked ? colors.primary : colors.textSecondary }]}>
          {opts.locked ? t('libation_upload.ask_owner') : opts.sub}
        </Text>
      </View>
      {opts.locked ? (
        <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={16} color={colors.primary} />
      ) : (
        <Text style={[styles.rowCost, { color: colors.textSecondary }]}>{opts.cost}</Text>
      )}
    </Pressable>
  );

  const creditsStrip = quota ? (
    <View style={[styles.credits, { backgroundColor: colors.blue + '21', borderColor: colors.blue + '47' }]}>
      <Text style={[styles.creditsNum, { color: colors.blueText }]}>{quota.credits_remaining}</Text>
      <Text style={[styles.creditsText, { color: colors.textSecondary }]}>
        {t('libation_upload.credits_rest', { max: quota.monthly_allowance, pdf: PDF_COST })}
      </Text>
    </View>
  ) : null;

  const bookPicker = (
    <>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('libation_upload.add_to')}</Text>
      <View style={[styles.seg, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        {([1, 2] as const).filter((s) => s === 1 || twoMenus).map((s) => {
          const on = slot === s;
          const icon = s === 2 ? organization?.menu_2_icon || 'sun.max.fill' : organization?.menu_1_icon || 'snowflake';
          return (
            <Pressable
              key={s}
              style={[styles.segHalf, on && { backgroundColor: colors.primary }]}
              onPress={busy ? undefined : () => setSlot(s)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
            >
              <IconSymbol ios_icon_name={icon} android_material_icon_name={menuIconAndroid(icon)} size={14} color={on ? colors.fireText : colors.textSecondary} />
              <Text style={[styles.segLabel, { color: on ? colors.fireText : colors.textSecondary }]} numberOfLines={1}>{bookName(s)}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={t('libation_upload.title')}
      subtitle={t('libation_upload.subtitle')}
    >
      {!hasPremium ? (
        // Base tier — the PremiumGate grammar, inside the sheet.
        <View style={[styles.gate, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={[styles.lockChip, { backgroundColor: colors.tint + '1C', borderColor: colors.tint + '52' }]}>
            <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={26} color={colors.tint} />
          </View>
          <Text style={[styles.gateEyebrow, { color: colors.tint }]}>{t('common.premium_badge')}</Text>
          <Text style={[styles.gateTitle, { color: colors.text }]}>{t('libation_upload.gate_title')}</Text>
          <Text style={[styles.gateDesc, { color: colors.textSecondary }]}>{t('libation_upload.gate_desc')}</Text>
          <View style={styles.bullets}>
            {[t('libation_upload.gate_b1'), t('libation_upload.gate_b2'), t('libation_upload.gate_b3')].map((b, i) => (
              <View key={i} style={styles.bulletRow}>
                <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={15} color={colors.tint} />
                <Text style={[styles.bulletText, { color: colors.text }]}>{b}</Text>
              </View>
            ))}
          </View>
          <Pressable
            style={[styles.cta, { backgroundColor: colors.primary }]}
            onPress={() => defer(() => router.push('/subscription-management' as any))}
          >
            <Text style={[styles.ctaText, { color: colors.fireText }]}>{t('weekly_quizzes.premium_upgrade_btn')}</Text>
          </Pressable>
        </View>
      ) : !canUpload ? (
        // A manager without the grant: rows locked, not hidden.
        <>
          <View style={[styles.credits, styles.creditsDim, { backgroundColor: colors.blue + '21', borderColor: colors.blue + '47' }]}>
            <Text style={[styles.creditsNum, { color: colors.blueText }]}>—</Text>
            <Text style={[styles.creditsText, { color: colors.textSecondary }]}>{t('libation_upload.locked_credits')}</Text>
          </View>
          {sourceRow({ key: 'file', ios: 'doc.fill', android: 'description', label: t('libation_upload.choose_file'), sub: '', cost: '', locked: true, onPress: () => {} })}
          {sourceRow({ key: 'photos', ios: 'photo.on.rectangle', android: 'photo-library', label: t('libation_upload.choose_photos'), sub: '', cost: '', locked: true, onPress: () => {} })}
          {sourceRow({ key: 'camera', ios: 'camera.fill', android: 'camera-alt', label: t('libation_upload.take_photo'), sub: '', cost: '', locked: true, onPress: () => {} })}
          <Text style={[styles.foot, { color: colors.textSecondary }]}>{t('libation_upload.locked_note')}</Text>
        </>
      ) : busy ? (
        <>
          {creditsStrip}
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('libation_upload.adding_to')}</Text>
          <View style={[styles.seg, styles.segDim, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <View style={[styles.segHalf, { backgroundColor: colors.primary }]}>
              <Text style={[styles.segLabel, { color: colors.fireText }]} numberOfLines={1}>{bookName(slot)}</Text>
            </View>
          </View>
          <View style={[styles.processing, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <View style={styles.processingTop}>
              <ActivityIndicator size="small" color={colors.primary} />
              <ScanQuip style={[styles.processingQuip, { color: colors.text }]} quips={quips} />
            </View>
            <Text style={[styles.processingText, { color: colors.textSecondary }]}>{t('libation_upload.processing')}</Text>
          </View>
        </>
      ) : (
        <>
          {creditsStrip}
          {bookPicker}
          {sourceRow({ key: 'file', ios: 'doc.fill', android: 'description', label: t('libation_upload.choose_file'), sub: t('libation_upload.choose_file_sub'), cost: t('libation_upload.cost_n', { count: PDF_COST }), onPress: handleChooseFile })}
          {sourceRow({ key: 'photos', ios: 'photo.on.rectangle', android: 'photo-library', label: t('libation_upload.choose_photos'), sub: t('libation_upload.choose_photos_sub'), cost: t('libation_upload.cost_each'), onPress: handleChoosePhotos })}
          {sourceRow({ key: 'camera', ios: 'camera.fill', android: 'camera-alt', label: t('libation_upload.take_photo'), sub: t('libation_upload.take_photo_sub'), cost: t('libation_upload.cost_n', { count: 1 }), onPress: handleTakePhoto })}

          <View style={[styles.divider, { backgroundColor: colors.hairline }]} />

          {/* THE ONLY NAVIGATING ROW — the AI Menu Upload page's Recent tab lists both kinds. */}
          <Pressable
            onPress={() => defer(() => router.push({ pathname: '/menu-upload', params: { tab: 'history' } } as any))}
            style={[styles.row, styles.historyRow, { borderColor: colors.primary + '6B' }]}
          >
            <IconSymbol ios_icon_name="clock" android_material_icon_name="schedule" size={20} color={colors.primary} />
            <View style={styles.rowBody}>
              <Text style={[styles.rowLabel, { color: colors.primary }]} numberOfLines={1}>{t('libation_upload.history')}</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{t('libation_upload.history_sub')}</Text>
            </View>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={14} color={colors.primary} />
          </Pressable>
          <Text style={[styles.foot, { color: colors.textSecondary }]}>{t('libation_upload.pool_note')}</Text>
        </>
      )}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginBottom: 8,
  },
  rowLocked: { opacity: 0.6 },
  rowBody: { flex: 1, flexShrink: 1 },
  rowLabel: { fontFamily: fonts.display.semibold, fontSize: 15 },
  rowSub: { fontFamily: fonts.body.regular, fontSize: 11.5, marginTop: 2 },
  rowCost: { fontFamily: fonts.mono.medium, fontSize: 10 },
  // Dashed needs the full 1pt — sub-point dashed borders render almost solid.
  historyRow: { backgroundColor: 'transparent', borderStyle: 'dashed', borderWidth: 1, marginTop: 2 },
  credits: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginBottom: 12,
  },
  creditsDim: { opacity: 0.6 },
  creditsNum: { fontFamily: fonts.mono.semibold, fontSize: 15 },
  creditsText: { flex: 1, flexShrink: 1, fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16 },
  fieldLabel: { fontFamily: fonts.display.semibold, fontSize: 13, marginBottom: 8 },
  seg: {
    flexDirection: 'row',
    borderRadius: 13,
    padding: 3,
    gap: 3,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  segDim: { opacity: 0.6 },
  segHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    minWidth: 0,
  },
  segLabel: { fontFamily: fonts.body.semibold, fontSize: 12.5, flexShrink: 1 },
  divider: { height: 1, marginVertical: 3 },
  processing: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    gap: 8,
  },
  processingTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  processingQuip: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 12.5 },
  processingText: { flex: 1, flexShrink: 1, fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 17 },
  foot: { fontFamily: fonts.body.regular, fontSize: 10.5, lineHeight: 15, fontStyle: 'italic', marginTop: 6, paddingHorizontal: 2 },
  // The gate card — PremiumGate's grammar, sheet-sized.
  gate: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 22,
    alignItems: 'center',
  },
  lockChip: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  gateEyebrow: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 14 },
  gateTitle: { fontFamily: fonts.display.bold, fontSize: 20, letterSpacing: -0.3, textAlign: 'center', marginTop: 6 },
  gateDesc: { fontFamily: fonts.body.regular, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  bullets: { alignSelf: 'stretch', marginTop: 16, gap: 10 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  bulletText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 13, lineHeight: 19 },
  cta: { alignSelf: 'stretch', height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  ctaText: { fontFamily: fonts.display.bold, fontSize: 15 },
});
