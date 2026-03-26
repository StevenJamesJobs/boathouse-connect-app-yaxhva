
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TABS = ['newsfeed', 'employee', 'management'] as const;
type TabName = typeof TABS[number];

export default function ManagerManageScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabName>('newsfeed');
  const pagerRef = useRef<FlatList>(null);

  const handleTabPress = useCallback((tab: TabName) => {
    setActiveTab(tab);
    const index = TABS.indexOf(tab);
    pagerRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  const handleSwipe = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / SCREEN_WIDTH);
    const newTab = TABS[pageIndex];
    if (newTab && newTab !== activeTab) {
      setActiveTab(newTab);
    }
  }, [activeTab]);

  const renderNewsfeedTab = () => (
    <>
      {/* Announcements Editor */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card }]}
        onPress={() => router.push('/announcement-editor')}
      >
        <View style={styles.cardContent}>
          <IconSymbol ios_icon_name="megaphone.fill" android_material_icon_name="campaign" size={28} color={colors.highlight} />
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.announcements_editor')}</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{t('manager_manage.announcements_editor_desc')}</Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={24} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Special Features Editor */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card }]}
        onPress={() => router.push('/special-features-editor')}
      >
        <View style={styles.cardContent}>
          <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={28} color={colors.highlight} />
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.special_features_editor')}</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{t('manager_manage.special_features_editor_desc')}</Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={24} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Upcoming Events Editor */}
      <TouchableOpacity
        style={[styles.card, styles.lastCard, { backgroundColor: colors.card }]}
        onPress={() => router.push('/upcoming-events-editor')}
      >
        <View style={styles.cardContent}>
          <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={28} color={colors.highlight} />
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.upcoming_events_editor')}</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{t('manager_manage.upcoming_events_editor_desc')}</Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={24} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
    </>
  );

  const renderEmployeeTab = () => (
    <>
      {/* Guides and Training Editor */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card }]}
        onPress={() => router.push('/guides-and-training-editor')}
      >
        <View style={styles.cardContent}>
          <IconSymbol ios_icon_name="square.and.pencil" android_material_icon_name="book" size={28} color={colors.highlight} />
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.guides_training_editor')}</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{t('manager_manage.guides_training_editor_desc')}</Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={24} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Server Assistant Editor */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card }]}
        onPress={() => router.push('/server-assistant-editor')}
      >
        <View style={styles.cardContent}>
          <IconSymbol ios_icon_name="tray.full.fill" android_material_icon_name="room-service" size={28} color={colors.highlight} />
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.server_assistant_editor')}</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{t('manager_manage.server_assistant_editor_desc')}</Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={24} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Bartender Assistant Editor */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card }]}
        onPress={() => router.push('/bartender-assistant-editor')}
      >
        <View style={styles.cardContent}>
          <IconSymbol ios_icon_name="wineglass.fill" android_material_icon_name="local-bar" size={28} color={colors.highlight} />
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.bartender_assistant_editor')}</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{t('manager_manage.bartender_assistant_editor_desc')}</Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={24} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Host Assistant Editor */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card }]}
        onPress={() => router.push('/host-assistant-editor')}
      >
        <View style={styles.cardContent}>
          <IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="people" size={28} color={colors.highlight} />
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.host_assistant_editor')}</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{t('manager_manage.host_assistant_editor_desc')}</Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={24} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Kitchen Assistant Editor */}
      <TouchableOpacity
        style={[styles.card, styles.lastCard, { backgroundColor: colors.card }]}
        onPress={() => router.push('/kitchen-assistant-editor')}
      >
        <View style={styles.cardContent}>
          <IconSymbol ios_icon_name="flame.fill" android_material_icon_name="local-fire-department" size={28} color={colors.highlight} />
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.kitchen_assistant_editor')}</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{t('manager_manage.kitchen_assistant_editor_desc')}</Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={24} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
    </>
  );

  const renderManagementTab = () => (
    <>
      {/* Employee Management Hub */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card }]}
        onPress={() => router.push('/employee-hub')}
      >
        <View style={styles.cardContent}>
          <IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="people" size={28} color={colors.highlight} />
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_tools.employee_management')}</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{t('manager_manage.employee_hub_desc', 'Staff, schedules, rewards & reviews')}</Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={24} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Menu Editor */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card }]}
        onPress={() => router.push('/menu-editor')}
      >
        <View style={styles.cardContent}>
          <IconSymbol ios_icon_name="fork.knife" android_material_icon_name="restaurant" size={28} color={colors.highlight} />
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_manage.menu_editor')}</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{t('manager_manage.menu_editor_desc')}</Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={24} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Notification Center */}
      <TouchableOpacity
        style={[styles.card, styles.lastCard, { backgroundColor: colors.card }]}
        onPress={() => router.push('/notification-center')}
      >
        <View style={styles.cardContent}>
          <IconSymbol ios_icon_name="bell.fill" android_material_icon_name="notifications" size={28} color={colors.highlight} />
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('manager_tools.notification_center')}</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{t('manager_tools.notification_center_desc')}</Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={24} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
    </>
  );

  const renderTabContent = (tab: TabName) => {
    switch (tab) {
      case 'newsfeed': return renderNewsfeedTab();
      case 'employee': return renderEmployeeTab();
      case 'management': return renderManagementTab();
    }
  };

  const renderPage = useCallback(({ item }: { item: TabName }) => (
    <View style={{ width: SCREEN_WIDTH }}>
      <ScrollView contentContainerStyle={styles.pageContentContainer}>
        {renderTabContent(item)}
      </ScrollView>
    </View>
  ), [colors, t, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* User's Name Header */}
      <View style={[styles.nameHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.nameHeaderText, { color: colors.text }]}>{t('manager_manage.editors_header', { name: user?.name })}</Text>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabSelectorWrapper}>
        <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && { backgroundColor: colors.highlight }]}
              onPress={() => handleTabPress(tab)}
            >
              <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === tab && { color: colors.text }]}>
                {tab === 'newsfeed' ? t('manager_manage.tab_newsfeed') :
                 tab === 'employee' ? t('manager_manage.tab_employee') :
                 t('manager_manage.tab_management')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Horizontal Swipe Pager */}
      <FlatList
        ref={pagerRef}
        data={TABS as unknown as TabName[]}
        keyExtractor={(item) => item}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleSwipe}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        style={styles.pager}
      />
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
  tabSelectorWrapper: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
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
  pager: {
    flex: 1,
  },
  pageContentContainer: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 100,
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
