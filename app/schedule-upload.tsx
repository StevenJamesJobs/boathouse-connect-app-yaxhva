import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useTranslation } from 'react-i18next';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { useScheduleQuota, scanCost } from '@/hooks/useScheduleQuota';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/app/integrations/supabase/client';
import { brokerUploadBase64, brokerDelete } from '@/utils/storageBroker';
import { translateServerError } from '@/utils/serverErrors';
import { takeStagedPick, type StagedPick, type StagedAsset } from '@/utils/schedule/uploadStaging';
import { localeFor, toISODate, addDays, formatWeekRange, formatStamp, type AppLocale } from '@/utils/schedule/format';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import PremiumGate from '@/components/PremiumGate';
import { IconSymbol } from '@/components/IconSymbol';
import { SectionRule } from '@/components/tools/ToolsBits';
import { FieldLabel, GlassTextInput, Hint } from '@/components/content/FormKit';
import ScanQuip from '@/components/MenuScanQuips';
import ScheduleGearChip from '@/components/schedule/ScheduleGearChip';
import ScheduleNavSheet from '@/components/schedule/ScheduleNavSheet';
import ScheduleSegTabs from '@/components/schedule/ScheduleSegTabs';
import { useScheduleQuips } from '@/components/schedule/scheduleQuips';
import { scheduleHue, TILE_BG_ALPHA, TILE_BORDER_ALPHA } from '@/components/schedule/scheduleVisuals';
import { SCHEDULE_UPLOAD_MAX_BYTES } from '@/components/schedule/ScheduleUploadSheet';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Upload Schedule (s83) — the two-tab page behind ⚙ → Upload Schedules & View
 * History. Upload tab: credits strip → "For best results" fold → three tinted
 * tiles → the STAGING card (title, optional week range, Scan) → processing card
 * → Ready-to-review cards. Recent tab: every finished upload, menu-upload grammar.
 *
 * A pick (from the tiles, or staged by ScheduleUploadSheet via `?staged=1`) costs
 * nothing until Scan — Scan is the ONLY place that uploads, creates the row and
 * invokes parse-schedule. Credits are charged server-side after a successful
 * parse; a failed scan never charges and a deleted upload never refunds.
 */

type SourceType = 'pdf' | 'image' | 'manual' | null;

interface UploadRow {
  id: string;
  file_name: string;
  file_url: string;
  week_start: string;
  week_end: string;
  status: string;
  parsed_shifts_count: number;
  unmatched_employees: string[];
  error_message: string | null;
  created_at: string;
  title: string | null;
  reviewed_at: string | null;
  source_type: SourceType;
  page_count: number;
  credits_charged: number;
  was_free: boolean;
}

// PostgREST numerics can arrive as strings; unmatched_employees is Json.
function normalizeUpload(r: any): UploadRow {
  return {
    id: String(r.id),
    file_name: r.file_name ?? '',
    file_url: r.file_url ?? '',
    week_start: r.week_start,
    week_end: r.week_end,
    status: r.status,
    parsed_shifts_count: Number(r.parsed_shifts_count) || 0,
    unmatched_employees: Array.isArray(r.unmatched_employees) ? r.unmatched_employees.map(String) : [],
    error_message: r.error_message ?? null,
    created_at: r.created_at,
    title: r.title ?? null,
    reviewed_at: r.reviewed_at ?? null,
    source_type: (r.source_type ?? null) as SourceType,
    page_count: Number(r.page_count) || 1,
    credits_charged: Number(r.credits_charged) || 0,
    was_free: !!r.was_free,
  };
}

function isManualRow(u: UploadRow): boolean {
  return u.source_type === 'manual' || u.file_name === 'Manual Entry';
}

function titleFromName(name: string): string {
  return name.replace(/\.(pdf|png|jpe?g)$/i, '');
}

function sizeLabel(assets: StagedAsset[]): string | null {
  const total = assets.reduce((sum, a) => sum + (a.size ?? 0), 0);
  if (!total) return null;
  const mb = total / (1024 * 1024);
  return `${mb < 0.1 ? '0.1' : mb.toFixed(1)} MB`;
}

/** A scan left running when the page was last closed is re-adopted within this window. */
const ADOPT_WINDOW_MS = 10 * 60 * 1000;
const SIMULATE_MS = 12000;

type Tab = 'upload' | 'recent';
type RangeField = 'start' | 'end';

// ─── Week-range date row (ShiftEditSheet's pickerRow grammar) ────────────────
function DateRow({ value, placeholder, locale, onPress }: { value: Date | null; placeholder: string; locale: AppLocale; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable onPress={onPress} style={[styles.pickRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={16} color={colors.primary} />
      <Text style={[styles.pickText, { color: value ? colors.text : colors.textSecondary }]} numberOfLines={1}>
        {value ? value.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }) : placeholder}
      </Text>
    </Pressable>
  );
}

// ─── iOS nested date spinner (Android uses DateTimePickerAndroid.open) ───────
function DatePickSheet({
  visible,
  title,
  value,
  onCancel,
  onDone,
}: {
  visible: boolean;
  title: string;
  value: Date;
  onCancel: () => void;
  onDone: (d: Date) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { language } = useLanguage();
  const locale = localeFor(language);
  const [draft, setDraft] = useState<Date>(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  return (
    <GlassSheet
      visible={visible}
      onClose={onCancel}
      title={title}
      scroll={false}
      footer={
        <View style={styles.sheetFooter}>
          <Pressable style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]} onPress={onCancel}>
            <Text style={[styles.footerLabel, { color: colors.text }]}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            style={[styles.footerBtn, styles.footerPrimary, { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => onDone(new Date(draft))}
          >
            <Text style={[styles.footerLabel, { color: colors.fireText }]}>{t('content_editor.done')}</Text>
          </Pressable>
        </View>
      }
    >
      <View style={[styles.spinnerWrap, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
        {visible && (
          <DateTimePicker
            value={draft}
            mode="date"
            display="spinner"
            themeVariant={isDark ? 'dark' : 'light'}
            locale={locale}
            onValueChange={(_e, picked) => setDraft(picked)}
            style={styles.spinner}
          />
        )}
      </View>
    </GlassSheet>
  );
}

// ─── Ready-to-review card (completed, not yet reviewed) ──────────────────────
function ReadyCard({
  upload,
  expanded,
  onToggleUnmatched,
  onReview,
}: {
  upload: UploadRow;
  expanded: boolean;
  onToggleUnmatched: () => void;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { language } = useLanguage();
  const locale = localeFor(language);
  const ok = scheduleHue('ok', isDark);
  const gold = scheduleHue('pending', isDark);
  const unmatched = upload.unmatched_employees.length;
  // manual rows have no source; legacy (pre-s83) rows carry no source_type, so the
  // file name decides (the July PDFs read "Image" on the sim smoke)
  const manualRow = isManualRow(upload);
  const source = manualRow
    ? null
    : upload.source_type === 'pdf' || /\.pdf$/i.test(upload.file_name)
      ? t('schedule_upload.source_pdf')
      : upload.file_name === t('schedule_upload.photo_name')
        ? t('schedule_upload.source_photo')
        : t('schedule_upload.source_image');

  return (
    <GlassCard variant="surface" radius={16} style={styles.readyCard}>
      <View style={styles.readyHead}>
        <View style={styles.flex1}>
          <Text style={[styles.readyTitle, { color: colors.text }]} numberOfLines={2}>
            {upload.title || upload.file_name}
          </Text>
          <Text style={[styles.readyMeta, { color: colors.textSecondary }]} numberOfLines={2}>
            {formatWeekRange(upload.week_start, upload.week_end, locale)}
            {' · '}
            {manualRow
              ? t('schedule_upload.added_stamp', { stamp: formatStamp(upload.created_at, locale) })
              : t('schedule_upload.scanned_stamp', { stamp: formatStamp(upload.created_at, locale) })}
            {source ? ` · ${source}` : ''}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: hexToRgba(ok, 0.16), borderColor: hexToRgba(ok, 0.4) }]}>
          <Text style={[styles.pillText, { color: ok }]}>{t('schedule_upload.status_completed')}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.stat, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text style={[styles.statNum, { color: colors.text }]}>{upload.parsed_shifts_count}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('schedule_upload.stat_shifts')}</Text>
        </View>
        <Pressable
          onPress={onToggleUnmatched}
          disabled={unmatched === 0}
          style={[
            styles.stat,
            { backgroundColor: colors.glass, borderColor: colors.glassBorder },
            unmatched > 0 && { backgroundColor: hexToRgba(gold, 0.12), borderColor: hexToRgba(gold, 0.36) },
          ]}
        >
          <View style={styles.statNumRow}>
            <Text style={[styles.statNum, { color: unmatched > 0 ? gold : colors.text }]}>{unmatched}</Text>
            {unmatched > 0 && (
              <IconSymbol
                ios_icon_name={expanded ? 'chevron.up' : 'chevron.down'}
                android_material_icon_name={expanded ? 'expand-less' : 'expand-more'}
                size={12}
                color={gold}
              />
            )}
          </View>
          <Text style={[styles.statLabel, { color: unmatched > 0 ? gold : colors.textSecondary }]}>{t('schedule_upload.stat_unmatched')}</Text>
        </Pressable>
        <View style={[styles.stat, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text style={[styles.statNum, { color: colors.text }]}>
            {upload.was_free ? t('schedule_upload.free_label') : upload.credits_charged}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('schedule_upload.stat_credits')}</Text>
        </View>
      </View>

      {expanded && unmatched > 0 && (
        <View style={styles.chipWrap}>
          {upload.unmatched_employees.map((name, i) => (
            <View key={`${name}-${i}`} style={[styles.nameChip, { backgroundColor: hexToRgba(gold, 0.12), borderColor: hexToRgba(gold, 0.36) }]}>
              <Text style={[styles.nameChipText, { color: colors.text }]} numberOfLines={1}>
                {name}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Pressable onPress={onReview} style={[styles.reviewBar, { backgroundColor: colors.primary }]}>
        <Text style={[styles.reviewBarText, { color: colors.fireText }]}>{t('schedule_upload.review_edit')}</Text>
        <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={15} color={colors.fireText} />
      </Pressable>
    </GlassCard>
  );
}

// ─── Recent uploads row (menu-upload's history card grammar) ─────────────────
function RecentRow({ upload, onDelete, onReview }: { upload: UploadRow; onDelete: () => void; onReview: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { language } = useLanguage();
  const locale = localeFor(language);
  const manual = isManualRow(upload);
  const completed = upload.status === 'completed';
  const failed = upload.status === 'failed';
  const replaced = upload.status === 'replaced';
  const unmatched = upload.unmatched_employees.length;

  const isPdf = upload.source_type === 'pdf' || /\.pdf$/i.test(upload.file_name); // legacy rows carry no source_type
  const iosIcon = manual ? 'calendar' : isPdf ? 'doc.fill' : upload.file_name === t('schedule_upload.photo_name') ? 'camera.fill' : 'photo.on.rectangle';
  const androidIcon = manual ? 'event' : isPdf ? 'description' : upload.file_name === t('schedule_upload.photo_name') ? 'camera-alt' : 'photo-library';

  const segments: { text: string; color?: string }[] = [{ text: formatWeekRange(upload.week_start, upload.week_end, locale) }];
  if (!manual) {
    if (completed) segments.push({ text: t('schedule_upload.status_completed'), color: scheduleHue('ok', isDark) });
    else if (failed) segments.push({ text: t('schedule_upload.status_failed'), color: scheduleHue('bad', isDark) });
    else if (replaced) segments.push({ text: t('schedule_upload.status_replaced') });
    else segments.push({ text: upload.status });
  }
  if (!failed) segments.push({ text: `${upload.parsed_shifts_count} ${t('schedule_upload.shifts')}` });
  if (unmatched > 0) segments.push({ text: `${unmatched} ${t('schedule_upload.unmatched')}`, color: scheduleHue('pending', isDark) });
  if (manual) segments.push({ text: t('schedule_upload.added_by_hand') });
  else if (failed) {
    if (upload.error_message) segments.push({ text: translateServerError({ message: upload.error_message }, t('schedule_upload.error_generic')) });
    segments.push({ text: t('schedule_upload.not_charged') });
  } else if (upload.was_free) segments.push({ text: t('schedule_upload.free_label') });
  else if (upload.credits_charged > 0) segments.push({ text: t('schedule_upload.credits_n', { n: upload.credits_charged }) });

  return (
    <GlassCard variant="surface" radius={13} style={[styles.recentRow, replaced && styles.recentRowDim]}>
      <View style={[styles.recentIcon, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={17} color={colors.textSecondary} />
      </View>
      {/* the body opens the review too — the chevron alone was a 16pt target (sim smoke, s83) */}
      <Pressable style={styles.flex1} onPress={completed ? onReview : undefined} disabled={!completed}>
        <Text style={[styles.recentTitle, { color: colors.text }]} numberOfLines={1}>
          {manual ? t('schedule_upload.manual_entry') : upload.title || upload.file_name}
        </Text>
        <Text style={[styles.recentMeta, { color: colors.textSecondary }]} numberOfLines={2}>
          {segments.map((s, i) => (
            <Text key={i} style={s.color ? { color: s.color } : undefined}>
              {i > 0 ? ' · ' : ''}
              {s.text}
            </Text>
          ))}
        </Text>
      </Pressable>
      {!manual && (
        <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel={t('common.delete')} style={styles.recentAction}>
          <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={16} color={colors.textSecondary} />
        </Pressable>
      )}
      {completed && (
        <Pressable onPress={onReview} hitSlop={8} accessibilityLabel={t('schedule_upload.review_edit')} style={styles.recentAction}>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.primary} />
        </Pressable>
      )}
    </GlassCard>
  );
}

// ─── The page ────────────────────────────────────────────────────────────────
export default function ScheduleUploadScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; staged?: string }>();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { hasPremium } = useSubscription();
  const { perms } = useManagerPermissions();
  const { quota, refresh: refreshQuota } = useScheduleQuota();
  const { language } = useLanguage();
  const locale = localeFor(language);
  const { t } = useTranslation();
  const quips = useScheduleQuips();

  const [navOpen, setNavOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('upload');
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [quotaChecked, setQuotaChecked] = useState(false);
  const [foldOpen, setFoldOpen] = useState(false);
  const [picking, setPicking] = useState(false);

  // the staged pick + its form
  const [staged, setStaged] = useState<StagedPick | null>(null);
  const [title, setTitle] = useState('');
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [weekEnd, setWeekEnd] = useState<Date | null>(null);
  const [iosPick, setIosPick] = useState<RangeField | null>(null);

  // the scan in flight
  const [scanning, setScanning] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingTitle, setProcessingTitle] = useState('');
  // Base tier: the free scan flips freeAvailable off the moment it completes;
  // the premium wall waits until the next visit so its Ready-to-review card
  // (and the Review tap) stay reachable.
  const [scannedThisVisit, setScannedThisVisit] = useState(false);
  // Dev-only rehearsal of the scanning state (the menu-upload precedent): the
  // quip rotor without a real parse. Stripped from release builds by __DEV__.
  const [simulating, setSimulating] = useState(false);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const isManagerLocked = user?.role === 'manager' && !perms.aiScheduleUpload;
  const canScan = hasPremium || !!quota?.freeAvailable;
  const busy = !!processingId || simulating || scanning;
  const tilesDim = busy || !!staged || picking;

  const recent = useMemo(() => uploads.filter((u) => u.status !== 'processing'), [uploads]);
  // "ready" = a real scan nobody has reviewed yet. Manual Entry rows and legacy
  // (pre-s83, source_type null) uploads never had a review step — they live in Recent.
  const ready = useMemo(
    () => uploads.filter((u) => u.status === 'completed' && !u.reviewed_at && !isManualRow(u) && !!u.source_type),
    [uploads],
  );

  const loadUploads = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_org_uploads', { p_actor_id: user.id, p_limit: 30 });
      if (error) throw error;
      const rows = (data || []).map(normalizeUpload);
      setUploads(rows);
      // Re-adopt a scan that was still running when the page was last closed
      // (the poll resumes; a row stuck for longer than the window is left alone).
      setProcessingId((current) => {
        if (current) return current;
        const live = rows.find((r) => r.status === 'processing' && Date.now() - new Date(r.created_at).getTime() < ADOPT_WINDOW_MS);
        return live ? live.id : current;
      });
    } catch (e) {
      console.error('Error loading schedule uploads:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const stagePick = useCallback((pick: StagedPick) => {
    setStaged(pick);
    setTitle(titleFromName(pick.displayName));
    setWeekStart(null);
    setWeekEnd(null);
    setTab('upload');
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUploads();
      refreshQuota().finally(() => setQuotaChecked(true));
      if (params.staged === '1') {
        const pick = takeStagedPick();
        if (pick) stagePick(pick);
      }
    }, [loadUploads, refreshQuota, params.staged, stagePick])
  );

  useEffect(() => {
    if (params.tab === 'recent') setTab('recent');
  }, [params.tab]);

  // A re-adopted scan names its processing card from the row (a fresh scan sets
  // the title itself before processingId).
  useEffect(() => {
    if (!processingId || processingTitle) return;
    const row = uploads.find((u) => u.id === processingId);
    if (row) setProcessingTitle(row.title || row.file_name);
  }, [processingId, processingTitle, uploads]);

  useEffect(() => {
    if (!simulating) return;
    const timer = setTimeout(() => setSimulating(false), SIMULATE_MS);
    return () => clearTimeout(timer);
  }, [simulating]);

  // Poll the scan every 3 s. An rpc error or 5 consecutive empty reads stops
  // the poll instead of spinning forever (the MenuUploadSheet branch).
  useEffect(() => {
    if (!processingId) return;
    let emptyTicks = 0;
    const interval = setInterval(async () => {
      if (!user?.id) return;
      const { data: pollRows, error: pollError } = await supabase.rpc('get_org_uploads', {
        p_actor_id: user.id,
        p_upload_id: processingId,
      });
      const row: any = Array.isArray(pollRows) ? pollRows[0] : null;
      if (pollError || (!row && ++emptyTicks >= 5)) {
        clearInterval(interval);
        setProcessingId(null);
        Alert.alert(t('schedule_upload.error_title'), t('schedule_upload.poll_failed'));
        return;
      }
      if (row) emptyTicks = 0;
      if (row && row.status !== 'processing') {
        clearInterval(interval);
        setProcessingId(null);
        loadUploads();
        refreshQuota();
        if (row.status === 'failed') {
          Alert.alert(
            t('schedule_upload.error_title'),
            translateServerError({ message: row.error_message }, t('schedule_upload.error_generic'))
          );
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [processingId, user?.id, t, loadUploads, refreshQuota]);

  // ─── Pickers (the ScheduleUploadSheet handlers, staging locally) ───────────
  const premiumGuard = (): boolean => {
    if (canScan) return true;
    Alert.alert(t('schedule_upload.premium_title'), t('schedule_upload.premium_msg'), [
      { text: t('common.not_now', 'Not Now'), style: 'cancel' },
      { text: t('common.upgrade', 'Upgrade'), onPress: () => router.push('/subscription-management' as any) },
    ]);
    return false;
  };

  const tooBig = (bytes: number | null | undefined) => !!bytes && bytes > SCHEDULE_UPLOAD_MAX_BYTES;

  const handleChooseFile = async () => {
    if (!premiumGuard()) return;
    try {
      setPicking(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      if (tooBig(file.size)) {
        Alert.alert(t('schedule_upload.too_big_title'), t('schedule_upload.too_big_msg'));
        return;
      }
      const ext = (file.name || '').toLowerCase().split('.').pop();
      const isImg = ext === 'jpg' || ext === 'jpeg' || ext === 'png';
      const mediaType = file.mimeType || (ext === 'png' ? 'image/png' : isImg ? 'image/jpeg' : 'application/pdf');
      const asset: StagedAsset = { uri: file.uri, name: file.name || 'schedule', mimeType: mediaType, size: file.size ?? null };
      stagePick({
        kind: 'file',
        assets: [asset],
        displayName: file.name || t('schedule_upload.default_file_name'),
        sourceType: isImg ? 'image' : 'pdf',
        pageCount: 1,
        mediaType,
      });
    } catch (e) {
      console.error('schedule file pick error:', e);
      Alert.alert(t('schedule_upload.upload_failed'), t('schedule_upload.failed_generic'));
    } finally {
      setPicking(false);
    }
  };

  const handleChooseLibrary = async () => {
    if (!premiumGuard()) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('schedule_upload.permission_title'), t('schedule_upload.permission_msg'));
        return;
      }
      setPicking(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.9,
        orderedSelection: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const images = result.assets;
      if (images.some((img) => tooBig(img.fileSize))) {
        Alert.alert(t('schedule_upload.too_big_title'), t('schedule_upload.too_big_msg'));
        return;
      }
      const assets: StagedAsset[] = images.map((img, i) => {
        const png = img.uri.toLowerCase().endsWith('.png');
        return { uri: img.uri, name: `schedule-page-${i + 1}.${png ? 'png' : 'jpg'}`, mimeType: png ? 'image/png' : 'image/jpeg', size: img.fileSize ?? null };
      });
      stagePick({
        kind: 'images',
        assets,
        displayName: images.length > 1 ? t('schedule_upload.images_name', { n: images.length }) : t('schedule_upload.image_name'),
        sourceType: 'image',
        pageCount: images.length,
        mediaType: assets[0].mimeType,
      });
    } catch (e) {
      console.error('schedule photo pick error:', e);
      Alert.alert(t('schedule_upload.upload_failed'), t('schedule_upload.failed_generic'));
    } finally {
      setPicking(false);
    }
  };

  const handleTakePhoto = async () => {
    if (!premiumGuard()) return;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('schedule_upload.camera_denied_title'), t('schedule_upload.camera_denied_msg'));
        return;
      }
      setPicking(true);
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (result.canceled || !result.assets?.[0]) return;
      const img = result.assets[0];
      const png = img.uri.toLowerCase().endsWith('.png');
      const asset: StagedAsset = { uri: img.uri, name: `schedule-photo.${png ? 'png' : 'jpg'}`, mimeType: png ? 'image/png' : 'image/jpeg', size: img.fileSize ?? null };
      stagePick({ kind: 'camera', assets: [asset], displayName: t('schedule_upload.photo_name'), sourceType: 'image', pageCount: 1, mediaType: asset.mimeType });
    } catch (e) {
      console.error('schedule camera error:', e);
      Alert.alert(t('schedule_upload.upload_failed'), t('schedule_upload.failed_generic'));
    } finally {
      setPicking(false);
    }
  };

  // ─── Staging card: week range + discard ────────────────────────────────────
  const commitRange = (field: RangeField, picked: Date) => {
    const day = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate());
    if (field === 'start') {
      setWeekStart(day);
      if (!weekEnd || weekEnd < day) setWeekEnd(addDays(day, 6));
    } else {
      setWeekEnd(day);
      if (!weekStart || weekStart > day) setWeekStart(addDays(day, -6));
    }
  };

  const openRange = (field: RangeField) => {
    const current = (field === 'start' ? weekStart : weekEnd) ?? (field === 'end' && weekStart ? addDays(weekStart, 6) : new Date());
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onValueChange: (_e, picked) => commitRange(field, picked),
      });
      return;
    }
    setIosPick(field);
  };

  const clearRange = () => {
    setWeekStart(null);
    setWeekEnd(null);
  };

  const discard = () => {
    setStaged(null);
    setTitle('');
    clearRange();
  };

  // ─── Scan: the ONLY place that uploads ─────────────────────────────────────
  const handleScan = async () => {
    if (!staged || !user?.id) return;
    if (!premiumGuard()) return;
    const cost = scanCost(staged.sourceType, staged.pageCount, quota);
    if (cost > 0 && (quota?.remaining ?? 0) < cost) {
      Alert.alert(
        t('schedule_upload.insufficient_title'),
        t('schedule_upload.insufficient_msg', { cost, have: quota?.remaining ?? 0 })
      );
      return;
    }
    const pick = staged;
    const displayName = pick.displayName;
    const titleText = title.trim() || null;
    const range = weekStart && weekEnd ? { start: toISODate(weekStart), end: toISODate(weekEnd) } : null;
    setScanning(true);
    try {
      const urls: string[] = [];
      for (const asset of pick.assets) {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        urls.push(await brokerUploadBase64('schedule_upload_file', base64, asset.name, asset.mimeType, user.id));
      }
      // Week bounds: the manager's range when set; otherwise this week's
      // Sunday–Saturday placeholders, which parse-schedule corrects.
      const today = new Date();
      const sunday = addDays(today, -today.getDay());
      const { data: newId, error: insertError } = await supabase.rpc('create_schedule_upload', {
        p_actor_id: user.id,
        p_file_url: urls[0],
        p_file_name: displayName,
        p_week_start: range?.start ?? toISODate(sunday),
        p_week_end: range?.end ?? toISODate(addDays(sunday, 6)),
        p_status: 'processing',
        p_title: titleText,
        p_source_type: pick.sourceType,
        p_page_count: pick.pageCount,
      });
      if (insertError) throw insertError;
      const uploadId = newId as string;

      discard();
      setProcessingTitle(titleText ?? displayName);
      setProcessingId(uploadId);
      setScannedThisVisit(true);

      const { error: fnError } = await supabase.functions.invoke('parse-schedule', {
        body: {
          file_url: urls[0],
          upload_id: uploadId,
          user_id: user.id,
          organization_id: organizationId,
          media_type: pick.mediaType,
          additional_image_urls: urls.slice(1),
          source_type: pick.sourceType,
          page_count: pick.pageCount,
          week_start_hint: range?.start ?? null,
          week_end_hint: range?.end ?? null,
        },
      });
      if (fnError) console.error('parse-schedule invoke error:', fnError);
      loadUploads();
    } catch (e: any) {
      console.error('schedule scan error:', e);
      Alert.alert(t('schedule_upload.upload_failed'), translateServerError(e, t('schedule_upload.failed_generic')));
    } finally {
      setScanning(false);
    }
  };

  // ─── Recent: delete (cascades the shifts; credits are never refunded) ──────
  const confirmDelete = (u: UploadRow) => {
    Alert.alert(t('schedule_upload.delete_title'), t('schedule_upload.delete_message_cascade'), [
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
      {
        text: t('common.delete', 'Delete'),
        style: 'destructive',
        onPress: async () => {
          if (!user?.id) return;
          try {
            const { error } = await supabase.rpc('delete_schedule_upload', { p_actor_id: user.id, p_upload_id: u.id });
            if (error) throw error;
            if (u.file_url) await brokerDelete('schedules', [u.file_url], user.id);
            setUploads((prev) => prev.filter((x) => x.id !== u.id));
          } catch (e: any) {
            console.error('Error deleting schedule upload:', e);
            Alert.alert(t('schedule_upload.delete_failed'), translateServerError(e, t('schedule_upload.failed_generic')));
          }
        },
      },
    ]);
  };

  const goReview = (uploadId: string) => router.push({ pathname: '/schedule-review', params: { upload_id: uploadId } });

  const toggleFold = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFoldOpen((v) => !v);
  };

  const toggleUnmatched = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Derived copy ──────────────────────────────────────────────────────────
  const lead = quota ? String(quota.remaining) : '';
  const creditsLine = quota
    ? t('schedule_upload.credits_left', { n: quota.remaining, max: quota.max }) + ' · ' + t('schedule_upload.credits_costs', { pdf: quota.pdfCost })
    : '';
  const creditsRest = creditsLine.startsWith(lead) ? creditsLine.slice(lead.length).trimStart() : creditsLine;

  const stagedCost = staged ? scanCost(staged.sourceType, staged.pageCount, quota) : 0;
  const stagedSize = staged ? sizeLabel(staged.assets) : null;
  const stagedMeta = staged
    ? [t('schedule_upload.ready_to_scan'), stagedSize, stagedCost > 0 ? t('schedule_upload.costs_credits', { n: stagedCost }) : t('schedule_upload.free_scan')]
        .filter(Boolean)
        .join(' · ')
    : '';

  const bestLines = [
    t('schedule_upload.best_1'),
    t('schedule_upload.best_2'),
    t('schedule_upload.best_3'),
    t('schedule_upload.best_4'),
    t('schedule_upload.best_5'),
  ];

  const tileFill = hexToRgba(colors.primary, isDark ? TILE_BG_ALPHA.dark : TILE_BG_ALPHA.light);
  const tileBorder = hexToRgba(colors.primary, isDark ? TILE_BORDER_ALPHA.dark : TILE_BORDER_ALPHA.light);
  const bad = scheduleHue('bad', isDark);

  const gear = <ScheduleGearChip onPress={() => setNavOpen(true)} />;
  const navSheet = <ScheduleNavSheet visible={navOpen} onClose={() => setNavOpen(false)} current="upload" />;

  // ─── Gates ─────────────────────────────────────────────────────────────────
  // The first scan is free even on the base tier (mirroring menus), so the
  // premium wall waits for the quota read before deciding.
  if (!hasPremium && !quotaChecked) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('schedule_upload.title')} rightWide right={gear} />
        <ActivityIndicator color={colors.primary} style={styles.centerSpinner} />
        {navSheet}
      </View>
    );
  }

  if (!hasPremium && !quota?.freeAvailable && !processingId && !scannedThisVisit) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('schedule_upload.title')} rightWide right={gear} />
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
        {navSheet}
      </View>
    );
  }

  const tile = (key: string, iosIcon: string, androidIcon: string, label: string, sub: string, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      disabled={tilesDim}
      style={[styles.tile, { backgroundColor: tileFill, borderColor: tileBorder }, tilesDim && styles.tileDim]}
    >
      <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={22} color={colors.primary} />
      <Text style={[styles.tileTitle, { color: colors.text }]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.tileSub, { color: colors.textSecondary }]} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={t('schedule_upload.title')} rightWide right={gear} />

      <View style={styles.segWrap}>
        <ScheduleSegTabs<Tab>
          tabs={[
            { key: 'upload', label: t('schedule_upload.tab_upload') },
            { key: 'recent', label: t('schedule_upload.tab_recent'), count: recent.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tab === 'upload' ? (
          <>
            {/* Credits strip (the sheet's) */}
            {!!quota && (
              <View style={[styles.credits, { backgroundColor: colors.blue + '21', borderColor: colors.blue + '47' }]}>
                <Text style={[styles.creditsNum, { color: colors.blueText }]}>{lead}</Text>
                <Text style={[styles.creditsText, { color: colors.textSecondary }]}>
                  {creditsRest}
                  {quota.freeAvailable ? ' · ' + t('schedule_upload.first_free') : ''}
                </Text>
              </View>
            )}

            {isManagerLocked ? (
              <GlassCard variant="glass" radius={16} style={styles.lockCard}>
                <View style={[styles.lockIcon, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                  <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={17} color={colors.primary} />
                </View>
                <View style={styles.flex1}>
                  <Text style={[styles.lockTitle, { color: colors.text }]}>{t('schedule_upload.locked_title')}</Text>
                  <Text style={[styles.lockSub, { color: colors.textSecondary }]}>{t('schedule_nav.ask_owner')}</Text>
                </View>
              </GlassCard>
            ) : (
              <>
                {/* "For best results" fold — collapsed by default */}
                <GlassCard variant="glass" radius={16} style={styles.foldCard}>
                  <Pressable onPress={toggleFold} style={styles.foldHead} accessibilityRole="button">
                    <IconSymbol ios_icon_name="info.circle.fill" android_material_icon_name="info" size={18} color={colors.primary} />
                    <Text style={[styles.foldTitle, { color: colors.text }]}>{t('schedule_upload.best_title')}</Text>
                    <IconSymbol
                      ios_icon_name={foldOpen ? 'chevron.down' : 'chevron.right'}
                      android_material_icon_name={foldOpen ? 'expand-more' : 'chevron-right'}
                      size={14}
                      color={colors.textSecondary}
                    />
                  </Pressable>
                  {foldOpen && (
                    <View style={styles.foldBody}>
                      <Text style={[styles.foldIntro, { color: colors.textSecondary }]}>{t('schedule_upload.best_intro')}</Text>
                      {bestLines.map((line, i) => (
                        <View key={i} style={styles.bullet}>
                          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                          <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{line}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </GlassCard>

                {/* The three tinted tiles */}
                <View style={styles.grid}>
                  {tile('file', 'doc.fill', 'description', t('schedule_upload.upload_file'), t('schedule_upload.tile_file_sub', { pdf: quota?.pdfCost ?? 3 }), handleChooseFile)}
                  {tile('image', 'photo.on.rectangle', 'photo-library', t('schedule_upload.tile_image'), t('schedule_upload.tile_image_sub'), handleChooseLibrary)}
                  {tile('camera', 'camera.fill', 'camera-alt', t('schedule_upload.tile_camera'), t('schedule_upload.tile_camera_sub'), handleTakePhoto)}
                </View>

                {__DEV__ && (
                  <Pressable style={[styles.devBtn, { borderColor: colors.primary + '8C' }]} onPress={() => setSimulating((s) => !s)}>
                    <Text style={[styles.devBtnText, { color: colors.primary }]}>{simulating ? 'DEV · STOP SIMULATED SCAN' : 'DEV · SIMULATE SCAN'}</Text>
                  </Pressable>
                )}

                {/* Staging card */}
                {!!staged && (
                  <GlassCard variant="surface" radius={16} style={styles.stageCard}>
                    <View style={styles.stageHead}>
                      <View style={[styles.thumb, { backgroundColor: colors.thumbPlaceholder }]}>
                        <IconSymbol
                          ios_icon_name={staged.sourceType === 'pdf' ? 'doc.fill' : staged.kind === 'camera' ? 'camera.fill' : 'photo.on.rectangle'}
                          android_material_icon_name={staged.sourceType === 'pdf' ? 'description' : staged.kind === 'camera' ? 'camera-alt' : 'photo-library'}
                          size={24}
                          color={colors.textSecondary}
                        />
                        {staged.pageCount > 1 && (
                          <View style={[styles.pgBadge, { backgroundColor: colors.primary }]}>
                            <Text style={[styles.pgText, { color: colors.fireText }]}>{t('schedule_upload.pages_badge', { n: staged.pageCount })}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.flex1}>
                        <Text style={[styles.stageName, { color: colors.text }]} numberOfLines={1}>
                          {staged.displayName}
                        </Text>
                        <Text style={[styles.stageMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                          {stagedMeta}
                        </Text>
                      </View>
                      <Pressable
                        onPress={discard}
                        disabled={scanning}
                        accessibilityLabel={t('schedule_upload.discard')}
                        style={[styles.trashBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                      >
                        <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={15} color={colors.textSecondary} />
                      </Pressable>
                    </View>

                    <View style={styles.field}>
                      <FieldLabel label={t('schedule_upload.title_label')} trailing={t('schedule_upload.optional')} />
                      <GlassTextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder={staged.displayName}
                        maxLength={80}
                        returnKeyType="done"
                        editable={!scanning}
                      />
                    </View>

                    <View style={styles.field}>
                      <FieldLabel label={t('schedule_upload.week_range')} trailing={t('schedule_upload.optional')} />
                      <View style={styles.two}>
                        <View style={styles.twoItem}>
                          <DateRow value={weekStart} placeholder={t('schedule_upload.week_start')} locale={locale} onPress={() => openRange('start')} />
                        </View>
                        <View style={styles.twoItem}>
                          <DateRow value={weekEnd} placeholder={t('schedule_upload.week_end')} locale={locale} onPress={() => openRange('end')} />
                        </View>
                        {(!!weekStart || !!weekEnd) && (
                          <Pressable
                            onPress={clearRange}
                            hitSlop={6}
                            accessibilityLabel={t('schedule_upload.clear_range')}
                            style={[styles.clearBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                          >
                            <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={13} color={colors.textSecondary} />
                          </Pressable>
                        )}
                      </View>
                      <Hint>{t('schedule_upload.week_hint')}</Hint>
                    </View>

                    <View style={styles.stageFoot}>
                      <Pressable
                        style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                        onPress={discard}
                        disabled={scanning}
                      >
                        <Text style={[styles.footerLabel, { color: colors.text }]}>{t('schedule_upload.discard')}</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.footerBtn, styles.footerPrimary, { backgroundColor: colors.primary, borderColor: colors.primary }, scanning && styles.dim]}
                        onPress={handleScan}
                        disabled={scanning}
                      >
                        {scanning ? (
                          <ActivityIndicator size="small" color={colors.fireText} />
                        ) : (
                          <View style={styles.footerInner}>
                            <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={15} color={colors.fireText} />
                            <Text style={[styles.footerLabel, { color: colors.fireText }]}>
                              {stagedCost > 0 ? t('schedule_upload.scan_cost', { n: stagedCost }) : t('schedule_upload.scan_free')}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    </View>
                  </GlassCard>
                )}
              </>
            )}

            {/* Processing card */}
            {(!!processingId || simulating) && (
              <GlassCard variant="glass" radius={16} style={styles.procCard}>
                <View style={styles.procRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <View style={styles.flex1}>
                    <ScanQuip quips={quips} style={[styles.quip, { color: colors.text }]} />
                    <Text style={[styles.procSub, { color: colors.textSecondary }]} numberOfLines={2}>
                      {t('schedule_upload.processing_sub', { title: processingTitle || t('schedule_upload.default_file_name') })}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            )}

            {/* Ready to review */}
            {ready.length > 0 && (
              <>
                <SectionRule label={t('schedule_upload.ready_rule')} />
                {ready.map((u) => (
                  <ReadyCard
                    key={u.id}
                    upload={u}
                    expanded={expandedIds.has(u.id)}
                    onToggleUnmatched={() => toggleUnmatched(u.id)}
                    onReview={() => goReview(u.id)}
                  />
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {loading && uploads.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={styles.listSpinner} />
            ) : recent.length === 0 ? (
              <GlassCard variant="surface" radius={16} style={styles.emptyCard}>
                <IconSymbol ios_icon_name="calendar.badge.plus" android_material_icon_name="event-note" size={34} color={colors.textSecondary} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('schedule_upload.no_uploads')}</Text>
                <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('schedule_upload.no_uploads_desc')}</Text>
              </GlassCard>
            ) : (
              recent.map((u) => <RecentRow key={u.id} upload={u} onDelete={() => confirmDelete(u)} onReview={() => goReview(u.id)} />)
            )}

            <View style={[styles.note, { backgroundColor: hexToRgba(bad, 0.1), borderColor: hexToRgba(bad, 0.32) }]}>
              <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={15} color={bad} />
              <Text style={[styles.noteText, { color: colors.textSecondary }]}>{t('schedule_upload.delete_note')}</Text>
            </View>
          </>
        )}
      </ScrollView>

      {navSheet}

      {Platform.OS === 'ios' && (
        <DatePickSheet
          visible={!!iosPick}
          title={iosPick === 'end' ? t('schedule_upload.week_end') : t('schedule_upload.week_start')}
          value={(iosPick === 'end' ? weekEnd : weekStart) ?? (iosPick === 'end' && weekStart ? addDays(weekStart, 6) : new Date())}
          onCancel={() => setIosPick(null)}
          onDone={(d) => {
            if (iosPick) commitRange(iosPick, d);
            setIosPick(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1, minWidth: 0 },
  dim: { opacity: 0.6 },
  centerSpinner: { marginTop: 48 },
  listSpinner: { marginTop: 24 },
  segWrap: { marginHorizontal: 16, marginBottom: 8 },
  scrollContent: { padding: 16, paddingTop: 4, paddingBottom: 48 },

  // credits strip
  credits: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginBottom: 10,
  },
  creditsNum: { fontFamily: fonts.mono.semibold, fontSize: 15 },
  creditsText: { flex: 1, flexShrink: 1, fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16 },

  // locked manager notice
  lockCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 12 },
  lockIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  lockTitle: { fontFamily: fonts.display.semibold, fontSize: 14 },
  lockSub: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 16.5, marginTop: 2 },

  // "For best results" fold
  foldCard: { marginBottom: 10 },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  foldTitle: { flex: 1, fontFamily: fonts.display.semibold, fontSize: 14 },
  foldBody: { paddingHorizontal: 14, paddingBottom: 13, gap: 7 },
  foldIntro: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 16.5, marginBottom: 2 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingRight: 4 },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 6 },
  bulletText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 16.5 },

  // tiles
  grid: { flexDirection: 'row', gap: 9, marginBottom: 12 },
  tile: {
    flex: 1,
    minHeight: 92,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tileDim: { opacity: 0.5 },
  tileTitle: { fontFamily: fonts.display.semibold, fontSize: 14, textAlign: 'center' },
  tileSub: { fontFamily: fonts.mono.medium, fontSize: 9.5, textAlign: 'center' },
  devBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  devBtnText: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 0.8 },

  // staging card
  stageCard: { padding: 14, marginBottom: 12 },
  stageHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pgBadge: { position: 'absolute', right: 4, bottom: 4, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  pgText: { fontFamily: fonts.mono.semibold, fontSize: 8.5 },
  stageName: { fontFamily: fonts.body.semibold, fontSize: 14 },
  stageMeta: { fontFamily: fonts.mono.medium, fontSize: 11, marginTop: 3, lineHeight: 15 },
  trashBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  field: { marginTop: 12 },
  two: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  twoItem: { flex: 1, minWidth: 0 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 43,
    borderRadius: 13,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  pickText: { flex: 1, fontFamily: fonts.mono.medium, fontSize: 12.5 },
  clearBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  stageFoot: { flexDirection: 'row', gap: 10, marginTop: 14 },
  footerBtn: { flex: 1, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  footerPrimary: { flex: 1.45 },
  footerInner: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  footerLabel: { fontFamily: fonts.body.semibold, fontSize: 14.5 },
  sheetFooter: { flexDirection: 'row', gap: 11, paddingTop: 12 },
  spinnerWrap: { borderRadius: 13, borderWidth: StyleSheet.hairlineWidth + 0.5, overflow: 'hidden', alignItems: 'center' },
  spinner: { width: '100%', height: 200 },

  // processing card
  procCard: { padding: 14, marginBottom: 12 },
  procRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quip: { fontFamily: fonts.body.semibold, fontSize: 13, lineHeight: 18 },
  procSub: { fontFamily: fonts.mono.medium, fontSize: 10.5, marginTop: 3, lineHeight: 14 },

  // ready-to-review card
  readyCard: { padding: 14, marginBottom: 10 },
  readyHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  readyTitle: { fontFamily: fonts.display.semibold, fontSize: 15 },
  readyMeta: { fontFamily: fonts.mono.medium, fontSize: 10.5, marginTop: 3, lineHeight: 14 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth + 0.5 },
  pillText: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 0.4 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: { flex: 1, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth + 0.5, paddingVertical: 9, alignItems: 'center', gap: 2 },
  statNumRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statNum: { fontFamily: fonts.mono.semibold, fontSize: 17 },
  statLabel: { fontFamily: fonts.mono.medium, fontSize: 9.5, letterSpacing: 0.4, textTransform: 'uppercase' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  nameChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth + 0.5, maxWidth: '100%' },
  nameChipText: { fontFamily: fonts.body.medium, fontSize: 12 },
  reviewBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, marginTop: 12 },
  reviewBarText: { fontFamily: fonts.body.semibold, fontSize: 14 },

  // recent rows
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8 },
  recentRowDim: { opacity: 0.62 },
  recentIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  recentTitle: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
  recentMeta: { fontFamily: fonts.mono.medium, fontSize: 10.5, marginTop: 3, lineHeight: 14 },
  recentAction: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { alignItems: 'center', padding: 26, gap: 8, marginBottom: 8 },
  emptyTitle: { fontFamily: fonts.display.semibold, fontSize: 15, marginTop: 4 },
  emptyDesc: { fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 17, textAlign: 'center' },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginTop: 8,
  },
  noteText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 16 },
});
