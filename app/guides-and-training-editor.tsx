
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import HeaderNavButton from '@/components/HeaderNavButton';
import ScreenHeader from '@/components/ScreenHeader';
import AmbientGlow from '@/components/AmbientGlow';
import GlassCard from '@/components/GlassCard';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import CategorySheet, { CategoryOption } from '@/components/CategorySheet';
import GlassActionSheet from '@/components/GlassActionSheet';
import OrderPositionModal from '@/components/OrderPositionModal';
import BottomNavBar from '@/components/BottomNavBar';
import JoltOverlay, { setJoltDockTarget } from '@/components/JoltOverlay';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { brokerUploadImage, brokerUploadFile, brokerDelete } from '@/utils/storageBroker';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { useLanguage } from '@/contexts/LanguageContext';
import { saveTranslations, getLocalizedField } from '@/utils/translateContent';
import { useTranslationSection } from '@/components/TranslationSection';
import { translateServerError } from '@/utils/serverErrors';
import { formatShortDate } from '@/utils/dateUtils';
import { fonts } from '@/constants/fonts';

interface GuideItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  thumbnail_url: string | null;
  file_url: string;
  file_type: string;
  file_name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  title_es?: string | null;
  description_es?: string | null;
}

// A row of the org's `guide_categories` table. `name` is the DB value stored in
// `guides_and_training.category` — NEVER translated, because the filter
// predicate and every guide row compare against it. `name_es` is display only.
interface GuideCategory {
  id: string;
  name: string;
  name_es: string | null;
  // Non-null marks a BUILT-IN: renameable and hideable per org, but the delete
  // RPC refuses it outright, so the sheet shows a lock in place of the trash.
  system_key: string | null;
  display_order: number;
  is_hidden: boolean;
}

// Sentinel for the filter's ALL row. Underscored so nobody types it by
// accident — but it CAN be typed, so confirmNewCategory rejects it outright
// (a category actually named this would be swallowed by the ALL filter).
const ALL_CATEGORY = '__all__';

// EVERY server path that matches a category name does it with lower(): the
// seed's adopt arm, the rename cascade, the delete guard, the unique index, and
// get_guides' hidden-category filter. The client MUST match the same way — an
// exact-case join silently drops a guide whose category differs only in case
// from every list, count, badge and search result, with no error and no empty
// state to hint at it. Only the MATCHING is case-insensitive: what gets PRINTED
// is always the stored name or its translated label.
// KEEP IDENTICAL to the copy in guides-and-training.tsx.
const catKey = (name: string) => name.toLowerCase();

// The tie-break INSIDE a category: stored slot, then oldest first, then id. It
// is a TOTAL order on purpose — two guides sharing a display_order (a legacy
// duplicate) must land the same way every time. Every path that sequences
// guides runs through it (the visible list, the per-category position numbers,
// the delete resequence), because a resequence that sorted differently from the
// list would renumber rows into an order the manager never saw.
const orderWithinCategory = (a: GuideItem, b: GuideItem) =>
  (a.display_order ?? 0) - (b.display_order ?? 0) ||
  (a.created_at || '').localeCompare(b.created_at || '') ||
  a.id.localeCompare(b.id);

export default function GuidesAndTrainingEditorScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const colors = useThemeColors();
  const { language } = useLanguage();
  const [guides, setGuides] = useState<GuideItem[]>([]);
  // The org's categories, in the server's display_order. HIDDEN ONES INCLUDED
  // (p_include_hidden: true) — the editor is the only place a hidden category
  // can be un-hidden, and its guides still have to be listed, filed and re-filed
  // while it is hidden. The staff screen is the one that leaves them out.
  const [categories, setCategories] = useState<GuideCategory[]>([]);
  // The same list, readable from a handler that has already awaited. Assigned in
  // render (the shape `lastAction`/`lastPosition` below already use) rather than
  // in an effect, so it is current the instant the list is: submitRename waits
  // on a translate round-trip that can take seconds and can put a prompt in
  // front of the manager, and the render closure's `categories` is a snapshot
  // from before all of that.
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGuide, setEditingGuide] = useState<GuideItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY);
  const [searchQuery, setSearchQuery] = useState('');

  // Sheet visibility
  const [showFilterCategories, setShowFilterCategories] = useState(false);
  const [showFormCategories, setShowFormCategories] = useState(false);
  const [actionGuide, setActionGuide] = useState<{ guide: GuideItem; index: number } | null>(null);
  const [positionPicker, setPositionPicker] = useState<{ guide: GuideItem; currentIndex: number } | null>(null);
  // Closing a sheet nulls the state its own title/rows are derived from, so the
  // content would blank out for the whole slide-out. Keep rendering the last
  // value while it animates away.
  const lastAction = useRef(actionGuide);
  if (actionGuide) lastAction.current = actionGuide;
  const shownAction = actionGuide ?? lastAction.current;
  const lastPosition = useRef(positionPicker);
  if (positionPicker) lastPosition.current = positionPicker;
  const shownPosition = positionPicker ?? lastPosition.current;

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryFor, setNewCategoryFor] = useState<'filter' | 'form' | null>(null);
  const closeNewCategory = React.useCallback(() => setNewCategoryFor(null), []);
  // Creating from the FILTER sheet ends by presenting the Add sheet, and the two
  // are BOTH root-level Modals — issuing that presentation in the same commit
  // that dismisses this one is exactly the race useSheetHandoff exists for:
  // UIKit silently DROPS a presentation made while a dismissal is still
  // animating, so the Add sheet never appears whenever the reload is fast.
  // `defer` closes this sheet and runs the follow-up on Modal.onDismiss, with a
  // timer backstop so it also works on Android (RN fires onDismiss on iOS only).
  const { defer: deferAfterNewCategory, onDismiss: onNewCategoryDismissed } =
    useSheetHandoff(closeNewCategory);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    // Always replaced by openAddModal/openEditModal before the sheet is shown —
    // there is no constant to seed it from any more.
    category: '',
    display_order: 0,
    title_es: '',
    description_es: '',
  });
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [selectedThumbnailUri, setSelectedThumbnailUri] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);

  // Hybrid bilingual authoring (s61): the primary inputs bind the device
  // language; the shared section shows the other-language preview + translate
  // button + pencil edit. resolveOnSave() runs the staleness rules.
  const isSpanishAuthor = i18n.language === 'es';
  const addSessionRef = useRef(0);
  const translation = useTranslationSection({
    fields: [
      {
        key: 'title',
        labelKey: 'translation_section:field_title',
        enValue: formData.title,
        esValue: formData.title_es,
        setEnValue: (v) => setFormData(prev => ({ ...prev, title: v })),
        setEsValue: (v) => setFormData(prev => ({ ...prev, title_es: v })),
        // Raw, UNCOLLAPSED column values: '' means the manager deliberately
        // cleared this side, null means it was never authored. formData
        // collapses both to '', so the hook can only tell them apart from here.
        enStored: editingGuide ? editingGuide.title : undefined,
        esStored: editingGuide ? editingGuide.title_es ?? null : undefined,
      },
      {
        key: 'description',
        labelKey: 'translation_section:field_description',
        enValue: formData.description,
        esValue: formData.description_es,
        setEnValue: (v) => setFormData(prev => ({ ...prev, description: v })),
        setEsValue: (v) => setFormData(prev => ({ ...prev, description_es: v })),
        multiline: true,
        enStored: editingGuide ? editingGuide.description ?? null : undefined,
        esStored: editingGuide ? editingGuide.description_es ?? null : undefined,
      },
    ],
    sessionKey: editingGuide ? `edit:${editingGuide.id}` : `new:${addSessionRef.current}`,
    active: showAddModal,
  });

  // ── Rename prompt (the filter sheet's edit-mode pencil) ────────────────────
  // `name` is the name AT OPEN. It is only the LAST-RESORT fallback for the
  // cascade — the save reads the current name by id (see submitRename), because
  // this prompt survives a failed save and by the retry this copy can name
  // something no row stores any more.
  const [renameCategory, setRenameCategory] = useState<{ id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameNameEs, setRenameNameEs] = useState('');
  const closeRename = React.useCallback(() => setRenameCategory(null), []);
  // The rename can end in an alert ("the English name saved, the Spanish one
  // did not") raised in the SAME commit that dismisses the sheet the alert would
  // present on. Same race as the ＋New category hand-off above, and the same
  // fix: `defer` closes the prompt and fires the alert on Modal.onDismiss, with
  // the hook's timer backstop so it also lands on Android.
  const { defer: deferAfterRename, onDismiss: onRenameDismissed } = useSheetHandoff(closeRename);
  // Its own bilingual section, configured exactly like manage-menu-categories'
  // rename modal: ONE field, so the manager gets the same Translate button and
  // pencil for a category name that they get for a guide title. Deliberately
  // WITHOUT enStored/esStored — the clear flow is opt-in, and a category with no
  // name is not a thing this prompt can produce anyway (see submitRename).
  const catTranslation = useTranslationSection({
    fields: [
      {
        key: 'display_name',
        labelKey: 'translation_section:field_name',
        enValue: renameName,
        esValue: renameNameEs,
        setEnValue: setRenameName,
        setEsValue: setRenameNameEs,
      },
    ],
    sessionKey: `edit:${renameCategory?.id ?? 'none'}`,
    active: renameCategory !== null,
  });

  useEffect(() => {
    reload();
  }, []);

  // ── Jolt FAB docking ───────────────────────────────────────────────────────
  // The same contract as the staff screen and the Manage command center: hand
  // the corner bolt this search bar's slot coords so it flies in physically.
  // Both guides screens dock to the SAME on-screen position, which is the whole
  // point of keeping the search row identical — the bolt stays put across a
  // user <-> editor switch instead of flying home and back. Clearing the target
  // on blur is mandatory, or the FAB stays pinned to these coords on whatever
  // tab we return to.
  const joltSlotRef = useRef<View>(null);
  const dockActiveRef = useRef(false);
  const focusEpochRef = useRef(0);
  // Mirrors dockActiveRef into render so the slot drops its resting icon only
  // once the bolt is on its way in (a ref alone never re-renders).
  const [joltDocked, setJoltDocked] = useState(false);
  const measureAndDock = React.useCallback(() => {
    if (dockActiveRef.current) return; // already docked this focus
    const node = joltSlotRef.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    // measureInWindow is async: without the focus check an in-flight callback
    // can land AFTER the cleanup and re-arm the module-wide dock target with
    // coordinates no screen owns any more, stranding the bolt there.
    const focusedAt = focusEpochRef.current;
    // Claimed BEFORE the async measure, not inside its callback: onLayout can
    // fire twice before the first callback resolves, and both would dock.
    // Released again below if this measure turns out to be too early.
    dockActiveRef.current = true;
    node.measureInWindow((x: number, y: number, w: number, h: number) => {
      if (focusedAt !== focusEpochRef.current) return; // blurred mid-measure
      if (!w && !h) {
        dockActiveRef.current = false; // not laid out yet — let a retry through
        return;
      }
      setJoltDockTarget({ x: x + w / 2, y: y + h / 2 });
      setJoltDocked(true);
    });
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      reload();
      // The slot's own onLayout fires the first attempt; these are the fallback
      // for when onLayout lands before the window position has settled.
      // measureAndDock is idempotent (dockActiveRef), so the extra calls are free.
      const t1 = setTimeout(measureAndDock, 200);
      const t2 = setTimeout(measureAndDock, 480);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        // Without this the stale-measure guard above is DEAD — nothing ever
        // changes the epoch, so a callback landing after the blur still re-arms
        // the module-wide target with coords no screen owns.
        focusEpochRef.current += 1;
        setJoltDockTarget(null);
        dockActiveRef.current = false;
        setJoltDocked(false);
      };
    }, [measureAndDock])
  );

  const loadGuides = async () => {
    try {
      setLoading(true);

      if (!user?.id) return;
      const { data, error } = await supabase.rpc('get_guides', {
        p_actor_id: user.id,
        p_include_inactive: true,
      });

      if (error) {
        console.error('Error loading guides:', error);
        throw error;
      }

      setGuides(data || []);
    } catch (error) {
      console.error('Error loading guides:', error);
      Alert.alert(t('common.error'), t('guides_training_editor.loading_guides'));
    } finally {
      setLoading(false);
    }
  };

  // Swallows its own failure on purpose: it runs alongside loadGuides on every
  // refresh, and a dead connection must not fire two alerts. An empty list is
  // visible anyway — the Add chip disables and the filter offers only ALL.
  const loadCategories = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.rpc('get_guide_categories', {
        p_actor_id: user.id,
        // The editor shows hidden categories so they can be un-hidden.
        p_include_hidden: true,
      });
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading guide categories:', error);
    }
  };

  // The screen's ONE refresh. Guides and the category table they are filed
  // under always reload together — the ranking, the counts and the filter chip
  // are all derived from both, and another manager can hide or reorder a
  // category between our focuses.
  const reload = async () => {
    await Promise.all([loadGuides(), loadCategories()]);
  };

  // ── Categories ─────────────────────────────────────────────────────────
  // The `guide_categories` rows exactly as the server ordered them. ONE
  // derivation feeds BOTH the filter sheet and the form's picker, so the two can
  // never disagree — and it is the same order the cards group in (categoryRank
  // below reads the same list). Hidden rows stay in: the sheet dims them in edit
  // mode, but they remain selectable as a filter and assignable in the form.
  const categoryOptions = useMemo<CategoryOption[]>(
    () =>
      categories.map(c => ({
        id: c.id,
        name: c.name,
        // Spanish name only for a Spanish reader, falling back to the stored
        // name — the rule getLocalizedField uses everywhere else. `||` rather
        // than a null check, because a name_es of '   ' is not a translation.
        label: language === 'es' && c.name_es?.trim() ? c.name_es.trim() : c.name,
        count: guides.filter(g => catKey(g.category) === catKey(c.name)).length,
        isHidden: c.is_hidden,
        // Drives the lock-instead-of-trash in the filter sheet's edit mode.
        isBuiltIn: c.system_key !== null,
      })),
    [categories, guides, language]
  );
  // The ALL row is SYNTHETIC — no id, so CategorySheet's edit mode never drags
  // or hides it and it can never reach an ordered-ids payload.
  const filterOptions = useMemo<CategoryOption[]>(
    () => [
      { name: ALL_CATEGORY, label: t('guides_training.category_all'), count: guides.length },
      ...categoryOptions,
    ],
    [categoryOptions, guides.length, t]
  );
  // Name -> the label the sheets show, for the places that hold a bare DB value
  // (the filter chip, the form's category row). Falls back to the raw name so a
  // guide filed under a category that has since been deleted still reads.
  const categoryLabel = (name: string) => {
    if (name === ALL_CATEGORY) return t('guides_training.category_all');
    return categoryOptions.find(o => catKey(o.name) === catKey(name))?.label ?? name;
  };

  // The staff screen's counterpart: a category that DISAPPEARS while it is the
  // active filter would otherwise leave the editor parked on a permanently empty
  // list with no hint why (another manager deleted it, or this manager renamed
  // it). Only deletion triggers it here — this screen loads hidden categories
  // too, so hiding one keeps it selectable, which is the point of the editor.
  // The length guard is what keeps a FAILED load from clearing the filter:
  // loadCategories swallows its own error and leaves the list empty.
  useEffect(() => {
    if (
      selectedCategory !== ALL_CATEGORY &&
      categories.length > 0 &&
      !categories.some(c => catKey(c.name) === catKey(selectedCategory))
    ) {
      setSelectedCategory(ALL_CATEGORY);
    }
  }, [categories, selectedCategory]);

  const pickThumbnail = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedThumbnailUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking thumbnail:', error);
      Alert.alert(t('common.error'), t('guides_training_editor.error_failed_thumbnail'));
    }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // The broker's guide_file gate accepts ANY type up to 50MB — the picker
        // list is the only filter, so keep video selectable (session-49 fix).
        type: ['application/pdf', 'image/*', 'video/*', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const file = result.assets[0];
        setSelectedFile({
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream',
        });
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert(t('common.error'), t('guides_training_editor.error_failed_file'));
    }
  };

  const uploadThumbnail = async (uri: string): Promise<string | null> => {
    if (!user?.id) return null;
    try {
      setUploadingThumbnail(true);

      // Upload via the storage broker
      const publicUrl = await brokerUploadImage('guide_thumbnail', uri, user.id);
      if (!publicUrl) {
        throw new Error('Upload failed');
      }

      return publicUrl;
    } catch (error: any) {
      console.error('Error uploading thumbnail:', error);
      Alert.alert(
        t('common.error'),
        t('guides_training_editor.upload_failed_thumbnail', { error: translateServerError(error) })
      );
      return null;
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const uploadFile = async (file: { uri: string; name: string; type: string }): Promise<{ url: string; type: string } | null> => {
    if (!user?.id) return null;
    try {
      setUploadingFile(true);

      // Upload via the storage broker
      const fileUrl = await brokerUploadFile('guide_file', file.uri, file.name, file.type, user.id);
      if (!fileUrl) {
        throw new Error('Upload failed');
      }

      return { url: fileUrl, type: file.type };
    } catch (error: any) {
      console.error('Error uploading file:', error);
      Alert.alert(
        t('common.error'),
        t('guides_training_editor.upload_failed_file', { error: translateServerError(error) })
      );
      return null;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSave = async () => {
    const authorTitle = isSpanishAuthor ? formData.title_es : formData.title;
    // .trim(): every downstream rule trims, so a whitespace-only title used to
    // slip through here and then fall into the clear bucket — blanking BOTH
    // title columns and leaving the guide unnamed everywhere it is listed.
    if (!authorTitle.trim()) {
      Alert.alert(t('common.error'), t('guides_training_editor.error_no_title'));
      return;
    }

    if (!editingGuide && !selectedFile) {
      Alert.alert(t('common.error'), t('guides_training_editor.error_no_file'));
      return;
    }

    if (!user?.id) {
      Alert.alert(t('common.error'), t('guides_training_editor.error_not_authenticated'));
      return;
    }

    // Fill/refresh the other language per the s61 staleness rules (may ask once).
    const resolved = await translation.resolveOnSave();
    if (!resolved) return;

    try {
      let thumbnailUrl = editingGuide?.thumbnail_url || null;
      let fileUrl = editingGuide?.file_url || '';
      let fileType = editingGuide?.file_type || '';
      let fileName = editingGuide?.file_name || '';

      // Upload thumbnail if selected
      if (selectedThumbnailUri) {
        const uploadedUrl = await uploadThumbnail(selectedThumbnailUri);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
        }
      }

      // Upload file if selected
      if (selectedFile) {
        const uploadedFile = await uploadFile(selectedFile);
        if (uploadedFile) {
          fileUrl = uploadedFile.url;
          fileType = uploadedFile.type;
          fileName = selectedFile.name;
        } else {
          Alert.alert(t('common.error'), t('guides_training_editor.error_upload_file'));
          return;
        }
      }

      if (editingGuide) {
        // A field is DELIBERATELY CLEARED only when it held text before and
        // resolves blank now — never when it was simply never authored. That
        // distinction is what the '' marker means, so widening it would
        // permanently suppress auto-fill on guides that never had a translation.
        const cleared = (stored: string | null | undefined, next: string) =>
          !!stored?.trim() && !next.trim();
        const clearBlank = [
          cleared(editingGuide.title_es, resolved.title.es) && 'title_es',
          cleared(editingGuide.description_es, resolved.description.es) && 'description_es',
        ].filter((f): f is string => !!f);

        const { error } = await supabase.rpc('update_guide', {
          p_user_id: user.id,
          p_guide_id: editingGuide.id,
          p_title: resolved.title.en,
          // update_guide ASSIGNS (no COALESCE), so a blank English side has to
          // decide between the two markers every time: null = never authored
          // (auto-fill is welcome), '' = deliberately cleared (it must not be).
          // Keyed on the STORED value rather than "was it cleared in THIS
          // session", because a later save that never touches the description
          // would otherwise downgrade '' back to null and let auto-fill refill
          // it — the clear would survive exactly one more save.
          p_description:
            resolved.description.en || (editingGuide.description == null ? null : ''),
          p_category: formData.category,
          p_thumbnail_url: thumbnailUrl,
          p_file_url: fileUrl,
          p_file_type: fileType,
          p_file_name: fileName,
          // The RPC still REQUIRES a display_order; an edit keeps the guide's
          // stored slot (a 0 here would jump it to the top of its category).
          // A CATEGORY CHANGE moves it into a different slot space, though, so
          // it takes a fresh slot there exactly like the add path — carrying the
          // old number across would duplicate one already in use over there, and
          // the form has no numeric field left to correct it with.
          p_display_order:
            catKey(formData.category) === catKey(editingGuide.category)
              ? editingGuide.display_order
              : nextOrderFor(formData.category),
          p_organization_id: organizationId ?? undefined,
        });

        if (error) {
          console.error('Error updating guide:', error);
          throw error;
        }
        // The translations RPC COALESCE-keeps a null, so a blank normally means
        // "leave alone". `clearBlank` names the fields where blank means the
        // manager confirmed a clear, and those go over as '' to overwrite.
        //
        // Reported AFTER this write, and only if it succeeded. The two writes
        // are separate RPCs with no transaction, so announcing success first
        // meant a dropped connection could blank the English, keep the Spanish,
        // and still tell the manager both languages were cleared.
        const translationsSaved = await saveTranslations('guides_and_training', editingGuide.id, {
          title_es: resolved.title.es,
          description_es: resolved.description.es,
        }, user?.id, clearBlank.length ? { clearBlank } : undefined);
        Alert.alert(
          translationsSaved ? t('common.success') : t('common.error'),
          translationsSaved
            ? t('guides_training_editor.guide_updated')
            : t('guides_training_editor.translations_failed')
        );
      } else {
        const { data: newGuideId, error } = await supabase.rpc('create_guide', {
          p_user_id: user.id,
          p_title: resolved.title.en,
          p_description: resolved.description.en || null,
          p_category: formData.category,
          p_thumbnail_url: thumbnailUrl,
          p_file_url: fileUrl,
          p_file_type: fileType,
          p_file_name: fileName,
          p_display_order: formData.display_order,
          p_organization_id: organizationId ?? undefined,
        });

        if (error) {
          console.error('Error creating guide:', error);
          throw error;
        }
        Alert.alert(t('common.success'), t('guides_training_editor.guide_created'));

        // Save Spanish translations for newly created item
        if (newGuideId) {
          await saveTranslations('guides_and_training', newGuideId, {
            title_es: resolved.title.es,
            description_es: resolved.description.es,
          }, user?.id);
        }
      }

      closeModal();
      await reload();
    } catch (error: any) {
      console.error('Error saving guide:', error);
      Alert.alert(t('common.error'), translateServerError(error, t('guides_training_editor.save_failed')));
    }
  };

  const handleDelete = async (guide: GuideItem) => {
    Alert.alert(
      t('guides_training_editor.delete_title'),
      // The localized title — the same string the card shows, so a Spanish
      // manager is not asked to confirm a name they never saw.
      t('guides_training_editor.delete_confirm', { title: getLocalizedField(guide, 'title', language) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            try {
              const { error } = await supabase.rpc('delete_guide', {
                p_user_id: user?.id,
                p_guide_id: guide.id,
                p_organization_id: organizationId ?? undefined,
              });

              if (error) {
                console.error('Error deleting guide:', error);
                throw error;
              }

              // Delete files from storage via the broker
              await brokerDelete('guides-and-training', [guide.thumbnail_url, guide.file_url], user.id);

              // Close display_order gaps in this category so a later add
              // (display_order = category count) can never collide. Sorting by
              // display_order ALONE would let a duplicate slot resequence into
              // whatever order Postgres returned, so it uses the list's own
              // comparator — the new numbers must match what the manager saw.
              const remaining = guides
                .filter(g => g.id !== guide.id && catKey(g.category) === catKey(guide.category))
                .sort(orderWithinCategory);
              if (remaining.length > 0) {
                const { error: reorderError } = await supabase.rpc('reorder_guides', {
                  p_actor_id: user.id,
                  p_ordered_ids: remaining.map(g => g.id),
                });
                if (reorderError) {
                  console.error('Error resequencing guide display orders:', reorderError);
                }
              }

              Alert.alert(t('common.success'), t('guides_training_editor.guide_deleted'));
              await reload();
            } catch (error: any) {
              console.error('Error deleting guide:', error);
              Alert.alert(t('common.error'), translateServerError(error, t('guides_training_editor.delete_failed')));
            }
          },
        },
      ]
    );
  };

  // Persist a category's new order. `ordered` is that category's guides in
  // their new sequence; display_order is written 0..n-1 by the RPC and mirrored
  // into local state so the sorted derived list re-renders immediately.
  const persistOrder = async (ordered: GuideItem[]) => {
    if (!user?.id) return;
    const orderMap = new Map(ordered.map((g, idx) => [g.id, idx]));
    setGuides((prev) =>
      prev.map((g) => (orderMap.has(g.id) ? { ...g, display_order: orderMap.get(g.id)! } : g))
    );
    try {
      const { error } = await supabase.rpc('reorder_guides', {
        p_actor_id: user.id,
        p_ordered_ids: ordered.map((g) => g.id),
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error reordering guides:', error);
      await reload();
    }
  };

  const handleMove = (index: number, dir: -1 | 1) => {
    if (!canReorder) return;
    const target = index + dir;
    if (target < 0 || target >= filteredGuides.length) return;
    const reordered = [...filteredGuides];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    persistOrder(reordered);
  };

  const handleDragEnd = ({ data }: { data: GuideItem[] }) => {
    if (!canReorder) return;
    persistOrder(data);
  };

  const applyPositionChange = (newPosition: number) => {
    if (!positionPicker) return;
    const oldIndex = positionPicker.currentIndex;
    const newIndex = Math.max(0, Math.min(filteredGuides.length - 1, newPosition - 1));
    setPositionPicker(null);
    // Defence in depth: reorder_guides renumbers whatever ids it is handed, so
    // every order-persisting path re-checks canReorder rather than trusting the
    // action sheet's `disabled` prop a component away. Closes the sheet first —
    // an ignored tap must not leave it stuck open.
    if (!canReorder) return;
    if (newIndex === oldIndex) return;
    const reordered = [...filteredGuides];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    persistOrder(reordered);
  };

  // Highest + 1, not the category count: if a resequence ever fails and
  // leaves a gap, a count would collide with an existing display_order.
  const nextOrderFor = (category: string) =>
    guides
      .filter(g => catKey(g.category) === catKey(category))
      .reduce((max, g) => Math.max(max, (g.display_order ?? 0) + 1), 0);

  const openAddModal = (category?: string) => {
    // Under the ALL filter there is no category to inherit, so fall back to the
    // org's first VISIBLE category (the server's display_order) rather than
    // writing the sentinel into the DB column. Visible, not simply `[0]`: this
    // screen loads hidden categories too (p_include_hidden), so the first row
    // can be one staff cannot see — filing a guide there by DEFAULT publishes it
    // straight into a hole. If EVERY category is hidden there is no better slot
    // than the first, and that is a deliberate choice: the guide has to be filed
    // somewhere, the manager can re-file it, and the picker shows where it went.
    const fallback = categories.find(c => !c.is_hidden) ?? categories[0];
    const target = category ?? (selectedCategory === ALL_CATEGORY ? fallback?.name : selectedCategory);
    // An org with no categories has nowhere to file a guide. The Add chip is
    // disabled for exactly this case (canAddGuide); bailing here is the belt to
    // that brace — the old code would have written a constant that no longer
    // exists, i.e. `undefined`, straight into the DB `category` column.
    if (!target) return;
    setEditingGuide(null);
    setFormData({
      title: '',
      description: '',
      category: target,
      display_order: nextOrderFor(target),
      title_es: '',
      description_es: '',
    });
    setSelectedThumbnailUri(null);
    setSelectedFile(null);
    addSessionRef.current += 1;
    setShowAddModal(true);
  };

  const openEditModal = (guide: GuideItem) => {
    setEditingGuide(guide);
    setFormData({
      title: guide.title,
      description: guide.description || '',
      category: guide.category,
      display_order: guide.display_order,
      title_es: guide.title_es || '',
      description_es: guide.description_es || '',
    });
    setSelectedThumbnailUri(null);
    setSelectedFile(null);
    setShowAddModal(true);
  };

  const selectFormCategory = (name: string) => {
    setFormData(prev => ({
      ...prev,
      category: name,
      // A NEW guide's slot belongs to whichever category it lands in — recompute
      // it, or switching category would carry the old one's order across and
      // collide there. An EDIT keeps its stored slot (see handleSave).
      display_order: editingGuide ? prev.display_order : nextOrderFor(name),
    }));
  };

  // ── Category writes ───────────────────────────────────────────────────────
  // ONE in-flight flag for the whole `guide_categories` lane (create, hide,
  // reorder). Every writer here is last-write-wins and ends with a reload that
  // is the AUTHORITATIVE settle, so two overlapping writes can settle the DB
  // opposite to the tap order AND let the first write's reload land on top of
  // the second's optimistic state. Serialising the lane removes both: a second
  // invocation while one is pending is ignored outright, and the flag is not
  // released until that writer's own reload has landed, so no reload can ever be
  // stale by the time the next write starts. A dropped tap costs one repeat; the
  // races cost a category order or visibility that silently disagrees with the
  // screen. Set immediately before the RPC and cleared in `finally`.
  const categoryWriteRef = useRef(false);

  // The lane guard, for the two callers that reach it having ALREADY spent the
  // manager's intent: the delete confirmation they accepted, and the rename's
  // translate round-trip they answered. Returning silently there reads as "the
  // app ate my delete" — the dropped-tap-costs-one-repeat bargain above only
  // holds while the guard sits in FRONT of a bare tap, which is why the hide /
  // reorder / create guards stay silent and these two do not.
  const categoryLaneBusy = () => {
    if (!categoryWriteRef.current) return false;
    Alert.alert(t('common.error'), t('guides_training_editor.category_save_failed'));
    return true;
  };

  // The new category RPCs' RAISE strings are not in the SHARED serverErrors map,
  // and translateServerError returns ANY non-empty message verbatim — so these
  // reach a Spanish manager in English, while the localized fallback each caller
  // passes is effectively dead (it fires only on an EMPTY message, where the
  // create path then wrongly blames a duplicate). Map them here, in the one
  // screen that calls these RPCs; utils/serverErrors.ts is shared by every
  // editor and is not ours to widen. Anything unrecognised still goes through
  // translateServerError, which keeps the mapped shared guards ('Not
  // authorized', 'Invalid actor', …) localized.
  const categoryErrorMessage = (
    error: { message?: string | null } | null | undefined,
    name?: string
  ) => {
    const msg = (error?.message || '').trim();
    // The two with something specific to say — and the only paths that have a
    // name to interpolate. Without one, fall through to the generic line rather
    // than print a quoted blank.
    if (msg === 'Category already exists' && name) {
      return t('guides_training_editor.new_category_duplicate', { name });
    }
    // The RPCs' own 'Category already exists' is a PRE-check, and a pre-check
    // cannot win a race. The thing that actually stops two managers creating (or
    // renaming onto) the same name in the same instant is the unique index on
    // `lower(name)` — and Postgres reports THAT as raw English ('duplicate key
    // value violates unique constraint "guide_categories_org_lname_key"'). From
    // the manager's side it is the same fact, so it gets the same line.
    if (msg.includes('guide_categories_org_lname_key')) {
      return name
        ? t('guides_training_editor.new_category_duplicate', { name })
        : t('guides_training_editor.category_save_failed');
    }
    if (msg === 'Category still has guides' && name) {
      return t('guides_training_editor.delete_category_has_guides', { name });
    }
    // startsWith, not ===: the LIVE function raises exactly this, but the repo's
    // migration copy (supabase/migrations/20260806120000_guide_categories.sql)
    // still carries a trailing "— hide it instead". Either spelling has to map,
    // or a re-apply of that file would put raw English in front of a manager.
    if (msg.startsWith('Built-in categories cannot be deleted')) {
      return t('guides_training_editor.builtin_locked');
    }
    if (
      msg === 'Category already exists' ||
      msg === 'Category name required' ||
      msg === 'Category still has guides' ||
      msg === 'Reorder must list every category in your organization exactly once' ||
      msg === 'Not found in your organization'
    ) {
      return t('guides_training_editor.category_save_failed');
    }
    return translateServerError(error, t('guides_training_editor.category_save_failed'));
  };

  // ── Category edit mode (the FILTER sheet's Edit toggle) ────────────────────
  // Both writers follow the same shape: move local state first so the eye flips
  // (and the row lands) under the finger, write, then re-read. The re-read runs
  // in `finally` on purpose — it is what confirms the optimistic change AND what
  // silently undoes it when the write failed, so neither needs a snapshot.
  const handleToggleCategoryHidden = async (id: string, nextHidden: boolean) => {
    if (!user?.id) return;
    // Guarded BEFORE the optimistic flip: an ignored tap must not move the eye
    // to a state no write is backing — and it says so rather than doing nothing.
    if (categoryLaneBusy()) return;
    categoryWriteRef.current = true;
    setCategories(prev => prev.map(c => (c.id === id ? { ...c, is_hidden: nextHidden } : c)));
    try {
      const { error } = await supabase.rpc('manage_guide_category_set_hidden', {
        p_actor_id: user.id,
        p_id: id,
        p_is_hidden: nextHidden,
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Error updating category visibility:', error);
      Alert.alert(t('common.error'), categoryErrorMessage(error));
    } finally {
      // The reload stays INSIDE the lane (that is the whole point of the flag)
      // — but it must never be able to STRAND it. A throw between here and the
      // release would wedge every category write for the rest of the session,
      // with no symptom but taps that quietly do nothing.
      try {
        await loadCategories();
      } finally {
        categoryWriteRef.current = false;
      }
    }
  };

  const handleReorderCategories = async (orderedIds: string[]) => {
    if (!user?.id) return;
    // Reported, not dropped: a drag is work the manager committed to, and the
    // settling reload snaps the rows back — silence reads as "the app undid my
    // drag" rather than "that didn't go through".
    if (categoryLaneBusy()) return;
    categoryWriteRef.current = true;
    setCategories(prev => {
      const byId = new Map(prev.map(c => [c.id, c]));
      const moved = orderedIds
        .map(id => byId.get(id))
        .filter((c): c is GuideCategory => !!c);
      // Anything the sheet did not name keeps its place at the end. It cannot
      // happen today (edit mode drags every real row), but dropping a category
      // from local state would drop its guides out of the ranking with it.
      const rest = prev.filter(c => !orderedIds.includes(c.id));
      return [...moved, ...rest].map((c, i) => ({ ...c, display_order: i }));
    });
    try {
      const { error } = await supabase.rpc('manage_guide_category_reorder', {
        p_actor_id: user.id,
        p_ordered_ids: orderedIds,
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Error reordering categories:', error);
      Alert.alert(t('common.error'), categoryErrorMessage(error));
    } finally {
      // Release guaranteed even if the reload throws — see the note above.
      try {
        await loadCategories();
      } finally {
        categoryWriteRef.current = false;
      }
    }
  };

  // The pencil. Seeds BOTH language inputs in one commit so the bilingual
  // section baselines its session against the stored pair rather than a blank
  // one (it reads the field values on the render the prompt opens).
  const openRenameCategory = (id: string) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    setRenameName(cat.name);
    setRenameNameEs(cat.name_es || '');
    setRenameCategory({ id: cat.id, name: cat.name });
  };

  const submitRename = async () => {
    const target = renameCategory;
    if (!target || !user?.id) return;
    // The author side is the one bound to the visible input — an empty rename
    // is a no-op, not an error worth an alert.
    if (!(isSpanishAuthor ? renameNameEs : renameName).trim()) return;

    // Lane check BEFORE the translate round-trip, not after it: resolveOnSave
    // can put a confirmation in front of the manager and can wait on the
    // network, and abandoning the rename once they have answered that is work
    // they already committed to. Re-checked below for the window this await
    // opens — the flag can only be CLAIMED immediately before the RPC.
    if (categoryLaneBusy()) return;

    // Fill/refresh the other language per the s61 staleness rules (may ask once).
    const resolved = await catTranslation.resolveOnSave();
    if (!resolved) return;
    const nextName = resolved.display_name.en.trim();
    // The ENGLISH name is the DB join key every guide row stores, so a blank one
    // would orphan the category from its own guides. resolveOnSave already
    // refuses to hand back a blank English side (en_required); this is the belt
    // to that brace.
    if (!nextName) return;
    const nextEs = resolved.display_name.es.trim();

    // Same lane as create / hide / reorder: all four write `guide_categories`
    // and all four settle from a reload, so they must not interleave.
    if (categoryLaneBusy()) return;
    categoryWriteRef.current = true;
    // The name to cascade FROM, read at SAVE time by id — NOT the copy taken
    // when the pencil was tapped. This prompt deliberately stays open after a
    // failed save, and the failure path reloads before the manager retries, so
    // on the second attempt `target.name` can name something no row stores any
    // more (a save that failed client-side after the server committed is exactly
    // that). The local cascade below would then match no guide and no filter,
    // and every card in the category would drop off the list until the next
    // reload. `categoriesRef`, not the closure: two awaits have happened since
    // this render. Falls back to the open-time name only if the row has gone
    // from the list entirely, where there is nothing better to use.
    const previousName =
      categoriesRef.current.find(c => c.id === target.id)?.name ?? target.name;
    try {
      const { error } = await supabase.rpc('manage_guide_category_rename', {
        p_actor_id: user.id,
        p_id: target.id,
        p_new_name: nextName,
      });
      if (error) throw error;

      // ONLY once the English rename landed — the Spanish is a label ON that
      // row, and writing it against a rename that was rejected as a duplicate
      // would leave the two languages naming different categories.
      //
      // SKIPPED when the Spanish resolves blank. The RPC is
      // `COALESCE(p_name_es, name_es)`, so "leave it alone" is NULL — which this
      // signature cannot express (p_name_es is non-null text) — and '' is a real
      // CLEAR. This prompt never opts into the clear flow, so a blank here means
      // the translation failed, NOT that the manager confirmed a clear; sending
      // '' would wipe a Spanish name nobody asked to remove. Not calling at all
      // is exactly what passing NULL would have done.
      let esFailure: string | null = null;
      if (nextEs) {
        const { error: esError } = await supabase.rpc('update_guide_category_translations_actor', {
          p_actor_id: user.id,
          p_id: target.id,
          p_name_es: nextEs,
        });
        // The rename is already committed and cascaded, so a failed Spanish
        // write is reported but must not read as "the rename failed".
        if (esError) {
          console.error('Error saving category translation:', esError);
          esFailure = categoryErrorMessage(esError);
        }
      }

      // The half-succeeded rename is the ONE outcome the manager has to be told
      // about, so it must not be raised in the same commit that dismisses the
      // sheet it would present on — that is how it ends up torn down with the
      // prompt and never seen. `defer` closes the prompt and fires the alert
      // once the Modal is actually gone, on both platforms.
      if (esFailure) {
        const esMessage = esFailure;
        deferAfterRename(() => Alert.alert(t('common.error'), esMessage));
      } else {
        setRenameCategory(null);
      }
      // ── Follow the rename everywhere the OLD name is still the key ──────────
      // All in ONE commit, ahead of the reload. `guides_and_training.category`
      // stores the NAME, so the server cascaded every guide in this category to
      // `nextName`; until the local copy does the same, the client's
      // case-insensitive join matches nothing and every card in the category
      // drops out of the list (count 0, empty state) until the next focus. The
      // FILTER has to follow too, or the "category vanished" effect would bounce
      // the manager to ALL for renaming the very thing they were looking at —
      // and it has to be the same commit as the categories update, since either
      // one alone leaves that effect looking at a name it cannot find.
      // Functional updaters throughout: this runs after two awaits, so the
      // render closure's copies are not trustworthy.
      setCategories(prev =>
        prev.map(c =>
          c.id === target.id ? { ...c, name: nextName, name_es: nextEs || c.name_es } : c
        )
      );
      setGuides(prev =>
        prev.map(g =>
          catKey(g.category) === catKey(previousName) ? { ...g, category: nextName } : g
        )
      );
      setSelectedCategory(prev => (catKey(prev) === catKey(previousName) ? nextName : prev));
    } catch (error: any) {
      console.error('Error renaming category:', error);
      // The prompt stays OPEN so the typed name is not lost — the manager can
      // pick another name or cancel.
      Alert.alert(t('common.error'), categoryErrorMessage(error, nextName));
    } finally {
      // GUIDES as well as categories: the rename cascaded into
      // guides_and_training, so reloading the category list alone would settle
      // only half of what changed on the server. Release guaranteed even if that
      // reload throws — a stranded flag wedges every category write for the rest
      // of the session.
      try {
        await reload();
      } finally {
        categoryWriteRef.current = false;
      }
    }
  };

  // The trash. Built-ins never reach here — their row shows a lock — but the
  // server refuses them anyway, and that refusal is mapped for the manager.
  const handleDeleteCategory = (id: string) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    // BEFORE the confirmation, not after it: asking a manager to confirm a
    // destructive action and then dropping it because another write is in
    // flight is the worst of both — they believe the category is gone, and
    // nothing happened.
    if (categoryLaneBusy()) return;
    // The LABEL, not the raw DB name: a Spanish manager must not be asked to
    // confirm the deletion of a name they have never seen on screen.
    const label = categoryLabel(cat.name);
    Alert.alert(
      t('guides_training_editor.delete_category_title'),
      t('guides_training_editor.delete_category_confirm', { name: label }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => runDeleteCategory(cat.id, cat.name, label),
        },
      ]
    );
  };

  const runDeleteCategory = async (id: string, storedName: string, label: string) => {
    if (!user?.id) return;
    // The lane was already clear when the confirmation went up; this covers the
    // window it was on screen. Still says so rather than dropping it silently —
    // the manager has confirmed a deletion by the time we get here.
    if (categoryLaneBusy()) return;
    categoryWriteRef.current = true;
    try {
      const { error } = await supabase.rpc('manage_guide_category_delete', {
        p_actor_id: user.id,
        p_id: id,
      });
      if (error) throw error;
      // Fall back to ALL when the filter was pointing at what just went. The
      // "category vanished" effect would get there too, but only after the
      // reload lands and only while the list is non-empty — this is immediate
      // and holds even when that was the org's last category.
      setSelectedCategory(prev => (catKey(prev) === catKey(storedName) ? ALL_CATEGORY : prev));
    } catch (error: any) {
      console.error('Error deleting category:', error);
      Alert.alert(t('common.error'), categoryErrorMessage(error, label));
    } finally {
      // Categories only, unlike the rename: the server refuses to delete a
      // category that still has guides, so nothing in guides_and_training can
      // have moved and a guides reload would only flash the list for nothing.
      // Release guaranteed even if it throws — see handleToggleCategoryHidden.
      try {
        await loadCategories();
      } finally {
        categoryWriteRef.current = false;
      }
    }
  };

  const confirmNewCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      Alert.alert(t('common.error'), t('checklist_editor.error_enter_category_name'));
      return;
    }
    // The one rule the SERVER CANNOT ENFORCE: manage_guide_category_create knows
    // nothing about this screen's ALL sentinel, so a manager who literally types
    // `__all__` would create a category the ALL filter swallows on both guides
    // screens — and it is now a permanent table row, not the session-scoped name
    // it used to be. Duplicates are the server's job (its check is the one that
    // cannot race), so this is all that stays client-side. Same message either
    // way — from the manager's side the name is taken.
    if (name.toLowerCase() === ALL_CATEGORY) {
      Alert.alert(t('common.error'), t('guides_training_editor.new_category_duplicate', { name }));
      return;
    }
    if (!user?.id) return;
    // This is bound to TWO triggers — the keyboard's Done key AND the Add button
    // — so a fast manager fires the create twice and the second call comes back
    // reporting their own brand-new category as a duplicate. Shares the lane
    // flag with the hide/reorder writers: all three write this table and all
    // three settle from the same reload.
    if (categoryLaneBusy()) return;
    categoryWriteRef.current = true;
    const target = newCategoryFor;
    try {
      const { error } = await supabase.rpc('manage_guide_category_create', {
        p_actor_id: user.id,
        p_name: name,
      });
      if (error) throw error;
      setNewCategoryName('');
      await loadCategories();
      if (target === 'form') {
        // Nothing is presented here — selecting only sets form state — so this
        // sheet closes immediately, the same call CategorySheet makes.
        setNewCategoryFor(null);
        selectFormCategory(name);
      } else {
        setSelectedCategory(name);
        // A brand-new category is empty, so drop straight into the Add sheet
        // with it pre-filled rather than leaving the manager on an empty list.
        // DEFERRED: the Add sheet is another root-level Modal, so it may only be
        // presented once THIS one has finished dismissing (see the hook above).
        deferAfterNewCategory(() => openAddModal(name));
      }
    } catch (error: any) {
      console.error('Error creating category:', error);
      Alert.alert(t('common.error'), categoryErrorMessage(error, name));
    } finally {
      categoryWriteRef.current = false;
    }
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingGuide(null);
    setSelectedThumbnailUri(null);
    setSelectedFile(null);
    setShowFormCategories(false);
    setNewCategoryFor(null);
  };

  const handleBackPress = () => {
    router.replace('/(portal)/manager/manage');
  };

  const isSearching = searchQuery.trim().length > 0;
  const searchTerm = searchQuery.trim().toLowerCase();
  // Same corpus as the staff screen (guides-and-training.tsx): BOTH the raw
  // English columns and the localized ones, plus the formatted dates. Matching
  // only the localized fields meant a manager could not find by English title a
  // guide their staff could find that way.
  const matchesSearch = (g: GuideItem) =>
    !searchTerm ||
    g.title.toLowerCase().includes(searchTerm) ||
    getLocalizedField(g, 'title', language).toLowerCase().includes(searchTerm) ||
    (g.description || '').toLowerCase().includes(searchTerm) ||
    getLocalizedField(g, 'description', language).toLowerCase().includes(searchTerm) ||
    formatShortDate(g.created_at, language).toLowerCase().includes(searchTerm) ||
    formatShortDate(g.updated_at, language).toLowerCase().includes(searchTerm);

  // ── SHARED CATEGORY RANKING ────────────────────────────────────────────────
  // Rank by category first so the ALL view groups instead of interleaving
  // (display_order is assigned PER category, so it means nothing across them).
  // KEEP THIS BLOCK IDENTICAL to the copy in guides-and-training.tsx — both
  // screens rank the same guides, so any divergence groups categories in a
  // different order for staff than for the manager. Rule: the ranking FOLLOWS
  // THE SERVER ORDER — the position of each category in the `guide_categories`
  // list get_guide_categories returns (its display_order, which the filter
  // sheet's Edit mode is what rewrites). A guide whose category is no longer in
  // the table ranks last.
  const categoryRank = useMemo(() => {
    const order = new Map(categories.map((c, i) => [catKey(c.name), i]));
    return (category: string) => order.get(catKey(category)) ?? order.size;
  }, [categories]);

  const filteredGuides = guides
    // A search spans EVERY category — scoping it to the filter meant a guide
    // filed elsewhere could not be found and read as deleted.
    .filter(g => isSearching || selectedCategory === ALL_CATEGORY || catKey(g.category) === catKey(selectedCategory))
    .filter(matchesSearch)
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || orderWithinCategory(a, b));

  const showCategoryBadge = isSearching || selectedCategory === ALL_CATEGORY;

  // A guide's 1-based slot INSIDE ITS OWN category. The row index counts rows
  // from other categories under the ALL filter (and hidden rows under a search),
  // so it names a position the manager cannot act on; this one always matches
  // what a reorder of that category would move.
  const positionInCategory = (() => {
    const byCategory = new Map<string, GuideItem[]>();
    guides.forEach(g => {
      const key = catKey(g.category);
      const list = byCategory.get(key);
      if (list) list.push(g);
      else byCategory.set(key, [g]);
    });
    const positions = new Map<string, number>();
    byCategory.forEach(list => {
      list.sort(orderWithinCategory).forEach((g, i) => positions.set(g.id, i + 1));
    });
    return positions;
  })();

  // reorder_guides renumbers exactly the ids it is handed to 0..n-1, so a
  // reorder is only coherent when the visible list IS one category's COMPLETE
  // set: under ALL it spans categories (renumbering would shuffle every other
  // one) and under a search it is a subset (renumbering would collide with the
  // rows the search hid). Both cases disable dragging and the move actions.
  const canReorder = selectedCategory !== ALL_CATEGORY && !isSearching;

  // Every guide MUST carry a category, so with none loaded there is nothing
  // valid to file one under — offer the sheet and the save would write a bogus
  // value. Only reachable before the first load lands, or if that load failed.
  const canAddGuide = categories.length > 0;

  const busy = uploadingFile || uploadingThumbnail;

  // Rendered in two places on purpose — Android has no `Alert.prompt`, and a
  // second ROOT-level modal cannot present over the already-presented form
  // sheet on iOS. RN unmounts a hidden <Modal>'s children, so the nested copy
  // only exists while the form sheet is open and exactly one is ever visible.
  // (employee-editor.tsx:585 nests MultiSelectField's picker the same way.)
  const renderNewCategorySheet = (target: 'filter' | 'form') => (
    <GlassSheet
      visible={newCategoryFor === target}
      onClose={closeNewCategory}
      // Fires (iOS) once this sheet is really gone, which is what releases the
      // deferred Add-sheet presentation. Harmless on the copy that is not the
      // open one, and harmless on a plain ✕ close: the slot is empty.
      onDismiss={onNewCategoryDismissed}
      title={t('guides_training_editor.new_category_title')}
      footer={
        <View style={styles.sheetFooter}>
          <Pressable
            style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
            onPress={() => setNewCategoryFor(null)}
          >
            <Text style={[styles.footerBtnLabel, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            style={[styles.footerBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={confirmNewCategory}
          >
            <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>{t('common.add')}</Text>
          </Pressable>
        </View>
      }
    >
      <TextInput
        style={[styles.input, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.text }]}
        placeholder={t('checklist_editor.category_name_placeholder')}
        placeholderTextColor={colors.textSecondary}
        value={newCategoryName}
        onChangeText={setNewCategoryName}
        autoFocus
        onSubmitEditing={confirmNewCategory}
        returnKeyType="done"
      />
    </GlassSheet>
  );

  // The rename prompt. Handed to CategorySheet rather than rendered here, so it
  // mounts INSIDE the filter sheet's Modal — on iOS a root-level sheet issued
  // while that one is up presents on a view controller that is already
  // presenting and is silently dropped (the same reason the ＋New category sheet
  // has a nested copy). Nesting is also what keeps Edit mode open behind it, so
  // the renamed row is right there when the prompt closes.
  const renameAuthorName = isSpanishAuthor ? renameNameEs : renameName;
  const renameSheet = (
    <GlassSheet
      visible={renameCategory !== null}
      // Closing does NOT clear the two name inputs — they are what the sheet is
      // still rendering all the way through the slide-out, and the next open
      // reseeds them anyway (openRenameCategory).
      onClose={closeRename}
      // Carries the "Spanish name didn't save" alert across the dismissal — see
      // deferAfterRename. Harmless when nothing is pending.
      onDismiss={onRenameDismissed}
      title={t('guides_training_editor.rename_category')}
      footer={
        <View style={styles.sheetFooter}>
          <Pressable
            style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
            onPress={closeRename}
          >
            <Text style={[styles.footerBtnLabel, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            style={[
              styles.footerBtn,
              { backgroundColor: colors.primary, borderColor: colors.primary },
              !renameAuthorName.trim() && styles.footerBtnDisabled,
            ]}
            onPress={submitRename}
            disabled={!renameAuthorName.trim()}
          >
            <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>{t('common.save')}</Text>
          </Pressable>
        </View>
      }
    >
      <TextInput
        style={[styles.input, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.text }]}
        placeholder={t('checklist_editor.category_name_placeholder')}
        placeholderTextColor={colors.textSecondary}
        value={renameAuthorName}
        onChangeText={isSpanishAuthor ? setRenameNameEs : setRenameName}
        autoFocus
        onSubmitEditing={submitRename}
        returnKeyType="done"
      />
      {/* Bilingual authoring (s61 hybrid) — the same affordance the Menu
          Categories editor puts on a category rename. */}
      {catTranslation.element}
    </GlassSheet>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('guides_training_editor.title')}
        onBack={handleBackPress}
        rightWide
        right={
          <HeaderNavButton
            label={t('common:to_user')}
            iconIos="person.fill"
            iconAndroid="person"
            onPress={() => router.replace('/guides-and-training')}
          />
        }
      />

      {/* Search + category filter — the SAME geometry and position as the user
          screen, so switching user <-> editor never moves the controls. */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          {/* The bolt's docking slot. Plain, untransformed View — measureInWindow
              on an Animated node would report the animated position. It rests as
              the search icon so a failed dock leaves the bar looking normal
              rather than blank. */}
          <View ref={joltSlotRef} style={styles.joltSlot} onLayout={measureAndDock}>
            {!joltDocked && (
              <IconSymbol
                ios_icon_name="magnifyingglass"
                android_material_icon_name="search"
                size={18}
                color={colors.textSecondary}
              />
            )}
          </View>
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t('guides_training.search_placeholder')}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>
          )}
        </View>

        <Pressable
          style={[styles.catBtn, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '42' }]}
          onPress={() => setShowFilterCategories(true)}
        >
          <Text
            style={[styles.catBtnLabel, { color: colors.primary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {categoryLabel(selectedCategory)}
          </Text>
          <IconSymbol
            ios_icon_name="chevron.down"
            android_material_icon_name="expand-more"
            size={14}
            color={colors.primary}
          />
        </Pressable>
      </View>

      <View style={styles.countRow}>
        <Text style={[styles.countText, { color: colors.textSecondary }]} numberOfLines={1}>
          {t('guides_training_editor.guides_count', { count: filteredGuides.length })}
        </Text>
        <Pressable
          style={[
            styles.addChip,
            { backgroundColor: colors.primary + '2E', borderColor: colors.primary + '6B' },
            !canAddGuide && styles.addChipDisabled,
          ]}
          onPress={() => openAddModal()}
          disabled={!canAddGuide}
        >
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color={colors.primary} />
          <Text style={[styles.addChipLabel, { color: colors.primary }]} numberOfLines={1}>
            {t('guides_training_editor.modal_add_title')}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('guides_training_editor.loading_guides')}</Text>
        </View>
      ) : filteredGuides.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconSymbol
            ios_icon_name={isSearching ? 'magnifyingglass' : 'book.fill'}
            android_material_icon_name={isSearching ? 'search' : 'menu-book'}
            size={54}
            color={colors.textSecondary}
          />
          <Text style={[styles.emptyText, { color: colors.text }]}>
            {isSearching
              ? t('guides_training.no_results')
              // "in this category" is a lie under ALL — that empty list means
              // the org has no guides at all.
              : selectedCategory === ALL_CATEGORY
                ? t('guides_training_editor.no_guides_yet')
                : t('guides_training_editor.no_guides_in_category')}
          </Text>
          {!isSearching && (
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              {t('guides_training_editor.tap_to_create')}
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.itemsList}>
          {/* This screen's own hint: the borrowed events one still promises
              per-card arrows, which now live only in the ⋯ sheet. */}
          {canReorder && filteredGuides.length > 1 && (
            <Text style={[styles.reorderHint, { color: colors.textSecondary }]}>{t('guides_training_editor.reorder_hint')}</Text>
          )}
          <DraggableFlatList
            data={filteredGuides}
            keyExtractor={(item) => item.id}
            onDragEnd={handleDragEnd}
            activationDistance={10}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.itemsListContent}
            renderItem={({ item: guide, getIndex, drag, isActive }: RenderItemParams<GuideItem>) => {
              const index = getIndex() ?? 0;
              const ext = guide.file_name.includes('.')
                ? guide.file_name.slice(guide.file_name.lastIndexOf('.') + 1).toUpperCase()
                : '';
              // `#n` is the slot in the guide's OWN category (positionInCategory)
              // — the row index would count rows from other categories. A bare
              // `#` also cannot be misread as Point-Of-Sale the way "POS" can in
              // a restaurant app.
              const position = positionInCategory.get(guide.id);
              const meta = [position ? `#${position}` : '', ext, formatShortDate(guide.updated_at, language)]
                .filter(Boolean)
                .join(' · ');

              return (
                <ScaleDecorator>
                  {/* Grabber / thumb / middle / meatball are INLINE flex children:
                      unlike menu-editor's absolutely-positioned corner buttons they
                      need no padding clearance to keep off the title. */}
                  <GlassCard variant="surface" radius={17} style={[styles.card, isActive && styles.cardDragging]}>
                    {/* Omitted entirely, not dimmed, when reordering is off (the
                        ALL filter or an active search): a grab handle that cannot
                        grab reads as broken rather than disabled. Rendering an
                        empty spacer instead would still leave the row's 12pt gap
                        as a dead gutter, so the card simply starts at the thumb. */}
                    {canReorder && (
                      <Pressable
                        onLongPress={drag}
                        disabled={isActive}
                        hitSlop={6}
                        style={styles.grabber}
                      >
                        <IconSymbol
                          ios_icon_name="line.3.horizontal.decrease"
                          android_material_icon_name="drag-indicator"
                          size={20}
                          color={colors.textSecondary}
                        />
                      </Pressable>
                    )}

                    {guide.thumbnail_url ? (
                      <StorageImage source={{ uri: guide.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: colors.thumbPlaceholder }]}>
                        <IconSymbol
                          ios_icon_name="doc.fill"
                          android_material_icon_name="description"
                          size={20}
                          color={colors.textSecondary}
                        />
                      </View>
                    )}

                    <View style={styles.cardMid}>
                      {showCategoryBadge && (
                        // A search spans every category, and ALL interleaves
                        // them, so each card has to say where it lives. Same
                        // condition as the staff screen's badge.
                        <View style={[styles.cardBadge, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '42' }]}>
                          {/* The LABEL, not the raw DB value — the filter chip,
                              the sheets and the form row all resolve through
                              categoryLabel, so a badge printing `guide.category`
                              is the one surface that disagrees with the rest the
                              moment a category is translated. */}
                          <Text style={[styles.cardBadgeText, { color: colors.primary }]} numberOfLines={1}>
                            {categoryLabel(guide.category)}
                          </Text>
                        </View>
                      )}
                      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                        {getLocalizedField(guide, 'title', language)}
                      </Text>
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                        {meta}
                      </Text>
                    </View>

                    <Pressable
                      style={[styles.meatball, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                      onPress={() => setActionGuide({ guide, index })}
                      hitSlop={6}
                    >
                      <IconSymbol
                        ios_icon_name="ellipsis"
                        android_material_icon_name="more-horiz"
                        size={18}
                        color={colors.text}
                      />
                    </Pressable>
                  </GlassCard>
                </ScaleDecorator>
              );
            }}
          />
        </View>
      )}

      <BottomNavBar activeTab="manage" />
      {/* Pushed route (outside the tab layout), so the Jolt companion is rendered
          here too — this screen is manager-only. */}
      <JoltOverlay role="manager" />

      <CategorySheet
        visible={showFilterCategories}
        // The rename prompt lives inside this Modal, so closing the sheet
        // unmounts it — drop the prompt's own state with it, or reopening the
        // sheet would present a half-finished rename out of nowhere.
        onClose={() => {
          setShowFilterCategories(false);
          setRenameCategory(null);
        }}
        title={t('guides_training_editor.category_label')}
        options={filterOptions}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        onNewCategory={() => {
          setNewCategoryName('');
          setNewCategoryFor('filter');
        }}
        newCategoryLabel={t('guides_training_editor.new_category')}
        // Edit mode (drag to reorder + the per-row pencil / eye / trash) belongs
        // to THIS sheet only. The form's picker below deliberately goes without
        // it — see CategorySheet's prop doc: renaming or reordering the whole
        // org's categories while filing one guide is not a thing anyone means
        // to do.
        editing={{
          editLabel: t('common.edit'),
          // Save, not Done: the toggle now leaves a mode where a tap renames or
          // deletes, and "Done" reads like it is what commits them.
          doneLabel: t('common.save'),
          onToggleHidden: handleToggleCategoryHidden,
          onReorder: handleReorderCategories,
          onRename: openRenameCategory,
          onDelete: handleDeleteCategory,
          builtInHint: t('guides_training_editor.builtin_locked'),
          renameSheet,
        }}
      />

      {renderNewCategorySheet('filter')}

      <GlassActionSheet
        visible={!!actionGuide}
        onClose={() => setActionGuide(null)}
        title={shownAction ? getLocalizedField(shownAction.guide, 'title', language) : ''}
        actions={shownAction ? [
          {
            key: 'edit',
            label: t('common.edit'),
            iosIcon: 'pencil',
            androidIcon: 'edit',
            onPress: () => openEditModal(shownAction.guide),
          },
          {
            key: 'up',
            label: t('guides_training_editor.move_up'),
            iosIcon: 'arrow.up',
            androidIcon: 'arrow-upward',
            disabled: !canReorder || shownAction.index === 0,
            onPress: () => handleMove(shownAction.index, -1),
          },
          {
            key: 'down',
            label: t('guides_training_editor.move_down'),
            iosIcon: 'arrow.down',
            androidIcon: 'arrow-downward',
            disabled: !canReorder || shownAction.index === filteredGuides.length - 1,
            onPress: () => handleMove(shownAction.index, 1),
          },
          {
            key: 'position',
            label: t('menu_editor:order_position'),
            iosIcon: 'arrow.up.arrow.down',
            androidIcon: 'swap-vert',
            disabled: !canReorder,
            onPress: () => setPositionPicker({ guide: shownAction.guide, currentIndex: shownAction.index }),
          },
          {
            key: 'delete',
            label: t('common.delete'),
            iosIcon: 'trash',
            androidIcon: 'delete',
            destructive: true,
            onPress: () => handleDelete(shownAction.guide),
          },
        ] : []}
      />

      <OrderPositionModal
        visible={!!positionPicker}
        title={t('menu_editor:order_position')}
        subtitle={shownPosition ? getLocalizedField(shownPosition.guide, 'title', language) : ''}
        // The CATEGORY-scoped list: persistOrder only sends this category's ids
        // to reorder_guides, so a global count would offer impossible slots.
        count={filteredGuides.length}
        currentIndex={shownPosition?.currentIndex ?? 0}
        onClose={() => setPositionPicker(null)}
        onApply={applyPositionChange}
      />

      {/* Add / Edit — Category, Thumbnail + File, Title, Description, Español. */}
      <GlassSheet
        visible={showAddModal}
        onClose={closeModal}
        title={editingGuide ? t('guides_training_editor.modal_edit_title') : t('guides_training_editor.modal_add_title')}
        footer={
          <View style={styles.sheetFooter}>
            <Pressable
              style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={closeModal}
            >
              <Text style={[styles.footerBtnLabel, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.footerBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={handleSave}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.fireText} />
              ) : (
                <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>
                  {editingGuide ? t('guides_training_editor.save_button_update') : t('guides_training_editor.save_button_add')}
                </Text>
              )}
            </Pressable>
          </View>
        }
      >
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('guides_training_editor.category_label')}</Text>
          <Pressable
            style={[styles.glassRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
            onPress={() => setShowFormCategories(true)}
          >
            {/* The LABEL, not the raw DB value: the picker row the manager just
                tapped shows the label, so the field it fills has to match. */}
            <Text style={[styles.glassRowValue, { color: colors.text }]} numberOfLines={1}>
              {categoryLabel(formData.category)}
            </Text>
            <IconSymbol
              ios_icon_name="chevron.down"
              android_material_icon_name="expand-more"
              size={15}
              color={colors.textSecondary}
            />
          </Pressable>
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('guides_training_editor.thumbnail_and_file')}</Text>
          {/* No alignItems — the default `stretch` is what keeps the two zones
              the same height. */}
          <View style={styles.zoneRow}>
            <Pressable
              style={[styles.zone, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={pickThumbnail}
            >
              {selectedThumbnailUri || editingGuide?.thumbnail_url ? (
                <StorageImage
                  source={{ uri: selectedThumbnailUri || editingGuide?.thumbnail_url || '' }}
                  style={styles.zoneImage}
                  resizeMode="cover"
                />
              ) : (
                <>
                  <IconSymbol
                    ios_icon_name="photo"
                    android_material_icon_name="add-photo-alternate"
                    size={19}
                    color={colors.textSecondary}
                  />
                  <Text style={[styles.zoneLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                    {t('guides_training_editor.thumbnail_short')}
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.zone, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={pickFile}
            >
              <IconSymbol
                ios_icon_name="doc.fill"
                android_material_icon_name="description"
                size={19}
                color={selectedFile || editingGuide ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.zoneLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                {selectedFile ? selectedFile.name : editingGuide ? editingGuide.file_name : t('guides_training_editor.choose_file')}
              </Text>
            </Pressable>
          </View>
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('guides_training_editor.title_label')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.text }]}
            placeholder={t('guides_training_editor.title_placeholder')}
            placeholderTextColor={colors.textSecondary}
            value={isSpanishAuthor ? formData.title_es : formData.title}
            onChangeText={(text) => setFormData(prev => isSpanishAuthor ? { ...prev, title_es: text } : { ...prev, title: text })}
          />
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('guides_training_editor.description_label')}</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.text }]}
            placeholder={t('guides_training_editor.description_placeholder')}
            placeholderTextColor={colors.textSecondary}
            value={isSpanishAuthor ? formData.description_es : formData.description}
            onChangeText={(text) => setFormData(prev => isSpanishAuthor ? { ...prev, description_es: text } : { ...prev, description: text })}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Bilingual authoring (s61 hybrid) */}
        {translation.element}

        {/* Nested so they present ABOVE this sheet (see renderNewCategorySheet). */}
        <CategorySheet
          visible={showFormCategories}
          onClose={() => setShowFormCategories(false)}
          title={t('guides_training_editor.category_label')}
          options={categoryOptions}
          selected={formData.category}
          onSelect={selectFormCategory}
          onNewCategory={() => {
            setNewCategoryName('');
            setNewCategoryFor('form');
          }}
          newCategoryLabel={t('guides_training_editor.new_category')}
        />
        {renderNewCategorySheet('form')}
      </GlassSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  joltSlot: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    // Geometry kept byte-identical to the staff screen's searchField: both dock
    // the Jolt bolt, and the slot only lands in the same place if the row does.
    gap: 11,
    height: 46,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body.regular,
    fontSize: 14,
    padding: 0,
  },
  // maxWidth caps the button so a long custom category cannot eat the search
  // field; flexShrink:0 keeps it from collapsing when the row is tight, and the
  // label (flexShrink:1 + numberOfLines) ellipsizes inside that cap.
  catBtn: {
    flexShrink: 0,
    maxWidth: 158,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 46,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  catBtnLabel: {
    flexShrink: 1,
    fontFamily: fonts.body.semibold,
    fontSize: 13,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 11,
  },
  // flexShrink:1 (RN defaults it to 0) so a long ES count ellipsizes instead of
  // squeezing the chip.
  countText: {
    flexShrink: 1,
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  addChip: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 35,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  addChipLabel: {
    fontFamily: fonts.body.semibold,
    fontSize: 13,
  },
  // Dimmed rather than hidden: the chip is the screen's one primary action, and
  // a missing one reads as a broken screen where a greyed one reads as "not yet".
  addChipDisabled: {
    opacity: 0.4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    marginTop: 12,
  },
  itemsList: {
    flex: 1,
  },
  itemsListContent: {
    paddingHorizontal: 16,
    // Clears the floating BottomNavBar.
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  emptyText: {
    fontFamily: fonts.display.semibold,
    fontSize: 16,
    marginTop: 14,
    textAlign: 'center',
  },
  emptySubtext: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  reorderHint: {
    fontFamily: fonts.body.regular,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 9,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 10,
  },
  cardDragging: {
    opacity: 0.9,
    transform: [{ scale: 1.02 }],
  },
  grabber: {
    flexShrink: 0,
  },
  thumb: {
    flexShrink: 0,
    width: 53,
    height: 53,
    borderRadius: 13,
    overflow: 'hidden',
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMid: {
    flex: 1,
    gap: 3,
  },
  // alignSelf so the pill hugs its label (a column child stretches by default)
  // and maxWidth so a long custom category ellipsizes instead of pushing the
  // meatball off the card.
  cardBadge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  cardBadgeText: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    letterSpacing: 0.4,
  },
  cardTitle: {
    fontFamily: fonts.display.semibold,
    fontSize: 15,
  },
  cardMeta: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  meatball: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  fieldLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  glassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    height: 43,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  glassRowValue: {
    flex: 1,
    flexShrink: 1,
    fontFamily: fonts.body.medium,
    fontSize: 14,
  },
  zoneRow: {
    flexDirection: 'row',
    gap: 11,
  },
  zone: {
    flex: 1,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    // No padding here on purpose — a filled thumbnail is width/height 100% of
    // the CONTENT box, so any padding would leave a gutter instead of cropping.
    borderRadius: 13,
    // A full point, not the hairline convention: RN draws sub-point dashed
    // borders as an (almost) solid line, and the dashes are what read "empty".
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  zoneLabel: {
    alignSelf: 'stretch',
    paddingHorizontal: 8,
    fontFamily: fonts.body.medium,
    fontSize: 11,
    textAlign: 'center',
  },
  zoneImage: {
    width: '100%',
    height: '100%',
  },
  input: {
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    minHeight: 43,
    fontFamily: fonts.body.regular,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  textArea: {
    minHeight: 62,
    textAlignVertical: 'top',
    paddingTop: 11,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: 11,
    marginTop: 12,
  },
  footerBtn: {
    flex: 1,
    height: 47,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  footerBtnLabel: {
    fontFamily: fonts.body.semibold,
    fontSize: 15,
  },
  // Dimmed rather than hidden, same call as addChipDisabled: a save button that
  // disappears when the field is empty reads as broken.
  footerBtnDisabled: {
    opacity: 0.5,
  },
});
