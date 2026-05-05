import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { hexToRgba } from '@/styles/commonStyles';
import { BlurView } from 'expo-blur';
import { MessageBadge } from '@/components/MessageBadge';

export type PortalRole = 'manager' | 'employee';

export interface PortalTabBarBadges {
  messages: number;
  tools: number;
  rewardsHasNew?: boolean;
}

interface PortalTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
  role: PortalRole;
  badges: PortalTabBarBadges;
}

export default function PortalTabBar({ state, descriptors, navigation, role, badges }: PortalTabBarProps) {
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const isManager = role === 'manager';

  const blurBgColor = Platform.select({
    ios: hexToRgba(colors.tabBarBackground, isManager ? 0.80 : 0.60),
    android: hexToRgba(colors.tabBarBackground, isManager ? 0.95 : 0.90),
    web: hexToRgba(colors.tabBarBackground, isManager ? 0.90 : 0.85),
  });

  const iconSize = isManager ? 22 : 24;

  return (
    <View style={styles.floatingTabBarContainer}>
      <BlurView
        intensity={80}
        tint={mode === 'dark' ? 'dark' : 'light'}
        style={[
          styles.blurContainer,
          isManager ? styles.blurContainerManager : styles.blurContainerEmployee,
          { backgroundColor: blurBgColor },
        ]}
      >
        <View style={styles.tabBarContent}>
          {state.routes.map((route: any, index: number) => {
            const { options } = descriptors[route.key];
            const label = options.tabBarLabel ?? options.title ?? route.name;
            const isFocused = state.index === index;
            const isProfileTab = route.name === 'profile';
            const isToolsTab = route.name === 'tools';
            const isRewardsTab = route.name === 'rewards';

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
                    size: iconSize,
                  })}
                  {isProfileTab && badges.messages > 0 && (
                    <View style={styles.tabBadgePosition}>
                      <MessageBadge count={badges.messages} size="small" />
                    </View>
                  )}
                  {isToolsTab && badges.tools > 0 && (
                    <View style={styles.tabBadgePosition}>
                      <MessageBadge count={badges.tools} size="small" />
                    </View>
                  )}
                  {isRewardsTab && badges.rewardsHasNew && !isFocused && (
                    <View style={styles.tabRedDotPosition}>
                      <View style={styles.tabRedDot} />
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.tabLabel,
                    isManager ? styles.tabLabelManager : styles.tabLabelEmployee,
                    { color: isFocused ? colors.tabBarActive : colors.tabBarInactive },
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

const styles = StyleSheet.create({
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
  },
  blurContainerManager: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  blurContainerEmployee: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.2), 0px 4px 16px rgba(0, 0, 0, 0.15)',
    elevation: 20,
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
    marginTop: 3,
    textAlign: 'center',
  },
  tabLabelManager: {
    fontWeight: '600',
  },
  tabLabelEmployee: {
    fontWeight: '700',
  },
});
