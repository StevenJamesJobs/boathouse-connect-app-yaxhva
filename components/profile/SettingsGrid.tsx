/**
 * The Settings pane — 2×2 square tiles with the Settings-B motion.
 *
 * Top row: Appearance (navigates) and Language (opens the sheet). Bottom row: Notifications
 * and Password EXPAND IN THE ROW — the tapped tile slides to full width while its neighbour
 * folds to a slim chip above the row, and the content opens as the slide finishes (one tap).
 * Tapping the chip swaps; tapping the open tile's header folds back to the 2×2.
 *
 * Motion: `flex` on the two bottom tiles is JS-animated (layout prop), the chip's height +
 * opacity too; the content's opacity/translate rides the native driver with a delay.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import NotificationPreferences from '@/components/NotificationPreferences';
import { fonts } from '@/constants/fonts';
import { themePalettes } from '@/styles/commonStyles';
import LanguageSheet from './LanguageSheet';
import PasswordPanel from './PasswordPanel';
import { SETTINGS_TILE_HEIGHT, SETTINGS_SLIDE_MS, SETTINGS_OPEN_DELAY_MS, SETTINGS_OPEN_MS, hexToRgba } from './profileVisuals';

type Expander = 'notifications' | 'password';

export default function SettingsGrid() {
  const colors = useThemeColors();
  const { palette, activePalette, resolvedMode, customAccent } = useAppTheme();
  const { language } = useLanguage();
  const { tier, isTrialActive, trialDaysRemaining } = useSubscription();
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const tintHex = colors.tint.startsWith('#') ? colors.tint : '#FF7A2F';

  const [open, setOpen] = useState<Expander | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [notifSummary, setNotifSummary] = useState<{ on: number; total: number } | null>(null);
  const onNotifSummary = useCallback((on: number, total: number) => {
    setNotifSummary((prev) => (prev && prev.on === on && prev.total === total ? prev : { on, total }));
  }, []);

  // flex of the two bottom tiles (1 ↔ 0) and the chips' reveal (0 ↔ 1)
  const notifFlex = useRef(new Animated.Value(1)).current;
  const passFlex = useRef(new Animated.Value(1)).current;
  const notifChip = useRef(new Animated.Value(0)).current;
  const passChip = useRef(new Animated.Value(0)).current;
  const content = useRef(new Animated.Value(0)).current;
  const [contentMounted, setContentMounted] = useState<Expander | null>(null);

  const animate = useCallback(
    (next: Expander | null) => {
      const ease = Easing.bezier(0.4, 0, 0.2, 1);
      const slide = (v: Animated.Value, to: number) => Animated.timing(v, { toValue: to, duration: SETTINGS_SLIDE_MS, easing: ease, useNativeDriver: false });
      const chip = (v: Animated.Value, to: number) => Animated.timing(v, { toValue: to, duration: 300, easing: ease, useNativeDriver: false });

      if (next === null) {
        Animated.timing(content, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
          setContentMounted(null);
          Animated.parallel([slide(notifFlex, 1), slide(passFlex, 1), chip(notifChip, 0), chip(passChip, 0)]).start();
        });
        return;
      }
      const swap = contentMounted !== null && contentMounted !== next;
      const run = () => {
        setContentMounted(next);
        content.setValue(0);
        Animated.parallel([
          slide(notifFlex, next === 'notifications' ? 1 : 0),
          slide(passFlex, next === 'password' ? 1 : 0),
          chip(notifChip, next === 'password' ? 1 : 0),
          chip(passChip, next === 'notifications' ? 1 : 0),
          Animated.sequence([
            Animated.delay(SETTINGS_OPEN_DELAY_MS),
            Animated.timing(content, { toValue: 1, duration: SETTINGS_OPEN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]).start();
      };
      if (swap) Animated.timing(content, { toValue: 0, duration: 140, useNativeDriver: true }).start(run);
      else run();
    },
    [content, contentMounted, notifChip, notifFlex, passChip, passFlex]
  );

  const toggle = (key: Expander) => {
    const next = open === key ? null : key;
    setOpen(next);
    animate(next);
  };

  const themeLabel = palette === 'custom' && customAccent ? t('appearance.theme_custom') : t(`appearance.theme_${palette}`);
  const modeLabel = resolvedMode === 'dark' ? t('appearance.dark_mode') : t('appearance.light_mode');
  const swatches = (palette === 'custom' ? activePalette : themePalettes[palette as keyof typeof themePalettes]).previewColors;
  const isOwner = user?.role === 'owner';
  const planLabel = tier === 'trial' && isTrialActive ? t('profile_hub.sub_trial', { count: trialDaysRemaining }) : tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : '';

  const contentStyle = {
    opacity: content,
    transform: [{ translateY: content.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
  };

  const Chip = ({ anim, icon, android, label, sub, onPress }: { anim: Animated.Value; icon: string; android: string; label: string; sub: string; onPress: () => void }) => (
    <Animated.View style={{ maxHeight: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 54] }), opacity: anim, overflow: 'hidden' }}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.chip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <IconSymbol ios_icon_name={icon} android_material_icon_name={android} size={16} color={colors.text} />
        <Text style={[styles.chipLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.chipSub, { color: colors.textSecondary }]} numberOfLines={1}>{sub}</Text>
        <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </Animated.View>
  );

  const Head = ({ icon, android, title, sub, expanded, onPress, children }: { icon: string; android: string; title: string; sub: string; expanded: boolean; onPress: () => void; children?: React.ReactNode }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.head}>
      <IconSymbol ios_icon_name={icon} android_material_icon_name={android} size={19} color={expanded ? colors.tint : colors.text} />
      <View style={styles.headText}>
        <Text style={[styles.tt, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.ts, { color: colors.textSecondary }]} numberOfLines={1}>{sub}</Text>
        {children}
      </View>
      <View style={styles.chev}>
        <IconSymbol ios_icon_name={expanded ? 'chevron.up' : 'chevron.down'} android_material_icon_name={expanded ? 'expand-less' : 'expand-more'} size={14} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );

  const notifSub = notifSummary ? t('profile_hub.notif_summary', { on: notifSummary.on, total: notifSummary.total }) : t('settings.notification_preferences');

  return (
    <View style={styles.wrap}>
      {/* top row — navigators */}
      <View style={styles.row}>
        <TouchableOpacity onPress={() => router.push('/appearance' as any)} activeOpacity={0.85} style={[styles.sq, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <IconSymbol ios_icon_name="paintbrush.fill" android_material_icon_name="palette" size={19} color={colors.text} />
          <View>
            <Text style={[styles.tt, { color: colors.text }]}>{t('settings.appearance')}</Text>
            <Text style={[styles.ts, { color: colors.textSecondary }]} numberOfLines={1}>
              <Text style={{ color: colors.text, fontFamily: fonts.body.semibold }}>{themeLabel}</Text> · {modeLabel}
            </Text>
            <View style={styles.strip}>
              {swatches.slice(0, 4).map((c, i) => (
                <View key={i} style={[styles.swatch, { backgroundColor: c }]} />
              ))}
            </View>
          </View>
          <View style={styles.chev}>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={14} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setLangOpen(true)} activeOpacity={0.85} style={[styles.sq, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <IconSymbol ios_icon_name="globe" android_material_icon_name="language" size={19} color={colors.text} />
          <View>
            <Text style={[styles.tt, { color: colors.text }]}>{t('settings.language')}</Text>
            <Text style={[styles.ts, { color: colors.textSecondary }]} numberOfLines={1}>{t('profile_hub.lang_follows')}</Text>
            <View style={styles.lang2}>
              {(['en', 'es'] as const).map((k) => {
                const on = language === k;
                return (
                  <View key={k} style={[styles.langPill, { backgroundColor: on ? hexToRgba(tintHex, 0.18) : colors.glass, borderColor: on ? hexToRgba(tintHex, 0.36) : colors.glassBorder }]}>
                    <Text style={[styles.langText, { color: on ? colors.tint : colors.textSecondary }]}>{k === 'en' ? 'English' : 'Español'}</Text>
                  </View>
                );
              })}
            </View>
          </View>
          <View style={styles.chev}>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={14} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
      </View>

      {/* the folded neighbour's chip (only one is ever visible) */}
      <Chip anim={notifChip} icon="bell.fill" android="notifications" label={t('profile_hub.tile_notifications')} sub={notifSub} onPress={() => toggle('notifications')} />
      <Chip anim={passChip} icon="key.fill" android="vpn-key" label={t('profile_hub.tile_password')} sub={t('profile_hub.password_sub')} onPress={() => toggle('password')} />

      {/* bottom row — expanders */}
      <View style={styles.row}>
        <Animated.View
          style={[
            styles.sqAnim,
            { flex: notifFlex, marginRight: Animated.multiply(notifFlex, passFlex).interpolate({ inputRange: [0, 1], outputRange: [0, 10] }) },
            { backgroundColor: open === 'notifications' ? hexToRgba(tintHex, 0.12) : colors.glass, borderColor: open === 'notifications' ? hexToRgba(tintHex, 0.42) : colors.glassBorder },
            { opacity: notifFlex, overflow: 'hidden', maxWidth: notifFlex.interpolate({ inputRange: [0, 1], outputRange: [0, 2000] }), paddingHorizontal: notifFlex.interpolate({ inputRange: [0, 1], outputRange: [0, 11] }), borderWidth: notifFlex.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
          ]}
        >
          <Head icon="bell.fill" android="notifications" title={t('profile_hub.tile_notifications')} sub={notifSub} expanded={open === 'notifications'} onPress={() => toggle('notifications')} />
          {contentMounted === 'notifications' ? (
            <Animated.View style={[styles.content, contentStyle]}>
              <NotificationPreferences onSummary={onNotifSummary} />
            </Animated.View>
          ) : null}
        </Animated.View>
        <Animated.View
          style={[
            styles.sqAnim,
            { flex: passFlex },
            { backgroundColor: open === 'password' ? hexToRgba(tintHex, 0.12) : colors.glass, borderColor: open === 'password' ? hexToRgba(tintHex, 0.42) : colors.glassBorder },
            { opacity: passFlex, overflow: 'hidden', maxWidth: passFlex.interpolate({ inputRange: [0, 1], outputRange: [0, 2000] }), paddingHorizontal: passFlex.interpolate({ inputRange: [0, 1], outputRange: [0, 11] }), borderWidth: passFlex.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
          ]}
        >
          <Head icon="key.fill" android="vpn-key" title={t('profile_hub.tile_password')} sub={t('profile_hub.password_sub')} expanded={open === 'password'} onPress={() => toggle('password')} />
          {contentMounted === 'password' ? (
            <Animated.View style={[styles.content, contentStyle]}>
              <PasswordPanel onDone={() => { setOpen(null); animate(null); }} />
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>

      {/* hidden pre-mount so the notification summary is known before the tile opens */}
      {notifSummary === null ? (
        <View style={styles.hidden} pointerEvents="none">
          <NotificationPreferences onSummary={onNotifSummary} />
        </View>
      ) : null}

      {isOwner ? (
        <TouchableOpacity onPress={() => router.push('/subscription-management' as any)} activeOpacity={0.85} style={[styles.subRow, { backgroundColor: colors.surface, borderColor: hexToRgba(colors.blue.startsWith('#') ? colors.blue : '#8FA0AC', 0.3) }]}>
          <View style={[styles.subIcon, { backgroundColor: hexToRgba(tintHex, 0.14) }]}>
            <IconSymbol ios_icon_name="creditcard.fill" android_material_icon_name="credit-card" size={17} color={colors.tint} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.subTitleRow}>
              <Text style={[styles.tt, { color: colors.text }]}>{t('profile_hub.tile_subscription')}</Text>
              <View style={[styles.ownerTag, { backgroundColor: hexToRgba(colors.blue.startsWith('#') ? colors.blue : '#8FA0AC', 0.18) }]}>
                <Text style={[styles.ownerText, { color: colors.blueText }]}>{t('manager_manage.owner_tag', 'Owner')}</Text>
              </View>
            </View>
            <Text style={[styles.ts, { color: colors.textSecondary }]} numberOfLines={1}>
              <Text style={{ color: colors.text, fontFamily: fonts.body.semibold }}>{planLabel}</Text>
            </Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}

      <LanguageSheet visible={langOpen} onClose={() => setLangOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  sq: { flex: 1, minWidth: 0, minHeight: SETTINGS_TILE_HEIGHT, borderRadius: 16, borderWidth: 1, padding: 11, justifyContent: 'space-between', position: 'relative' },
  sqAnim: { minWidth: 0, minHeight: SETTINGS_TILE_HEIGHT, borderRadius: 16, paddingVertical: 11, position: 'relative' },
  head: { flexDirection: 'column', justifyContent: 'space-between', minHeight: SETTINGS_TILE_HEIGHT - 22, position: 'relative' },
  headText: { minWidth: 0, paddingRight: 22 },
  tt: { fontFamily: fonts.display.semibold, fontSize: 14.5 },
  ts: { fontFamily: fonts.body.regular, fontSize: 11, marginTop: 1 },
  chev: { position: 'absolute', top: 0, right: 0 },
  strip: { flexDirection: 'row', gap: 3, marginTop: 6 },
  swatch: { flex: 1, height: 8, borderRadius: 3 },
  lang2: { flexDirection: 'row', gap: 5, marginTop: 6 },
  langPill: { flex: 1, height: 20, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  langText: { fontFamily: fonts.body.semibold, fontSize: 10 },
  chip: { height: 44, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  chipLabel: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
  chipSub: { flex: 1, fontFamily: fonts.body.regular, fontSize: 11, textAlign: 'right' },
  content: { marginTop: 10 },
  hidden: { position: 'absolute', opacity: 0, height: 0, overflow: 'hidden' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingLeft: 13, borderRadius: 14, borderWidth: 1 },
  subIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  subTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ownerTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  ownerText: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase' },
});
