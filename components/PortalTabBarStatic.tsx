import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { hexToRgba } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useUnreadQuizzes } from '@/hooks/useUnreadQuizzes';
import { MessageBadge } from '@/components/MessageBadge';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';

/**
 * Visual replica of the CALLER'S portal floating tab bar, usable on shared
 * non-tab screens (e.g. Roster) that live outside the (portal) Tabs
 * navigators. Picks the manager or employee tab set from the signed-in
 * user's role, so an employee is never shown manager destinations
 * (replaces the old ManagerTabBarStatic, which rendered the manager bar
 * for everyone and let employees walk into the Manage shell).
 *
 * On press, navigates to the corresponding tab via router.push.
 * `activeTab` lets the caller highlight a specific tab; defaults to none.
 */

interface PortalTabDef {
  name: 'index' | 'menus' | 'tools' | 'manage' | 'rewards' | 'profile';
  route: Href;
  ios_icon_name: string;
  android_material_icon_name: string;
  labelKey: string;
  defaultLabel: string;
}

const MANAGER_TABS: PortalTabDef[] = [
  { name: 'index', route: '/(portal)/manager', ios_icon_name: 'house.fill', android_material_icon_name: 'home', labelKey: 'tabs.welcome', defaultLabel: 'Welcome' },
  { name: 'menus', route: '/(portal)/manager/menus', ios_icon_name: 'fork.knife', android_material_icon_name: 'restaurant', labelKey: 'tabs.menus', defaultLabel: 'Menus' },
  { name: 'tools', route: '/(portal)/manager/tools', ios_icon_name: 'wrench.and.screwdriver.fill', android_material_icon_name: 'build', labelKey: 'tabs.tools', defaultLabel: 'Tools' },
  { name: 'manage', route: '/(portal)/manager/manage', ios_icon_name: 'slider.horizontal.3', android_material_icon_name: 'tune', labelKey: 'tabs.manage', defaultLabel: 'Manage' },
  { name: 'profile', route: '/(portal)/manager/profile', ios_icon_name: 'person.fill', android_material_icon_name: 'person', labelKey: 'tabs.profile', defaultLabel: 'Profile' },
];

const EMPLOYEE_TABS: PortalTabDef[] = [
  { name: 'index', route: '/(portal)/employee', ios_icon_name: 'house.fill', android_material_icon_name: 'home', labelKey: 'tabs.welcome', defaultLabel: 'Welcome' },
  { name: 'menus', route: '/(portal)/employee/menus', ios_icon_name: 'fork.knife', android_material_icon_name: 'restaurant', labelKey: 'tabs.menus', defaultLabel: 'Menus' },
  { name: 'tools', route: '/(portal)/employee/tools', ios_icon_name: 'wrench.and.screwdriver.fill', android_material_icon_name: 'build', labelKey: 'tabs.tools', defaultLabel: 'Tools' },
  { name: 'rewards', route: '/(portal)/employee/rewards', ios_icon_name: 'star.fill', android_material_icon_name: 'star', labelKey: 'tabs.rewards', defaultLabel: 'Rewards' },
  { name: 'profile', route: '/(portal)/employee/profile', ios_icon_name: 'person.fill', android_material_icon_name: 'person', labelKey: 'tabs.profile', defaultLabel: 'Profile' },
];

interface PortalTabBarStaticProps {
  /** Name of the tab to highlight as active, or null for none. */
  activeTab?: PortalTabDef['name'] | null;
}

export default function PortalTabBarStatic({ activeTab = null }: PortalTabBarStaticProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { unreadCount } = useUnreadMessages();
  const { unreadCount: unreadQuizCount } = useUnreadQuizzes();

  const tabs = isManagerOrOwner(user) ? MANAGER_TABS : EMPLOYEE_TABS;

  const blurBgColor = Platform.select({
    ios: hexToRgba(colors.tabBarBackground, 0.80),
    android: hexToRgba(colors.tabBarBackground, 0.95),
    web: hexToRgba(colors.tabBarBackground, 0.90),
  });

  return (
    <View style={styles.floatingTabBarContainer} pointerEvents="box-none">
      <BlurView
        intensity={80}
        tint={mode === 'dark' ? 'dark' : 'light'}
        style={[styles.blurContainer, { backgroundColor: blurBgColor }]}
      >
        <View style={styles.tabBarContent}>
          {tabs.map((tab) => {
            const isFocused = activeTab === tab.name;
            const isProfileTab = tab.name === 'profile';
            const isToolsTab = tab.name === 'tools';
            const color = isFocused ? colors.tabBarActive : colors.tabBarInactive;

            return (
              <TouchableOpacity
                key={tab.name}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={() => router.push(tab.route)}
                style={styles.tabButton}
              >
                <View style={styles.iconContainer}>
                  <IconSymbol
                    ios_icon_name={tab.ios_icon_name}
                    android_material_icon_name={tab.android_material_icon_name}
                    size={22}
                    color={color}
                  />
                  {isProfileTab && unreadCount > 0 && (
                    <View style={styles.tabBadgePosition}>
                      <MessageBadge count={unreadCount} size="small" />
                    </View>
                  )}
                  {isToolsTab && unreadQuizCount > 0 && (
                    <View style={styles.tabBadgePosition}>
                      <MessageBadge count={unreadQuizCount} size="small" />
                    </View>
                  )}
                </View>
                <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>
                  {t(tab.labelKey, tab.defaultLabel)}
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
    zIndex: 1000,
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
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },
});
