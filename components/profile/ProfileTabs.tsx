/**
 * The Profile capsule — My Hub · My Info · Settings. ConnectBar's geometry (surface card,
 * a primary pill that springs under the active tab, display-semibold labels) with three
 * equal segments and icons.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/GlassCard';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { PROFILE_TABS, ProfileTab } from './profileVisuals';

const TAB_META: Record<ProfileTab, { ios: string; android: string; key: string }> = {
  hub: { ios: 'square.grid.2x2.fill', android: 'grid-view', key: 'profile_hub.tab_hub' },
  info: { ios: 'person.fill', android: 'person', key: 'profile_hub.tab_info' },
  settings: { ios: 'gearshape.fill', android: 'settings', key: 'profile_hub.tab_settings' },
};

export default function ProfileTabs({ value, onChange }: { value: ProfileTab; onChange: (t: ProfileTab) => void }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const pillX = useRef(new Animated.Value(0)).current;
  const pillW = useRef(new Animated.Value(0)).current;
  const [measured, setMeasured] = useState(false);
  const sizedRef = useRef(false);

  const moveTo = (tab: ProfileTab, animate: boolean) => {
    const l = layouts.current[tab];
    if (!l) return;
    if (!animate) {
      pillX.setValue(l.x);
      pillW.setValue(l.width);
      return;
    }
    Animated.parallel([
      Animated.spring(pillX, { toValue: l.x, tension: 68, friction: 12, useNativeDriver: false }),
      Animated.spring(pillW, { toValue: l.width, tension: 68, friction: 12, useNativeDriver: false }),
    ]).start();
  };

  const onTabLayout = (tab: ProfileTab) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    layouts.current[tab] = { x, width };
    if (Object.keys(layouts.current).length === PROFILE_TABS.length && !sizedRef.current) {
      sizedRef.current = true;
      moveTo(value, false);
      setMeasured(true);
    }
  };

  useEffect(() => {
    if (sizedRef.current) moveTo(value, true);
  }, [value]);

  return (
    <GlassCard variant="surface" radius={14} intensity={16} style={styles.wrap}>
      {measured && (
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { backgroundColor: colors.primary, width: pillW, transform: [{ translateX: pillX }] }]}
        />
      )}
      {PROFILE_TABS.map((tab) => {
        const on = tab === value;
        const meta = TAB_META[tab];
        return (
          <TouchableOpacity key={tab} style={styles.tab} onLayout={onTabLayout(tab)} onPress={() => onChange(tab)} activeOpacity={0.8}>
            <IconSymbol ios_icon_name={meta.ios} android_material_icon_name={meta.android} size={16} color={on ? colors.fireText : colors.textSecondary} />
            <Text style={[styles.label, { color: on ? colors.fireText : colors.textSecondary }]} numberOfLines={1}>
              {t(meta.key)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 4, gap: 6, marginBottom: 4, position: 'relative' },
  pill: { position: 'absolute', top: 4, bottom: 4, left: 0, borderRadius: 10 },
  tab: { flex: 1, height: 34, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, zIndex: 1 },
  label: { fontFamily: fonts.display.semibold, fontSize: 13 },
});
