
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
  
  // Check if user can see Bar Assistant (Bartender, Manager, Lead Server, or Banquet Captain)
  const canSeeBarAssistant = jobTitles.includes('Bartender') || 
                             jobTitles.includes('Manager') || 
                             jobTitles.includes('Lead Server') || 
                             jobTitles.includes('Banquet Captain');
  
  // Check if user can see Host Assistant (Host or Manager)
  const canSeeHostAssistant = jobTitles.includes('Host') || jobTitles.includes('Manager');
  
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
        <TouchableOpacity 
          style={styles.card}
          onPress={() => router.push('/guides-and-training')}
          activeOpacity={0.7}
        >
          <View style={styles.cardContent}>
            <IconSymbol
              ios_icon_name="book.fill"
              android_material_icon_name="menu-book"
              size={28}
              color={employeeColors.highlight}
            />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Guides and Training</Text>
              <Text style={styles.cardDescription}>
                View training materials and guides
              </Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={employeeColors.textSecondary}
            />
          </View>
        </TouchableOpacity>

        {/* 2. Check Out Calculator Section - Only for Servers and Managers */}
        {canSeeCheckOutCalculator && (
          <TouchableOpacity 
            style={styles.card}
            onPress={() => router.push('/check-out-calculator')}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <IconSymbol
                ios_icon_name="clock.fill"
                android_material_icon_name="calculate"
                size={28}
                color={employeeColors.highlight}
              />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Check Outs Calculator</Text>
                <Text style={styles.cardDescription}>
                  Calculate your shift check out totals and tip outs
                </Text>
              </View>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={20}
                color={employeeColors.textSecondary}
              />
            </View>
          </TouchableOpacity>
        )}

        {/* 3. Bartender Assistant Section - For Bartenders, Managers, Lead Servers, and Banquet Captains */}
        {canSeeBarAssistant && (
          <TouchableOpacity 
            style={styles.card}
            onPress={() => router.push('/bartender-assistant')}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <IconSymbol
                ios_icon_name="wineglass.fill"
                android_material_icon_name="local-bar"
                size={28}
                color={employeeColors.highlight}
              />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Bartender Assistant</Text>
                <Text style={styles.cardDescription}>
                  Access cocktail recipes, knowledge base, and bar exams
                </Text>
              </View>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={20}
                color={employeeColors.textSecondary}
              />
            </View>
          </TouchableOpacity>
        )}

        {/* 4. Host Assistant Section - For Hosts and Managers */}
        {canSeeHostAssistant && (
          <TouchableOpacity 
            style={styles.card}
            onPress={() => router.push('/host-assistant')}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <IconSymbol
                ios_icon_name="person.2.fill"
                android_material_icon_name="people"
                size={28}
                color={employeeColors.highlight}
              />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Host Assistant</Text>
                <Text style={styles.cardDescription}>
                  Access OpenTable Academy, hosting resources, and host exams
                </Text>
              </View>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={20}
                color={employeeColors.textSecondary}
              />
            </View>
          </TouchableOpacity>
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
    borderRadius: 12,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 2,
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
    color: employeeColors.text,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: employeeColors.textSecondary,
    lineHeight: 18,
  },
});
