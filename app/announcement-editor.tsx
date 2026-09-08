import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Alert } from 'react-native';
import { useFocusEffect } from "expo-router/react-navigation";
import { useTranslation } from 'react-i18next';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useSheetHandoff } from '@/components/GlassSheet';
import SimpleSelectPicker from '@/components/SimpleSelectPicker';
import { useTranslationSection } from '@/components/TranslationSection';
import ContentListScreen, { type ContentListItem } from '@/components/content/ContentListScreen';
import StepSheet from '@/components/content/StepSheet';
import CoverPhotoField, { type ThumbnailShape } from '@/components/content/CoverPhotoField';
import RichTextField from '@/components/content/RichTextField';
import AttachmentField, { type AttachmentDraft } from '@/components/content/AttachmentField';
import ReviewStep, { type ReviewLine } from '@/components/content/ReviewStep';
import { FieldLabel, GlassTextInput, Hint, SelectRow, StepTitle, useFormStyles } from '@/components/content/FormKit';
import {
  CONTENT_CAPS,
  PRIORITY_LEVELS,
  VISIBILITY_OPTIONS,
  priorityHue,
  type AnnouncementPriority,
  type AnnouncementVisibility,
} from '@/components/content/contentVisuals';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import {
  brokerRetire,
  fetchContentAttachmentsBatch,
  retireContentStorage,
  setContentAttachment,
  uploadContentAttachment,
  type ContentAttachment,
} from '@/utils/contentAttachments';
import { fetchContentImages, saveContentImages, uploadImageToStorage } from '@/utils/contentImages';
import { brokerUploadImage } from '@/utils/storageBroker';
import { getLocalizedField, saveTranslations } from '@/utils/translateContent';
import { bothLanguages } from '@/utils/notificationHelpers';
import { translateServerError } from '@/utils/serverErrors';
import { formatShortDate } from '@/utils/dateUtils';

interface GuideFileJson {
  id: string;
  title: string;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
}

interface Announcement {
  id: string;
  title: string;
  content: string | null;
  message: string | null;
  thumbnail_url: string | null;
  thumbnail_shape: string;
  priority: string;
  visibility: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  link: string | null;
  guide_file_id: string | null;
  guide_file?: GuideFileJson | null;
  title_es?: string | null;
  content_es?: string | null;
}

interface FormState {
  title: string;
  message: string;
  title_es: string;
  message_es: string;
  priority: AnnouncementPriority;
  visibility: AnnouncementVisibility;
  shape: ThumbnailShape;
  link: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  message: '',
  title_es: '',
  message_es: '',
  priority: 'none',
  visibility: 'everyone',
  shape: 'square',
  link: '',
};

const STEP_KEYS = ['basics', 'details', 'extras', 'review'] as const;
const REVIEW_STEP = STEP_KEYS.length - 1;
const MAX = CONTENT_CAPS.announcement;

const PRIORITY_KEYS: Record<AnnouncementPriority, string> = {
  none: 'common:priority_none',
  new: 'common:priority_new',
  important: 'common:priority_important',
  update: 'common:priority_update',
};
const VISIBILITY_KEYS: Record<AnnouncementVisibility, string> = {
  everyone: 'announcement_editor:visibility_everyone',
  employees: 'announcement_editor:visibility_employees',
  managers: 'announcement_editor:visibility_managers',
  none: 'announcement_editor:visibility_none',
};

/** Prepend https:// when the entered link has no scheme, else it won't open. */
function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Announcements editor (s80) — the Content Kit's list page plus the stepped
 * sheet: Basics · Details · Extras · Review (no "When": announcements do not
 * expire). Data flows are the pre-glass file's, minus the old ActionSheetIOS /
 * inline guide list, plus the one-time attachment and the retire-on-delete path.
 */
export default function AnnouncementEditorScreen() {
  useRequireManagerRoute();
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const fs = useFormStyles(colors);
  const { user } = useAuth();
  const { sendNotification } = useNotification();
  const { language } = useLanguage();
  const { organizationId } = useOrganization();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [attachments, setAttachments] = useState<Map<string, ContentAttachment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // ── Sheet state ─────────────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [extraUrls, setExtraUrls] = useState<string[]>([]);
  const [extraUris, setExtraUris] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<AttachmentDraft | null>(null);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [badgePickerOpen, setBadgePickerOpen] = useState(false);
  const [visibilityPickerOpen, setVisibilityPickerOpen] = useState(false);
  const addSessionRef = useRef(0);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setBadgePickerOpen(false);
    setVisibilityPickerOpen(false);
  }, []);
  // An Alert issued during a Modal dismissal is dropped on iOS — hand it off.
  const handoff = useSheetHandoff(closeSheet);

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
        enStored: editing ? editing.title : undefined,
        esStored: editing ? editing.title_es ?? null : undefined,
      },
      {
        key: 'message',
        labelKey: 'translation_section:field_description',
        enValue: form.message,
        esValue: form.message_es,
        setEnValue: (v) => setForm((prev) => ({ ...prev, message: v })),
        setEsValue: (v) => setForm((prev) => ({ ...prev, message_es: v })),
        multiline: true,
        enStored: editing ? editing.content ?? editing.message ?? null : undefined,
        esStored: editing ? editing.content_es ?? null : undefined,
      },
    ],
    sessionKey: editing ? `edit:${editing.id}` : `new:${addSessionRef.current}`,
    active: sheetOpen,
  });

  // ── Labels ──────────────────────────────────────────────────────────────────
  const priorityLabel = useCallback(
    (priority: string) => (PRIORITY_KEYS[priority as AnnouncementPriority] ? t(PRIORITY_KEYS[priority as AnnouncementPriority]) : priority),
    [t]
  );
  const visibilityLabel = useCallback(
    (visibility: string) =>
      VISIBILITY_KEYS[visibility as AnnouncementVisibility] ? t(VISIBILITY_KEYS[visibility as AnnouncementVisibility]) : visibility,
    [t]
  );

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    // Logout race: an empty actor would reach the uuid RPC param as '' (22P02).
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      // Manager editor mode: every row, every visibility, inactive included.
      const { data, error } = await supabase.rpc('get_announcements', {
        p_actor_id: user.id,
        p_include_inactive: true,
      });
      if (error) throw error;
      const rows = (data || []) as unknown as Announcement[];
      setAnnouncements(rows);
      setAttachments(await fetchContentAttachmentsBatch(user.id, 'announcement', rows.map((r) => r.id)));
    } catch (error) {
      console.error('Error loading announcements:', error);
      Alert.alert(t('common:error'), t('announcement_editor:load_error'));
    } finally {
      setLoading(false);
    }
  }, [user?.id, t]);

  useEffect(() => { void load(); }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // ── Open / close ────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCoverUri(null);
    setExtraUrls([]);
    setExtraUris([]);
    setAttachment(null);
    setNotify(true);
    setStep(0);
    setVisited(0);
    addSessionRef.current += 1;
    setSheetOpen(true);
  };

  const openEdit = (item: ContentListItem) => {
    const a = announcements.find((x) => x.id === item.id);
    if (!a || !user?.id) return;
    setEditing(a);
    setForm({
      title: a.title,
      message: a.content || a.message || '',
      title_es: a.title_es || '',
      message_es: a.content_es || '',
      priority: (PRIORITY_LEVELS as string[]).includes(a.priority) ? (a.priority as AnnouncementPriority) : 'none',
      visibility: (VISIBILITY_OPTIONS as string[]).includes(a.visibility)
        ? (a.visibility as AnnouncementVisibility)
        : 'everyone',
      shape: a.thumbnail_shape === 'banner' ? 'banner' : 'square',
      link: a.link || '',
    });
    setCoverUri(null);
    setExtraUrls([]);
    setExtraUris([]);
    setNotify(true);

    // Seed the attachment: a stored one-time file wins; else the linked guide.
    const stored = attachments.get(a.id);
    if (stored) {
      setAttachment({
        kind: 'file',
        file_url: stored.file_url,
        file_name: stored.file_name,
        file_type: stored.file_type ?? 'application/octet-stream',
        size_bytes: stored.size_bytes,
      });
    } else if (a.guide_file_id) {
      // The row's guide_file jsonb carries no category — seed now, refine below.
      setAttachment({
        kind: 'guide',
        guide: {
          id: a.guide_file_id,
          title: a.guide_file?.title ?? '',
          category: '',
          file_name: a.guide_file?.file_name ?? '',
        },
      });
      const guideId = a.guide_file_id;
      supabase.rpc('get_guides', { p_actor_id: user.id }).then(({ data }) => {
        const g = (data || []).find((row: any) => row.id === guideId);
        if (!g) return;
        setAttachment((prev) =>
          prev?.kind === 'guide' && prev.guide.id === guideId
            ? { kind: 'guide', guide: { id: g.id, title: g.title, category: g.category ?? '', file_name: g.file_name ?? '' } }
            : prev
        );
      });
    } else {
      setAttachment(null);
    }

    // Edit opens straight on Review with every step done.
    setStep(REVIEW_STEP);
    setVisited(REVIEW_STEP);
    setSheetOpen(true);
    fetchContentImages(user.id, 'announcement', a.id).then((urls) => setExtraUrls(urls));
  };

  const goToStep = (index: number) => {
    const next = Math.max(0, Math.min(REVIEW_STEP, index));
    setStep(next);
    setVisited((v) => Math.max(v, next));
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user?.id) {
      Alert.alert(t('common:error'), t('announcement_editor:error_not_authenticated'));
      return;
    }
    const authorTitle = (isSpanishAuthor ? form.title_es : form.title).trim();
    const authorMessage = (isSpanishAuthor ? form.message_es : form.message).trim();
    if (!authorTitle) {
      goToStep(0);
      Alert.alert(t('common:error'), t('content_editor.error_title_required'));
      return;
    }
    if (!authorMessage) {
      goToStep(1);
      Alert.alert(t('common:error'), t('content_editor.error_message_required'));
      return;
    }
    if (!editing && announcements.length >= MAX) {
      Alert.alert(t('announcement_editor:limit_reached_title'), t('announcement_editor:limit_reached_msg'));
      return;
    }

    // Fill/refresh the other language per the s61 staleness rules (may ask once).
    const resolved = await translation.resolveOnSave();
    if (!resolved) return;

    setBusy(true);
    let notice: { title: string; body: string } | null = null;
    try {
      let thumbnailUrl = editing?.thumbnail_url || null;
      if (coverUri) {
        const uploaded = await brokerUploadImage('announcement_image', coverUri, user.id);
        if (uploaded) thumbnailUrl = uploaded;
        else Alert.alert(t('common:error'), t('announcement_editor:upload_image_error'));
      }

      const link = normalizeLink(form.link);
      const guideFileId = attachment?.kind === 'guide' ? attachment.guide.id : null;
      const shared = {
        p_user_id: user.id,
        p_organization_id: organizationId ?? undefined,
        p_title: resolved.title.en,
        p_message: resolved.message.en,
        p_thumbnail_url: thumbnailUrl ?? undefined,
        p_thumbnail_shape: form.shape,
        p_priority: form.priority,
        p_visibility: form.visibility,
        p_link: link ?? undefined,
        p_guide_file_id: guideFileId ?? undefined,
      };

      let id: string;
      if (editing) {
        const { error } = await supabase.rpc('update_announcement', {
          ...shared,
          p_announcement_id: editing.id,
          p_display_order: editing.display_order,
        });
        if (error) throw error;
        id = editing.id;
      } else {
        // The hardened RPC returns the new row's uuid.
        const { data, error } = await supabase.rpc('create_announcement', {
          ...shared,
          p_display_order: announcements.length,
        });
        if (error) throw error;
        id = data as string;
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
        'announcements',
        id,
        { title_es: resolved.title.es, content_es: resolved.message.es },
        user.id,
        clearBlank.length ? { clearBlank } : undefined
      );

      // Extra photos: upload the new ones, then replace the full set. An edit
      // always writes so removing every photo actually clears the rows.
      const uploadedExtras: string[] = [];
      for (const uri of extraUris) {
        const url = await uploadImageToStorage(uri, 'announcement', user.id);
        if (url) uploadedExtras.push(url);
      }
      if (editing || uploadedExtras.length > 0) {
        await saveContentImages(user.id, 'announcement', id, [...extraUrls, ...uploadedExtras]);
      }

      // One-time attachment: fresh file → upload + set; stored file → keep;
      // none / guide where a file used to be → clear.
      const hadFile = !!editing && attachments.has(editing.id);
      if (attachment?.kind === 'file' && attachment.uri) {
        const fileUrl = await uploadContentAttachment(
          'announcement',
          attachment.uri,
          attachment.file_name,
          attachment.file_type,
          user.id
        );
        if (fileUrl) {
          await setContentAttachment(user.id, 'announcement', id, {
            file_url: fileUrl,
            file_name: attachment.file_name,
            file_type: attachment.file_type,
            size_bytes: attachment.size_bytes,
          });
        } else {
          notice = { title: t('common:error'), body: t('content_editor.error_upload_failed') };
        }
      } else if (attachment?.kind !== 'file' && hadFile) {
        await setContentAttachment(user.id, 'announcement', id, null);
      }

      // Push on CREATE only, and only when the Notify switch is on.
      if (!editing && notify) {
        try {
          const pushTitle = bothLanguages('notifications.new_announcement_title');
          await sendNotification({
            notificationType: 'announcement',
            title: pushTitle.en,
            body: resolved.title.en,
            title_es: pushTitle.es,
            // The authored Spanish title when it exists; empty falls back to EN.
            body_es: resolved.title.es || undefined,
            // type + the created row's uuid make the banner tap deep-link
            // (NotificationContext routes to PortalHome's openAnnouncementId).
            data: { type: 'announcement', announcementId: id, priority: form.priority },
          });
        } catch (notificationError) {
          console.error('Failed to send push notification:', notificationError);
        }
      }

      if (notice) {
        const n = notice;
        handoff.defer(() => Alert.alert(n.title, n.body));
      } else {
        closeSheet();
      }
      await load();
    } catch (error: any) {
      console.error('Error saving announcement:', error);
      Alert.alert(t('common:error'), translateServerError(error, t('announcement_editor:save_error')));
    } finally {
      setBusy(false);
    }
  };

  // ── Delete / reorder ────────────────────────────────────────────────────────
  const handleDelete = (item: ContentListItem) => {
    const a = announcements.find((x) => x.id === item.id);
    if (!a) return;
    Alert.alert(t('content_editor.delete_confirm_title'), t('content_editor.delete_confirm_body'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('common:delete'),
        style: 'destructive',
        onPress: async () => {
          if (!user?.id) {
            Alert.alert(t('common:error'), t('announcement_editor:error_not_authenticated'));
            return;
          }
          try {
            // Queue first, delete second — the URLs are unreachable once the row is gone.
            const files = await retireContentStorage(user.id, 'announcement', a.id);
            const { error } = await supabase.rpc('delete_announcement', {
              p_user_id: user.id,
              p_organization_id: organizationId ?? undefined,
              p_announcement_id: a.id,
            });
            if (error) throw error;
            await brokerRetire(user.id, files);
            await load();
          } catch (error: any) {
            console.error('Error deleting announcement:', error);
            Alert.alert(t('common:error'), translateServerError(error, t('announcement_editor:delete_error')));
          }
        },
      },
    ]);
  };

  const handleReorder = async (orderedIds: string[]) => {
    if (!user?.id) return;
    const byId = new Map(announcements.map((a) => [a.id, a]));
    const reordered = orderedIds
      .map((id, index) => {
        const a = byId.get(id);
        return a ? { ...a, display_order: index } : null;
      })
      .filter((a): a is Announcement => !!a);
    setAnnouncements(reordered);
    try {
      const { error } = await supabase.rpc('reorder_announcements', {
        p_actor_id: user.id,
        p_ordered_ids: orderedIds,
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error reordering announcements:', error);
      await load();
    }
  };

  // ── List rows ───────────────────────────────────────────────────────────────
  const items = useMemo<ContentListItem[]>(() => {
    const q = search.trim().toLowerCase();
    const rows: ContentListItem[] = announcements.map((a, index) => {
      const hidden = a.visibility === 'none';
      const meta = [`#${index + 1}`, visibilityLabel(a.visibility), formatShortDate(a.created_at, language)];
      if (attachments.has(a.id)) meta.push(t('content_editor.preview_file'));
      else if (a.guide_file_id) meta.push(t('content_editor.preview_guide'));
      if (a.link) meta.push(t('content_editor.preview_link'));
      return {
        id: a.id,
        title: getLocalizedField(a, 'title', language) || t('content_editor.preview_untitled'),
        meta: meta.join(' · '),
        thumbnailUrl: a.thumbnail_url,
        shape: a.thumbnail_shape === 'banner' ? 'banner' : 'square',
        dim: hidden,
        pill: hidden
          ? { label: visibilityLabel('none'), color: colors.textSecondary, iosIcon: 'eye.slash', androidIcon: 'visibility-off' }
          : a.priority && a.priority !== 'none'
            ? { label: priorityLabel(a.priority), color: priorityHue(a.priority, colors, isDark), iosIcon: 'star.fill', androidIcon: 'star' }
            : undefined,
      };
    });
    if (!q) return rows;
    return rows.filter((row, i) => {
      const a = announcements[i];
      return [a.title, a.title_es, a.content, a.content_es, a.message]
        .some((s) => !!s && s.toLowerCase().includes(q));
    });
  }, [announcements, attachments, search, language, colors, isDark, t, priorityLabel, visibilityLabel]);

  // ── Review data ─────────────────────────────────────────────────────────────
  const authorTitle = isSpanishAuthor ? form.title_es : form.title;
  const authorMessage = isSpanishAuthor ? form.message_es : form.message;
  const photoCount = (coverUri || editing?.thumbnail_url ? 1 : 0) + extraUrls.length + extraUris.length;
  const hasSpanish = !!(form.title_es.trim() || form.message_es.trim());
  const attachmentSummary =
    attachment?.kind === 'file'
      ? t('content_editor.file_attached')
      : attachment?.kind === 'guide'
        ? t('content_editor.guide_attached')
        : t('content_editor.no_attachment');

  const reviewLines: ReviewLine[] = [
    {
      key: 'basics',
      iosIcon: 'textformat',
      androidIcon: 'title',
      label: t('content_editor.step_basics'),
      value: `${authorTitle.trim() || t('content_editor.preview_untitled')} · ${
        photoCount > 0 ? t('content_editor.photos_count', { count: photoCount }) : t('content_editor.no_photo')
      }`,
      missing: !authorTitle.trim(),
      onPress: () => goToStep(0),
    },
    {
      key: 'details',
      iosIcon: 'text.alignleft',
      androidIcon: 'notes',
      label: t('content_editor.step_details'),
      value: hasSpanish ? t('content_editor.lang_en_es') : t('content_editor.lang_en_only'),
      missing: !authorMessage.trim(),
      onPress: () => goToStep(1),
    },
    {
      key: 'extras',
      iosIcon: 'star',
      androidIcon: 'star-border',
      label: t('content_editor.step_extras'),
      value: [
        priorityLabel(form.priority),
        visibilityLabel(form.visibility),
        attachmentSummary,
        form.link.trim() ? t('content_editor.preview_link') : t('content_editor.no_link'),
      ].join(' · '),
      onPress: () => goToStep(2),
    },
  ];

  const steps = STEP_KEYS.map((key) => ({ key, label: t(`content_editor.step_${key}`) }));

  // ── Panes ───────────────────────────────────────────────────────────────────
  const renderPane = () => {
    switch (step) {
      case 0:
        return (
          <>
            <StepTitle
              title={t('content_editor.basics_title_announcement')}
              subtitle={t('content_editor.basics_subtitle_announcement')}
            />
            <View>
              <FieldLabel label={t('content_editor.field_title')} />
              <GlassTextInput
                value={authorTitle}
                onChangeText={(text) =>
                  setForm((prev) => (isSpanishAuthor ? { ...prev, title_es: text } : { ...prev, title: text }))
                }
                placeholder={t('announcement_editor:announcement_title_placeholder')}
                maxLength={120}
              />
            </View>
            <CoverPhotoField
              coverUri={coverUri}
              coverUrl={editing?.thumbnail_url ?? null}
              shape={form.shape}
              onShapeChange={(shape) => setForm((prev) => ({ ...prev, shape }))}
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
            <StepTitle title={t('content_editor.details_title')} subtitle={t('content_editor.details_subtitle')} />
            <RichTextField
              label={t('content_editor.field_message')}
              value={authorMessage}
              onChangeText={(text) =>
                setForm((prev) => (isSpanishAuthor ? { ...prev, message_es: text } : { ...prev, message: text }))
              }
              placeholder={t('announcement_editor:message_placeholder')}
            />
            {translation.element}
          </>
        );
      case 2:
        return (
          <>
            <StepTitle title={t('content_editor.extras_title')} subtitle={t('content_editor.extras_subtitle_announcement')} />
            <View style={fs.twoCol}>
              <View style={fs.twoColItem}>
                <FieldLabel label={t('content_editor.field_badge')} />
                <SelectRow
                  iosIcon="star.fill"
                  androidIcon="star"
                  iconColor={priorityHue(form.priority, colors, isDark)}
                  value={priorityLabel(form.priority)}
                  onPress={() => setBadgePickerOpen(true)}
                />
              </View>
              <View style={fs.twoColItem}>
                <FieldLabel label={t('content_editor.field_visible_to')} />
                <SelectRow
                  iosIcon={form.visibility === 'none' ? 'eye.slash' : 'eye'}
                  androidIcon={form.visibility === 'none' ? 'visibility-off' : 'visibility'}
                  value={visibilityLabel(form.visibility)}
                  onPress={() => setVisibilityPickerOpen(true)}
                />
              </View>
            </View>
            <View>
              <FieldLabel label={t('content_editor.field_link')} trailing={t('content_editor.optional')} />
              <GlassTextInput
                value={form.link}
                onChangeText={(link) => setForm((prev) => ({ ...prev, link }))}
                placeholder={t('announcement_editor:link_placeholder')}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Hint>{t('content_editor.link_hint')}</Hint>
            </View>
            {!!user?.id && (
              <AttachmentField contentKind="announcement" value={attachment} onChange={setAttachment} actorId={user.id} />
            )}
            <SimpleSelectPicker
              visible={badgePickerOpen}
              title={t('content_editor.field_badge')}
              options={PRIORITY_LEVELS.map(priorityLabel)}
              value={priorityLabel(form.priority)}
              onSelect={(label) => {
                const priority = PRIORITY_LEVELS.find((p) => priorityLabel(p) === label);
                if (priority) setForm((prev) => ({ ...prev, priority }));
              }}
              onClose={() => setBadgePickerOpen(false)}
            />
            <SimpleSelectPicker
              visible={visibilityPickerOpen}
              title={t('content_editor.field_visible_to')}
              options={VISIBILITY_OPTIONS.map(visibilityLabel)}
              value={visibilityLabel(form.visibility)}
              onSelect={(label) => {
                const visibility = VISIBILITY_OPTIONS.find((v) => visibilityLabel(v) === label);
                if (visibility) setForm((prev) => ({ ...prev, visibility }));
              }}
              onClose={() => setVisibilityPickerOpen(false)}
            />
          </>
        );
      default:
        return (
          <ReviewStep editing={!!editing}
            preview={{
              kind: 'announcement',
              title: authorTitle,
              body: authorMessage,
              coverUri,
              coverUrl: editing?.thumbnail_url ?? null,
              shape: form.shape,
              priority: form.priority,
              hasLink: !!form.link.trim(),
              attachmentLabel:
                attachment?.kind === 'file'
                  ? t('content_editor.preview_file')
                  : attachment?.kind === 'guide'
                    ? t('content_editor.preview_guide')
                    : null,
              eyebrow: t('content_editor.preview_eyebrow_announcement'),
            }}
            lines={reviewLines}
            notify={editing ? undefined : { value: notify, onChange: setNotify }}
          />
        );
    }
  };

  return (
    <ContentListScreen
      title={t('announcement_editor:title')}
      eyebrow={t('content_editor.eyebrow_manage')}
      emptyIconIos="megaphone.fill"
      emptyIconAndroid="campaign"
      items={items}
      total={announcements.length}
      max={MAX}
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('announcement_editor:search_placeholder')}
      countLabel={t('announcement_editor:count_label', { count: announcements.length })}
      onAdd={openAdd}
      onEdit={openEdit}
      onDelete={handleDelete}
      onReorder={handleReorder}
      emptyTitle={t('announcement_editor:empty_title')}
      emptyBody={t('announcement_editor:empty_body')}
      limitTitle={t('announcement_editor:limit_reached_title')}
      limitMessage={t('announcement_editor:limit_reached_msg')}
    >
      <StepSheet
        visible={sheetOpen}
        onClose={closeSheet}
        onDismiss={handoff.onDismiss}
        title={editing ? t('announcement_editor:modal_edit') : t('announcement_editor:modal_add')}
        subtitle={editing ? t('content_editor.sheet_subtitle_edit') : t('content_editor.sheet_subtitle_new')}
        steps={steps}
        step={step}
        onStepChange={goToStep}
        visited={visited}
        primaryLabel={editing ? t('content_editor.save_changes') : t('content_editor.post_announcement')}
        nextLabel={t('content_editor.next')}
        backLabel={t('content_editor.back')}
        cancelLabel={t('common:cancel')}
        onPrimary={handleSave}
        busy={busy}
      >
        {renderPane()}
      </StepSheet>
    </ContentListScreen>
  );
}
