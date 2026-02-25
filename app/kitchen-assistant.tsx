
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function KitchenAssistantScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [activeTab, setActiveTab] = useState<'encyclopedia' | 'exams'>('encyclopedia');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('kitchen_assistant.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Tab Selector */}
        <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'encyclopedia' && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab('encyclopedia')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'encyclopedia' && { color: colors.text }]}>
              {t('kitchen_assistant.encyclopedia')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'exams' && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab('exams')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'exams' && { color: colors.text }]}>
              {t('kitchen_assistant.kitchen_exams')}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'encyclopedia' ? (
          <>
            {/* Main Menu Recipes Section - Coming Soon */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => console.log('Main Menu Recipes - Coming Soon')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="book.pages"
                  android_material_icon_name="menu-book"
                  size={28}
                  color={colors.primary}
                />
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('kitchen_assistant.main_menu_recipes')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('kitchen_assistant.main_menu_recipes_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Banquet Recipes Section - Coming Soon */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => console.log('Banquet Recipes - Coming Soon')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="person.3.fill"
                  android_material_icon_name="groups"
                  size={28}
                  color={colors.primary}
                />
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('kitchen_assistant.banquet_recipes')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('kitchen_assistant.banquet_recipes_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Buffet Recipes Section - Coming Soon */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => console.log('Buffet Recipes - Coming Soon')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="list.clipboard.fill"
                  android_material_icon_name="list-alt"
                  size={28}
                  color={colors.primary}
                />
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('kitchen_assistant.buffet_recipes')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('kitchen_assistant.buffet_recipes_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Weekly Quiz Section */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => console.log('Weekly Quiz - Coming Soon')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="questionmark.circle.fill"
                  android_material_icon_name="quiz"
                  size={28}
                  color={colors.primary}
                />
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('kitchen_assistant.weekly_quiz')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('kitchen_assistant.weekly_quiz_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Placeholder for future exam sections */}
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <IconSymbol
                ios_icon_name="info.circle.fill"
                android_material_icon_name="info"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {t('kitchen_assistant.more_exams_coming')}
              </Text>
            </View>
          </>
        )}
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
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    borderRadius: 12,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontStyle: 'italic',
  },
});
