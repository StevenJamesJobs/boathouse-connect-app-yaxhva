
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

export default function ManagerManageScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'newsfeed' | 'employee' | 'management'>('newsfeed');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* User's Name Header */}
      <View style={[styles.nameHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.nameHeaderText, { color: colors.text }]}>{t('manager_manage.editors_header', { name: user?.name })}</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Tab Selector */}
        <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'newsfeed' && { backgroundColor: colors.highlight }]}
            onPress={() => setActiveTab('newsfeed')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'newsfeed' && { color: colors.text }]}>
              {t('manager_manage.tab_newsfeed')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'employee' && { backgroundColor: colors.highlight }]}
            onPress={() => setActiveTab('employee')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'employee' && { color: colors.text }]}>
              {t('manager_manage.tab_employee')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'management' && { backgroundColor: colors.highlight }]}
            onPress={() => setActiveTab('management')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'management' && { color: colors.text }]}>
              {t('manager_manage.tab_management')}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'newsfeed' ? (
          <>
            {/* Announcements Editor */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/announcement-editor')}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="megaphone.fill"
                  android_material_icon_name="campaign"
                  size={28}
                  color={colors.highlight}
                />
                <View style={styles.cardTextContainer}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.announcements_editor')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('manager_manage.announcements_editor_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={24}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Special Features Editor - MOVED ABOVE Upcoming Events */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/special-features-editor')}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="star.fill"
                  android_material_icon_name="star"
                  size={28}
                  color={colors.highlight}
                />
                <View style={styles.cardTextContainer}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.special_features_editor')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('manager_manage.special_features_editor_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={24}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Upcoming Events Editor - MOVED BELOW Special Features */}
            <TouchableOpacity
              style={[styles.card, styles.lastCard, { backgroundColor: colors.card }]}
              onPress={() => router.push('/upcoming-events-editor')}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="calendar"
                  android_material_icon_name="event"
                  size={28}
                  color={colors.highlight}
                />
                <View style={styles.cardTextContainer}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.upcoming_events_editor')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('manager_manage.upcoming_events_editor_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={24}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>
          </>
        ) : activeTab === 'employee' ? (
          <>
            {/* Guides and Training Editor */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/guides-and-training-editor')}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="square.and.pencil"
                  android_material_icon_name="book"
                  size={28}
                  color={colors.highlight}
                />
                <View style={styles.cardTextContainer}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.guides_training_editor')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('manager_manage.guides_training_editor_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={24}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Bartender Assistant Editor */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/bartender-assistant-editor')}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="wineglass.fill"
                  android_material_icon_name="local-bar"
                  size={28}
                  color={colors.highlight}
                />
                <View style={styles.cardTextContainer}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.bartender_assistant_editor')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('manager_manage.bartender_assistant_editor_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={24}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Host Assistant Editor */}
            <TouchableOpacity
              style={[styles.card, styles.lastCard, { backgroundColor: colors.card }]}
              onPress={() => router.push('/host-assistant-editor')}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="person.2.fill"
                  android_material_icon_name="people"
                  size={28}
                  color={colors.highlight}
                />
                <View style={styles.cardTextContainer}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.host_assistant_editor')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('manager_manage.host_assistant_editor_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={24}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Employee Management */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/employee-editor')}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="person.2.fill"
                  android_material_icon_name="people"
                  size={28}
                  color={colors.highlight}
                />
                <View style={styles.cardTextContainer}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_tools.employee_management')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('manager_manage.employee_management_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={24}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Rewards and Reviews Editor - MOVED FROM Employee tab */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/rewards-and-reviews-editor')}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="gift.fill"
                  android_material_icon_name="star"
                  size={28}
                  color={colors.highlight}
                />
                <View style={styles.cardTextContainer}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.rewards_reviews_editor')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('manager_manage.rewards_reviews_editor_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={24}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Menu Editor */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push('/menu-editor')}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="fork.knife"
                  android_material_icon_name="restaurant"
                  size={28}
                  color={colors.highlight}
                />
                <View style={styles.cardTextContainer}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.menu_editor')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('manager_manage.menu_editor_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={24}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Notification Center */}
            <TouchableOpacity
              style={[styles.card, styles.lastCard, { backgroundColor: colors.card }]}
              onPress={() => router.push('/notification-center')}
            >
              <View style={styles.cardContent}>
                <IconSymbol
                  ios_icon_name="bell.fill"
                  android_material_icon_name="notifications"
                  size={28}
                  color={colors.highlight}
                />
                <View style={styles.cardTextContainer}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_tools.notification_center')}</Text>
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                    {t('manager_tools.notification_center_desc')}
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={24}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>
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
  nameHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  nameHeaderText: {
    fontSize: 24,
    fontWeight: 'bold',
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
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  lastCard: {
    marginBottom: 0,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTextContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
});
