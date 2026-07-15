
import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { isManagerOrOwner } from '@/utils/roles';
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
import JoltOverlay from '@/components/JoltOverlay';
import AmbientGlow from '@/components/AmbientGlow';
import { useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function ManagerHeader() {
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
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const segments = useSegments();
  const { user } = useAuth();
  // Ambient glow flows edge-to-edge on the glass screens (Welcome = the index
  // tab + Manage = the Command Center). Excludes the still-solid tabs; the
  // transparent spacer + transparent scenes let it read continuously.
  const lastSeg = segments[segments.length - 1] as string;
  const showAmbient = !['menus', 'tools', 'profile'].includes(lastSeg);

  // Role guard: the manager shell (incl. Manage) is for managers/owners only.
  // An employee who reaches a /(portal)/manager URL — deep link, stale route,
  // or a shared screen's tab bar — is sent to their own portal instead.
  if (user && !isManagerOrOwner(user)) {
    return <Redirect href="/(portal)/employee" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Ambient glow on the glass screens (absolute → no layout impact). */}
      {showAmbient && <AmbientGlow />}
      <View style={{ height: insets.top }} />
      <Tabs
        tabBar={(props) => <ManagerTabBar {...props} />}
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
      <JoltOverlay role="manager" />
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
