/**
 * The Team drop — the azure tile that slides in under the stat strip when a manager taps
 * the Team cell. Height is measured once and JS-animated (the ShiftsFlipCard pattern), so
 * the Favorites below slide instead of jumping.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { fonts } from '@/constants/fonts';
import { TEAM_HUE, TEAM_DROP_MS, hexToRgba } from './profileVisuals';

interface Props {
  open: boolean;
  staffCount: number | null;
  scheduledToday: number | null;
  joinCode: string | null;
  onEmployees: () => void;
  onSchedules: () => void;
  onInvite: () => void;
}

export default function TeamDrop({ open, staffCount, scheduledToday, joinCode, onEmployees, onSchedules, onInvite }: Props) {
  const colors = useThemeColors();
  const { resolvedMode } = useAppTheme();
  const { t } = useTranslation();
  const hue = TEAM_HUE[resolvedMode];
  const height = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [natural, setNatural] = useState(0);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    const to = open ? natural : 0;
    if (!natural && open) return; // wait for the measurement
    Animated.parallel([
      Animated.timing(height, { toValue: to, duration: TEAM_DROP_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(opacity, { toValue: open ? 1 : 0, duration: open ? TEAM_DROP_MS : 180, useNativeDriver: false }),
    ]).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, natural, height, opacity]);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && h !== natural) setNatural(h);
  };

  if (!mounted) return null;

  const eyebrow = [
    staffCount != null ? t('profile_hub.team_staff', { count: staffCount }) : null,
    scheduledToday != null ? t('profile_hub.team_scheduled_today', { count: scheduledToday }) : null,
    joinCode ? t('profile_hub.team_code', { code: joinCode }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const Btn = ({ icon, android, label, onPress, fill }: { icon: string; android: string; label: string; onPress: () => void; fill?: boolean }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.btn,
        fill ? { backgroundColor: hue, borderColor: hue } : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
      ]}
    >
      <IconSymbol ios_icon_name={icon} android_material_icon_name={android} size={14} color={fill ? '#FFFFFF' : hue} />
      <Text style={[styles.btnText, { color: fill ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Animated.View style={[styles.clip, natural ? { height, opacity } : { opacity: 0 }]}>
      <View onLayout={onLayout} style={[styles.card, { backgroundColor: hexToRgba(hue, 0.11), borderColor: hexToRgba(hue, 0.4) }]}>
        <Text style={[styles.eyebrow, { color: hue }]} numberOfLines={1}>
          {eyebrow}
        </Text>
        <View style={styles.row}>
          <Btn icon="person.2.fill" android="people" label={t('profile_hub.team_employees')} onPress={onEmployees} fill />
          <Btn icon="calendar" android="event" label={t('profile_hub.team_schedules')} onPress={onSchedules} />
          <Btn icon="at" android="alternate-email" label={t('profile_hub.team_invite')} onPress={onInvite} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The gap lives on the CLIP, not the card: onLayout measures the card's box without its margin,
  // so a margin inside the clip pushed the card down 8pt and the clip cut its bottom edge off.
  clip: { overflow: 'hidden', marginTop: 8 },
  card: { borderRadius: 16, borderWidth: 1, padding: 12, paddingBottom: 13, gap: 9 },
  eyebrow: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 38, borderRadius: 11, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  btnText: { fontFamily: fonts.body.semibold, fontSize: 12 },
});
