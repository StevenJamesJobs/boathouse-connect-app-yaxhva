
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

export default function BartenderAssistantScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'encyclopedia' | 'exams'>('encyclopedia');

  // Use manager colors if user is a manager, otherwise use employee colors
  const isManager = user?.role === 'manager';
  const colors = isManager ? managerColors : employeeColors;

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Bartender Assistant</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Tab Selector */}
        <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'encyclopedia' && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab('encyclopedia')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'encyclopedia' ? colors.text : colors.textSecondary }]}>
              Encyclopedia
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'exams' && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab('exams')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'exams' ? colors.text : colors.textSecondary }]}>
              Bar Exams
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'encyclopedia' ? (
          <>
            {/* Cocktails A-Z Section */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="list.bullet"
                  android_material_icon_name="format-list-bulleted"
                  size={32}
                  color={colors.primary}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Cocktails A-Z</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    Browse all cocktails alphabetically
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.cardButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/cocktails-az')}
              >
                <Text style={[styles.cardButtonText, { color: colors.text }]}>View Cocktails</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>

            {/* Signature Recipes Section */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="star.fill"
                  android_material_icon_name="star"
                  size={32}
                  color={colors.primary}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Signature Recipes</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    McLoone&apos;s exclusive cocktail recipes
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.cardButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/signature-recipes')}
              >
                <Text style={[styles.cardButtonText, { color: colors.text }]}>View Recipes</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>

            {/* General Knowledge Section */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="lightbulb.fill"
                  android_material_icon_name="lightbulb"
                  size={32}
                  color={colors.primary}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>General Knowledge</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    Bar techniques, spirits, and mixology basics
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.cardButton, { backgroundColor: colors.primary }]}
                onPress={() => console.log('General Knowledge - Coming Soon')}
              >
                <Text style={[styles.cardButtonText, { color: colors.text }]}>Coming Soon</Text>
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
            {/* Weekly Quiz Section */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="questionmark.circle.fill"
                  android_material_icon_name="quiz"
                  size={32}
                  color={colors.primary}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Weekly Quiz</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    Test your bartending knowledge
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.cardButton, { backgroundColor: colors.primary }]}
                onPress={() => console.log('Weekly Quiz - Coming Soon')}
              >
                <Text style={[styles.cardButtonText, { color: colors.text }]}>Coming Soon</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>

            {/* Placeholder for future exam sections */}
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <IconSymbol
                ios_icon_name="info.circle.fill"
                android_material_icon_name="info"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
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
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardButtonText: {
    fontSize: 16,
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
