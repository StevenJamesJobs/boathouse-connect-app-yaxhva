/**
 * The Onboarding Kit (s86) — the pre-login / onboarding family's shared pieces, so Welcome,
 * Login, the owner path, the setup wizard and the employee join all draw the same page:
 * glow ground · brand mark · hero · glass fields with icons · tick rows · the five-segment
 * rail · the pinned Back / Next dock · the Terms · Privacy footer.
 *
 * Accent grammar: `quiet` (the theme's `ember` — Moonstone's logo grey) inks decorative
 * discs and eyebrows, `pop` (the tint) inks links / active states, and the big buttons fill
 * with the tint — except Moonstone LIGHT, whose buttons wear the logo's ring navy.
 */
import React, { forwardRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import AmbientGlow from '@/components/AmbientGlow';
import ShineButton from '@/components/quiz/ShineButton';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { hexToRgba, type ThemeColorSet } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import { IS_MCLOONES } from '@/constants/buildVariant';
import { LEGAL } from '@/config/legal';

const PLATE = require('@/assets/images/MyRestoAppClip.png');
const MCLOONES_LOGO = require('@/assets/images/43c91958-d4c9-4b12-8d2a-51e85de57f94.jpeg');

// Fixed error red, stepped for light themes (the change-password pair).
const RED = { dark: '#EF4444', light: '#DC2626' };
const OK = { dark: '#10A56F', light: '#087A52' };

/** Button fill / ink + the two accent inks, resolved for the theme in force. */
export function useOnbAccents() {
  const colors = useThemeColors();
  const { palette, resolvedMode } = useAppTheme();
  return useMemo(() => {
    const isDark = resolvedMode === 'dark';
    const navy = palette === 'moonstone' && !isDark;
    return {
      isDark,
      fill: navy ? colors.primary : colors.tint,
      ink: navy ? '#FCFCFC' : colors.fireText,
      quiet: colors.ember,
      pop: colors.tint,
      bad: isDark ? RED.dark : RED.light,
      ok: isDark ? OK.dark : OK.light,
    };
  }, [colors, palette, resolvedMode]);
}

// ── Page shell ────────────────────────────────────────────────────────────

interface OnbScreenProps {
  children: React.ReactNode;
  /** Login-family pages turn the glow up (bigger crown + a low counter-glow). */
  front?: boolean;
  /** Fixed chrome above the scroll (TopBar or OnboardingRail). */
  header?: React.ReactNode;
  /** Pinned below the scroll (OnboardingDock); the scroll gains its runway. */
  dock?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}

export function OnbScreen({ children, front, header, dock, contentStyle }: OnbScreenProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AmbientGlow front={front} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={{ paddingTop: insets.top + 6, zIndex: 3 }}>{header}</View>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: (dock ? 120 : 24) + insets.bottom },
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {dock}
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Brand ─────────────────────────────────────────────────────────────────

interface BrandMarkProps {
  size?: 'lg' | 'sm';
  /** A returning device's cached org — its logo / name replace the app's own mark. */
  org?: { orgName: string; logoUrl: string | null } | null;
}

/** The plate mark clipped to its ring + a typeset wordmark (inks with the theme, so it holds on navy). */
export function BrandMark({ size = 'lg', org }: BrandMarkProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const lg = size === 'lg';
  const d = lg ? 92 : 44;

  if (org) {
    const initials = org.orgName.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
    return (
      <View style={[styles.brandRow, { paddingTop: 18 }]}>
        {org.logoUrl ? (
          <StorageImage source={{ uri: org.logoUrl }} style={[styles.orgLogo, { borderColor: colors.glassBorder }]} resizeMode="cover" />
        ) : (
          <View style={[styles.orgLogo, styles.center, { borderColor: colors.glassBorder, backgroundColor: hexToRgba(colors.tint, 0.18) }]}>
            <Text style={{ fontFamily: fonts.display.bold, fontSize: 16, color: colors.tint }}>{initials}</Text>
          </View>
        )}
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary, letterSpacing: 1.6 }]}>{t('welcome.welcome_back_to')}</Text>
          <Text style={{ fontFamily: fonts.display.bold, fontSize: 18, letterSpacing: -0.3, color: colors.text }} numberOfLines={1}>
            {org.orgName}
          </Text>
        </View>
      </View>
    );
  }

  if (IS_MCLOONES) {
    return (
      <View style={[styles.center, { paddingTop: lg ? 26 : 18 }]}>
        <View style={[styles.mcCard, { width: lg ? 220 : 132, height: lg ? 150 : 90 }]}>
          <Image source={MCLOONES_LOGO} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        </View>
      </View>
    );
  }

  const plate = (
    <View style={[styles.plateClip, { width: d, height: d, borderRadius: d / 2 }]}>
      {/* The PNG carries a margin around the ring: scale + offset so the ring meets the clip edge. */}
      <Image source={PLATE} style={{ position: 'absolute', width: d * 1.259, height: d * 1.185, left: -d * 0.11, top: -d * 0.085 }} resizeMode="stretch" />
    </View>
  );
  const word = (
    <View style={lg ? styles.center : undefined}>
      <Text style={{ fontFamily: fonts.display.bold, fontSize: lg ? 27 : 19, letterSpacing: lg ? -0.8 : -0.4, color: colors.text }}>MyResto</Text>
      <Text style={{ fontFamily: fonts.mono.medium, fontSize: lg ? 9.5 : 8, letterSpacing: lg ? 5 : 3.6, color: colors.textSecondary, marginTop: lg ? 3 : 1, paddingLeft: lg ? 5 : 1 }}>
        CONNECT
      </Text>
    </View>
  );
  return lg ? (
    <View style={[styles.center, { gap: 8, paddingTop: 26 }]}>{plate}{word}</View>
  ) : (
    <View style={[styles.brandRow, { paddingTop: 18 }]}>{plate}{word}</View>
  );
}

// ── Hero / chrome ─────────────────────────────────────────────────────────

interface HeroProps {
  title: string;
  subtitle?: string;
  iosIcon?: string;
  androidIcon?: string;
  /** 'pop' tints the disc icon with the highlight; default is the quiet accent; 'ok' = the success tick. */
  tone?: 'quiet' | 'pop' | 'ok';
  align?: 'center' | 'left';
  children?: React.ReactNode;
}

export function Hero({ title, subtitle, iosIcon, androidIcon, tone = 'quiet', align = 'center', children }: HeroProps) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  const left = align === 'left';
  const ink = tone === 'pop' ? a.pop : tone === 'ok' ? a.ok : a.quiet;
  return (
    <View style={[styles.hero, left && styles.heroLeft]}>
      {!!iosIcon && !!androidIcon && (
        <Disc tone={tone}>
          <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={28} color={ink} />
        </Disc>
      )}
      <Text style={[styles.heroTitle, { color: colors.text, textAlign: left ? 'left' : 'center' }]}>{title}</Text>
      {!!subtitle && (
        <Text style={[styles.heroSub, { color: colors.textSecondary, textAlign: left ? 'left' : 'center' }, !left && { maxWidth: 300 }]}>
          {subtitle}
        </Text>
      )}
      {children}
    </View>
  );
}

export function Disc({ children, small, tone = 'quiet', style }: { children: React.ReactNode; small?: boolean; tone?: 'quiet' | 'pop' | 'ok'; style?: StyleProp<ViewStyle> }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  const tinted = tone !== 'quiet';
  const hue = tone === 'ok' ? a.ok : a.pop;
  return (
    <View
      style={[
        small ? styles.discS : styles.disc,
        styles.center,
        {
          backgroundColor: tinted ? hexToRgba(hue, 0.12) : colors.glass,
          borderColor: tinted ? hexToRgba(hue, 0.32) : colors.glassBorder,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** The pushed-page top row: a 38pt glass back chip + an optional mono eyebrow. */
export function TopBar({ onBack, eyebrow }: { onBack?: () => void; eyebrow?: string }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  return (
    <View style={styles.topBar}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={8} style={[styles.c38, styles.center, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={20} color={colors.text} />
        </Pressable>
      ) : (
        <View style={{ width: 38 }} />
      )}
      <Text style={[styles.eyebrow, { flex: 1, textAlign: 'center', color: a.quiet }]} numberOfLines={1}>{eyebrow ?? ''}</Text>
      <View style={{ width: 38 }} />
    </View>
  );
}

/** Five thin segments with mono names — live one glowing, done ones ticked. */
export function OnboardingRail({ steps, current, rightLabel }: { steps: string[]; current: number; rightLabel?: string }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  const { t } = useTranslation();
  return (
    <View style={styles.rail}>
      <View style={styles.railTop}>
        <Text style={[styles.eyebrow, { color: a.pop, flex: 1 }]}>{t('onboarding.step_of', { n: current, total: steps.length })}</Text>
        {!!rightLabel && <Text style={[styles.eyebrow, { color: colors.textSecondary, flexShrink: 1 }]} numberOfLines={1}>{rightLabel}</Text>}
      </View>
      <View style={styles.segs}>
        {steps.map((name, i) => {
          const n = i + 1;
          const done = n < current;
          const now = n === current;
          return (
            <View key={name} style={styles.seg}>
              <View style={[styles.segBar, { backgroundColor: now ? a.pop : done ? hexToRgba(a.pop, 0.55) : colors.hairline }]} />
              <View style={styles.segLabelRow}>
                {done && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={8} color={colors.text} />}
                <Text style={[styles.segLabel, { color: now ? a.pop : colors.textSecondary }, done && { color: colors.text, opacity: 0.75 }]} numberOfLines={1}>
                  {name}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────

interface CtaButtonProps {
  label: string;
  onPress: () => void;
  /** Defaults to the trailing → arrow; pass null for a bare label. */
  iosIcon?: string | null;
  androidIcon?: string | null;
  leading?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

/** The family's one shining button per screen. */
export function CtaButton({ label, onPress, iosIcon = 'arrow.right', androidIcon = 'arrow-forward', leading, disabled, loading, style }: CtaButtonProps) {
  const a = useOnbAccents();
  return (
    <ShineButton
      label={label}
      gradient={[a.fill, a.fill]}
      ink={a.ink}
      iosIcon={iosIcon ?? undefined}
      androidIcon={androidIcon ?? undefined}
      iconTrailing={!leading}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      style={style}
    />
  );
}

export function GhostButton({ label, onPress, iosIcon, androidIcon, disabled, style }: { label: string; onPress: () => void; iosIcon?: string; androidIcon?: string; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.ghost, { backgroundColor: colors.glass, borderColor: colors.glassBorder, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}
    >
      {!!iosIcon && !!androidIcon && <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={16} color={colors.text} />}
      <Text style={[styles.ghostLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

interface DockProps {
  onBack?: () => void;
  backLabel?: string;
  nextLabel: string;
  onNext: () => void;
  nextIosIcon?: string | null;
  nextAndroidIcon?: string | null;
  nextLeading?: boolean;
  loading?: boolean;
  nextDisabled?: boolean;
  /** One shine per screen: when the page has its own shining action, Next goes quiet glass. */
  quietNext?: boolean;
}

/** Pinned Back + Next over a ground-colour wash — the same footer on every step. */
export function OnboardingDock({ onBack, backLabel, nextLabel, onNext, nextIosIcon, nextAndroidIcon, nextLeading, loading, nextDisabled, quietNext }: DockProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View style={styles.dockWrap} pointerEvents="box-none">
      <LinearGradient
        colors={[hexToRgba(colors.background, 0), hexToRgba(colors.background, 0.94), colors.background, colors.background]}
        locations={[0, 0.26, 0.42, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]}>
        {onBack && <GhostButton label={backLabel ?? t('common.back')} onPress={onBack} disabled={loading} style={{ width: 96 }} />}
        {quietNext ? (
          <GhostButton label={nextLabel} onPress={onNext} disabled={loading || nextDisabled} iosIcon="arrow.right" androidIcon="arrow-forward" style={{ flex: 1, flexDirection: 'row-reverse' }} />
        ) : (
          <CtaButton
            label={nextLabel}
            onPress={onNext}
            iosIcon={nextIosIcon === undefined ? 'arrow.right' : nextIosIcon}
            androidIcon={nextAndroidIcon === undefined ? 'arrow-forward' : nextAndroidIcon}
            leading={nextLeading}
            loading={loading}
            disabled={nextDisabled}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </View>
  );
}

// ── Fields ────────────────────────────────────────────────────────────────

interface IconFieldProps extends TextInputProps {
  label?: string;
  required?: boolean;
  /** Right-aligned mono note on the label row (a counter, "Auto-filled"). */
  labelTrailing?: React.ReactNode;
  iosIcon?: string;
  androidIcon?: string;
  /** Sits inside the field's right edge (eye toggle, clear ✕, a tick). */
  trailing?: React.ReactNode;
  hint?: React.ReactNode;
  mono?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/** The FormKit field with a leading icon and a trailing slot. */
export const IconField = forwardRef<TextInput, IconFieldProps>(function IconField(
  { label, required, labelTrailing, iosIcon, androidIcon, trailing, hint, mono, containerStyle, style, multiline, placeholder, value, onChangeText, ...input },
  ref,
) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  const [focused, setFocused] = React.useState(false);
  // The placeholder is OUR text, not the native one: iOS re-kerns the native placeholder of
  // any field its AutoFill treats as a username / password candidate ("U s e r n a m e" —
  // Steve's s86 device round). An overlay is deterministic on both platforms.
  const [inner, setInner] = React.useState('');
  const shown = value ?? inner;
  const family = mono ? fonts.mono.medium : fonts.body.regular;
  return (
    <View style={containerStyle}>
      {!!label && (
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {label}
            {required && <Text style={{ color: a.pop }}> *</Text>}
          </Text>
          {labelTrailing}
        </View>
      )}
      <View
        style={[
          styles.inp,
          multiline && styles.inpMulti,
          { backgroundColor: colors.glass, borderColor: focused ? hexToRgba(a.pop, 0.6) : colors.glassBorder },
        ]}
      >
        {!!iosIcon && !!androidIcon && (
          <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={17} color={colors.textSecondary} style={multiline ? { marginTop: 2 } : undefined} />
        )}
        <View style={styles.inpBox}>
          <TextInput
            ref={ref}
            multiline={multiline}
            value={value}
            {...input}
            onChangeText={(v) => { setInner(v); onChangeText?.(v); }}
            onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
            style={[styles.inpText, { color: colors.text, fontFamily: family }, multiline && { textAlignVertical: 'top', lineHeight: 20 }, style]}
          />
          {!shown && !!placeholder && (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: multiline ? 'flex-start' : 'center' }]}>
              <Text
                numberOfLines={multiline ? 3 : 1}
                style={[styles.inpText, { flex: 0, fontFamily: family }, multiline && { lineHeight: 20 }, style, { color: colors.textSecondary }]}
              >
                {placeholder}
              </Text>
            </View>
          )}
        </View>
        {trailing}
      </View>
      {!!hint && (typeof hint === 'string' ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text> : hint)}
    </View>
  );
});

/** Eye toggle for password fields' trailing slot. */
export function EyeToggle({ shown, onToggle, disabled }: { shown: boolean; onToggle: () => void; disabled?: boolean }) {
  const colors = useThemeColors();
  return (
    <Pressable onPress={onToggle} disabled={disabled} hitSlop={8}>
      <IconSymbol ios_icon_name={shown ? 'eye.slash.fill' : 'eye.fill'} android_material_icon_name={shown ? 'visibility-off' : 'visibility'} size={17} color={colors.textSecondary} />
    </Pressable>
  );
}

/** A tick box + label; `boxed` draws the glass row the clickwrap uses. */
export function CheckRow({ checked, onToggle, children, boxed, disabled }: { checked: boolean; onToggle: () => void; children: React.ReactNode; boxed?: boolean; disabled?: boolean }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={[
        styles.check,
        boxed && [styles.checkBoxed, { backgroundColor: colors.surface, borderColor: checked ? hexToRgba(a.pop, 0.38) : colors.surfaceBorder }],
      ]}
    >
      <View style={[styles.box, styles.center, { borderColor: checked ? a.fill : colors.textSecondary, backgroundColor: checked ? a.fill : 'transparent' }]}>
        {checked && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={13} color={a.ink} />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

/** Quiet-tint info row: icon + running text (pass <Text> children; nest <Text> for bold / bullets). */
export function InfoBlurb({ iosIcon = 'info.circle.fill', androidIcon = 'info', children, style }: { iosIcon?: string; androidIcon?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const a = useOnbAccents();
  return (
    <View style={[styles.info, { backgroundColor: hexToRgba(a.quiet, 0.08), borderColor: hexToRgba(a.quiet, 0.22) }, style]}>
      <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={15} color={a.quiet} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 6 }}>{children}</View>
    </View>
  );
}

/** Body copy for InfoBlurb / gates: muted running text; wrap the emphasised run in <B>. */
export function Body({ children, style }: { children: React.ReactNode; style?: StyleProp<any> }) {
  const colors = useThemeColors();
  return <Text style={[styles.body, { color: colors.textSecondary }, style]}>{children}</Text>;
}
export function B({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  return <Text style={{ fontFamily: fonts.body.semibold, color: colors.text }}>{children}</Text>;
}
export function Bullet({ children }: { children: React.ReactNode }) {
  const a = useOnbAccents();
  return (
    <View style={styles.bullet}>
      <View style={[styles.bulletDot, { backgroundColor: a.pop }]} />
      <Body style={{ flex: 1 }}>{children}</Body>
    </View>
  );
}

export function UsernameChip({ username }: { username: string }) {
  const a = useOnbAccents();
  return (
    <View style={[styles.unChip, { backgroundColor: hexToRgba(a.pop, 0.13), borderColor: hexToRgba(a.pop, 0.28) }]}>
      <Text style={{ fontFamily: fonts.mono.semibold, fontSize: 12, color: a.pop }}>{username}</Text>
    </View>
  );
}

export function Pill({ label, tone = 'muted', iosIcon, androidIcon }: { label: string; tone?: 'muted' | 'ok' | 'gold' | 'pop'; iosIcon?: string; androidIcon?: string }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  const gold = a.isDark ? '#F59E0B' : '#B45309';
  const hue = tone === 'ok' ? a.ok : tone === 'gold' ? gold : tone === 'pop' ? a.pop : null;
  return (
    <View style={[styles.pill, hue ? { backgroundColor: hexToRgba(hue, 0.14), borderColor: hexToRgba(hue, 0.3) } : { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      {!!iosIcon && !!androidIcon && <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={9} color={hue ?? colors.textSecondary} />}
      <Text style={[styles.pillText, { color: hue ?? colors.textSecondary }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function ErrorLine({ message }: { message?: string | null }) {
  const a = useOnbAccents();
  if (!message) return null;
  return <Text style={[styles.error, { color: a.bad }]}>{message}</Text>;
}

/** Centered text link row: muted lead + a strong tappable tail. */
export function LinkRow({ lead, label, onPress, back }: { lead?: string; label: string; onPress: () => void; back?: boolean }) {
  const colors = useThemeColors();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.linkRow}>
      {back && <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={13} color={colors.textSecondary} />}
      {!!lead && <Text style={[styles.linkLead, { color: colors.textSecondary }]}>{lead}</Text>}
      <Text style={[styles.linkLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function openLegal(which: 'terms' | 'privacy') {
  WebBrowser.openBrowserAsync(which === 'terms' ? LEGAL.termsUrl : LEGAL.privacyUrl).catch(() => {});
}

/** Terms · Privacy · version — sits at the foot of every pre-login page. */
export function LegalFooter({ showVersion = true }: { showVersion?: boolean }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const version = Constants.expoConfig?.version;
  return (
    <View style={styles.legal}>
      <Pressable onPress={() => openLegal('terms')} hitSlop={8}>
        <Text style={[styles.legalLink, { color: colors.textSecondary, borderBottomColor: hexToRgba(colors.textSecondary, 0.45) }]}>{t('welcome.terms')}</Text>
      </Pressable>
      <Text style={[styles.legalDot, { color: colors.textSecondary }]}>·</Text>
      <Pressable onPress={() => openLegal('privacy')} hitSlop={8}>
        <Text style={[styles.legalLink, { color: colors.textSecondary, borderBottomColor: hexToRgba(colors.textSecondary, 0.45) }]}>{t('welcome.privacy')}</Text>
      </Pressable>
      {showVersion && !!version && (
        <>
          <Text style={[styles.legalDot, { color: colors.textSecondary }]}>·</Text>
          <Text style={{ fontFamily: fonts.mono.medium, fontSize: 9.5, color: colors.textSecondary, opacity: 0.7 }}>v{version}</Text>
        </>
      )}
    </View>
  );
}

/** The clickwrap sentence: "I am the owner, and I agree to the Terms of Service and Privacy Policy." */
export function ClickwrapText() {
  const colors = useThemeColors();
  const a = useOnbAccents();
  const { t } = useTranslation();
  const link = { fontFamily: fonts.body.semibold, color: a.pop } as const;
  return (
    <Text style={{ fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 17, color: colors.text }}>
      {t('welcome.clickwrap_lead')}{' '}
      <Text style={link} onPress={() => openLegal('terms')}>{t('welcome.terms_of_service')}</Text>
      {' '}{t('welcome.clickwrap_and')}{' '}
      <Text style={link} onPress={() => openLegal('privacy')}>{t('welcome.privacy_policy')}</Text>.
    </Text>
  );
}

export function kitText(colors: ThemeColorSet) {
  return {
    cardTitle: { fontFamily: fonts.display.semibold, fontSize: 15, color: colors.text },
  } as const;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, gap: 12 },

  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  plateClip: { overflow: 'hidden', backgroundColor: '#FCFCFC' },
  orgLogo: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  mcCard: { borderRadius: 18, backgroundColor: '#FFFFFF', overflow: 'hidden', padding: 8 },

  hero: { alignItems: 'center', gap: 6, paddingTop: 14, paddingHorizontal: 8, paddingBottom: 2 },
  heroLeft: { alignItems: 'flex-start', paddingTop: 6, paddingHorizontal: 2 },
  heroTitle: { fontFamily: fonts.display.bold, fontSize: 25, letterSpacing: -0.5 },
  heroSub: { fontFamily: fonts.body.regular, fontSize: 13, lineHeight: 18 },
  disc: { width: 64, height: 64, borderRadius: 22, borderWidth: 1, marginBottom: 4 },
  discS: { width: 36, height: 36, borderRadius: 12, borderWidth: 1 },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2 },
  c38: { width: 38, height: 38, borderRadius: 12, borderWidth: 1 },
  eyebrow: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' },

  rail: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4, gap: 7 },
  railTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segs: { flexDirection: 'row', gap: 5 },
  seg: { flex: 1, gap: 5 },
  segBar: { height: 4, borderRadius: 2 },
  segLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  segLabel: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 0.8, textTransform: 'uppercase', flexShrink: 1 },

  ghost: { height: 50, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 },
  ghostLabel: { fontFamily: fonts.body.semibold, fontSize: 14.5 },
  dockWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5 },
  dock: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 30 },

  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  label: { flex: 1, fontFamily: fonts.mono.semibold, fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase' },
  inp: { minHeight: 43, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  inpMulti: { minHeight: 70, alignItems: 'flex-start', paddingVertical: 10 },
  inpBox: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  inpText: { flex: 1, minWidth: 0, fontSize: 14, paddingVertical: 11 },
  hint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, marginTop: 6 },

  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2, paddingHorizontal: 2 },
  checkBoxed: { alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 11, borderRadius: 13, borderWidth: 1 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5 },

  info: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 11, borderRadius: 13, borderWidth: 1 },
  body: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 17 },
  bullet: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletDot: { width: 4, height: 4, borderRadius: 2, marginTop: 7 },

  unChip: { height: 22, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  pill: { height: 20, paddingHorizontal: 7, borderRadius: 7, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillText: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase' },
  error: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 16, textAlign: 'center' },

  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  linkLead: { fontFamily: fonts.body.regular, fontSize: 12.5 },
  linkLabel: { fontFamily: fonts.body.semibold, fontSize: 12.5 },

  legal: { marginTop: 'auto', paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  legalLink: { fontFamily: fonts.body.regular, fontSize: 11, borderBottomWidth: 1, paddingBottom: 1 },
  legalDot: { fontFamily: fonts.body.regular, fontSize: 11 },
});
