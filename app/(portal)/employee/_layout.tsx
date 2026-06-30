
import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useUnreadQuizzes } from '@/hooks/useUnreadQuizzes';
import { useUnreadAwards } from '@/hooks/useUnreadAwards';
import { useUnreadLeaderboardPasses } from '@/hooks/useUnreadLeaderboardPasses';
import PortalTabBar from '@/components/PortalTabBar';
import JoltOverlay from '@/components/JoltOverlay';
import AmbientGlow from '@/components/AmbientGlow';
import { useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function EmployeeHeader() {
  const router = useRouter();
  const { logout } = useAuth();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { organization } = useOrganization();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <View style={styles.cornerBrand}>
        <IconSymbol
          ios_icon_name={organization?.header_icon || 'sailboat.fill'}
          android_material_icon_name={organization?.header_icon || 'sailboat.fill'}
          size={22}
          color={colors.primary}
        />
        <Text style={[styles.cornerBrandText, { color: colors.text }]}>{organization?.name || 'MyResto Connect'}</Text>
      </View>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{t('header.employee_portal')}</Text>
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

function EmployeeTabBar(props: any) {
  const { unreadCount } = useUnreadMessages();
  const { unreadCount: unreadQuizCount } = useUnreadQuizzes();
  const { unreadCount: unreadLeaderboardCount } = useUnreadLeaderboardPasses();
  const { hasNew: awardsHasNew } = useUnreadAwards();
  const toolsBadgeCount = unreadQuizCount + unreadLeaderboardCount;

  return (
    <PortalTabBar
      {...props}
      role="employee"
      badges={{ messages: unreadCount, tools: toolsBadgeCount, rewardsHasNew: awardsHasNew }}
    />
  );
}

export default function EmployeeLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const segments = useSegments();
  // Welcome = the index tab (last segment is not one of the other tabs).
  const lastSegment = segments[segments.length - 1] as string;
  const onWelcome = !['menus', 'tools', 'rewards', 'profile'].includes(lastSegment);
  // Rewards is a transparent, edge-to-edge glass screen like Welcome — render the
  // ambient glow at the layout level so it reads behind the status-bar spacer
  // (otherwise the parent's solid background shows as a strip at the very top).
  const onRewards = lastSegment === 'rewards';
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Ambient glow on the transparent, edge-to-edge tabs (Welcome + Rewards);
          absolute → no layout impact; the transparent spacer + transparent screen
          let it read edge-to-edge under the status bar. */}
      {(onWelcome || onRewards) && <AmbientGlow />}
      <View style={{ height: insets.top }} />
      <Tabs
        tabBar={(props) => <EmployeeTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: 'transparent' },
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
          name="rewards"
          options={{
            title: t('tabs.rewards'),
            tabBarIcon: ({ color, size }) => (
              <IconSymbol
                ios_icon_name="star.fill"
                android_material_icon_name="star"
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
      <JoltOverlay role="employee" />
    </View>
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
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
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
