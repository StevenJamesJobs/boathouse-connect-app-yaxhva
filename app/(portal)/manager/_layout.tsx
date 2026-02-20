
import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { hexToRgba } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { BlurView } from 'expo-blur';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { MessageBadge } from '@/components/MessageBadge';
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

function FloatingTabBar({ state, descriptors, navigation }: any) {
  const { unreadCount } = useUnreadMessages();
  const colors = useThemeColors();
  const { mode } = useAppTheme();

  const blurBgColor = Platform.select({
    ios: hexToRgba(colors.tabBarBackground, 0.80),
    android: hexToRgba(colors.tabBarBackground, 0.95),
    web: hexToRgba(colors.tabBarBackground, 0.90),
  });

  return (
    <View style={styles.floatingTabBarContainer}>
      <BlurView
        intensity={80}
        tint={mode === 'dark' ? 'dark' : 'light'}
        style={[styles.blurContainer, { backgroundColor: blurBgColor }]}
      >
        <View style={styles.tabBarContent}>
          {state.routes.map((route: any, index: number) => {
            const { options } = descriptors[route.key];
            const label = options.tabBarLabel ?? options.title ?? route.name;
            const isFocused = state.index === index;
            const isProfileTab = route.name === 'profile';

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TouchableOpacity
                key={index}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarTestID}
                onPress={onPress}
                style={styles.tabButton}
              >
                <View style={styles.iconContainer}>
                  {options.tabBarIcon && options.tabBarIcon({
                    color: isFocused ? colors.tabBarActive : colors.tabBarInactive,
                    size: 22,
                  })}
                  {isProfileTab && unreadCount > 0 && (
                    <View style={styles.tabBadgePosition}>
                      <MessageBadge count={unreadCount} size="small" />
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isFocused ? colors.tabBarActive : colors.tabBarInactive }
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

export default function ManagerLayout() {
  const { t } = useTranslation();
  return (
    <>
      <ManagerHeader />
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
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
  floatingTabBarContainer: {
    position: 'absolute',
    bottom: 20,
    left: 10,
    right: 10,
    alignItems: 'center',
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    minWidth: 70,
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
