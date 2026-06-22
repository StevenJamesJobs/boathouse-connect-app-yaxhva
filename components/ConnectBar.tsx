import React, { useRef, useEffect, useState } from 'react';
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
import GlassCard from '@/components/GlassCard';
import { fonts } from '@/constants/fonts';

export type ConnectBarTab = 'schedule' | 'today' | 'events' | 'specials';

interface TabConfig {
  key: ConnectBarTab;
  labelKey?: string;
  fallbackLabel?: string;
  iconIos: string;
  iconAndroid: string;
  iconOnly?: boolean;
}

const TABS: TabConfig[] = [
  {
    key: 'schedule',
    iconIos: 'clock',
    iconAndroid: 'schedule',
    iconOnly: true,
  },
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
  schedule?: boolean;
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
  const slideX = useRef(new Animated.Value(0)).current;
  const indWidth = useRef(new Animated.Value(0)).current;
  const tabWidths = useRef<number[]>(TABS.map(() => 0)).current;
  const tabPositions = useRef<number[]>(TABS.map(() => 0)).current;
  const [measured, setMeasured] = useState(false);

  const activeIndex = Math.max(0, TABS.findIndex((tab) => tab.key === activeTab));

  // Slide + size the indicator to the active tab's MEASURED geometry (the clock
  // tab is narrow, so a fixed %-width indicator no longer works). Width is a
  // layout prop → JS driver (keeps the pill's rounded corners crisp, unlike scaleX).
  useEffect(() => {
    if (!measured) return;
    Animated.spring(slideX, {
      toValue: tabPositions[activeIndex] || 0,
      useNativeDriver: false,
      tension: 68,
      friction: 12,
    }).start();
    Animated.spring(indWidth, {
      toValue: tabWidths[activeIndex] || 0,
      useNativeDriver: false,
      tension: 68,
      friction: 12,
    }).start();
  }, [activeIndex, measured, slideX, indWidth]);

  const handleTabLayout = (index: number, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabWidths[index] = width;
    tabPositions[index] = x;
    if (!measured && tabWidths.every((w) => w > 0)) {
      slideX.setValue(tabPositions[activeIndex] || 0);
      indWidth.setValue(tabWidths[activeIndex] || 0);
      setMeasured(true);
    }
  };

  return (
    <GlassCard
      variant="surface"
      radius={14}
      intensity={16}
      style={styles.container}
    >
      {/* Sliding active-tab indicator */}
      <Animated.View
        style={[
          styles.activeIndicator,
          {
            backgroundColor: colors.primary,
            width: indWidth,
            transform: [{ translateX: slideX }],
          },
        ]}
      />

      {TABS.map((tab, index) => {
        const isActive = activeTab === tab.key;
        const hasBadge = badges?.[tab.key] && !isActive;
        const fg = isActive ? colors.fireText : colors.textSecondary;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, tab.iconOnly && styles.tabIconOnly]}
            onPress={() => onTabChange(tab.key)}
            onLayout={(e) => handleTabLayout(index, e)}
            activeOpacity={0.7}
          >
            <IconSymbol
              ios_icon_name={tab.iconIos as any}
              android_material_icon_name={tab.iconAndroid as any}
              size={16}
              color={fg}
            />
            {!tab.iconOnly && (
              <Text style={[styles.tabText, { color: fg }]} numberOfLines={1}>
                {t(tab.labelKey!, tab.fallbackLabel!)}
              </Text>
            )}
            {hasBadge && <View style={[styles.badgeDot, { backgroundColor: colors.blue }]} />}
          </TouchableOpacity>
        );
      })}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
    marginBottom: 4,
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    gap: 6,
    zIndex: 1,
  },
  tabIconOnly: {
    flex: 0,
    flexBasis: 38,
    minWidth: 38,
  },
  tabText: {
    fontFamily: fonts.display.semibold,
    fontSize: 13,
  },
  badgeDot: {
    position: 'absolute',
    top: 4,
    right: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
