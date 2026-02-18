
import React from 'react';
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
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

export default function ManagerToolsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

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
              color={managerColors.highlight}
            />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{t('manager_tools.guides_training')}</Text>
              <Text style={styles.cardDescription}>
                {t('manager_tools.guides_training_desc')}
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

        {/* 2. Check Out Calculator Section - Only for Servers and Managers */}
        {canSeeCheckOutCalculator && (
          <TouchableOpacity 
            style={styles.card}
            onPress={() => router.push('/check-out-calculator')}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <IconSymbol
                ios_icon_name="clock"
                android_material_icon_name="calculate"
                size={28}
                color={managerColors.highlight}
              />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{t('employee_tools.check_out_calculator')}</Text>
                <Text style={styles.cardDescription}>
                  {t('employee_tools.check_out_calculator_desc')}
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
                color={managerColors.highlight}
              />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{t('employee_tools.bartender_assistant')}</Text>
                <Text style={styles.cardDescription}>
                  {t('employee_tools.bartender_assistant_desc')}
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
                color={managerColors.highlight}
              />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{t('employee_tools.host_assistant')}</Text>
                <Text style={styles.cardDescription}>
                  {t('employee_tools.host_assistant_desc')}
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
  nameHeader: {
    backgroundColor: managerColors.card,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  nameHeaderText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: managerColors.text,
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
});
