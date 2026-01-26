
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

export default function BartenderAssistantEditorScreen() {
  const router = useRouter();
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
        <Text style={styles.headerTitle}>Bartender Assistant Editor</Text>
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
              Encyclopedia
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'exams' && styles.activeTab]}
            onPress={() => setActiveTab('exams')}
          >
            <Text style={[styles.tabText, activeTab === 'exams' && styles.activeTabText]}>
              Bar Exams
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'encyclopedia' ? (
          <>
            {/* Checklists Editor Section - MOVED FROM BARTENDER BINDER EDITOR */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="checklist"
                  android_material_icon_name="checklist"
                  size={32}
                  color={managerColors.highlight}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={styles.cardTitle}>Checklists Editor</Text>
                  <Text style={styles.cardDescription}>
                    Manage opening and closing checklists
                  </Text>
                </View>
              </View>
              
              {/* Opening Checklist Editor */}
              <TouchableOpacity 
                style={styles.subCardButton}
                onPress={() => router.push('/bartender-opening-checklist-editor')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="sunrise.fill"
                    android_material_icon_name="wb-sunny"
                    size={24}
                    color={managerColors.highlight}
                  />
                  <Text style={styles.subCardText}>Opening Checklist Editor</Text>
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
                onPress={() => router.push('/bartender-closing-checklist-editor')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="moon.fill"
                    android_material_icon_name="nightlight"
                    size={24}
                    color={managerColors.highlight}
                  />
                  <Text style={styles.subCardText}>Closing Checklist Editor</Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={managerColors.text}
                />
              </TouchableOpacity>
            </View>

            {/* Libation Recipes Editor */}
            <TouchableOpacity 
              style={styles.card}
              onPress={() => router.push('/libation-recipes-editor')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="wineglass"
                  android_material_icon_name="local-bar"
                  size={28}
                  color={managerColors.highlight}
                />
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>Libation Recipes Editor</Text>
                  <Text style={styles.cardDescription}>
                    Add and manage cocktail recipes by category
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={managerColors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Cocktails A-Z Editor */}
            <TouchableOpacity 
              style={styles.card}
              onPress={() => router.push('/cocktails-az-editor')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="list.bullet"
                  android_material_icon_name="format-list-bulleted"
                  size={28}
                  color={managerColors.highlight}
                />
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>Cocktails A-Z Editor</Text>
                  <Text style={styles.cardDescription}>
                    Add and manage cocktail recipes alphabetically
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={managerColors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Purees & Syrups Recipes Editor - MOVED FROM BARTENDER BINDER EDITOR */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="drop.fill"
                  android_material_icon_name="opacity"
                  size={32}
                  color={managerColors.highlight}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={styles.cardTitle}>Purees & Simple Syrups Recipes Editor</Text>
                  <Text style={styles.cardDescription}>
                    Manage puree and simple syrup recipes
                  </Text>
                </View>
              </View>
              
              {/* Purees & Syrups Recipes Editor Button */}
              <TouchableOpacity 
                style={styles.subCardButton}
                onPress={() => router.push('/puree-syrup-recipes-editor')}
              >
                <View style={styles.subCardContent}>
                  <IconSymbol
                    ios_icon_name="drop.fill"
                    android_material_icon_name="opacity"
                    size={24}
                    color={managerColors.highlight}
                  />
                  <Text style={styles.subCardText}>Purees & Syrups Editor</Text>
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
            {/* Weekly Quiz Editor */}
            <TouchableOpacity 
              style={styles.card}
              onPress={() => console.log('Weekly Quiz Editor - Coming Soon')}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="questionmark.circle.fill"
                  android_material_icon_name="quiz"
                  size={28}
                  color={managerColors.highlight}
                />
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>Weekly Quiz Editor</Text>
                  <Text style={styles.cardDescription}>
                    Create and manage weekly bartending quizzes
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={managerColors.textSecondary}
                />
              </View>
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
                More exam editor sections will be added here in the future!
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
  card: {
    backgroundColor: managerColors.card,
    borderRadius: 12,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
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
    color: managerColors.text,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: managerColors.textSecondary,
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
    backgroundColor: managerColors.background,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 12,
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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  },
});
