
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/app/integrations/supabase/client';
import { useTranslation } from 'react-i18next';

interface ChecklistItem {
  id: string;
  text: string;
  display_order: number;
  completed: boolean;
}

interface ChecklistCategory {
  id: string;
  name: string;
  display_order: number;
  items: ChecklistItem[];
}

export default function BartenderOpeningChecklistScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [categories, setCategories] = useState<ChecklistCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const colors = user?.role === 'manager' ? managerColors : employeeColors;

  useFocusEffect(
    useCallback(() => {
      loadChecklist();
    }, [])
  );

  const loadChecklist = async () => {
    console.log('Loading Bartender Opening Checklist for user:', user?.id);
    try {
      setLoading(true);

      const { data: categoriesData, error: categoriesError } = await supabase
        .from('bartender_checklist_categories')
        .select('*')
        .eq('checklist_type', 'opening')
        .eq('is_active', true)
        .order('display_order');

      if (categoriesError) {
        console.error('Error loading categories:', categoriesError);
        throw categoriesError;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from('bartender_checklist_items')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (itemsError) {
        console.error('Error loading items:', itemsError);
        throw itemsError;
      }

      const today = new Date().toISOString().split('T')[0];
      const { data: progressData, error: progressError } = await supabase
        .from('user_bartender_checklist_progress')
        .select('*')
        .eq('user_id', user?.id)
        .eq('completed_date', today);

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
        display_order: cat.display_order,
        items: itemsData
          ?.filter(item => item.category_id === cat.id)
          .map(item => ({
            id: item.id,
            text: item.text,
            display_order: item.display_order,
            completed: progressMap.get(item.id) || false,
          })) || [],
      })) || [];

      setCategories(categoriesWithItems);
      
      const allCategoryIds = new Set(categoriesWithItems.map(c => c.id));
      setExpandedCategories(allCategoryIds);

      console.log('Loaded bartender checklist with', categoriesWithItems.length, 'categories');
    } catch (error) {
      console.error('Error loading checklist:', error);
      Alert.alert(t('common.error'), t('checklist.error_load'));
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    console.log('Toggling category:', categoryId);
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
    console.log('Toggling item:', itemId, 'from', currentCompleted, 'to', !currentCompleted);
    
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

      if (newCompleted) {
        const { error } = await supabase
          .from('user_bartender_checklist_progress')
          .upsert({
            user_id: user?.id,
            checklist_item_id: itemId,
            completed: true,
            completed_date: today,
          }, {
            onConflict: 'user_id,checklist_item_id,completed_date',
          });

        if (error) {
          console.error('Error updating progress:', error);
          throw error;
        }
      } else {
        const { error } = await supabase
          .from('user_bartender_checklist_progress')
          .delete()
          .eq('user_id', user?.id)
          .eq('checklist_item_id', itemId)
          .eq('completed_date', today);

        if (error) {
          console.error('Error deleting progress:', error);
          throw error;
        }
      }

      console.log('Item toggled successfully');
    } catch (error) {
      console.error('Error toggling item:', error);
      loadChecklist();
      Alert.alert('Error', 'Failed to update checklist. Please try again.');
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

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow-back"
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('checklist.title_bartender_opening')}</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('checklist.title_bartender_opening')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <View style={[styles.progressCard, { backgroundColor: colors.card }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressTitle, { color: colors.text }]}>{t('checklist.todays_progress')}</Text>
            <Text style={[styles.progressPercentage, { color: colors.primary }]}>
              {completionPercentage}%
            </Text>
          </View>
          <View style={[styles.progressBarBackground, { backgroundColor: colors.background }]}>
            <View 
              style={[
                styles.progressBarFill, 
                { backgroundColor: colors.primary, width: `${completionPercentage}%` }
              ]} 
            />
          </View>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {t('checklist.tasks_completed', { completed: stats.completedItems, total: stats.totalItems })}
          </Text>
        </View>

        {categories.map((category) => {
          const isExpanded = expandedCategories.has(category.id);
          const categoryCompleted = category.items.every(item => item.completed);
          const categoryProgress = category.items.filter(item => item.completed).length;

          return (
            <View key={category.id} style={[styles.categoryCard, { backgroundColor: colors.card }]}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => toggleCategory(category.id)}
                activeOpacity={0.7}
              >
                <View style={styles.categoryHeaderLeft}>
                  <IconSymbol
                    ios_icon_name={categoryCompleted ? 'checkmark.circle.fill' : 'circle'}
                    android_material_icon_name={categoryCompleted ? 'check-circle' : 'radio-button-unchecked'}
                    size={24}
                    color={categoryCompleted ? colors.primary : colors.textSecondary}
                  />
                  <View style={styles.categoryHeaderText}>
                    <Text style={[styles.categoryTitle, { color: colors.text }]}>
                      {category.name}
                    </Text>
                    <Text style={[styles.categoryProgress, { color: colors.textSecondary }]}>
                      {t('checklist.category_progress', { done: categoryProgress, total: category.items.length })}
                    </Text>
                  </View>
                </View>
                <IconSymbol
                  ios_icon_name={isExpanded ? 'chevron.up' : 'chevron.down'}
                  android_material_icon_name={isExpanded ? 'expand-less' : 'expand-more'}
                  size={24}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.itemsContainer}>
                  {category.items.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.itemRow, { borderTopColor: colors.border }]}
                      onPress={() => toggleItem(category.id, item.id, item.completed)}
                      activeOpacity={0.7}
                    >
                      <IconSymbol
                        ios_icon_name={item.completed ? 'checkmark.square.fill' : 'square'}
                        android_material_icon_name={item.completed ? 'check-box' : 'check-box-outline-blank'}
                        size={24}
                        color={item.completed ? colors.primary : colors.textSecondary}
                      />
                      <Text 
                        style={[
                          styles.itemText, 
                          { color: colors.text },
                          item.completed && styles.itemTextCompleted
                        ]}
                      >
                        {item.text}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
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
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  progressCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressPercentage: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  progressBarBackground: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
  },
  categoryCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  categoryHeaderText: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  categoryProgress: {
    fontSize: 13,
  },
  itemsContainer: {
    paddingBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: 1,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  itemTextCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
});
