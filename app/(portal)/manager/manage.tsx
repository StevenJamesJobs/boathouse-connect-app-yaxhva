
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
const GRID_PADDING = 16;
const GRID_GAP = 12;
const NUM_COLUMNS = 3;
const ITEM_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

const TABS = ['newsfeed', 'employee', 'management'] as const;
type TabName = typeof TABS[number];

interface GridItem {
  id: string;
  label: string;
  iosIcon: string;
  androidIcon: string;
  route: string;
}

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

  // Grid data for each tab
  const newsfeedItems: GridItem[] = [
    { id: 'announcements', label: t('manager_manage.grid_announcements'), iosIcon: 'megaphone.fill', androidIcon: 'campaign', route: '/announcement-editor' },
    { id: 'special-features', label: t('manager_manage.grid_special_features'), iosIcon: 'star.fill', androidIcon: 'star', route: '/special-features-editor' },
    { id: 'events', label: t('manager_manage.grid_events'), iosIcon: 'calendar', androidIcon: 'event', route: '/upcoming-events-editor' },
  ];

  const employeeItems: GridItem[] = [
    { id: 'guides', label: t('manager_manage.grid_guides'), iosIcon: 'book.fill', androidIcon: 'menu-book', route: '/guides-and-training-editor' },
    { id: 'game-hub', label: t('manager_manage.grid_game_hub'), iosIcon: 'gamecontroller.fill', androidIcon: 'sports-esports', route: '/game-hub-editor' },
    { id: 'weekly-quizzes', label: 'Weekly Quizzes', iosIcon: 'questionmark.circle.fill', androidIcon: 'quiz', route: '/quiz-hub-editor' },
    { id: 'assistant-editors', label: t('manager_manage.grid_assistant_editors'), iosIcon: 'person.crop.rectangle.stack.fill', androidIcon: 'groups', route: '/assistant-editors' },
  ];

  const managementItems: GridItem[] = [
    { id: 'employee-hub', label: t('manager_manage.grid_employee_hub'), iosIcon: 'person.2.fill', androidIcon: 'people', route: '/employee-hub' },
    { id: 'menu-editor', label: t('manager_manage.grid_menu'), iosIcon: 'fork.knife', androidIcon: 'restaurant', route: '/menu-editor' },
    { id: 'notifications', label: t('manager_manage.grid_notifications'), iosIcon: 'bell.fill', androidIcon: 'notifications', route: '/notification-center' },
  ];

  const renderGridItem = (item: GridItem) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.gridItem, { backgroundColor: colors.card, width: ITEM_WIDTH }]}
      onPress={() => router.push(item.route as any)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: colors.primary + '15' }]}>
        <IconSymbol
          ios_icon_name={item.iosIcon as any}
          android_material_icon_name={item.androidIcon as any}
          size={28}
          color={colors.primary}
        />
      </View>
      <Text style={[styles.gridLabel, { color: colors.text }]} numberOfLines={2}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  const renderGrid = (items: GridItem[]) => (
    <View style={styles.gridContainer}>
      {items.map(renderGridItem)}
    </View>
  );

  const renderTabContent = (tab: TabName) => {
    switch (tab) {
      case 'newsfeed': return renderGrid(newsfeedItems);
      case 'employee': return renderGrid(employeeItems);
      case 'management': return renderGrid(managementItems);
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
    paddingTop: 16,
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 100,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridItem: {
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)',
    elevation: 3,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  gridLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
});
