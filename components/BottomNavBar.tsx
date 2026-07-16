import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { hexToRgba } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useUnreadQuizzes } from '@/hooks/useUnreadQuizzes';
import { usePendingApprovals } from '@/hooks/usePendingApprovals';
import { useUnreadAwards } from '@/hooks/useUnreadAwards';
import { useUnreadQuizReward } from '@/hooks/useUnreadQuizReward';
import { MessageBadge } from '@/components/MessageBadge';
import { useTranslation } from 'react-i18next';

type TabName = 'index' | 'menus' | 'tools' | 'manage' | 'rewards' | 'profile';

interface BottomNavBarProps {
  activeTab: TabName;
}

interface TabConfig {
  name: TabName;
  labelKey: string;
  iosIcon: string;
  androidIcon: string;
}

const MANAGER_TABS: TabConfig[] = [
  { name: 'index', labelKey: 'tabs.welcome', iosIcon: 'house.fill', androidIcon: 'home' },
  { name: 'menus', labelKey: 'tabs.menus', iosIcon: 'fork.knife', androidIcon: 'restaurant' },
  { name: 'tools', labelKey: 'tabs.tools', iosIcon: 'wrench.and.screwdriver.fill', androidIcon: 'build' },
  { name: 'manage', labelKey: 'tabs.manage', iosIcon: 'slider.horizontal.3', androidIcon: 'tune' },
  { name: 'profile', labelKey: 'tabs.profile', iosIcon: 'person.fill', androidIcon: 'person' },
];

const EMPLOYEE_TABS: TabConfig[] = [
  { name: 'index', labelKey: 'tabs.welcome', iosIcon: 'house.fill', androidIcon: 'home' },
  { name: 'menus', labelKey: 'tabs.menus', iosIcon: 'fork.knife', androidIcon: 'restaurant' },
  { name: 'tools', labelKey: 'tabs.tools', iosIcon: 'wrench.and.screwdriver.fill', androidIcon: 'build' },
  { name: 'rewards', labelKey: 'tabs.rewards', iosIcon: 'star.fill', androidIcon: 'star' },
  { name: 'profile', labelKey: 'tabs.profile', iosIcon: 'person.fill', androidIcon: 'person' },
];

export default function BottomNavBar({ activeTab }: BottomNavBarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { unreadCount } = useUnreadMessages();
  const { unreadCount: unreadQuizCount } = useUnreadQuizzes();
  const { pendingCount: pendingApprovalsCount } = usePendingApprovals();
  const { count: awardsCount } = useUnreadAwards();
  const { count: quizRewardCount } = useUnreadQuizReward();
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const { t } = useTranslation();

  const isManager = user?.role === 'manager' || user?.role === 'owner';
  const tabs = isManager ? MANAGER_TABS : EMPLOYEE_TABS;
  const portalPath = isManager ? '/(portal)/manager' : '/(portal)/employee';

  const blurBgColor = Platform.select({
    ios: hexToRgba(colors.tabBarBackground, 0.80),
    android: hexToRgba(colors.tabBarBackground, 0.95),
    web: hexToRgba(colors.tabBarBackground, 0.90),
  });

  const handleTabPress = (tabName: TabName) => {
    const route = tabName === 'index' ? portalPath : `${portalPath}/${tabName}`;
    router.replace(route as any);
  };

  return (
    <View style={styles.floatingTabBarContainer}>
      <BlurView
        intensity={80}
        tint={mode === 'dark' ? 'dark' : 'light'}
        style={[styles.blurContainer, { backgroundColor: blurBgColor }]}
      >
        <View style={styles.tabBarContent}>
          {tabs.map((tab, index) => {
            const isFocused = tab.name === activeTab;
            const isProfileTab = tab.name === 'profile';
            const isToolsTab = tab.name === 'tools';
            const isRewardsTab = tab.name === 'rewards';
            const toolsCount = (unreadQuizCount || 0) + (isManager ? pendingApprovalsCount || 0 : 0);

            return (
              <TouchableOpacity
                key={index}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={() => handleTabPress(tab.name)}
                style={styles.tabButton}
              >
                <View style={styles.iconContainer}>
                  <IconSymbol
                    ios_icon_name={tab.iosIcon as any}
                    android_material_icon_name={tab.androidIcon as any}
                    size={22}
                    color={isFocused ? colors.tabBarActive : colors.tabBarInactive}
                  />
                  {isProfileTab && unreadCount > 0 && (
                    <View style={styles.tabBadgePosition}>
                      <MessageBadge count={unreadCount} size="small" />
                    </View>
                  )}
                  {isToolsTab && toolsCount > 0 && (
                    <View style={styles.tabBadgePosition}>
                      <MessageBadge count={toolsCount} size="small" />
                    </View>
                  )}
                  {isRewardsTab && (awardsCount + quizRewardCount) > 0 && (
                    <View style={styles.tabBadgePosition}>
                      <MessageBadge count={awardsCount + quizRewardCount} size="small" />
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isFocused ? colors.tabBarActive : colors.tabBarInactive },
                  ]}
                  numberOfLines={1}
                >
                  {t(tab.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingTabBarContainer: {
    position: 'absolute',
    bottom: 20,
    left: 10,
    right: 10,
    alignItems: 'center',
    elevation: 12,
  },
  blurContainer: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  iconContainer: {
    position: 'relative',
  },
  tabBadgePosition: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  tabRedDotPosition: {
    position: 'absolute',
    top: -2,
    right: -2,
  },
  tabRedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E74C3C',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },
});
