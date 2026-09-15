import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import { IconSymbol } from '@/components/IconSymbol';
import { SegControl, type SegOption } from '@/components/content/FormKit';
import ThemeTile from '@/components/appearance/ThemeTile';
import ThemePreview from '@/components/appearance/ThemePreview';
import AccentEditorSheet from '@/components/appearance/AccentEditorSheet';
import {
  alpha,
  HUE_GRADIENT_COLORS,
  HUE_GRADIENT_LOCATIONS,
  THEME_LABEL_KEY,
} from '@/components/appearance/appearanceKit';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { fonts } from '@/constants/fonts';
import {
  themePalettes,
  THEME_PALETTE_IDS,
  type PresetPaletteId,
  type ThemeMode,
} from '@/styles/commonStyles';
import { hslToHex } from '@/utils/theme/customAccent';

const TILE_TAG: Partial<Record<PresetPaletteId, 'revived' | 'new'>> = {
  midnight: 'revived',
  emerald: 'revived',
  gilded: 'revived',
  ember: 'new',
};

const BASE_LABEL_KEY = {
  graphite: 'appearance:custom_base_graphite',
  navy: 'appearance:custom_base_navy',
  espresso: 'appearance:custom_base_espresso',
  onyx: 'appearance:custom_base_onyx',
  slate: 'appearance:custom_base_slate',
  ivory: 'appearance:custom_base_ivory',
} as const;

/** Pairs of preset ids — one grid row each (flex halves + a 10pt gap). */
function pairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

/**
 * Appearance (mockup AP1): Light / Dark / Auto, the six-theme gallery, the wide
 * Custom tile (→ the AP2 editor sheet) and the honest preview of the theme in
 * force. Everything is a device preference held by ThemeContext.
 */
export default function AppearanceScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { palette, mode, resolvedMode, activePalette, customAccent, setPalette, setMode } = useAppTheme();
  const [editorOpen, setEditorOpen] = useState(false);

  const modeOptions = useMemo<SegOption<ThemeMode>[]>(
    () => [
      {
        key: 'light',
        label: t('appearance.light_mode'),
        iosIcon: 'sun.max.fill',
        androidIcon: 'light-mode',
        activeColor: colors.tint,
        activeInk: colors.fireText,
      },
      {
        key: 'dark',
        label: t('appearance.dark_mode'),
        iosIcon: 'moon.fill',
        androidIcon: 'dark-mode',
        activeColor: colors.tint,
        activeInk: colors.fireText,
      },
      {
        key: 'auto',
        label: t('appearance.auto_mode'),
        iosIcon: 'circle.lefthalf.filled',
        androidIcon: 'brightness-auto',
        activeColor: colors.tint,
        activeInk: colors.fireText,
      },
    ],
    [t, colors.tint, colors.fireText],
  );

  const customSelected = palette === 'custom';
  const customHex = customAccent ? hslToHex(customAccent.hue, 86, 60) : null;
  const modeLabel = t(resolvedMode === 'dark' ? 'appearance:dark_mode' : 'appearance:light_mode');
  const previewLabel = `${t(THEME_LABEL_KEY[palette])} · ${modeLabel}`;

  const onCustomTilePress = () => {
    if (customAccent) {
      if (!customSelected) setPalette('custom');
      else setEditorOpen(true);
    } else {
      setEditorOpen(true);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={t('appearance.title')} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Light / Dark / Auto */}
        <SegControl options={modeOptions} value={mode} onChange={(m) => setMode(m)} />

        {/* Theme rule + gallery */}
        <View style={styles.srule}>
          <Text style={[styles.eyeb, { color: colors.tint }]}>{t('appearance.select_theme')}</Text>
          <View style={[styles.ln, { backgroundColor: colors.hairline }]} />
        </View>
        <View style={styles.grid}>
          {pairs(THEME_PALETTE_IDS).map((row) => (
            <View key={row.join('-')} style={styles.gridRow}>
              {row.map((id) => (
                <ThemeTile
                  key={id}
                  id={id}
                  palette={themePalettes[id]}
                  selected={palette === id}
                  tag={TILE_TAG[id]}
                  onPress={() => setPalette(id)}
                />
              ))}
            </View>
          ))}

          {/* The wide Custom tile */}
          <View style={styles.customWrap}>
            <Pressable
              onPress={onCustomTilePress}
              accessibilityRole="button"
              accessibilityState={{ selected: customSelected }}
              style={({ pressed }) => [
                styles.custom,
                {
                  backgroundColor: colors.surface,
                  borderColor: customSelected ? colors.tint : colors.surfaceBorder,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {customAccent && customHex ? (
                <View style={[styles.customSwatch, { backgroundColor: customHex, borderColor: colors.glassBorder }]} />
              ) : (
                <LinearGradient
                  colors={HUE_GRADIENT_COLORS}
                  locations={HUE_GRADIENT_LOCATIONS}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.ring}
                >
                  <View style={[styles.ringInner, { backgroundColor: colors.card }]} />
                </LinearGradient>
              )}

              <View style={styles.customBody}>
                <Text style={[styles.customTitle, { color: colors.text }]} numberOfLines={1}>
                  {customHex ? `${t('appearance.theme_custom')} · ${customHex}` : t('appearance.theme_custom')}
                </Text>
                <Text style={[styles.customSub, { color: colors.textSecondary }]} numberOfLines={1}>
                  {customAccent ? t(BASE_LABEL_KEY[customAccent.base]) : t('appearance.custom_tile_sub')}
                </Text>
              </View>

              {customSelected ? (
                <Pressable
                  onPress={() => setEditorOpen(true)}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.editChip,
                    {
                      backgroundColor: alpha(colors.tint, 0.16),
                      borderColor: alpha(colors.tint, 0.4),
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={13} color={colors.tint} />
                  <Text style={[styles.editChipText, { color: colors.tint }]}>{t('appearance.custom_edit')}</Text>
                </Pressable>
              ) : (
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              )}
            </Pressable>
            {customSelected && <View pointerEvents="none" style={[styles.ring1, { borderColor: colors.tint }]} />}
          </View>
        </View>

        {/* Preview rule + the honest preview */}
        <View style={styles.srule}>
          <Text style={[styles.eyeb, { color: colors.tint }]}>{t('appearance.preview')}</Text>
          <View style={[styles.ln, { backgroundColor: colors.hairline }]} />
          <Text style={[styles.eyeb, { color: colors.textSecondary }]} numberOfLines={1}>
            {previewLabel}
          </Text>
        </View>
        <ThemePreview palette={activePalette[resolvedMode]} label={previewLabel} />
      </ScrollView>

      <AccentEditorSheet visible={editorOpen} onClose={() => setEditorOpen(false)} initial={customAccent} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1, zIndex: 2 },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 12 },
  srule: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2, marginBottom: -2 },
  ln: { flex: 1, height: 1 },
  eyeb: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  grid: { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },
  customWrap: {},
  custom: {
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 58,
  },
  ring1: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 16,
    borderWidth: 1,
  },
  ring: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 22, height: 22, borderRadius: 11 },
  customSwatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, marginHorizontal: 9 },
  customBody: { flex: 1, minWidth: 0 },
  customTitle: { fontFamily: fonts.display.semibold, fontSize: 14 },
  customSub: { fontFamily: fonts.body.regular, fontSize: 11, marginTop: 1 },
  editChip: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
  },
  editChipText: { fontFamily: fonts.body.semibold, fontSize: 12 },
});
