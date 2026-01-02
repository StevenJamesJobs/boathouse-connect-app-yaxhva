
import React from 'react';
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
import { useAuth } from '@/contexts/AuthContext';

export default function EmployeeToolsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  // Get job titles array from user
  const jobTitles = user?.jobTitles || [];
  
  // Check if user can see Bar Assistant (Bartender or Manager)
  const canSeeBarAssistant = jobTitles.includes('Bartender') || jobTitles.includes('Manager');
  
  // Check if user can see Check Outs Calculator (Server or Manager)
  const canSeeCheckOutCalculator = jobTitles.includes('Server') || jobTitles.includes('Manager');

  return (
    <View style={styles.container}>
      {/* User's Name Header */}
      <View style={styles.nameHeader}>
        <Text style={styles.nameHeaderText}>{user?.name}&apos;s Tools</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* 1. Guides and Training Section - ALWAYS AT TOP FOR EVERYONE */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconSymbol
              ios_icon_name="book.fill"
              android_material_icon_name="menu-book"
              size={32}
              color={employeeColors.highlight}
            />
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Guides and Training</Text>
              <Text style={styles.cardDescription}>
                View training materials and guides
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.cardButton}
            onPress={() => router.push('/guides-and-training')}
          >
            <Text style={styles.cardButtonText}>View Guides</Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={employeeColors.text}
            />
          </TouchableOpacity>
        </View>

        {/* 2. Check Out Calculator Section - Only for Servers and Managers */}
        {canSeeCheckOutCalculator && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <IconSymbol
                ios_icon_name="clock.fill"
                android_material_icon_name="calculate"
                size={32}
                color={employeeColors.highlight}
              />
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Check Outs Calculator</Text>
                <Text style={styles.cardDescription}>
                  Calculate your shift check out totals and tip outs
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.cardButton}
              onPress={() => router.push('/check-out-calculator')}
            >
              <Text style={styles.cardButtonText}>Open Calculator</Text>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={20}
                color={employeeColors.text}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* 3. Bartender Assistant Section - Only for Bartenders and Managers */}
        {canSeeBarAssistant && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <IconSymbol
                ios_icon_name="wineglass.fill"
                android_material_icon_name="local-bar"
                size={32}
                color={employeeColors.highlight}
              />
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Bartender Assistant</Text>
                <Text style={styles.cardDescription}>
                  Access cocktail recipes, knowledge base, and bar exams
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.cardButton}
              onPress={() => router.push('/bartender-assistant')}
            >
              <Text style={styles.cardButtonText}>Open Bar Assistant</Text>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={20}
                color={employeeColors.text}
              />
            </TouchableOpacity>
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
  nameHeader: {
    backgroundColor: employeeColors.card,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.border,
  },
  nameHeaderText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: employeeColors.text,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 2,
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
    backgroundColor: employeeColors.highlight,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: employeeColors.text,
  },
});
