
import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useUnreadQuizzes } from '@/hooks/useUnreadQuizzes';
import { useUnreadLeaderboardPasses } from '@/hooks/useUnreadLeaderboardPasses';
import { usePendingApprovals } from '@/hooks/usePendingApprovals';
import PortalTabBar from '@/components/PortalTabBar';
import { useTranslation } from 'react-i18next';

function ManagerHeader() {
  const router = useRouter();
  const { logout } = useAuth();
  const { t } = useTranslation();
  const colors = useThemeColors();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <View style={styles.cornerBrand}>
        <IconSymbol
          ios_icon_name="sailboat.fill"
          android_material_icon_name="sailing"
          size={22}
          color={colors.primary}
        />
        <Text style={[styles.cornerBrandText, { color: colors.text }]}>MB Connect</Text>
      </View>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{t('header.manager_portal')}</Text>
      <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
        <IconSymbol
          ios_icon_name="rectangle.portrait.and.arrow.right"
          android_material_icon_name="logout"
          size={24}
          color={colors.text}
        />
      </TouchableOpacity>
    </View>
  );
}

function ManagerTabBar(props: any) {
  const { unreadCount } = useUnreadMessages();
  const { unreadCount: unreadQuizCount } = useUnreadQuizzes();
  const { unreadCount: unreadLeaderboardCount } = useUnreadLeaderboardPasses();
  const { pendingCount: pendingApprovals } = usePendingApprovals();
  const toolsBadgeCount = unreadQuizCount + pendingApprovals + unreadLeaderboardCount;

  return (
    <PortalTabBar
      {...props}
      role="manager"
      badges={{ messages: unreadCount, tools: toolsBadgeCount }}
    />
  );
}

export default function ManagerLayout() {
  const { t } = useTranslation();
  return (
    <>
      <ManagerHeader />
      <Tabs
        tabBar={(props) => <ManagerTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.welcome'),
            tabBarIcon: ({ color, size }) => (
              <IconSymbol
                ios_icon_name="house.fill"
                android_material_icon_name="home"
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="menus"
          options={{
            title: t('tabs.menus'),
            tabBarIcon: ({ color, size }) => (
              <IconSymbol
                ios_icon_name="fork.knife"
                android_material_icon_name="restaurant"
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="tools"
          options={{
            title: t('tabs.tools'),
            tabBarIcon: ({ color, size }) => (
              <IconSymbol
                ios_icon_name="wrench.and.screwdriver.fill"
                android_material_icon_name="build"
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="manage"
          options={{
            title: t('tabs.manage'),
            tabBarIcon: ({ color, size }) => (
              <IconSymbol
                ios_icon_name="slider.horizontal.3"
                android_material_icon_name="tune"
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
            tabBarIcon: ({ color, size }) => (
              <IconSymbol
                ios_icon_name="person.fill"
                android_material_icon_name="person"
                size={size}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.2)',
    elevation: 4,
  },
  cornerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cornerBrandText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  logoutButton: {
    padding: 8,
  },
});
