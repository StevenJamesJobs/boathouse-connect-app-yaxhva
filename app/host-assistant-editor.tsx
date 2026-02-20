
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

export default function HostAssistantEditorScreen() {
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('host_assistant_editor.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Tab Selector */}
        <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'encyclopedia' && { backgroundColor: colors.highlight }]}
            onPress={() => setActiveTab('encyclopedia')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'encyclopedia' && { color: colors.text }]}>
              {t('host_assistant_editor.tab_encyclopedia')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'exams' && { backgroundColor: colors.highlight }]}
            onPress={() => setActiveTab('exams')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'exams' && { color: colors.text }]}>
              {t('host_assistant_editor.tab_host_exams')}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'encyclopedia' ? (
          <>
            {/* Checklists Editor Section */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="checklist"
                  android_material_icon_name="checklist"
                  size={32}
                  color={colors.highlight}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('host_assistant_editor.checklists_editor')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('host_assistant_editor.checklists_editor_desc')}
                  </Text>
                </View>
              </View>

              {/* Opening Checklist Editor */}
              <TouchableOpacity
                style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => router.push('/opening-checklist-editor')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="sunrise.fill"
                    android_material_icon_name="wb-sunny"
                    size={24}
                    color={colors.highlight}
                  />
                  <Text style={[styles.subCardText, { color: colors.text }]}>{t('host_assistant_editor.opening_checklist_editor')}</Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.text}
                />
              </TouchableOpacity>

              {/* Running Side Work Editor */}
              <TouchableOpacity
                style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => router.push('/running-side-work-editor')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="clock.fill"
                    android_material_icon_name="schedule"
                    size={24}
                    color={colors.highlight}
                  />
                  <Text style={[styles.subCardText, { color: colors.text }]}>{t('host_assistant_editor.running_side_work_editor')}</Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.text}
                />
              </TouchableOpacity>

              {/* Closing Checklist Editor */}
              <TouchableOpacity
                style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => router.push('/closing-checklist-editor')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="moon.fill"
                    android_material_icon_name="nightlight"
                    size={24}
                    color={colors.highlight}
                  />
                  <Text style={[styles.subCardText, { color: colors.text }]}>{t('host_assistant_editor.closing_checklist_editor')}</Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* Weekly Quiz Editor - Compact Design */}
            <TouchableOpacity
              style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => console.log('Weekly Quiz Editor - Coming Soon')}
            >
              <View style={styles.sectionCardContent}>
                <IconSymbol
                  ios_icon_name="questionmark.circle.fill"
                  android_material_icon_name="quiz"
                  size={32}
                  color={colors.highlight}
                />
                <View style={styles.sectionCardText}>
                  <Text style={[styles.sectionCardTitle, { color: colors.text }]}>{t('host_assistant_editor.weekly_quiz_editor')}</Text>
                  <Text style={[styles.sectionCardDescription, { color: colors.textSecondary }]}>
                    {t('host_assistant_editor.weekly_quiz_editor_desc')}
                  </Text>
                </View>
              </View>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={24}
                color={colors.text}
              />
            </TouchableOpacity>

            {/* Placeholder for future exam editors */}
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <IconSymbol
                ios_icon_name="info.circle.fill"
                android_material_icon_name="info"
                size={24}
                color={colors.highlight}
              />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {t('host_assistant_editor.more_exam_editors_coming')}
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
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
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
  sectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  sectionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  sectionCardText: {
    flex: 1,
  },
  sectionCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionCardDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  subCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
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
});
