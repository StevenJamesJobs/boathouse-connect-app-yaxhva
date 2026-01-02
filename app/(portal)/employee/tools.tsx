
import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';

export default function ToolsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const colors = isManager ? managerColors : employeeColors;
  
  // Get job titles array from user
  const jobTitles = user?.jobTitles || [];
  
  // Check if user can see Bar Assistant (Bartender or Manager)
  const canSeeBarAssistant = jobTitles.includes('Bartender') || jobTitles.includes('Manager');
  
  // Check if user can see Check Outs Calculator (Server or Manager)
  const canSeeCheckOutCalculator = jobTitles.includes('Server') || jobTitles.includes('Manager');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Text style={styles.headerTitle}>{isManager ? 'Manager' : 'Employee'} Portal</Text>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.contentContainer,
          Platform.OS !== 'ios' && styles.contentContainerWithTabBar
        ]}
      >
        <Text style={[styles.pageTitle, { color: colors.text }]}>Tools & Resources</Text>

        {/* 1. Guides and Training - Always visible at top */}
        <TouchableOpacity
          style={[styles.toolCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/guides-and-training')}
        >
          <View style={[styles.iconContainer, { backgroundColor: colors.highlight }]}>
            <IconSymbol
              ios_icon_name="book.fill"
              android_material_icon_name="menu-book"
              size={32}
              color={colors.primary}
            />
          </View>
          <View style={styles.toolContent}>
            <Text style={[styles.toolTitle, { color: colors.text }]}>Guides and Training</Text>
            <Text style={[styles.toolDescription, { color: colors.textSecondary }]}>
              Access training materials and guides
            </Text>
          </View>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={24}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        {/* 2. Check Outs Calculator - Only for Servers and Managers */}
        {canSeeCheckOutCalculator && (
          <TouchableOpacity
            style={[styles.toolCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/check-out-calculator')}
          >
            <View style={[styles.iconContainer, { backgroundColor: colors.highlight }]}>
              <IconSymbol
                ios_icon_name="dollarsign.circle.fill"
                android_material_icon_name="attach-money"
                size={32}
                color={colors.primary}
              />
            </View>
            <View style={styles.toolContent}>
              <Text style={[styles.toolTitle, { color: colors.text }]}>Check Outs Calculator</Text>
              <Text style={[styles.toolDescription, { color: colors.textSecondary }]}>
                Calculate your end-of-shift checkout
              </Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}

        {/* 3. Bar Assistant - Only for Bartenders and Managers */}
        {canSeeBarAssistant && (
          <TouchableOpacity
            style={[styles.toolCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/bartender-assistant')}
          >
            <View style={[styles.iconContainer, { backgroundColor: colors.highlight }]}>
              <IconSymbol
                ios_icon_name="wineglass.fill"
                android_material_icon_name="local-bar"
                size={32}
                color={colors.primary}
              />
            </View>
            <View style={styles.toolContent}>
              <Text style={[styles.toolTitle, { color: colors.text }]}>Bar Assistant</Text>
              <Text style={[styles.toolDescription, { color: colors.textSecondary }]}>
                Quick reference for cocktails and recipes
              </Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  logoutButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
  },
  logoutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  contentContainerWithTabBar: {
    paddingBottom: 100,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  toolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  toolContent: {
    flex: 1,
  },
  toolTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  toolDescription: {
    fontSize: 14,
  },
});
