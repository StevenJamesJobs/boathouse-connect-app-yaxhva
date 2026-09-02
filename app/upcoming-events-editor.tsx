import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { bothLanguages } from '@/utils/notificationHelpers';
import { brokerUploadImage } from '@/utils/storageBroker';
import { translateServerError } from '@/utils/serverErrors';
import { saveTranslations, getLocalizedField } from '@/utils/translateContent';
import { useTranslationSection } from '@/components/TranslationSection';
import { fetchContentImages, saveContentImages, uploadImageToStorage } from '@/utils/contentImages';
import {
  brokerRetire,
  fetchContentAttachmentsBatch,
  retireContentStorage,
  setContentAttachment,
  sweepExpiredContent,
  uploadContentAttachment,
  type ContentAttachment,
} from '@/utils/contentAttachments';
import { useSheetHandoff } from '@/components/GlassSheet';
import ContentListScreen, { type ContentListItem } from '@/components/content/ContentListScreen';
import StepSheet, { type StepDef } from '@/components/content/StepSheet';
import { FieldLabel, GlassTextInput, Hint, InfoRow, SegControl, StepTitle } from '@/components/content/FormKit';
import CoverPhotoField, { type ThumbnailShape } from '@/components/content/CoverPhotoField';
import RichTextField from '@/components/content/RichTextField';
import AttachmentField, { type AttachmentDraft } from '@/components/content/AttachmentField';
import DateTimeField from '@/components/content/DateTimeField';
import ReviewStep, { type ReviewLine } from '@/components/content/ReviewStep';
import type { GuidePick } from '@/components/content/GuidePickerSheet';
import { CONTENT_CAPS, categoryHue, type EventCategory } from '@/components/content/contentVisuals';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';

/** One get_upcoming_events row (the editor reads inactive rows too). */
interface UpcomingEvent {
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
  link: string | null;
  guide_file_id: string | null;
  guide_file: unknown;
  category: string | null;
  title_es: string | null;
  content_es: string | null;
}

/** The sheet's whole form. Reset on every open — the sheet owns no state. */
interface Draft {
  title: string;
  title_es: string;
  message: string;
  message_es: string;
  shape: ThumbnailShape;
  category: EventCategory;
  link: string;
  start: Date | null;
  end: Date | null;
  coverUri: string | null;
  coverUrl: string | null;
  extraUrls: string[];
  extraUris: string[];
  attachment: AttachmentDraft | null;
  notify: boolean;
}

const EMPTY_DRAFT: Draft = {
  title: '',
  title_es: '',
  message: '',
  message_es: '',
  shape: 'square',
  category: 'Event',
  link: '',
  start: null,
  end: null,
  coverUri: null,
  coverUrl: null,
  extraUrls: [],
  extraUris: [],
  attachment: null,
  notify: true,
};

const [STEP_BASICS, STEP_WHEN, STEP_DETAILS, STEP_EXTRAS, STEP_REVIEW] = [0, 1, 2, 3, 4];
const CAP = CONTENT_CAPS.upcoming_event;

// Date formatting — locale from the app language, never a hardcoded 'en-US'.
function fmtDay(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(d: Date, locale: string): string {
  return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

function fmtWhen(d: Date, locale: string): string {
  return `${fmtDay(d, locale)} · ${fmtTime(d, locale)}`;
}

/** "Fri Sep 5 · 7:00 – 10:00 PM" on one day; two full stamps across days. */
function fmtRange(start: Date, end: Date | null, locale: string): string {
  if (!end) return fmtWhen(start, locale);
  if (start.toDateString() !== end.toDateString()) return `${fmtWhen(start, locale)} – ${fmtWhen(end, locale)}`;
  const a = fmtTime(start, locale);
  const b = fmtTime(end, locale);
  const suffix = a.match(/\s?[AP]\.?M\.?$/i)?.[0];
  const head = suffix && b.endsWith(suffix) ? a.slice(0, -suffix.length) : a;
  return `${fmtDay(start, locale)} · ${head} – ${b}`;
}

function asCategory(value: string | null | undefined): EventCategory {
  return value === 'Entertainment' ? 'Entertainment' : 'Event';
}

export default function UpcomingEventsEditorScreen() {
  useRequireManagerRoute();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { sendNotification } = useNotification();
  const { organizationId } = useOrganization();
  const { language } = useLanguage();
  const isDark = useIsDarkTheme();
  const locale = language === 'es' ? 'es' : 'en-US';

  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [attachments, setAttachments] = useState<Map<string, ContentAttachment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // ── Sheet state ─────────────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<UpcomingEvent | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [step, setStep] = useState(STEP_BASICS);
  const [visited, setVisited] = useState(STEP_BASICS);
  const [busy, setBusy] = useState(false);
  const addSessionRef = useRef(0);
  // Whether the row being edited carried a one-time file when the sheet opened —
  // the only case where a null / guide draft has to CLEAR the stored attachment.
  const hadFileRef = useRef(false);
  const patch = useCallback((p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })), []);

  const closeSheet = useCallback(() => setSheetOpen(false), []);
  // Success alerts fire AFTER the sheet is gone (the GlassSheet handoff race).
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
        enValue: draft.title,
        esValue: draft.title_es,
        setEnValue: (v) => patch({ title: v }),
        setEsValue: (v) => patch({ title_es: v }),
        // Raw, UNCOLLAPSED column values: '' means the manager deliberately
        // cleared this side, null means it was never authored (guides pattern).
        enStored: editing ? editing.title : undefined,
        esStored: editing ? editing.title_es ?? null : undefined,
      },
      {
        key: 'message',
        labelKey: 'translation_section:field_description',
        enValue: draft.message,
        esValue: draft.message_es,
        setEnValue: (v) => patch({ message: v }),
        setEsValue: (v) => patch({ message_es: v }),
        multiline: true,
        enStored: editing ? editing.content ?? editing.message ?? null : undefined,
        esStored: editing ? editing.content_es ?? null : undefined,
      },
    ],
    sessionKey: editing ? `edit:${editing.id}` : `new:${addSessionRef.current}`,
    active: sheetOpen,
  });

  // ── Loading ─────────────────────────────────────────────────────────────────

  const resequence = useCallback(
    async (orderedIds: string[]) => {
      // One gated reorder RPC reindexes the whole list 0..N-1 server-side.
      if (!user?.id || orderedIds.length === 0) return;
      const { error } = await supabase.rpc('reorder_upcoming_events', {
        p_actor_id: user.id,
        p_ordered_ids: orderedIds,
      });
      if (error) console.error('Error resequencing event display orders:', error);
    },
    [user?.id]
  );

  const load = useCallback(
    async (sweep = false) => {
      // Logout race: an empty actor would reach the uuid RPC param as '' (22P02).
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        // The expiry sweep replaces delete_expired_upcoming_events: it deletes
        // expired specials + events server-side and hands back every pending
        // file for the org, which a manager broker-deletes (fire-and-forget).
        if (sweep) await sweepExpiredContent(user.id, true);
        const { data, error } = await supabase.rpc('get_upcoming_events', {
          p_actor_id: user.id,
          p_include_inactive: true,
        });
        if (error) throw error;
        const rows = (data || []) as UpcomingEvent[];
        // Expiry leaves holes in display_order; close them exactly as the old
        // cleanup did — the surviving ids, in order, to reorder_upcoming_events.
        if (sweep && rows.some((r, i) => r.display_order !== i)) {
          await resequence(rows.map((r) => r.id));
        }
        setEvents(rows);
        setAttachments(await fetchContentAttachmentsBatch(user.id, 'upcoming_event', rows.map((r) => r.id)));
      } catch (error) {
        console.error('Error loading upcoming events:', error);
        Alert.alert(t('common:error'), t('upcoming_events_editor:load_error'));
      } finally {
        setLoading(false);
      }
    },
    [user?.id, resequence, t]
  );

  // Fires on the initial focus too, so this is mount + every refocus.
  useFocusEffect(useCallback(() => void load(true), [load]));

  // ── Open / close ────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditing(null);
    hadFileRef.current = false;
    setDraft(EMPTY_DRAFT);
    addSessionRef.current += 1;
    setStep(STEP_BASICS);
    setVisited(STEP_BASICS);
    setSheetOpen(true);
  };

  /** The row's guide, for the Extras chip: get_guides carries the category the
   *  row's guide_file jsonb lacks; the jsonb is the fallback. */
  const resolveGuide = async (ev: UpcomingEvent): Promise<GuidePick | null> => {
    if (!ev.guide_file_id || !user?.id) return null;
    const { data, error } = await supabase.rpc('get_guides', { p_actor_id: user.id });
    if (error) console.error('Error loading guides for event:', error);
    const g = (data || []).find((row) => row.id === ev.guide_file_id);
    if (g) return { id: g.id, title: g.title, category: g.category ?? '', file_name: g.file_name ?? '' };
    const json = ev.guide_file as { id?: string; title?: string; file_name?: string } | null;
    return json?.id ? { id: json.id, title: json.title ?? '', category: '', file_name: json.file_name ?? '' } : null;
  };

  const openEdit = async (item: ContentListItem) => {
    const ev = events.find((e) => e.id === item.id);
    if (!ev) return;
    const stored = attachments.get(ev.id) ?? null;
    hadFileRef.current = !!stored;
    const [extraUrls, guide] = await Promise.all([
      fetchContentImages(user?.id, 'upcoming_event', ev.id),
      stored ? Promise.resolve(null) : resolveGuide(ev),
    ]);
    const attachment: AttachmentDraft | null = stored
      ? { kind: 'file', ...stored, file_type: stored.file_type ?? 'application/octet-stream' }
      : guide
        ? { kind: 'guide', guide }
        : null;
    setEditing(ev);
    setDraft({
      title: ev.title ?? '',
      title_es: ev.title_es ?? '',
      message: ev.content || ev.message || '',
      message_es: ev.content_es ?? '',
      shape: ev.thumbnail_shape === 'banner' ? 'banner' : 'square',
      category: asCategory(ev.category),
      link: ev.link ?? '',
      start: ev.start_date_time ? new Date(ev.start_date_time) : null,
      end: ev.end_date_time ? new Date(ev.end_date_time) : null,
      coverUri: null,
      coverUrl: ev.thumbnail_url ?? null,
      extraUrls,
      extraUris: [],
      attachment,
      notify: false,
    });
    // Edit opens on Review with every step done — one tap deep to any line.
    setStep(STEP_REVIEW);
    setVisited(STEP_REVIEW);
    setSheetOpen(true);
  };

  const goTo = (i: number) => {
    setStep(i);
    setVisited((v) => Math.max(v, i));
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const authorTitle = isSpanishAuthor ? draft.title_es : draft.title;
    const authorMessage = isSpanishAuthor ? draft.message_es : draft.message;
    if (!authorTitle.trim()) {
      goTo(STEP_BASICS);
      Alert.alert(t('common:error'), t('content_editor.error_title_required'));
      return;
    }
    if (!draft.start) {
      goTo(STEP_WHEN);
      Alert.alert(t('common:error'), t('content_editor.start_required'));
      return;
    }
    if (!authorMessage.trim()) {
      goTo(STEP_DETAILS);
      Alert.alert(t('common:error'), t('content_editor.error_message_required'));
      return;
    }
    if (!user?.id) {
      Alert.alert(t('common:error'), t('upcoming_events_editor:error_not_authenticated'));
      return;
    }
    if (!editing && events.length >= CAP) {
      Alert.alert(t('upcoming_events_editor:limit_reached_title'), t('upcoming_events_editor:limit_reached_msg'));
      return;
    }

    setBusy(true);
    try {
      // Fill/refresh the other language per the s61 staleness rules (may ask once).
      const resolved = await translation.resolveOnSave();
      if (!resolved) return;

      // Non-fatal problems (a photo or file that would not upload) are reported
      // AFTER the sheet closes — the row itself still saves.
      const warnings: string[] = [];
      let thumbnailUrl = editing?.thumbnail_url ?? null;
      if (draft.coverUri) {
        const uploaded = await brokerUploadImage('upcoming_event_image', draft.coverUri, user.id);
        if (uploaded) thumbnailUrl = uploaded;
        else warnings.push('upcoming_events_editor:upload_image_error');
      }

      // Prepend https:// when the entered link has no scheme, else it won't open (e.g. "kevahomes.com").
      const rawLink = draft.link.trim();
      const linkValue = rawLink ? (/^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`) : null;
      // A guide pick links the row to Guides & Training; a one-time file (or
      // nothing) leaves guide_file_id empty — the RPCs ASSIGN, so undefined clears.
      const guideFileId = draft.attachment?.kind === 'guide' ? draft.attachment.guide.id : null;
      const params = {
        p_user_id: user.id,
        p_organization_id: organizationId ?? undefined,
        p_title: resolved.title.en,
        p_message: resolved.message.en,
        p_thumbnail_url: thumbnailUrl ?? undefined,
        p_thumbnail_shape: draft.shape,
        p_start_date_time: draft.start.toISOString(),
        p_end_date_time: draft.end?.toISOString(),
        p_link: linkValue ?? undefined,
        p_guide_file_id: guideFileId ?? undefined,
        p_category: draft.category,
      };
      let eventId: string;
      if (editing) {
        const { error } = await supabase.rpc('update_upcoming_event', {
          ...params,
          p_event_id: editing.id,
          p_display_order: editing.display_order,
        });
        if (error) throw error;
        eventId = editing.id;
      } else {
        // create_upcoming_event returns the new row's uuid.
        const { data, error } = await supabase.rpc('create_upcoming_event', {
          ...params,
          p_display_order: events.length,
        });
        if (error) throw error;
        eventId = data as string;
      }

      // The translations RPC COALESCE-keeps a null, so a blank normally means
      // "leave alone". A field is DELIBERATELY CLEARED only when it held text
      // before and resolves blank now — those go over as '' (guides pattern).
      const cleared = (stored: string | null | undefined, next: string) => !!stored?.trim() && !next.trim();
      const clearBlank = editing
        ? [
            cleared(editing.title_es, resolved.title.es) && 'title_es',
            cleared(editing.content_es, resolved.message.es) && 'content_es',
          ].filter((f): f is string => !!f)
        : [];
      await saveTranslations(
        'upcoming_events',
        eventId,
        { title_es: resolved.title.es, content_es: resolved.message.es },
        user.id,
        clearBlank.length ? { clearBlank } : undefined
      );

      // Extra photos: upload the new ones, then replace the full ordered set
      // (an edit always writes — an emptied rail has to clear the stored rows).
      const uploadedExtras: string[] = [];
      for (const uri of draft.extraUris) {
        const url = await uploadImageToStorage(uri, 'upcoming_event', user.id);
        if (url) uploadedExtras.push(url);
      }
      const allExtras = [...draft.extraUrls, ...uploadedExtras];
      if (editing || allExtras.length > 0) {
        await saveContentImages(user.id, 'upcoming_event', eventId, allExtras);
      }

      // One-time attachment: a fresh pick uploads + upserts; a stored file is
      // untouched; removing it (or swapping to a guide) clears the row.
      const att = draft.attachment;
      if (att?.kind === 'file' && att.uri) {
        const fileUrl = await uploadContentAttachment('upcoming_event', att.uri, att.file_name, att.file_type, user.id);
        if (fileUrl) {
          const { file_name, file_type, size_bytes } = att;
          await setContentAttachment(user.id, 'upcoming_event', eventId, { file_url: fileUrl, file_name, file_type, size_bytes });
        } else {
          warnings.push('content_editor.error_upload_failed');
        }
      } else if (att?.kind !== 'file' && hadFileRef.current) {
        await setContentAttachment(user.id, 'upcoming_event', eventId, null);
      }

      // The new event shows in the notification shade live (via the
      // upcoming_events table); the push itself goes out only when Notify is on.
      if (!editing && draft.notify) {
        try {
          const pushTitle = bothLanguages('notifications.new_event_title');
          await sendNotification({
            notificationType: 'event',
            title: pushTitle.en,
            body: resolved.title.en,
            title_es: pushTitle.es,
            // The authored Spanish title when it exists; empty falls back to EN.
            body_es: resolved.title.es || undefined,
            // type + the created row's uuid make the banner tap deep-link
            // (NotificationContext routes to PortalHome's openEventId).
            data: {
              type: 'event',
              eventId,
              category: draft.category,
              startDateTime: draft.start.toISOString(),
            },
          });
        } catch (notificationError) {
          console.error('Failed to send push notification:', notificationError);
        }
      }

      const wasEdit = !!editing;
      defer(() => {
        if (warnings.length > 0) {
          Alert.alert(t('common:error'), warnings.map((k) => t(k)).join('\n'));
        } else {
          Alert.alert(
            wasEdit ? t('content_editor.saved') : t('content_editor.posted'),
            wasEdit ? t('upcoming_events_editor:updated_success') : t('upcoming_events_editor:created_success')
          );
        }
      });
      await load();
    } catch (error: any) {
      console.error('Error saving upcoming event:', error);
      Alert.alert(t('common:error'), translateServerError(error, t('upcoming_events_editor:save_error')));
    } finally {
      setBusy(false);
    }
  };

  // ── Delete / reorder ────────────────────────────────────────────────────────

  const handleDelete = (item: ContentListItem) => {
    const ev = events.find((e) => e.id === item.id);
    if (!ev) return;
    Alert.alert(t('content_editor.delete_confirm_title'), t('content_editor.delete_confirm_body'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('common:delete'),
        style: 'destructive',
        onPress: async () => {
          if (!user?.id) {
            Alert.alert(t('common:error'), t('upcoming_events_editor:error_not_authenticated'));
            return;
          }
          try {
            // Queue thumbnail + extra images + attachment server-side FIRST —
            // the URLs are unreachable once the row is gone.
            const files = await retireContentStorage(user.id, 'upcoming_event', ev.id);
            const { error } = await supabase.rpc('delete_upcoming_event', {
              p_user_id: user.id,
              p_organization_id: organizationId ?? undefined,
              p_event_id: ev.id,
            });
            if (error) throw error;
            await brokerRetire(user.id, files);
            // Close the gap the row leaves in display_order.
            await resequence(events.filter((e) => e.id !== ev.id).map((e) => e.id));
            await load();
          } catch (error: any) {
            console.error('Error deleting upcoming event:', error);
            Alert.alert(t('common:error'), translateServerError(error, t('upcoming_events_editor:delete_error')));
          }
        },
      },
    ]);
  };

  const handleReorder = async (orderedIds: string[]) => {
    // Optimistic: reindex locally, persist, reload only on failure.
    const byId = new Map(events.map((e) => [e.id, e]));
    setEvents(
      orderedIds.flatMap((id, i) => {
        const ev = byId.get(id);
        return ev ? [{ ...ev, display_order: i }] : [];
      })
    );
    if (!user?.id) return;
    const { error } = await supabase.rpc('reorder_upcoming_events', {
      p_actor_id: user.id,
      p_ordered_ids: orderedIds,
    });
    if (error) {
      console.error('Error persisting event reorder:', error);
      await load();
    }
  };

  // ── List rows ───────────────────────────────────────────────────────────────

  const categoryLabel = useCallback(
    (c: EventCategory) => t(c === 'Entertainment' ? 'upcoming_events_editor:category_entertainment' : 'upcoming_events_editor:category_event'),
    [t]
  );

  const items = useMemo<ContentListItem[]>(() => {
    const q = search.trim().toLowerCase();
    const rows = events.map((ev, i) => {
      const category = asCategory(ev.category);
      const att = attachments.get(ev.id);
      const meta = [`#${i + 1}`];
      if (ev.start_date_time) meta.push(fmtWhen(new Date(ev.start_date_time), locale));
      if (att) meta.push(t('content_editor.preview_file'));
      else if (ev.guide_file_id) meta.push(t('content_editor.preview_guide'));
      if (ev.link) meta.push(t('content_editor.preview_link'));
      return {
        row: ev,
        item: {
          id: ev.id,
          title: getLocalizedField(ev, 'title', language) || t('content_editor.preview_untitled'),
          meta: meta.join(' · '),
          thumbnailUrl: ev.thumbnail_url ?? null,
          shape: (ev.thumbnail_shape === 'banner' ? 'banner' : 'square') as ContentListItem['shape'],
          pill: {
            label: categoryLabel(category),
            color: categoryHue(category, isDark),
            iosIcon: category === 'Entertainment' ? 'music.note' : 'ticket.fill',
            androidIcon: category === 'Entertainment' ? 'music-note' : 'confirmation-number',
          },
        },
      };
    });
    if (!q) return rows.map((r) => r.item);
    return rows
      .filter(({ row }) =>
        [row.title, row.title_es, row.content, row.message, row.content_es].some((s) => !!s && s.toLowerCase().includes(q))
      )
      .map((r) => r.item);
  }, [events, attachments, search, language, locale, isDark, t, categoryLabel]);

  // ── Sheet: steps, review lines, preview ─────────────────────────────────────

  const steps = useMemo<StepDef[]>(
    () => [
      { key: 'basics', label: t('content_editor.step_basics') },
      { key: 'when', label: t('content_editor.step_when') },
      { key: 'details', label: t('content_editor.step_details') },
      { key: 'extras', label: t('content_editor.step_extras') },
      { key: 'review', label: t('content_editor.step_review') },
    ],
    [t]
  );

  const authorTitle = isSpanishAuthor ? draft.title_es : draft.title;
  const authorMessage = isSpanishAuthor ? draft.message_es : draft.message;
  const hasLink = draft.link.trim().length > 0;
  const photoCount = (draft.coverUri || draft.coverUrl ? 1 : 0) + draft.extraUrls.length + draft.extraUris.length;
  const bothLanguagesFilled = !!draft.title.trim() && !!draft.title_es.trim();
  const attachmentLabel =
    draft.attachment?.kind === 'guide'
      ? t('content_editor.preview_guide')
      : draft.attachment
        ? t('content_editor.preview_file')
        : null;

  const reviewLines: ReviewLine[] = [
    {
      key: 'basics',
      iosIcon: 'textformat',
      androidIcon: 'title',
      label: t('content_editor.step_basics'),
      value: [
        categoryLabel(draft.category),
        draft.shape === 'banner' ? t('content_editor.shape_banner') : t('content_editor.shape_square'),
        photoCount > 0 ? t('content_editor.photos_count', { count: photoCount }) : t('content_editor.no_photo'),
      ].join(' · '),
      onPress: () => goTo(STEP_BASICS),
    },
    {
      key: 'when',
      iosIcon: 'calendar',
      androidIcon: 'event',
      label: t('content_editor.step_when'),
      value: draft.start ? fmtRange(draft.start, draft.end, locale) : t('content_editor.start_required'),
      missing: !draft.start,
      onPress: () => goTo(STEP_WHEN),
    },
    {
      key: 'details',
      iosIcon: 'doc.text',
      androidIcon: 'article',
      label: t('content_editor.step_details'),
      value: bothLanguagesFilled ? t('content_editor.lang_en_es') : t('content_editor.lang_en_only'),
      onPress: () => goTo(STEP_DETAILS),
    },
    {
      key: 'extras',
      iosIcon: 'paperclip',
      androidIcon: 'attach-file',
      label: t('content_editor.step_extras'),
      value: [
        hasLink ? t('content_editor.preview_link') : t('content_editor.no_link'),
        draft.attachment?.kind === 'guide'
          ? t('content_editor.guide_attached')
          : draft.attachment
            ? t('content_editor.file_attached')
            : t('content_editor.no_attachment'),
      ].join(' · '),
      onPress: () => goTo(STEP_EXTRAS),
    },
  ];

  const renderStep = () => {
    switch (step) {
      case STEP_BASICS:
        return (
          <>
            <StepTitle title={t('content_editor.basics_title_event')} subtitle={t('content_editor.basics_subtitle_event')} />
            <FieldLabel label={t('content_editor.field_title')} />
            <GlassTextInput
              value={authorTitle}
              onChangeText={(text) => patch(isSpanishAuthor ? { title_es: text } : { title: text })}
              placeholder={t('upcoming_events_editor:event_title_placeholder')}
            />
            <FieldLabel label={t('content_editor.field_category')} />
            <SegControl<EventCategory>
              value={draft.category}
              onChange={(category) => patch({ category })}
              options={[
                {
                  key: 'Event',
                  label: t('upcoming_events_editor:category_event'),
                  iosIcon: 'ticket.fill',
                  androidIcon: 'confirmation-number',
                  activeColor: categoryHue('Event', isDark),
                },
                {
                  key: 'Entertainment',
                  label: t('upcoming_events_editor:category_entertainment'),
                  iosIcon: 'music.note',
                  androidIcon: 'music-note',
                  activeColor: categoryHue('Entertainment', isDark),
                },
              ]}
            />
            <CoverPhotoField
              coverUri={draft.coverUri}
              coverUrl={draft.coverUrl}
              shape={draft.shape}
              onShapeChange={(shape) => patch({ shape })}
              onCoverPicked={(uri) => patch({ coverUri: uri })}
              extraUrls={draft.extraUrls}
              extraUris={draft.extraUris}
              onExtraPicked={(uri) => setDraft((d) => ({ ...d, extraUris: [...d.extraUris, uri] }))}
              onRemoveExtraUrl={(i) => setDraft((d) => ({ ...d, extraUrls: d.extraUrls.filter((_, k) => k !== i) }))}
              onRemoveExtraUri={(i) => setDraft((d) => ({ ...d, extraUris: d.extraUris.filter((_, k) => k !== i) }))}
            />
          </>
        );
      case STEP_WHEN:
        return (
          <>
            <StepTitle title={t('content_editor.when_title_event')} subtitle={t('content_editor.when_subtitle_event')} />
            <DateTimeField
              label={t('content_editor.field_starts')}
              value={draft.start}
              placeholder={t('content_editor.pick_date')}
              // Keep end ≥ start: an end the new start has passed is dropped.
              onChange={(start) =>
                setDraft((d) => ({ ...d, start, end: d.end && start && d.end < start ? null : d.end }))
              }
            />
            <DateTimeField
              label={t('content_editor.field_ends')}
              labelTrailing={t('content_editor.optional')}
              value={draft.end}
              placeholder={t('content_editor.pick_end_date')}
              hint={t('content_editor.ends_hint_event')}
              minimumDate={draft.start ?? undefined}
              seed={draft.start ?? undefined}
              onChange={(end) => patch({ end })}
            />
            {draft.start ? (
              <InfoRow
                iosIcon="calendar.badge.clock"
                androidIcon="event-available"
                title={t('content_editor.lands_on', {
                  date: draft.start.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' }),
                })}
                subtitle={t('content_editor.lands_on_hint')}
              />
            ) : (
              <InfoRow iosIcon="calendar.badge.exclamationmark" androidIcon="event-busy" title={t('content_editor.start_required')} />
            )}
          </>
        );
      case STEP_DETAILS:
        return (
          <>
            <StepTitle title={t('content_editor.details_title')} subtitle={t('content_editor.details_subtitle')} />
            <RichTextField
              label={t('content_editor.field_description')}
              value={authorMessage}
              onChangeText={(text) => patch(isSpanishAuthor ? { message_es: text } : { message: text })}
              placeholder={t('upcoming_events_editor:description_placeholder')}
            />
            {translation.element}
          </>
        );
      case STEP_EXTRAS:
        return (
          <>
            <StepTitle title={t('content_editor.extras_title')} subtitle={t('content_editor.extras_subtitle')} />
            <FieldLabel label={t('content_editor.field_link')} trailing={t('content_editor.optional')} />
            <GlassTextInput
              value={draft.link}
              onChangeText={(link) => patch({ link })}
              placeholder={t('upcoming_events_editor:link_placeholder')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Hint>{t('content_editor.link_hint')}</Hint>
            {!!user?.id && (
              <AttachmentField
                contentKind="upcoming_event"
                value={draft.attachment}
                onChange={(attachment) => patch({ attachment })}
                actorId={user.id}
              />
            )}
          </>
        );
      default:
        return (
          <ReviewStep editing={!!editing}
            preview={{
              kind: 'upcoming_event',
              title: authorTitle,
              body: authorMessage,
              coverUri: draft.coverUri,
              coverUrl: draft.coverUrl,
              shape: draft.shape,
              category: draft.category,
              startDateTime: draft.start,
              endDateTime: draft.end,
              hasLink,
              attachmentLabel,
              eyebrow: t('content_editor.preview_eyebrow_event'),
            }}
            lines={reviewLines}
            notify={editing ? undefined : { value: draft.notify, onChange: (notify) => patch({ notify }) }}
          />
        );
    }
  };

  return (
    <ContentListScreen
      title={t('upcoming_events_editor:title')}
      eyebrow={t('content_editor.eyebrow_manage')}
      emptyIconIos="music.note.list"
      emptyIconAndroid="event"
      items={items}
      total={events.length}
      max={CAP}
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('upcoming_events_editor:search_placeholder')}
      countLabel={t('upcoming_events_editor:count_label', { count: events.length })}
      onAdd={openAdd}
      onEdit={(item) => void openEdit(item)}
      onDelete={handleDelete}
      onReorder={(ids) => void handleReorder(ids)}
      emptyTitle={t('upcoming_events_editor:empty_title')}
      emptyBody={t('upcoming_events_editor:empty_body')}
      limitTitle={t('upcoming_events_editor:limit_reached_title')}
      limitMessage={t('upcoming_events_editor:limit_reached_msg')}
    >
      <StepSheet
        visible={sheetOpen}
        onClose={closeSheet}
        onDismiss={onDismiss}
        title={editing ? t('upcoming_events_editor:modal_edit') : t('upcoming_events_editor:modal_add')}
        subtitle={editing ? t('content_editor.sheet_subtitle_edit') : t('content_editor.sheet_subtitle_new')}
        steps={steps}
        step={step}
        onStepChange={goTo}
        visited={visited}
        primaryLabel={editing ? t('content_editor.save_changes') : t('content_editor.post_event')}
        nextLabel={t('content_editor.next')}
        backLabel={t('content_editor.back')}
        cancelLabel={t('common:cancel')}
        onPrimary={() => void handleSave()}
        busy={busy}
      >
        {renderStep()}
      </StepSheet>
    </ContentListScreen>
  );
}
