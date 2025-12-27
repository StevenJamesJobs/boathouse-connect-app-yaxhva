
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';

export default function BartenderAssistantScreen() {
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
            color={employeeColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bartender Assistant</Text>
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
            {/* Cocktails A-Z Section */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="list.bullet"
                  android_material_icon_name="format-list-bulleted"
                  size={32}
                  color={employeeColors.primary}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={styles.cardTitle}>Cocktails A-Z</Text>
                  <Text style={styles.cardDescription}>
                    Browse all cocktails alphabetically
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.cardButton}
                onPress={() => console.log('Cocktails A-Z - Coming Soon')}
              >
                <Text style={styles.cardButtonText}>Coming Soon</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={employeeColors.text}
                />
              </TouchableOpacity>
            </View>

            {/* Signature Recipes Section */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="star.fill"
                  android_material_icon_name="star"
                  size={32}
                  color={employeeColors.primary}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={styles.cardTitle}>Signature Recipes</Text>
                  <Text style={styles.cardDescription}>
                    McLoone&apos;s exclusive cocktail recipes
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.cardButton}
                onPress={() => console.log('Signature Recipes - Coming Soon')}
              >
                <Text style={styles.cardButtonText}>Coming Soon</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={employeeColors.text}
                />
              </TouchableOpacity>
            </View>

            {/* General Knowledge Section */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="lightbulb.fill"
                  android_material_icon_name="lightbulb"
                  size={32}
                  color={employeeColors.primary}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={styles.cardTitle}>General Knowledge</Text>
                  <Text style={styles.cardDescription}>
                    Bar techniques, spirits, and mixology basics
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.cardButton}
                onPress={() => console.log('General Knowledge - Coming Soon')}
              >
                <Text style={styles.cardButtonText}>Coming Soon</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={employeeColors.text}
                />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* Weekly Quiz Section */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="questionmark.circle.fill"
                  android_material_icon_name="quiz"
                  size={32}
                  color={employeeColors.primary}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={styles.cardTitle}>Weekly Quiz</Text>
                  <Text style={styles.cardDescription}>
                    Test your bartending knowledge
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.cardButton}
                onPress={() => console.log('Weekly Quiz - Coming Soon')}
              >
                <Text style={styles.cardButtonText}>Coming Soon</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={employeeColors.text}
                />
              </TouchableOpacity>
            </View>

            {/* Placeholder for future exam sections */}
            <View style={styles.infoCard}>
              <IconSymbol
                ios_icon_name="info.circle.fill"
                android_material_icon_name="info"
                size={24}
                color={employeeColors.primary}
              />
              <Text style={styles.infoText}>
                More exam sections will be added here in the future!
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
    backgroundColor: employeeColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: employeeColors.card,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.border,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: employeeColors.text,
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
    backgroundColor: employeeColors.card,
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
  activeTab: {
    backgroundColor: employeeColors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: employeeColors.textSecondary,
  },
  activeTabText: {
    color: employeeColors.text,
  },
  card: {
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
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
    color: employeeColors.text,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: employeeColors.textSecondary,
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: employeeColors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: employeeColors.text,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: employeeColors.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: employeeColors.textSecondary,
    fontStyle: 'italic',
  },
});
