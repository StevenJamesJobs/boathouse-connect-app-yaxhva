import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from 'react-i18next';

export type ConnectBarTab = 'today' | 'events' | 'specials';

interface TabConfig {
  key: ConnectBarTab;
  labelKey: string;
  fallbackLabel: string;
  iconIos: string;
  iconAndroid: string;
}

const TABS: TabConfig[] = [
  {
    key: 'today',
    labelKey: 'connect_bar.today',
    fallbackLabel: 'Today',
    iconIos: 'megaphone.fill',
    iconAndroid: 'campaign',
  },
  {
    key: 'events',
    labelKey: 'connect_bar.events',
    fallbackLabel: 'Events',
    iconIos: 'calendar',
    iconAndroid: 'event',
  },
  {
    key: 'specials',
    labelKey: 'connect_bar.specials',
    fallbackLabel: 'Specials',
    iconIos: 'fork.knife',
    iconAndroid: 'restaurant',
  },
];

interface ConnectBarBadges {
  today?: boolean;
  events?: boolean;
  specials?: boolean;
}

interface ConnectBarProps {
  activeTab: ConnectBarTab;
  onTabChange: (tab: ConnectBarTab) => void;
  badges?: ConnectBarBadges;
}

export default function ConnectBar({ activeTab, onTabChange, badges }: ConnectBarProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const tabWidths = useRef<number[]>([0, 0, 0]).current;
  const tabPositions = useRef<number[]>([0, 0, 0]).current;
  const containerWidth = useRef(0);

  const activeIndex = TABS.findIndex(tab => tab.key === activeTab);

  useEffect(() => {
    // Animate the indicator sliding to the active tab
    const targetX = tabPositions[activeIndex] || 0;
    const targetWidth = tabWidths[activeIndex] || 0;

    Animated.spring(slideAnim, {
      toValue: targetX,
      useNativeDriver: true,
      tension: 68,
      friction: 12,
    }).start();
  }, [activeIndex, slideAnim]);

  const handleTabLayout = (index: number, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    tabWidths[index] = width;
    tabPositions[index] = x;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={[styles.tabBar, { backgroundColor: colors.background }]}>
        {/* Animated sliding background */}
        <Animated.View
          style={[
            styles.activeIndicator,
            {
              backgroundColor: colors.primary,
              width: `${100 / TABS.length}%` as any,
              transform: [{ translateX: slideAnim }],
            },
          ]}
        />

        {TABS.map((tab, index) => {
          const isActive = activeTab === tab.key;
          const hasBadge = badges?.[tab.key] && !isActive;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => onTabChange(tab.key)}
              onLayout={(e) => handleTabLayout(index, e)}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrapper}>
                <IconSymbol
                  ios_icon_name={tab.iconIos as any}
                  android_material_icon_name={tab.iconAndroid as any}
                  size={16}
                  color={isActive ? '#FFFFFF' : colors.textSecondary}
                />
                {hasBadge && <View style={styles.badgeDot} />}
              </View>
              <Text
                style={[
                  styles.tabText,
                  { color: isActive ? '#FFFFFF' : colors.textSecondary },
                  isActive && styles.activeTabText,
                ]}
                numberOfLines={1}
              >
                {t(tab.labelKey, tab.fallbackLabel)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 4,
    marginBottom: 4,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  activeIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 5,
    zIndex: 1,
  },
  iconWrapper: {
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E74C3C',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    fontWeight: '700',
  },
});
