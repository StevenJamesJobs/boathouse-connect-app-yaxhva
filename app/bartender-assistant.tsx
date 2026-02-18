
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function BartenderAssistantScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'encyclopedia' | 'exams'>('encyclopedia');

  // Use manager colors if user is a manager, otherwise use employee colors
  const colors = user?.role === 'manager' ? managerColors : employeeColors;

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('bartender_assistant.title')}</Text>
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
              {t('bartender_assistant.encyclopedia')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'exams' && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab('exams')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'exams' && { color: colors.text }]}>
              {t('bartender_assistant.bar_exams')}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'encyclopedia' ? (
          <>
            {/* Checklists Section - MOVED FROM BARTENDER BINDER */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="checklist"
                  android_material_icon_name="checklist"
                  size={32}
                  color={colors.primary}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('bartender_assistant.checklists')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('bartender_assistant.checklists_desc')}
                  </Text>
                </View>
              </View>
              
              {/* Opening Checklist */}
              <TouchableOpacity 
                style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => router.push('/bartender-opening-checklist')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="sunrise.fill"
                    android_material_icon_name="wb-sunny"
                    size={24}
                    color={colors.primary}
                  />
                  <Text style={[styles.subCardText, { color: colors.text }]}>{t('bartender_assistant.opening_checklist')}</Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              {/* Closing Checklist */}
              <TouchableOpacity 
                style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => router.push('/bartender-closing-checklist')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="moon.fill"
                    android_material_icon_name="nightlight"
                    size={24}
                    color={colors.primary}
                  />
                  <Text style={[styles.subCardText, { color: colors.text }]}>{t('bartender_assistant.closing_checklist')}</Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Libation Recipes Section */}
            <TouchableOpacity 
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/libation-recipes')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="wineglass"
                  android_material_icon_name="local-bar"
                  size={28}
                  color={colors.primary}
                />
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('bartender_assistant.libation_recipes')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('bartender_assistant.libation_recipes_desc')}
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

            {/* Cocktails A-Z Section */}
            <TouchableOpacity 
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/cocktails-az')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="list.bullet"
                  android_material_icon_name="format-list-bulleted"
                  size={28}
                  color={colors.primary}
                />
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('bartender_assistant.cocktails_az')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('bartender_assistant.cocktails_az_desc')}
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

            {/* Purees & Simple Syrups Recipes Section - NOW MATCHES COCKTAILS A-Z DESIGN */}
            <TouchableOpacity 
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/puree-syrup-recipes')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="drop.fill"
                  android_material_icon_name="opacity"
                  size={28}
                  color={colors.primary}
                />
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('bartender_assistant.purees_syrups')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('bartender_assistant.purees_syrups_desc')}
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
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('bartender_assistant.weekly_quiz')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('bartender_assistant.weekly_quiz_desc')}
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
                {t('bartender_assistant.more_exams_coming')}
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 16,
  },
  subCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  subCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subCardText: {
    fontSize: 15,
    fontWeight: '600',
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
