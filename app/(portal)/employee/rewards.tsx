
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

export default function EmployeeRewardsScreen() {
  const [activeTab, setActiveTab] = useState<'rewards' | 'reviews'>('rewards');

  return (
    <View style={styles.container}>
      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rewards' && styles.activeTab]}
          onPress={() => setActiveTab('rewards')}
        >
          <Text style={[styles.tabText, activeTab === 'rewards' && styles.activeTabText]}>
            Rewards
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reviews' && styles.activeTab]}
          onPress={() => setActiveTab('reviews')}
        >
          <Text style={[styles.tabText, activeTab === 'reviews' && styles.activeTabText]}>
            Reviews
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {activeTab === 'rewards' ? (
          <View style={styles.placeholderContainer}>
            <IconSymbol
              ios_icon_name="gift.fill"
              android_material_icon_name="card_giftcard"
              size={64}
              color={employeeColors.primary}
            />
            <Text style={styles.placeholderTitle}>Rewards</Text>
            <Text style={styles.placeholderText}>
              Your rewards and achievements will be displayed here.
            </Text>
            <Text style={styles.placeholderSubtext}>
              Earn rewards for your hard work and dedication!
            </Text>
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <IconSymbol
              ios_icon_name="star.fill"
              android_material_icon_name="rate_review"
              size={64}
              color={employeeColors.primary}
            />
            <Text style={styles.placeholderTitle}>Reviews</Text>
            <Text style={styles.placeholderText}>
              Your performance reviews will be displayed here.
            </Text>
            <Text style={styles.placeholderSubtext}>
              Track your progress and feedback from management.
            </Text>
          </View>
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: employeeColors.card,
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.border,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: employeeColors.primary,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: employeeColors.textSecondary,
  },
  activeTabText: {
    color: employeeColors.primary,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    minHeight: 400,
  },
  placeholderTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 16,
    color: employeeColors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
