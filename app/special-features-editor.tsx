import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from "expo-router/react-navigation";
import { useTranslation } from 'react-i18next';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useThemeColors } from '@/hooks/useThemeColors';
import { bothLanguages } from '@/utils/notificationHelpers';
import { saveTranslations, getLocalizedField } from '@/utils/translateContent';
import { useTranslationSection } from '@/components/TranslationSection';
import { fetchContentImages, saveContentImages, uploadImageToStorage } from '@/utils/contentImages';
import { brokerUploadImage } from '@/utils/storageBroker';
import {
  fetchContentAttachmentsBatch,
  uploadContentAttachment,
  setContentAttachment,
  retireContentStorage,
  brokerRetire,
  sweepExpiredContent,
  type ContentAttachment,
} from '@/utils/contentAttachments';
import { translateServerError } from '@/utils/serverErrors';
import { useSheetHandoff } from '@/components/GlassSheet';
import ContentListScreen, { type ContentListItem } from '@/components/content/ContentListScreen';
import StepSheet from '@/components/content/StepSheet';
import { FieldLabel, Hint, StepTitle, GlassTextInput, InfoRow } from '@/components/content/FormKit';
import CoverPhotoField, { type ThumbnailShape } from '@/components/content/CoverPhotoField';
import RichTextField from '@/components/content/RichTextField';
import AttachmentField, { type AttachmentDraft } from '@/components/content/AttachmentField';
import DateTimeField from '@/components/content/DateTimeField';
import ReviewStep, { type PreviewCardData, type ReviewLine } from '@/components/content/ReviewStep';
import { CONTENT_CAPS, categoryHue } from '@/components/content/contentVisuals';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';

interface SpecialFeature {
  id: string;
  title: string;
  content: string | null;
  message: string | null;
  thumbnail_url: string | null;
  thumbnail_shape: string | null;
  start_date_time: string | null;
  end_date_time: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  link: string | null;
  guide_file_id: string | null;
  guide_file?: unknown;
  title_es?: string | null;
  content_es?: string | null;
}

interface FormState {
  title: string;
  message: string;
  title_es: string;
  message_es: string;
  link: string;
}

const EMPTY_FORM: FormState = { title: '', message: '', title_es: '', message_es: '', link: '' };
const STEP_KEYS = ['basics', 'when', 'details', 'extras', 'review'] as const;
const REVIEW_STEP = STEP_KEYS.length - 1;
const MAX = CONTENT_CAPS.special_feature;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Special Features editor (s80) — the Content Kit's ContentListScreen page +
 * the stepped StepSheet (Basics · When · Details · Extras · Review). Data path
 * unchanged from the pre-glass screen: get/create/update/delete/reorder
 * _special_feature(s) RPCs, broker uploads, content_images, the s61 bilingual
 * hybrid, push on create. New in s80: the one-time attachment (Extras), the
 * storage retire path on delete, and sweep_expired_content before every load.
 */
export default function SpecialFeaturesEditorScreen() {
  useRequireManagerRoute();
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { user } = useAuth();
  const { sendNotification } = useNotification();
  const { organizationId } = useOrganization();
  const { language } = useLanguage();
  const locale = language === 'es' ? 'es' : 'en-US';

  // ── List ──────────────────────────────────────────────────────────────────
  const [features, setFeatures] = useState<SpecialFeature[]>([]);
  const [attachments, setAttachments] = useState<Map<string, ContentAttachment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // ── Sheet ─────────────────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<SpecialFeature | null>(null);
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [shape, setShape] = useState<ThumbnailShape>('square');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [extraUrls, setExtraUrls] = useState<string[]>([]);
  const [extraUris, setExtraUris] = useState<string[]>([]);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [attachment, setAttachment] = useState<AttachmentDraft | null>(null);
  const [notify, setNotify] = useState(true);
  // Whether the item being edited had a one-time file when the sheet opened —
  // a draft that is null / a guide at save time then means "clear it".
  const hadFileRef = useRef(false);
  const initialExtraCountRef = useRef(0);
  const addSessionRef = useRef(0);
  // get_guides, fetched once per screen life only when an edit needs the
  // category the row's guide_file JSON does not carry.
  const guidesRef = useRef<{ id: string; title: string; category: string; file_name: string }[] | null>(null);

  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const { defer, onDismiss } = useSheetHandoff(closeSheet);

  // Hybrid bilingual authoring (s61): the primary inputs bind the device
  // language; the shared section shows the other-language preview + translate
  // button + pencil edit. resolveOnSave() runs the staleness rules.
  const isSpanishAuthor = i18n.language === 'es';
  const translation = useTranslationSection({
    fields: [
      {
        key: 'title',
        labelKey: 'translation_section:field_title',
        enValue: form.title,
        esValue: form.title_es,
        setEnValue: (v) => setForm((prev) => ({ ...prev, title: v })),
        setEsValue: (v) => setForm((prev) => ({ ...prev, title_es: v })),
      },
      {
        key: 'message',
        labelKey: 'translation_section:field_description',
        enValue: form.message,
        esValue: form.message_es,
        setEnValue: (v) => setForm((prev) => ({ ...prev, message: v })),
        setEsValue: (v) => setForm((prev) => ({ ...prev, message_es: v })),
        multiline: true,
      },
    ],
    sessionKey: editing ? `edit:${editing.id}` : `new:${addSessionRef.current}`,
    active: sheetOpen,
  });

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadFeatures = useCallback(async () => {
    // Logout race: an empty actor would reach the uuid RPC param as '' (22P02).
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      // The sweep deletes expired rows AND retires their storage (manager ⇒ canDelete).
      await sweepExpiredContent(user.id, true);
      // Manager editor mode: inactive rows included.
      const { data, error } = await supabase.rpc('get_special_features', {
        p_actor_id: user.id,
        p_include_inactive: true,
      });
      if (error) throw error;
      const rows: SpecialFeature[] = data || [];
      setFeatures(rows);
      setAttachments(await fetchContentAttachmentsBatch(user.id, 'special_feature', rows.map((r) => r.id)));
    } catch (error) {
      console.error('Error loading special features:', error);
      Alert.alert(t('common:error'), t('special_features_editor:load_error'));
    } finally {
      setLoading(false);
    }
  }, [user?.id, t]);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  useFocusEffect(
    useCallback(() => {
      loadFeatures();
    }, [loadFeatures])
  );

  // ── Derived list ──────────────────────────────────────────────────────────
  const fmtDay = useCallback(
    (iso: string) => new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    [locale]
  );

  const listItems = useMemo<ContentListItem[]>(() => {
    const now = Date.now();
    const q = search.trim().toLowerCase();
    const azure = categoryHue('Event', isDark);
    return features
      .map((f, i) => {
        const s = f.start_date_time ? new Date(f.start_date_time).getTime() : null;
        const e = f.end_date_time ? new Date(f.end_date_time).getTime() : null;
        const started = s == null || s <= now;
        const ended = e != null && e < now;
        const pill = !started
          ? { label: t('special_features_editor:pill_upcoming'), color: azure, iosIcon: 'calendar', androidIcon: 'event' }
          : ended
            ? { label: t('special_features_editor:pill_ended'), color: colors.textSecondary, iosIcon: 'clock', androidIcon: 'history' }
            : { label: t('special_features_editor:pill_live'), color: colors.primary, iosIcon: 'clock.fill', androidIcon: 'schedule' };
        const dates =
          f.start_date_time && f.end_date_time
            ? `${fmtDay(f.start_date_time)} → ${fmtDay(f.end_date_time)}`
            : f.start_date_time
              ? fmtDay(f.start_date_time)
              : f.end_date_time
                ? `→ ${fmtDay(f.end_date_time)}`
                : t('content_editor.preview_no_dates');
        const meta = [`#${i + 1}`, dates];
        if (attachments.has(f.id)) meta.push(t('content_editor.preview_file'));
        else if (f.guide_file_id) meta.push(t('content_editor.preview_guide'));
        if (f.link) meta.push(t('content_editor.preview_link'));
        return {
          id: f.id,
          title: getLocalizedField(f, 'title', language),
          meta: meta.join(' · '),
          thumbnailUrl: f.thumbnail_url,
          shape: (f.thumbnail_shape === 'banner' ? 'banner' : 'square') as 'square' | 'banner',
          pill,
          haystack: `${f.title} ${f.title_es ?? ''} ${f.content ?? f.message ?? ''} ${f.content_es ?? ''}`.toLowerCase(),
        };
      })
      .filter((it) => !q || it.haystack.includes(q))
      .map(({ haystack: _h, ...it }) => it);
  }, [features, attachments, search, language, isDark, colors, t, fmtDay]);

  // ── Open / close ──────────────────────────────────────────────────────────
  const goTo = (i: number) => {
    setStep(i);
    setVisited((v) => Math.max(v, i));
  };

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShape('square');
    setCoverUri(null);
    setCoverUrl(null);
    setExtraUrls([]);
    setExtraUris([]);
    setStart(null);
    setEnd(null);
    setAttachment(null);
    setNotify(true);
    hadFileRef.current = false;
    initialExtraCountRef.current = 0;
    addSessionRef.current += 1;
    setStep(0);
    setVisited(0);
    setSheetOpen(true);
  };

  const resolveGuideDraft = async (feature: SpecialFeature): Promise<AttachmentDraft | null> => {
    if (!feature.guide_file_id || !user?.id) return null;
    if (!guidesRef.current) {
      const { data, error } = await supabase.rpc('get_guides', { p_actor_id: user.id });
      if (error) console.error('Error loading guides for special feature:', error);
      guidesRef.current = (data || []).map((g: any) => ({
        id: g.id,
        title: g.title,
        category: g.category ?? '',
        file_name: g.file_name ?? '',
      }));
    }
    const found = guidesRef.current.find((g) => g.id === feature.guide_file_id);
    if (found) return { kind: 'guide', guide: found };
    // The row's guide_file JSON (id · title · file_url · file_name · file_type) carries no category.
    const gf = feature.guide_file as { id?: string; title?: string; file_name?: string } | null;
    if (gf?.id && gf.title) {
      return { kind: 'guide', guide: { id: gf.id, title: gf.title, category: '', file_name: gf.file_name ?? '' } };
    }
    return null;
  };

  const openEdit = async (feature: SpecialFeature) => {
    setEditing(feature);
    setForm({
      title: feature.title,
      message: feature.content || feature.message || '',
      title_es: feature.title_es || '',
      message_es: feature.content_es || '',
      link: feature.link || '',
    });
    setShape(feature.thumbnail_shape === 'banner' ? 'banner' : 'square');
    setCoverUri(null);
    setCoverUrl(feature.thumbnail_url);
    setExtraUris([]);
    setStart(feature.start_date_time ? new Date(feature.start_date_time) : null);
    setEnd(feature.end_date_time ? new Date(feature.end_date_time) : null);
    setNotify(false);
    const att = attachments.get(feature.id);
    hadFileRef.current = !!att;
    if (att) {
      setAttachment({
        kind: 'file',
        file_url: att.file_url,
        file_name: att.file_name,
        file_type: att.file_type ?? 'application/octet-stream',
        size_bytes: att.size_bytes,
      });
    } else {
      setAttachment(await resolveGuideDraft(feature));
    }
    const imgs = await fetchContentImages(user?.id, 'special_feature', feature.id);
    setExtraUrls(imgs);
    initialExtraCountRef.current = imgs.length;
    setStep(REVIEW_STEP);
    setVisited(REVIEW_STEP);
    setSheetOpen(true);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const authorTitle = (isSpanishAuthor ? form.title_es : form.title).trim();
    const authorMessage = (isSpanishAuthor ? form.message_es : form.message).trim();
    if (!authorTitle) {
      goTo(0);
      Alert.alert(t('common:error'), t('content_editor.error_title_required'));
      return;
    }
    if (!authorMessage) {
      goTo(2);
      Alert.alert(t('common:error'), t('content_editor.error_message_required'));
      return;
    }
    if (!user?.id) {
      Alert.alert(t('common:error'), t('special_features_editor:error_not_authenticated'));
      return;
    }
    if (!editing && features.length >= MAX) {
      Alert.alert(t('special_features_editor:limit_reached'), t('special_features_editor:limit_reached_msg'));
      return;
    }

    // Fill/refresh the other language per the s61 staleness rules (may ask once).
    const resolved = await translation.resolveOnSave();
    if (!resolved) return;

    setSaving(true);
    try {
      let thumbnailUrl = editing?.thumbnail_url || null;
      if (coverUri) {
        const uploaded = await brokerUploadImage('special_feature_image', coverUri, user.id);
        if (uploaded) thumbnailUrl = uploaded;
        else Alert.alert(t('common:error'), t('special_features_editor:upload_image_error'));
      }

      // Prepend https:// when the entered link has no scheme, else it won't open (e.g. "kevahomes.com").
      const rawLink = form.link.trim();
      const linkValue = rawLink ? (/^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`) : null;
      const guideFileId = attachment?.kind === 'guide' ? attachment.guide.id : null;
      const startIso = start?.toISOString();
      const endIso = end?.toISOString();

      const shared = {
        p_user_id: user.id,
        p_organization_id: organizationId ?? undefined,
        p_title: resolved.title.en,
        p_message: resolved.message.en,
        p_thumbnail_url: thumbnailUrl ?? undefined,
        p_thumbnail_shape: shape,
        p_start_date_time: startIso,
        p_end_date_time: endIso,
        p_link: linkValue ?? undefined,
        p_guide_file_id: guideFileId ?? undefined,
      };

      let featureId: string;
      if (editing) {
        const { error } = await supabase.rpc('update_special_feature', {
          ...shared,
          p_feature_id: editing.id,
          p_display_order: editing.display_order,
        });
        if (error) throw error;
        featureId = editing.id;
      } else {
        // The hardened RPC returns the new row's uuid.
        const { data: newFeatureId, error } = await supabase.rpc('create_special_feature', {
          ...shared,
          p_display_order: features.length,
        });
        if (error) throw error;
        featureId = newFeatureId;

        // The new special shows in the notification shade live (via the
        // special_features table). Push goes out only when the toggle is on.
        if (notify) {
          try {
            const pushTitle = bothLanguages('notifications.new_special_feature_title');
            await sendNotification({
              notificationType: 'special_feature',
              title: pushTitle.en,
              body: resolved.title.en,
              title_es: pushTitle.es,
              // The authored Spanish title when it exists; empty falls back to EN.
              body_es: resolved.title.es || undefined,
              // type + the created row's uuid make the banner tap deep-link
              // (NotificationContext routes to PortalHome's openFeatureId).
              data: {
                type: 'special_feature',
                featureId: newFeatureId,
                startDateTime: startIso || null,
              },
            });
          } catch (notificationError) {
            console.error('Failed to send push notification:', notificationError);
          }
        }
      }

      // The translations RPC COALESCE-keeps a null, so a blank normally means
      // "leave alone". A field is DELIBERATELY CLEARED only when it held text
      // before and resolves blank now — those go over as '' (guides pattern;
      // an unconditional clear would stamp '' over never-authored Spanish
      // whenever machine translation failed and suppress future auto-fill).
      const cleared = (stored: string | null | undefined, next: string) => !!stored?.trim() && !next.trim();
      const clearBlank = editing
        ? [
            cleared(editing.title_es, resolved.title.es) && 'title_es',
            cleared(editing.content_es, resolved.message.es) && 'content_es',
          ].filter((f): f is string => !!f)
        : [];
      await saveTranslations(
        'special_features',
        featureId,
        { title_es: resolved.title.es, content_es: resolved.message.es },
        user.id,
        clearBlank.length ? { clearBlank } : undefined
      );

      // Extra photos: upload the new ones, then replace the full ordered set.
      const uploadedNew: string[] = [];
      for (const uri of extraUris) {
        const url = await uploadImageToStorage(uri, 'special_feature', user.id);
        if (url) uploadedNew.push(url);
      }
      const allExtra = [...extraUrls, ...uploadedNew];
      if (allExtra.length > 0 || initialExtraCountRef.current > 0) {
        await saveContentImages(user.id, 'special_feature', featureId, allExtra);
      }

      // One-time attachment: new pick ⇒ upload + set; stored file ⇒ untouched;
      // removed (null or swapped for a guide) ⇒ clear, which retires the old file.
      let uploadFailed = false;
      if (attachment?.kind === 'file') {
        if (attachment.uri) {
          const fileUrl = await uploadContentAttachment(
            'special_feature',
            attachment.uri,
            attachment.file_name,
            attachment.file_type,
            user.id
          );
          if (!fileUrl) uploadFailed = true;
          else {
            await setContentAttachment(user.id, 'special_feature', featureId, {
              file_url: fileUrl,
              file_name: attachment.file_name,
              file_type: attachment.file_type,
              size_bytes: attachment.size_bytes,
            });
          }
        }
      } else if (hadFileRef.current) {
        await setContentAttachment(user.id, 'special_feature', featureId, null);
      }

      const wasEdit = !!editing;
      defer(() =>
        Alert.alert(
          uploadFailed ? t('common:error') : t('common:success'),
          uploadFailed
            ? t('content_editor.error_upload_failed')
            : t(wasEdit ? 'special_features_editor:updated_success' : 'special_features_editor:created_success')
        )
      );
      await loadFeatures();
    } catch (error: any) {
      console.error('Error saving special feature:', error);
      Alert.alert(t('common:error'), translateServerError(error, t('special_features_editor:save_error')));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete / reorder ──────────────────────────────────────────────────────
  const handleDelete = (item: ContentListItem) => {
    Alert.alert(t('content_editor.delete_confirm_title'), t('content_editor.delete_confirm_body'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('common:delete'),
        style: 'destructive',
        onPress: async () => {
          if (!user?.id) {
            Alert.alert(t('common:error'), t('special_features_editor:error_not_authenticated'));
            return;
          }
          try {
            // Queue the files FIRST — their URLs are unreachable once the row is gone.
            const files = await retireContentStorage(user.id, 'special_feature', item.id);
            const { error } = await supabase.rpc('delete_special_feature', {
              p_user_id: user.id,
              p_organization_id: organizationId ?? undefined,
              p_feature_id: item.id,
            });
            if (error) throw error;
            await brokerRetire(user.id, files);
            Alert.alert(t('common:success'), t('special_features_editor:deleted_success'));
            await loadFeatures();
          } catch (error: any) {
            console.error('Error deleting special feature:', error);
            Alert.alert(t('common:error'), translateServerError(error, t('special_features_editor:delete_error')));
          }
        },
      },
    ]);
  };

  const handleReorder = async (orderedIds: string[]) => {
    if (!user?.id) return;
    const byId = new Map(features.map((f) => [f.id, f]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((f): f is SpecialFeature => !!f)
      .map((f, i) => ({ ...f, display_order: i }));
    setFeatures(reordered);
    try {
      const { error } = await supabase.rpc('reorder_special_features', {
        p_actor_id: user.id,
        p_ordered_ids: orderedIds,
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error reordering special features:', error);
      await loadFeatures();
    }
  };

  // ── Sheet content ─────────────────────────────────────────────────────────
  const steps = useMemo(() => STEP_KEYS.map((key) => ({ key, label: t(`content_editor.step_${key}`) })), [t]);

  const fmtWhen = (d: Date) =>
    `${d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(locale, {
      hour: 'numeric',
      minute: '2-digit',
    })}`;

  const runDays = end ? Math.max(1, Math.ceil((end.getTime() - (start ?? new Date()).getTime()) / DAY_MS)) : 0;

  const onStartChange = (next: Date | null) => {
    setStart(next);
    // An end that now sits before the start is meaningless — drop it.
    if (next && end && end.getTime() < next.getTime()) setEnd(null);
  };

  const authorTitle = isSpanishAuthor ? form.title_es : form.title;
  const authorMessage = isSpanishAuthor ? form.message_es : form.message;
  const photoCount = (coverUri || coverUrl ? 1 : 0) + extraUrls.length + extraUris.length;
  const attachmentLabel =
    attachment?.kind === 'guide'
      ? t('content_editor.guide_attached')
      : attachment?.kind === 'file'
        ? t('content_editor.file_attached')
        : null;

  const preview: PreviewCardData = {
    kind: 'special_feature',
    title: authorTitle,
    body: authorMessage,
    coverUri,
    coverUrl,
    shape,
    startDateTime: start,
    endDateTime: end,
    hasLink: form.link.trim().length > 0,
    attachmentLabel: attachment?.kind === 'guide' ? t('content_editor.preview_guide') : attachment ? t('content_editor.preview_file') : null,
    eyebrow: t('content_editor.preview_eyebrow_special'),
  };

  const whenValue =
    start && end
      ? `${fmtWhen(start)} → ${fmtWhen(end)}`
      : start
        ? `${fmtWhen(start)} · ${t('content_editor.no_end')}`
        : end
          ? `→ ${fmtWhen(end)}`
          : t('content_editor.runs_open');

  const reviewLines: ReviewLine[] = [
    {
      key: 'basics',
      iosIcon: 'textformat',
      androidIcon: 'title',
      label: t('content_editor.step_basics'),
      value: [
        authorTitle.trim() || t('content_editor.preview_untitled'),
        photoCount > 0 ? t('content_editor.photos_count', { count: photoCount }) : t('content_editor.no_photo'),
        shape === 'banner' ? t('content_editor.shape_banner') : t('content_editor.shape_square'),
      ].join(' · '),
      missing: !authorTitle.trim(),
      onPress: () => goTo(0),
    },
    {
      key: 'when',
      iosIcon: 'calendar',
      androidIcon: 'event',
      label: t('content_editor.step_when'),
      value: whenValue,
      onPress: () => goTo(1),
    },
    {
      key: 'details',
      iosIcon: 'text.alignleft',
      androidIcon: 'notes',
      label: t('content_editor.step_details'),
      value: form.title_es.trim() && form.message_es.trim() && form.title.trim() && form.message.trim()
        ? t('content_editor.lang_en_es')
        : t('content_editor.lang_en_only'),
      missing: !authorMessage.trim(),
      onPress: () => goTo(2),
    },
    {
      key: 'extras',
      iosIcon: 'paperclip',
      androidIcon: 'attach-file',
      label: t('content_editor.step_extras'),
      value: [
        form.link.trim() ? t('content_editor.preview_link') : t('content_editor.no_link'),
        attachmentLabel ?? t('content_editor.no_attachment'),
      ].join(' · '),
      onPress: () => goTo(3),
    },
  ];

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <>
            <StepTitle title={t('content_editor.basics_title_special')} subtitle={t('content_editor.basics_subtitle_special')} />
            <FieldLabel label={t('content_editor.field_title')} />
            <GlassTextInput
              value={authorTitle}
              onChangeText={(text) => setForm((prev) => (isSpanishAuthor ? { ...prev, title_es: text } : { ...prev, title: text }))}
              placeholder={t('special_features_editor:feature_title_placeholder')}
              maxLength={120}
            />
            <CoverPhotoField
              coverUri={coverUri}
              coverUrl={coverUrl}
              shape={shape}
              onShapeChange={setShape}
              onCoverPicked={setCoverUri}
              extraUrls={extraUrls}
              extraUris={extraUris}
              onExtraPicked={(uri) => setExtraUris((prev) => [...prev, uri])}
              onRemoveExtraUrl={(i) => setExtraUrls((prev) => prev.filter((_, idx) => idx !== i))}
              onRemoveExtraUri={(i) => setExtraUris((prev) => prev.filter((_, idx) => idx !== i))}
            />
          </>
        );
      case 1:
        return (
          <>
            <StepTitle title={t('content_editor.when_title_special')} subtitle={t('content_editor.when_subtitle_special')} />
            <DateTimeField
              label={t('content_editor.field_starts')}
              value={start}
              onChange={onStartChange}
              placeholder={t('content_editor.pick_date')}
            />
            <DateTimeField
              label={t('content_editor.field_ends')}
              labelTrailing={t('content_editor.optional')}
              value={end}
              onChange={setEnd}
              placeholder={t('content_editor.pick_end_date')}
              hint={t('content_editor.ends_hint_special')}
              minimumDate={start ?? undefined}
              seed={start ?? undefined}
            />
            {end ? (
              <InfoRow
                iosIcon="clock.fill"
                androidIcon="schedule"
                title={t('content_editor.runs_days', { count: runDays })}
                subtitle={t('content_editor.ends_hint_special')}
              />
            ) : (
              <InfoRow
                iosIcon="infinity"
                androidIcon="all-inclusive"
                title={t('content_editor.runs_open')}
                subtitle={t('content_editor.runs_open_hint')}
              />
            )}
          </>
        );
      case 2:
        return (
          <>
            <StepTitle title={t('content_editor.details_title')} subtitle={t('content_editor.details_subtitle')} />
            <RichTextField
              label={t('content_editor.field_description')}
              value={authorMessage}
              onChangeText={(text) =>
                setForm((prev) => (isSpanishAuthor ? { ...prev, message_es: text } : { ...prev, message: text }))
              }
              placeholder={t('special_features_editor:description_placeholder')}
            />
            {translation.element}
          </>
        );
      case 3:
        return (
          <>
            <StepTitle title={t('content_editor.extras_title')} subtitle={t('content_editor.extras_subtitle')} />
            <FieldLabel label={t('content_editor.field_link')} trailing={t('content_editor.optional')} />
            <GlassTextInput
              value={form.link}
              onChangeText={(text) => setForm((prev) => ({ ...prev, link: text }))}
              placeholder={t('special_features_editor:link_placeholder')}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Hint>{t('content_editor.link_hint')}</Hint>
            {!!user?.id && (
              <AttachmentField contentKind="special_feature" value={attachment} onChange={setAttachment} actorId={user.id} />
            )}
          </>
        );
      default:
        return (
          <ReviewStep editing={!!editing}
            preview={preview}
            lines={reviewLines}
            notify={editing ? undefined : { value: notify, onChange: setNotify }}
          />
        );
    }
  };

  const featureById = (id: string) => features.find((f) => f.id === id);

  return (
    <ContentListScreen
      title={t('special_features_editor:title')}
      eyebrow={t('content_editor.eyebrow_manage')}
      emptyIconIos="sparkles"
      emptyIconAndroid="auto-awesome"
      items={listItems}
      total={features.length}
      max={MAX}
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('special_features_editor:search_placeholder')}
      countLabel={t('special_features_editor:count_label', { count: features.length })}
      onAdd={openAdd}
      onEdit={(item) => {
        const f = featureById(item.id);
        if (f) openEdit(f);
      }}
      onDelete={handleDelete}
      onReorder={handleReorder}
      emptyTitle={t('special_features_editor:empty_title')}
      emptyBody={t('special_features_editor:empty_body')}
      limitTitle={t('special_features_editor:limit_reached')}
      limitMessage={t('special_features_editor:limit_reached_msg')}
    >
      <StepSheet
        visible={sheetOpen}
        onClose={closeSheet}
        onDismiss={onDismiss}
        title={editing ? t('special_features_editor:modal_edit') : t('special_features_editor:modal_add')}
        subtitle={editing ? t('content_editor.sheet_subtitle_edit') : t('content_editor.sheet_subtitle_new')}
        steps={steps}
        step={step}
        onStepChange={goTo}
        visited={visited}
        primaryLabel={editing ? t('content_editor.save_changes') : t('content_editor.post_special')}
        nextLabel={t('content_editor.next')}
        backLabel={t('content_editor.back')}
        cancelLabel={t('common:cancel')}
        onPrimary={handleSave}
        busy={saving}
      >
        {renderStep()}
      </StepSheet>
    </ContentListScreen>
  );
}
