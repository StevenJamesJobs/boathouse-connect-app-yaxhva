
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function HostAssistantEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'encyclopedia' | 'exams'>('encyclopedia');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('host_assistant_editor.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'encyclopedia' && styles.activeTab]}
            onPress={() => setActiveTab('encyclopedia')}
          >
            <Text style={[styles.tabText, activeTab === 'encyclopedia' && styles.activeTabText]}>
              {t('host_assistant_editor.tab_encyclopedia')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'exams' && styles.activeTab]}
            onPress={() => setActiveTab('exams')}
          >
            <Text style={[styles.tabText, activeTab === 'exams' && styles.activeTabText]}>
              {t('host_assistant_editor.tab_host_exams')}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'encyclopedia' ? (
          <>
            {/* Checklists Editor Section */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="checklist"
                  android_material_icon_name="checklist"
                  size={32}
                  color={managerColors.highlight}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={styles.cardTitle}>{t('host_assistant_editor.checklists_editor')}</Text>
                  <Text style={styles.cardDescription}>
                    {t('host_assistant_editor.checklists_editor_desc')}
                  </Text>
                </View>
              </View>
              
              {/* Opening Checklist Editor */}
              <TouchableOpacity 
                style={styles.subCardButton}
                onPress={() => router.push('/opening-checklist-editor')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="sunrise.fill"
                    android_material_icon_name="wb-sunny"
                    size={24}
                    color={managerColors.highlight}
                  />
                  <Text style={styles.subCardText}>{t('host_assistant_editor.opening_checklist_editor')}</Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={managerColors.text}
                />
              </TouchableOpacity>

              {/* Running Side Work Editor */}
              <TouchableOpacity
                style={styles.subCardButton}
                onPress={() => router.push('/running-side-work-editor')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="clock.fill"
                    android_material_icon_name="schedule"
                    size={24}
                    color={managerColors.highlight}
                  />
                  <Text style={styles.subCardText}>{t('host_assistant_editor.running_side_work_editor')}</Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={managerColors.text}
                />
              </TouchableOpacity>

              {/* Closing Checklist Editor */}
              <TouchableOpacity
                style={styles.subCardButton}
                onPress={() => router.push('/closing-checklist-editor')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="moon.fill"
                    android_material_icon_name="nightlight"
                    size={24}
                    color={managerColors.highlight}
                  />
                  <Text style={styles.subCardText}>{t('host_assistant_editor.closing_checklist_editor')}</Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={managerColors.text}
                />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* Weekly Quiz Editor - Compact Design */}
            <TouchableOpacity 
              style={styles.sectionCard}
              onPress={() => console.log('Weekly Quiz Editor - Coming Soon')}
            >
              <View style={styles.sectionCardContent}>
                <IconSymbol
                  ios_icon_name="questionmark.circle.fill"
                  android_material_icon_name="quiz"
                  size={32}
                  color={managerColors.highlight}
                />
                <View style={styles.sectionCardText}>
                  <Text style={styles.sectionCardTitle}>{t('host_assistant_editor.weekly_quiz_editor')}</Text>
                  <Text style={styles.sectionCardDescription}>
                    {t('host_assistant_editor.weekly_quiz_editor_desc')}
                  </Text>
                </View>
              </View>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={24}
                color={managerColors.text}
              />
            </TouchableOpacity>

            {/* Placeholder for future exam editors */}
            <View style={styles.infoCard}>
              <IconSymbol
                ios_icon_name="info.circle.fill"
                android_material_icon_name="info"
                size={24}
                color={managerColors.highlight}
              />
              <Text style={styles.infoText}>
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
    backgroundColor: managerColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: managerColors.card,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
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
    backgroundColor: managerColors.card,
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
  activeTab: {
    backgroundColor: managerColors.highlight,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  activeTabText: {
    color: managerColors.text,
  },
  sectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: managerColors.border,
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
    color: managerColors.text,
    marginBottom: 4,
  },
  sectionCardDescription: {
    fontSize: 14,
    color: managerColors.textSecondary,
    lineHeight: 18,
  },
  card: {
    backgroundColor: managerColors.card,
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
    color: managerColors.text,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: managerColors.textSecondary,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: managerColors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  subCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: managerColors.background,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  subCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subCardText: {
    fontSize: 15,
    fontWeight: '600',
    color: managerColors.text,
  },
});
