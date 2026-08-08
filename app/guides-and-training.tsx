
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Dimensions,
  Platform,
  Linking,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { resolveForOpen } from '@/utils/storageResolver';
import { supabase } from '@/app/integrations/supabase/client';
import type { Database } from '@/app/integrations/supabase/types';
import { PanGestureHandler } from 'react-native-gesture-handler';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import ContentDetailModal from '@/components/ContentDetailModal';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import CategorySheet, { CategoryOption } from '@/components/CategorySheet';
import BottomNavBar from '@/components/BottomNavBar';
import JoltOverlay, { setJoltDockTarget } from '@/components/JoltOverlay';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';
import HeaderNavButton from '@/components/HeaderNavButton';
import { translateServerError } from '@/utils/serverErrors';
import { formatShortDate } from '@/utils/dateUtils';

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

// The org's categories now live in `guide_categories` — the four built-ins are
// seeded rows like any other, so nothing about them is hardcoded here any more.
// `name` IS the DB `guides_and_training.category` value the editor writes and
// the filter predicate compares against, so it is never translated; only the
// synthetic ALL row and `name_es` carry a display label.
type GuideCategoryRow = Database['public']['Functions']['get_guide_categories']['Returns'][number];

const ALL = '__all__';

// EVERY server path that matches a category name does it with lower(): the
// seed's adopt arm, the rename cascade, the delete guard, the unique index, and
// get_guides' hidden-category filter. The client MUST match the same way — an
// exact-case join silently drops a guide whose stored category differs only in
// case from every list, count, badge and search result, with no error and no
// empty state to hint at it. Only the MATCHING is case-insensitive: what gets
// PRINTED is always the stored name or its translated label.
const catKey = (name: string) => name.toLowerCase();

export default function GuidesAndTrainingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const colors = useThemeColors();
  const { user } = useAuth();
  const [guides, setGuides] = useState<GuideItem[]>([]);
  const [categories, setCategories] = useState<GuideCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(ALL);
  const [categorySheetVisible, setCategorySheetVisible] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState<GuideItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // This screen is pushed from BOTH portals, so the Jolt index must follow the
  // viewer's role — a hardcoded 'manager' would hand employees manager tools.
  const isManager = isManagerOrOwner(user);

  useEffect(() => {
    loadGuides();
  }, [user?.id]);

  const loadGuides = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      setLoadError(false);
      // The category list is what decides which guides staff may even see, so it
      // is fetched in the SAME pass as the guides — loading it separately would
      // render one frame of a hidden category's contents.
      // p_include_hidden is deliberately NOT passed (it defaults to false):
      // staff must never see a category the manager has hidden.
      const [guidesRes, categoriesRes] = await Promise.all([
        supabase.rpc('get_guides', { p_actor_id: user.id }),
        supabase.rpc('get_guide_categories', { p_actor_id: user.id }),
      ]);

      if (guidesRes.error) throw guidesRes.error;
      // Failing the whole load on this is intentional: without the categories
      // every guide would be filtered out and the screen would lie that the
      // library is empty. The error state at least offers a retry.
      if (categoriesRes.error) throw categoriesRes.error;
      setGuides(guidesRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (error) {
      console.error('Error loading guides:', error);
      // Without this the RPC failure renders as the ordinary "no guides" empty
      // state — indistinguishable from an empty library, and with no way back.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  // ── Jolt FAB docking ───────────────────────────────────────────────────────
  // Hand the corner bolt this search bar's slot coords so it flies in physically
  // (same contract as the Manage command center). Clearing the target on blur is
  // mandatory: otherwise the FAB stays pinned to this screen's coordinates on
  // whatever tab we return to.
  const joltSlotRef = useRef<View>(null);
  const dockActiveRef = useRef(false);
  const focusEpochRef = useRef(0);
  // Mirrors dockActiveRef into render so the slot can drop its resting icon only
  // once the bolt is actually on its way in (a ref alone never re-renders).
  const [joltDocked, setJoltDocked] = useState(false);
  const measureAndDock = useCallback(() => {
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

  useFocusEffect(useCallback(() => {
    // The slot's own onLayout fires the first attempt; these are the fallback
    // for when onLayout lands before the window position has settled.
    // measureAndDock is idempotent (dockActiveRef), so the extra calls are free.
    const t1 = setTimeout(measureAndDock, 200);
    const t2 = setTimeout(measureAndDock, 480);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      focusEpochRef.current += 1;
      setJoltDockTarget(null);
      dockActiveRef.current = false;
      setJoltDocked(false);
    };
  }, [measureAndDock]));

  const openImageModal = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setImageModalVisible(true);
  };

  const closeImageModal = () => {
    setImageModalVisible(false);
    setSelectedImage(null);
  };

  const handleSwipeGesture = (event: any) => {
    const { translationY } = event.nativeEvent;
    if (translationY > 100) {
      closeImageModal();
    }
  };

  const handleViewFile = async (guide: GuideItem) => {
    try {
      setViewingFile(guide.id);
      const opened = await resolveForOpen(guide.file_url, { tier: 'file' });
      const canOpen = await Linking.canOpenURL(opened);
      if (canOpen) {
        await Linking.openURL(opened);
      } else {
        Alert.alert(t('common.error'), t('guides_training.error_cannot_open'));
      }
    } catch (error) {
      console.error('Error viewing file:', error);
      Alert.alert(t('common.error'), t('guides_training.error_open_failed'));
    } finally {
      setViewingFile(null);
    }
  };

  const handleDownloadFile = async (guide: GuideItem) => {
    try {
      setDownloadingFile(guide.id);

      const downloadUrl = await resolveForOpen(guide.file_url, { tier: 'file' });

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = guide.file_name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert(t('common.success'), t('guides_training.download_started'));
        setDownloadingFile(null);
        return;
      }

      const fileExtension = guide.file_name.includes('.')
        ? guide.file_name.substring(guide.file_name.lastIndexOf('.'))
        : '';
      const fileNameWithoutExt = guide.file_name.includes('.')
        ? guide.file_name.substring(0, guide.file_name.lastIndexOf('.'))
        : guide.file_name;

      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const uniqueFileName = `${fileNameWithoutExt}_${timestamp}_${randomString}${fileExtension}`;

      const downloadsDir = `${FileSystem.cacheDirectory}downloads/`;
      const dirInfo = await FileSystem.getInfoAsync(downloadsDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadsDir, { intermediates: true });
      }

      const destinationUri = `${downloadsDir}${uniqueFileName}`;
      const downloadResult = await FileSystem.downloadAsync(downloadUrl, destinationUri);

      if (downloadResult.status !== 200) {
        throw new Error(`Download failed with status ${downloadResult.status}`);
      }

      const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
      if (!fileInfo.exists || fileInfo.size === 0) {
        throw new Error('Downloaded file is empty or does not exist');
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: guide.file_type || 'application/octet-stream',
          dialogTitle: `Save ${guide.file_name}`,
          UTI: guide.file_type || 'public.data',
        });
      } else {
        Alert.alert(
          t('guides_training.downloaded_title'),
          t('guides_training.downloaded_body', {
            name: guide.file_name,
            size: ((fileInfo.size || 0) / 1024).toFixed(2),
          })
        );
      }
    } catch (error: any) {
      console.error('Failed to download file:', error);
      let errorMessage = t('guides_training.download_failed');
      if (error.message?.includes('network') || error.message?.includes('Network')) {
        errorMessage = t('guides_training.download_network');
      } else if (error.message?.includes('permission')) {
        errorMessage = t('guides_training.download_permission');
      } else if (error.message) {
        errorMessage = translateServerError(error);
      }
      Alert.alert(t('guides_training.download_error_title'), errorMessage);
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleGuidePress = (guide: GuideItem) => {
    setSelectedGuide(guide);
    setDetailModalVisible(true);
  };

  const closeDetailModal = () => {
    setDetailModalVisible(false);
    setSelectedGuide(null);
  };

  // Filter guides based on search query
  const filterGuides = useCallback((guidesToFilter: GuideItem[]) => {
    if (!searchQuery.trim()) return guidesToFilter;

    const query = searchQuery.toLowerCase().trim();
    return guidesToFilter.filter(guide => {
      const localizedTitle = getLocalizedField(guide, 'title', language);
      const titleMatch = guide.title.toLowerCase().includes(query) || localizedTitle.toLowerCase().includes(query);
      const localizedDesc = getLocalizedField(guide, 'description', language);
      const descriptionMatch = guide.description?.toLowerCase().includes(query) || localizedDesc?.toLowerCase().includes(query) || false;
      const createdDate = formatShortDate(guide.created_at, language).toLowerCase();
      const updatedDate = formatShortDate(guide.updated_at, language).toLowerCase();
      const dateMatch = createdDate.includes(query) || updatedDate.includes(query);
      return titleMatch || descriptionMatch || dateMatch;
    });
  }, [searchQuery, language]);

  const isSearchMode = searchQuery.trim().length > 0;

  // get_guide_categories is called without p_include_hidden, so everything it
  // returns is a category staff are allowed to see. Holds catKey()'d names, not
  // raw ones — see catKey: the server joins categories case-insensitively, so
  // every membership test on this set must too.
  const visibleCategoryNames = useMemo(
    () => new Set(categories.map(c => catKey(c.name))),
    [categories]
  );

  // THE SERVER IS AUTHORITATIVE: get_guides itself excludes guides in hidden
  // categories for non-managers (matching with lower(), as this does), and
  // returns everything to managers/owners. This pass is a defensive second
  // line — it also drops a guide left behind by a since-deleted category, and
  // covers a stale payload — but it is NOT the enforcement point. Do not treat
  // it as the thing keeping a hidden category's contents off a staff screen;
  // that gate lives in the RPC.
  const visibleGuidesPool = useMemo(
    () => guides.filter(g => visibleCategoryNames.has(catKey(g.category))),
    [guides, visibleCategoryNames]
  );

  // Without this, a category the manager hides (or deletes) while it is the
  // active filter leaves the screen parked on a permanently empty list with no
  // hint why. The length guard keeps a failed load from clearing the filter.
  useEffect(() => {
    if (
      selectedCategory !== ALL &&
      categories.length > 0 &&
      !visibleCategoryNames.has(catKey(selectedCategory))
    ) {
      setSelectedCategory(ALL);
    }
  }, [categories, selectedCategory, visibleCategoryNames]);

  // The category's display name for THIS reader: the Spanish name only for a
  // Spanish reader, falling back to the stored name — the same rule
  // getLocalizedField applies to every other translated field. Keying it purely
  // on "is there a name_es" would show an English reader the Spanish label the
  // moment a manager translated a category.
  // Every surface that prints a category (sheet row, filter pill, card badge)
  // resolves through this one lookup so they can never disagree.
  const categoryLabel = useMemo(() => {
    // Keyed by catKey so a guide whose stored category differs only in case
    // still resolves to its category's label instead of printing its own raw
    // spelling; the VALUE is still the stored/translated display string.
    const byName = new Map<string, string>();
    categories.forEach(c => {
      const es = c.name_es?.trim();
      byName.set(catKey(c.name), language === 'es' && es ? es : c.name);
    });
    return (name: string) => byName.get(catKey(name)) || name;
  }, [categories, language]);

  // ALL first, then the org's categories in the server's display_order — a new
  // category shows up the moment the manager creates it, and an empty one still
  // lists (with a 0) instead of vanishing the way the old guide-derived list did.
  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const counts = new Map<string, number>();
    visibleGuidesPool.forEach(g => counts.set(catKey(g.category), (counts.get(catKey(g.category)) || 0) + 1));
    return [
      { name: ALL, label: t('guides_training.category_all'), count: visibleGuidesPool.length },
      ...categories.map(c => ({
        id: c.id,
        name: c.name,
        label: categoryLabel(c.name),
        count: counts.get(catKey(c.name)) || 0,
      })),
    ];
  }, [categories, visibleGuidesPool, categoryLabel, t]);

  const selectedCategoryLabel =
    selectedCategory === ALL ? t('guides_training.category_all') : categoryLabel(selectedCategory);

  // ── SHARED CATEGORY RANKING ────────────────────────────────────────────────
  // Rank by category first so the ALL view groups instead of interleaving
  // (display_order is assigned PER category, so it means nothing across them).
  // KEEP THIS BLOCK IDENTICAL to the copy in guides-and-training-editor.tsx —
  // both screens rank the same guides, so any divergence groups custom
  // categories in a different order for staff than for the manager. Rule: the
  // ranking now follows the SERVER order — the position of each category in the
  // get_guide_categories result, i.e. guide_categories.display_order, which is
  // what the editor's reorder writes — unknown last.
  const categoryRank = useMemo(() => {
    // catKey'd both sides: a case-divergent guide belongs to its category and
    // must rank WITH it, not fall to the unknown bucket at the end.
    const order = new Map<string, number>();
    categories.forEach((c, i) => order.set(catKey(c.name), i));
    return (category: string) => order.get(catKey(category)) ?? order.size;
  }, [categories]);

  const visibleGuides = useMemo(() => {
    // A search spans EVERY category — scoping it to the filter meant a guide
    // filed elsewhere could not be found and read as deleted.
    const scoped = isSearchMode || selectedCategory === ALL
      ? visibleGuidesPool
      : visibleGuidesPool.filter(g => catKey(g.category) === catKey(selectedCategory));
    // Copy before sorting — with ALL selected `scoped` IS the memoized pool
    // array. The tie-break after the rank must stay identical to the editor's
    // comparator (guides-and-training-editor.tsx) or a display_order collision
    // renders in a different order for staff.
    return filterGuides([...scoped].sort((a, b) =>
      categoryRank(a.category) - categoryRank(b.category) ||
      (a.display_order ?? 0) - (b.display_order ?? 0) ||
      (a.created_at || '').localeCompare(b.created_at || '') ||
      a.id.localeCompare(b.id)));
  }, [visibleGuidesPool, selectedCategory, isSearchMode, filterGuides, categoryRank]);

  // The badge is what tells the user where a hit lives, so it is on for every
  // result while searching (the search ignores the category filter).
  const showCategoryBadge = isSearchMode || selectedCategory === ALL;

  // Render a guide card
  const renderGuideCard = (guide: GuideItem) => (
    <GlassCard key={guide.id} variant="surface" radius={17} style={styles.guideCard}>
      <TouchableOpacity style={styles.guideBody} activeOpacity={0.75} onPress={() => handleGuidePress(guide)}>
        {guide.thumbnail_url ? (
          <TouchableOpacity onPress={() => openImageModal(guide.thumbnail_url!)}>
            <StorageImage
              source={{ uri: guide.thumbnail_url }}
              style={styles.guideThumbnail}
            />
          </TouchableOpacity>
        ) : (
          // Placeholder keeps the row height constant when a guide has no cover.
          <View style={[styles.thumbFallback, { backgroundColor: colors.thumbPlaceholder }]}>
            <IconSymbol
              ios_icon_name="doc.text.fill"
              android_material_icon_name="description"
              size={22}
              color={colors.textSecondary}
            />
          </View>
        )}
        <View style={styles.guideContent}>
          {showCategoryBadge && (
            <View style={[styles.categoryBadge, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '42' }]}>
              <Text style={[styles.categoryBadgeText, { color: colors.primary }]} numberOfLines={1}>
                {categoryLabel(guide.category)}
              </Text>
            </View>
          )}
          <Text style={[styles.guideTitle, { color: colors.text }]} numberOfLines={1}>
            {getLocalizedField(guide, 'title', language)}
          </Text>
          {(guide.description || (language === 'es' && guide.description_es)) && (
            <Text style={[styles.guideDescription, { color: colors.textSecondary }]} numberOfLines={1}>
              {getLocalizedField(guide, 'description', language)}
            </Text>
          )}
          <Text style={[styles.guideMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('guides_training.updated_label', { date: formatShortDate(guide.updated_at, language) })}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: colors.primary + '2E', borderColor: colors.primary + '6B' }]}
          onPress={() => handleViewFile(guide)}
          disabled={viewingFile === guide.id}
          accessibilityLabel={t('common:view')}
        >
          {viewingFile === guide.id ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <IconSymbol
              ios_icon_name="eye.fill"
              android_material_icon_name="visibility"
              size={17}
              color={colors.primary}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          onPress={() => handleDownloadFile(guide)}
          disabled={downloadingFile === guide.id}
          accessibilityLabel={t('common:download')}
        >
          {downloadingFile === guide.id ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <IconSymbol
              ios_icon_name="arrow.down.circle.fill"
              android_material_icon_name="download"
              size={17}
              color={colors.text}
            />
          )}
        </TouchableOpacity>
      </View>
    </GlassCard>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('guides_training.title')}
        rightWide={isManager}
        right={isManager ? (
          <HeaderNavButton
            label={t('common:to_editor')}
            iconIos="pencil"
            iconAndroid="edit"
            onPress={() => router.replace('/guides-and-training-editor')}
          />
        ) : undefined}
      />

      <View style={styles.searchRow}>
        <View style={[styles.searchField, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          {/* Static slot the Jolt FAB measures and docks into — no transform, or
              measureInWindow would report the animated position. The magnifier
              is the slot's RESTING content: if measureInWindow never lands (cold
              start, slow layout) the bar still reads as a search field instead of
              a blank indent, and the bolt simply stays in its corner. */}
          <View ref={joltSlotRef} style={styles.joltSlot} onLayout={measureAndDock}>
            {!joltDocked && (
              <IconSymbol
                ios_icon_name="magnifyingglass"
                android_material_icon_name="search"
                size={20}
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
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.categoryButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          onPress={() => setCategorySheetVisible(true)}
        >
          <Text style={[styles.categoryButtonText, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
            {selectedCategoryLabel}
          </Text>
          <IconSymbol
            ios_icon_name="chevron.down"
            android_material_icon_name="expand-more"
            size={15}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('guides_training.loading')}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isSearchMode && (
            <Text style={[styles.resultsCount, { color: colors.textSecondary }]}>
              {t('guides_training.search_results', { count: visibleGuides.length })}
            </Text>
          )}
          {visibleGuides.length === 0 ? (
            loadError ? (
              // A failed fetch gets its own state with a way out — the "no
              // guides" copy below would claim the library is empty.
              <View style={styles.emptyContainer}>
                <IconSymbol
                  ios_icon_name="exclamationmark.triangle.fill"
                  android_material_icon_name="warning"
                  size={64}
                  color={colors.textSecondary}
                />
                <Text style={[styles.emptyText, { color: colors.text }]}>{t('common.error')}</Text>
                <TouchableOpacity
                  style={[styles.retryButton, { backgroundColor: colors.primary + '2E', borderColor: colors.primary + '6B' }]}
                  onPress={() => loadGuides()}
                >
                  <IconSymbol
                    ios_icon_name="arrow.clockwise"
                    android_material_icon_name="refresh"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={[styles.retryButtonText, { color: colors.primary }]}>{t('common.retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <IconSymbol
                  ios_icon_name={isSearchMode ? 'magnifyingglass' : 'book.fill'}
                  android_material_icon_name={isSearchMode ? 'search' : 'menu-book'}
                  size={64}
                  color={colors.textSecondary}
                />
                <Text style={[styles.emptyText, { color: colors.text }]}>
                  {isSearchMode
                    ? t('guides_training.no_results')
                    : selectedCategory === ALL
                      // Under ALL there is no "this category" to be empty.
                      ? t('guides_training.no_guides_yet')
                      : t('guides_training.no_guides_in_category')}
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                  {isSearchMode ? t('guides_training.try_keywords') : t('guides_training.check_back')}
                </Text>
              </View>
            )
          ) : (
            visibleGuides.map(guide => renderGuideCard(guide))
          )}
        </ScrollView>
      )}

      <BottomNavBar activeTab="tools" />
      <JoltOverlay role={isManager ? 'manager' : 'employee'} />

      <CategorySheet
        visible={categorySheetVisible}
        onClose={() => setCategorySheetVisible(false)}
        title={t('guides_training_editor.category_label')}
        options={categoryOptions}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {/* Image Modal */}
      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <PanGestureHandler onGestureEvent={handleSwipeGesture}>
          <View style={styles.imageModalOverlay}>
            <TouchableOpacity
              style={styles.imageModalCloseButton}
              onPress={closeImageModal}
            >
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={36}
                color="#FFFFFF"
              />
            </TouchableOpacity>
            {selectedImage && (
              <StorageImage
                source={{ uri: selectedImage }}
                style={styles.fullImage}
                resizeMode="contain"
              />
            )}
            <Text style={styles.swipeHint}>{t('guides_training.swipe_to_close')}</Text>
          </View>
        </PanGestureHandler>
      </Modal>

      {/* Detail Modal */}
      {selectedGuide && (
        <ContentDetailModal
          visible={detailModalVisible}
          onClose={closeDetailModal}
          title={getLocalizedField(selectedGuide, 'title', language)}
          content={getLocalizedField(selectedGuide, 'description', language) || t('guides_training.no_description')}
          thumbnailUrl={selectedGuide.thumbnail_url}
          guideFile={{
            id: selectedGuide.id,
            title: getLocalizedField(selectedGuide, 'title', language),
            file_url: selectedGuide.file_url,
            file_name: selectedGuide.file_name,
            file_type: selectedGuide.file_type,
          }}
          colors={colors}
        />
      )}
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
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    height: 46,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 13,
  },
  joltSlot: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  // flexShrink:0 + maxWidth: a long custom category ellipsizes inside this
  // button instead of squeezing the search field (RN defaults flexShrink to 0
  // on the row children, but the cap is what keeps the pill honest).
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 46,
    maxWidth: 158,
    flexShrink: 0,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 14,
  },
  categoryButtonText: {
    flexShrink: 1,
    fontFamily: fonts.body.semibold,
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    marginTop: 12,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 100,
  },
  resultsCount: {
    fontFamily: fonts.mono.medium,
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontFamily: fonts.display.bold,
    fontSize: 20,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginTop: 16,
  },
  retryButtonText: {
    fontFamily: fonts.body.semibold,
    fontSize: 14,
  },
  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 10,
  },
  guideBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  guideThumbnail: {
    width: 53,
    height: 53,
    borderRadius: 13,
    resizeMode: 'cover',
  },
  // Same box, minus `resizeMode` — that is an ImageStyle key and would not
  // type-check on the placeholder <View>.
  thumbFallback: {
    width: 53,
    height: 53,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideContent: {
    flex: 1,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginBottom: 4,
  },
  categoryBadgeText: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    letterSpacing: 0.4,
  },
  guideTitle: {
    fontFamily: fonts.display.semibold,
    fontSize: 15,
  },
  guideDescription: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    marginTop: 2,
  },
  guideMeta: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 7,
    flexShrink: 0,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalCloseButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
  },
  fullImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.8,
  },
  swipeHint: {
    position: 'absolute',
    bottom: 40,
    fontFamily: fonts.body.regular,
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.7,
  },
});
