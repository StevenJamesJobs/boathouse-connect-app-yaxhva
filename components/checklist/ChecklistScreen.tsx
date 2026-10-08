import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAssistantEditor } from '@/hooks/useAssistantEditor';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { supabase } from '@/app/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import { resolveForOpen } from '@/utils/storageResolver';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavButton from '@/components/HeaderNavButton';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { categoryHue } from '@/components/content/contentVisuals';
import { fonts } from '@/constants/fonts';
import {
  CHECKLIST_ROUTES,
  isPdf,
  kindArgs,
  parseAttachments,
  userTitleKey,
  type ChecklistAttachment,
  type ChecklistKind,
  type ChecklistType,
} from '@/components/checklist/checklistConfig';

interface ChecklistItem {
  id: string;
  text: string;
  text_es: string | null;
  display_order: number;
  completed: boolean;
}

interface ChecklistCategory {
  id: string;
  name: string;
  name_es: string | null;
  display_order: number;
  attachments: ChecklistAttachment[];
  items: ChecklistItem[];
}

interface ChecklistScreenProps {
  kind: ChecklistKind;
  type: ChecklistType;
}

/**
 * s91 — the staff checklist view, ONE component for host · bartender · kitchen
 * × opening · closing · running side work (the ten 425-line route copies are
 * now thin wrappers). Extracted from the s74 glass bartender version, look and
 * keys unchanged; new this wave: a category's attachments (prep sheets, guides)
 * render as tinted chips under its header, tap to view.
 */
export default function ChecklistScreen({ kind, type }: ChecklistScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { canEdit } = useAssistantEditor();
  const isDark = useIsDarkTheme();
  const [categories, setCategories] = useState<ChecklistCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  // Guide attachments carry only an id — the org's guides are fetched once per
  // screen life, on the first tap, to find the file behind it.
  const guidesRef = useRef<Map<string, string> | null>(null);

  const colors = useThemeColors();
  const guideHue = categoryHue('Event', isDark);
  const routes = CHECKLIST_ROUTES[kind][type];
  const showEditor = canEdit(kind);

  useFocusEffect(
    useCallback(() => {
      loadChecklist();
    }, [])
  );

  const loadChecklist = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      const { data: categoriesData, error: categoriesError } = await supabase.rpc('get_checklist_categories', {
        p_actor_id: user.id,
        ...kindArgs(kind),
        p_checklist_type: type,
      });

      if (categoriesError) {
        console.error('Error loading categories:', categoriesError);
        throw categoriesError;
      }

      const { data: itemsData, error: itemsError } = await supabase.rpc('get_checklist_items', {
        p_actor_id: user.id,
        ...kindArgs(kind),
        p_checklist_type: type,
      });

      if (itemsError) {
        console.error('Error loading items:', itemsError);
        throw itemsError;
      }

      const today = new Date().toISOString().split('T')[0];
      const { data: progressData, error: progressError } = await supabase.rpc('get_my_checklist_progress', {
        p_actor_id: user.id,
        ...kindArgs(kind),
        p_date: today,
      });

      if (progressError) {
        console.error('Error loading progress:', progressError);
        throw progressError;
      }

      const progressMap = new Map(
        progressData?.map(p => [p.checklist_item_id, p.completed]) || []
      );

      const categoriesWithItems: ChecklistCategory[] = categoriesData?.map(cat => ({
        id: cat.id,
        name: cat.name,
        name_es: cat.name_es,
        display_order: cat.display_order,
        attachments: parseAttachments(cat.attachments),
        items: itemsData
          ?.filter(item => item.category_id === cat.id)
          .map(item => ({
            id: item.id,
            text: item.text,
            text_es: item.text_es,
            display_order: item.display_order,
            completed: progressMap.get(item.id) || false,
          })) || [],
      })) || [];

      setCategories(categoriesWithItems);

      const allCategoryIds = new Set(categoriesWithItems.map(c => c.id));
      setExpandedCategories(allCategoryIds);
    } catch (error) {
      console.error('Error loading checklist:', error);
      Alert.alert(t('common.error'), t('checklist.error_load'));
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const toggleItem = async (categoryId: string, itemId: string, currentCompleted: boolean) => {
    if (!user?.id) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const newCompleted = !currentCompleted;

      setCategories(prev => prev.map(cat => {
        if (cat.id === categoryId) {
          return {
            ...cat,
            items: cat.items.map(item =>
              item.id === itemId ? { ...item, completed: newCompleted } : item
            ),
          };
        }
        return cat;
      }));

      const { error } = await supabase.rpc('set_checklist_progress', {
        p_actor_id: user.id,
        ...kindArgs(kind),
        p_item_id: itemId,
        p_completed: newCompleted,
        p_date: today,
      });

      if (error) {
        console.error('Error updating progress:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error toggling item:', error);
      loadChecklist();
      Alert.alert(t('common.error'), t('checklist.error_load'));
    }
  };

  /** The stored URL behind a guide attachment (null when the guide is gone). */
  const guideFileUrl = async (guideId: string): Promise<string | null> => {
    if (!user?.id) return null;
    if (!guidesRef.current) {
      const { data, error } = await supabase.rpc('get_guides', { p_actor_id: user.id });
      if (error) throw error;
      guidesRef.current = new Map((data || []).map(g => [g.id, g.file_url]));
    }
    return guidesRef.current.get(guideId) ?? null;
  };

  // Opens an attachment the way Guides & Training opens a file: resolve the
  // stored URL at the leaf (the `file` signed tier post-flip), then hand off.
  const openAttachment = async (att: ChecklistAttachment, key: string) => {
    if (openingKey) return;
    try {
      setOpeningKey(key);
      const stored = att.kind === 'file' ? att.url : await guideFileUrl(att.guide_id);
      if (!stored) {
        Alert.alert(t('common.error'), t('checklist:attachment_guide_missing'));
        return;
      }
      const opened = await resolveForOpen(stored, { tier: 'file' });
      const canOpen = await Linking.canOpenURL(opened);
      if (canOpen) {
        await Linking.openURL(opened);
      } else {
        Alert.alert(t('common.error'), t('checklist:attachment_open_failed'));
      }
    } catch (error) {
      console.error('Error opening checklist attachment:', error);
      Alert.alert(t('common.error'), t('checklist:attachment_open_failed'));
    } finally {
      setOpeningKey(null);
    }
  };

  const getCompletionStats = () => {
    const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);
    const completedItems = categories.reduce(
      (sum, cat) => sum + cat.items.filter(item => item.completed).length,
      0
    );
    return { totalItems, completedItems };
  };

  const stats = getCompletionStats();
  const completionPercentage = stats.totalItems > 0
    ? Math.round((stats.completedItems / stats.totalItems) * 100)
    : 0;

  const header = (
    <>
      <AmbientGlow />
      <ScreenHeader
        title={t(userTitleKey(kind, type))}
        rightWide={showEditor}
        right={showEditor ? (
          <HeaderNavButton
            label={t('common:to_editor')}
            iconIos="pencil"
            iconAndroid="edit"
            onPress={() => router.replace(routes.editor as Href)}
          />
        ) : undefined}
      />
    </>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {header}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {header}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Today's progress */}
        <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressTitle, { color: colors.text }]}>{t('checklist.todays_progress')}</Text>
            <Text style={[styles.progressPercentage, { color: colors.primary }]}>
              {completionPercentage}%
            </Text>
          </View>
          <View style={[styles.progressBarBackground, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <View
              style={[
                styles.progressBarFill,
                { backgroundColor: colors.primary, width: `${completionPercentage}%` },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {t('checklist.tasks_completed', { completed: stats.completedItems, total: stats.totalItems })}
          </Text>
        </View>

        {categories.map((category) => {
          const isExpanded = expandedCategories.has(category.id);
          const categoryCompleted = category.items.length > 0 && category.items.every(item => item.completed);
          const categoryProgress = category.items.filter(item => item.completed).length;

          return (
            <View key={category.id} style={[styles.categoryCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => toggleCategory(category.id)}
                activeOpacity={0.7}
              >
                <View style={styles.categoryHeaderLeft}>
                  <IconSymbol
                    ios_icon_name={categoryCompleted ? 'checkmark.circle.fill' : 'circle'}
                    android_material_icon_name={categoryCompleted ? 'check-circle' : 'radio-button-unchecked'}
                    size={22}
                    color={categoryCompleted ? colors.primary : colors.textSecondary}
                  />
                  <View style={styles.categoryHeaderText}>
                    <Text style={[styles.categoryTitle, { color: colors.text }]}>
                      {getLocalizedField(category, 'name', language)}
                    </Text>
                    <Text style={[styles.categoryProgress, { color: colors.textSecondary }]}>
                      {t('checklist.category_progress', { done: categoryProgress, total: category.items.length })}
                    </Text>
                  </View>
                </View>
                <IconSymbol
                  ios_icon_name={isExpanded ? 'chevron.up' : 'chevron.down'}
                  android_material_icon_name={isExpanded ? 'expand-less' : 'expand-more'}
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.itemsContainer}>
                  {/* Attachments — the prep sheet(s) behind this category, before its items */}
                  {category.attachments.map((att, index) => {
                    const key = `${category.id}-${index}`;
                    const isGuide = att.kind === 'guide';
                    const hue = isGuide ? guideHue : colors.primary;
                    const pdf = !isGuide && isPdf(att.mime, att.name);
                    const typeLabel = isGuide ? t('content_editor.preview_guide') : pdf ? 'PDF' : t('checklist:attachment_image');
                    const busy = openingKey === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.attachment, { backgroundColor: hue + '1F', borderColor: hue + '47' }]}
                        onPress={() => openAttachment(att, key)}
                        disabled={!!openingKey}
                        activeOpacity={0.7}
                      >
                        <IconSymbol
                          ios_icon_name={isGuide ? 'doc.text.fill' : pdf ? 'doc.fill' : 'photo'}
                          android_material_icon_name={isGuide ? 'description' : pdf ? 'insert-drive-file' : 'image'}
                          size={16}
                          color={hue}
                        />
                        <View style={styles.attachmentBody}>
                          <Text style={[styles.attachmentName, { color: colors.text }]} numberOfLines={1}>
                            {att.name}
                          </Text>
                          <Text style={[styles.attachmentMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                            {`${typeLabel} · ${t('checklist:attachment_tap_to_view')}`}
                          </Text>
                        </View>
                        <View style={[styles.attachmentOpen, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                          {busy ? (
                            <ActivityIndicator size="small" color={colors.text} />
                          ) : (
                            <IconSymbol
                              ios_icon_name="arrow.up.right"
                              android_material_icon_name="open-in-new"
                              size={13}
                              color={colors.text}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {category.items.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.itemRow, { borderTopColor: colors.border + '55' }]}
                      onPress={() => toggleItem(category.id, item.id, item.completed)}
                      activeOpacity={0.7}
                    >
                      <IconSymbol
                        ios_icon_name={item.completed ? 'checkmark.square.fill' : 'square'}
                        android_material_icon_name={item.completed ? 'check-box' : 'check-box-outline-blank'}
                        size={22}
                        color={item.completed ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.itemText,
                          { color: colors.text },
                          item.completed && styles.itemTextCompleted,
                        ]}
                      >
                        {getLocalizedField(item, 'text', language)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  progressCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 16,
    marginBottom: 14,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontFamily: fonts.display.semibold,
    fontSize: 15,
  },
  progressPercentage: {
    fontFamily: fonts.mono.semibold,
    fontSize: 22,
  },
  progressBarBackground: {
    height: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    overflow: 'hidden',
    marginBottom: 9,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressText: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
  },
  categoryCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginBottom: 10,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 11,
  },
  categoryHeaderText: {
    flex: 1,
  },
  categoryTitle: {
    fontFamily: fonts.display.semibold,
    fontSize: 15,
    marginBottom: 2,
  },
  categoryProgress: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
  },
  itemsContainer: {
    paddingBottom: 8,
  },
  // The mockup's `.att` chip: tinted row, icon · name + mono meta · open square.
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  attachmentBody: {
    flex: 1,
    minWidth: 0,
  },
  attachmentName: {
    fontFamily: fonts.body.semibold,
    fontSize: 12.5,
  },
  attachmentMeta: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  attachmentOpen: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemText: {
    flex: 1,
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  itemTextCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.55,
  },
});
