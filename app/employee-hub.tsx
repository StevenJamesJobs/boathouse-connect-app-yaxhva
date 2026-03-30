import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';

export default function EmployeeHubScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();

  const sections = [
    {
      key: 'employee_management',
      title: t('manager_tools.employee_management'),
      description: t('manager_manage.employee_management_desc'),
      iosIcon: 'person.2.fill' as const,
      androidIcon: 'people' as const,
      route: '/employee-editor',
      iconColor: colors.primary,
    },
    {
      key: 'staff_schedules',
      title: t('manager_manage.schedules', 'Staff Schedules'),
      description: t('manager_manage.schedules_desc', 'Upload & manage staff schedules'),
      iosIcon: 'calendar' as const,
      androidIcon: 'schedule' as const,
      route: '/schedule-upload',
      iconColor: '#FF9800',
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('manager_tools.employee_management')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section, index) => (
          <TouchableOpacity
            key={section.key}
            style={[
              styles.card,
              { backgroundColor: colors.card },
              index === sections.length - 1 && styles.lastCard,
            ]}
            onPress={() => router.push(section.route as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: section.iconColor + '12' }]}>
              <IconSymbol
                ios_icon_name={section.iosIcon}
                android_material_icon_name={section.androidIcon}
                size={26}
                color={section.iconColor}
              />
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{section.title}</Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                {section.description}
              </Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
      <BottomNavBar activeTab="manage" />
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
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 4,
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lastCard: {
    marginBottom: 0,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextContainer: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
});
