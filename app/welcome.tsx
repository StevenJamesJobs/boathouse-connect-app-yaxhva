/**
 * Welcome (s86, mockup W-B round 2) — the pre-login screen. Shown on every signed-out open
 * until this device has reached a dashboard (app/index.tsx reads the flag), MyResto only.
 *
 * Two tinted-glass tiles — Employee · Owner — that EXPAND IN THE ROW with the Settings-B
 * motion (components/profile/SettingsGrid): the tapped tile slides to full width while its
 * neighbour folds to a slim chip above the row, and the content opens as the slide lands.
 * Tapping the chip swaps; tapping the open tile's header folds back to the two tiles.
 *
 * This page sits UNDER the onboarding / join stacks and never reacts to the auth flip —
 * that guard lives on Login (pathname check) and in the root layout.
 */
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import { SETTINGS_SLIDE_MS, SETTINGS_OPEN_DELAY_MS, SETTINGS_OPEN_MS } from '@/components/profile/profileVisuals';
import {
  OnbScreen,
  BrandMark,
  Hero,
  Disc,
  CheckRow,
  ClickwrapText,
  CtaButton,
  LegalFooter,
  Body,
  B,
  useOnbAccents,
} from '@/components/onboarding/OnboardingKit';

type Role = 'emp' | 'own';

const TILE_REST_HEIGHT = 150;

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const a = useOnbAccents();

  const [open, setOpen] = useState<Role | null>(null);
  const [contentMounted, setContentMounted] = useState<Role | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  // flex of the two tiles (1 ↔ 0), the chips' reveal (0 ↔ 1), the open tile's content
  const empFlex = useRef(new Animated.Value(1)).current;
  const ownFlex = useRef(new Animated.Value(1)).current;
  const empChip = useRef(new Animated.Value(0)).current;
  const ownChip = useRef(new Animated.Value(0)).current;
  const content = useRef(new Animated.Value(0)).current;

  const animate = useCallback(
    (next: Role | null) => {
      const ease = Easing.bezier(0.4, 0, 0.2, 1);
      const slide = (v: Animated.Value, to: number) => Animated.timing(v, { toValue: to, duration: SETTINGS_SLIDE_MS, easing: ease, useNativeDriver: false });
      const chip = (v: Animated.Value, to: number) => Animated.timing(v, { toValue: to, duration: 300, easing: ease, useNativeDriver: false });

      if (next === null) {
        Animated.timing(content, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
          setContentMounted(null);
          Animated.parallel([slide(empFlex, 1), slide(ownFlex, 1), chip(empChip, 0), chip(ownChip, 0)]).start();
        });
        return;
      }
      const swap = contentMounted !== null && contentMounted !== next;
      const run = () => {
        setContentMounted(next);
        content.setValue(0);
        Animated.parallel([
          slide(empFlex, next === 'emp' ? 1 : 0),
          slide(ownFlex, next === 'own' ? 1 : 0),
          chip(empChip, next === 'own' ? 1 : 0),
          chip(ownChip, next === 'emp' ? 1 : 0),
          Animated.sequence([
            Animated.delay(SETTINGS_OPEN_DELAY_MS),
            Animated.timing(content, { toValue: 1, duration: SETTINGS_OPEN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]).start();
      };
      if (swap) Animated.timing(content, { toValue: 0, duration: 140, useNativeDriver: true }).start(run);
      else run();
    },
    [content, contentMounted, empChip, empFlex, ownChip, ownFlex],
  );

  const toggle = (key: Role) => {
    const next = open === key ? null : key;
    setOpen(next);
    animate(next);
  };

  const contentStyle = {
    opacity: content,
    transform: [{ translateY: content.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
  };

  // The folding tile: flex + maxWidth + padding + border to 0, and the gutter closes when
  // either neighbour folds (the s84 row-fold recipe).
  const foldStyle = (flex: Animated.Value) => ({
    flex,
    opacity: flex,
    maxWidth: flex.interpolate({ inputRange: [0, 1], outputRange: [0, 2000] }),
    paddingHorizontal: flex.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }),
    borderWidth: flex.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
  });
  const gutter = Animated.multiply(empFlex, ownFlex).interpolate({ inputRange: [0, 1], outputRange: [0, 10] });

  const tileSkin = (on: boolean) => ({
    backgroundColor: hexToRgba(on ? a.pop : a.quiet, on ? 0.09 : 0.09),
    borderColor: hexToRgba(on ? a.pop : a.quiet, on ? 0.4 : 0.26),
  });

  return (
    <OnbScreen front>
      <BrandMark size="lg" />
      <Hero title={t('welcome.title')} subtitle={t('welcome.subtitle')} />

      <View>
        <FoldChip anim={empChip} iosIcon="person.2.fill" androidIcon="group" label={t('welcome.employee')} sub={t('welcome.employee_chip_sub')} onPress={() => toggle('emp')} />
        <FoldChip anim={ownChip} iosIcon="building.2.fill" androidIcon="store" label={t('welcome.owner')} sub={t('welcome.owner_chip_sub')} onPress={() => toggle('own')} />

        <View style={styles.row}>
          <Animated.View style={[styles.tile, tileSkin(open === 'emp'), foldStyle(empFlex), { marginRight: gutter }]}>
            <TileHead
              iosIcon="person.2.fill"
              androidIcon="group"
              title={t('welcome.employee')}
              sub={t('welcome.employee_sub')}
              expanded={open === 'emp'}
              onPress={() => toggle('emp')}
            />
            {contentMounted === 'emp' && (
              <Animated.View style={[styles.body, contentStyle]}>
                <OptionRow
                  iosIcon="ticket.fill"
                  androidIcon="confirmation-number"
                  title={t('welcome.have_code')}
                  sub={t('welcome.have_code_sub')}
                  onPress={() => router.push('/join')}
                />
                <OptionRow
                  iosIcon="key.fill"
                  androidIcon="vpn-key"
                  title={t('welcome.have_login')}
                  sub={t('welcome.have_login_sub')}
                  onPress={() => router.push('/login')}
                />
                <Text style={[styles.note, { color: colors.textSecondary }]}>{t('welcome.no_code_note')}</Text>
              </Animated.View>
            )}
          </Animated.View>

          <Animated.View style={[styles.tile, tileSkin(open === 'own'), foldStyle(ownFlex)]}>
            <TileHead
              iosIcon="building.2.fill"
              androidIcon="store"
              title={t('welcome.owner')}
              sub={t('welcome.owner_sub')}
              expanded={open === 'own'}
              onPress={() => toggle('own')}
            />
            {contentMounted === 'own' && (
              <Animated.View style={[styles.body, contentStyle]}>
                <Body style={{ fontSize: 12.5, lineHeight: 18 }}>
                  <B>{t('welcome.owner_gate_lead')}</B> {t('welcome.owner_gate_body')}
                </Body>
                <CheckRow boxed checked={isOwner} onToggle={() => setIsOwner((v) => !v)}>
                  <ClickwrapText />
                </CheckRow>
                <CtaButton
                  label={t('welcome.create_account')}
                  disabled={!isOwner}
                  onPress={() => router.push('/onboarding/getting-started')}
                />
              </Animated.View>
            )}
          </Animated.View>
        </View>
      </View>

      <LegalFooter />
    </OnbScreen>
  );
}

// Top-level module components (a component redefined inside render remounts per state change).

function FoldChip({ anim, iosIcon, androidIcon, label, sub, onPress }: { anim: Animated.Value; iosIcon: string; androidIcon: string; label: string; sub: string; onPress: () => void }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  return (
    <Animated.View style={{ maxHeight: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 64] }), opacity: anim, overflow: 'hidden' }}>
      <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <Disc small style={{ width: 32, height: 32, borderRadius: 10 }}>
          <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={15} color={a.quiet} />
        </Disc>
        <Text style={[styles.chipLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.chipSub, { color: colors.textSecondary }]} numberOfLines={1}>{sub}</Text>
        <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={14} color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

function TileHead({ iosIcon, androidIcon, title, sub, expanded, onPress }: { iosIcon: string; androidIcon: string; title: string; sub: string; expanded: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded }} style={[styles.head, !expanded && { minHeight: TILE_REST_HEIGHT - 28 }]}>
      <View style={styles.headTop}>
        <Disc small tone={expanded ? 'pop' : 'quiet'}>
          <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={17} color={expanded ? a.pop : a.quiet} />
        </Disc>
        <IconSymbol ios_icon_name={expanded ? 'chevron.up' : 'chevron.down'} android_material_icon_name={expanded ? 'expand-less' : 'expand-more'} size={16} color={colors.textSecondary} />
      </View>
      <Text style={[styles.headTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      <Text style={[styles.headSub, { color: colors.textSecondary }]}>{sub}</Text>
    </Pressable>
  );
}

function OptionRow({ iosIcon, androidIcon, title, sub, onPress }: { iosIcon: string; androidIcon: string; title: string; sub: string; onPress: () => void }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.opt, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, opacity: pressed ? 0.8 : 1 }]}>
      <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={16} color={a.quiet} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.optTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.optSub, { color: colors.textSecondary }]}>{sub}</Text>
      </View>
      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  tile: { minWidth: 0, borderRadius: 20, paddingVertical: 14, overflow: 'hidden' },
  // minWidth: while a tile folds to zero width its head must CLIP, not re-wrap — Android
  // wraps the sub-line one character per row at width 0 and the row grows screen-tall.
  head: { gap: 8, minWidth: 146 },
  headTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headTitle: { fontFamily: fonts.display.bold, fontSize: 19, letterSpacing: -0.3 },
  headSub: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 16 },
  body: { paddingTop: 12, gap: 8 },
  note: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, marginTop: 2 },

  chip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  chipLabel: { fontFamily: fonts.display.bold, fontSize: 15 },
  chipSub: { flex: 1, textAlign: 'right', fontFamily: fonts.body.regular, fontSize: 11.5 },

  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1 },
  optTitle: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
  optSub: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 15, marginTop: 1 },
});
