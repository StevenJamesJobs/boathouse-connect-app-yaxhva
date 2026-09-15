import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import GlassCard from '@/components/GlassCard';
import { IconSymbol } from '@/components/IconSymbol';
import { FieldLabel, Hint, SegControl } from '@/components/content/FormKit';
import ThemePreview from '@/components/appearance/ThemePreview';
import HueSlider from '@/components/appearance/HueSlider';
import { alpha, THEME_LABEL_KEY } from '@/components/appearance/appearanceKit';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { fonts } from '@/constants/fonts';
import { themePalettes, THEME_PALETTE_IDS, type PresetPaletteId } from '@/styles/commonStyles';
import {
  type CustomAccent,
  type NeutralBase,
  NEUTRAL_BASES,
  baseForPreset,
  buildCustomPalette,
  clampHue,
  hslToHex,
} from '@/utils/theme/customAccent';

const BASE_LABEL_KEY: Record<NeutralBase, string> = {
  graphite: 'appearance:custom_base_graphite',
  navy: 'appearance:custom_base_navy',
  espresso: 'appearance:custom_base_espresso',
  onyx: 'appearance:custom_base_onyx',
  slate: 'appearance:custom_base_slate',
  ivory: 'appearance:custom_base_ivory',
};

interface AccentEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The saved accent to start from; null/undefined seeds from the active preset. */
  initial?: CustomAccent | null;
}

/**
 * "Your accent" (mockup AP2): a preset chip rail that seeds hue + base, the hue
 * slider, the neutral base row and the honest preview. Local state only until
 * Save accent (→ setCustomAccent, which also selects 'custom'); Cancel discards.
 */
export default function AccentEditorSheet({ visible, onClose, initial }: AccentEditorSheetProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { palette, resolvedMode, setCustomAccent } = useAppTheme();

  const [hue, setHue] = useState(0);
  const [base, setBase] = useState<NeutralBase>('graphite');
  const [seed, setSeed] = useState<PresetPaletteId | null>(null);
  // The preview can show either mode without saving (Steve's round 2); it opens on the mode in force.
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>(resolvedMode);

  // Reset the draft every time the sheet opens — from the saved accent, else from
  // the preset in force (so "Custom" starts as a copy of what you have).
  useEffect(() => {
    if (!visible) return;
    setPreviewMode(resolvedMode);
    if (initial) {
      setHue(clampHue(initial.hue));
      setBase(initial.base);
      setSeed(initial.seed);
      return;
    }
    const from: PresetPaletteId = palette !== 'custom' ? palette : 'moonstone';
    setHue(themePalettes[from].hue);
    setBase(baseForPreset(from));
    setSeed(from);
  }, [visible, initial, palette, resolvedMode]);

  const draft = useMemo<CustomAccent>(() => ({ hue: clampHue(hue), base, seed }), [hue, base, seed]);
  const draftPalette = useMemo(() => buildCustomPalette(draft), [draft]);
  const hex = hslToHex(hue, 86, 60);
  const ticks = useMemo(() => THEME_PALETTE_IDS.map((id) => themePalettes[id].hue), []);
  const tintRing = alpha(colors.tint, 0.45);

  const pickPreset = (id: PresetPaletteId) => {
    setHue(themePalettes[id].hue);
    setBase(baseForPreset(id));
    setSeed(id);
  };

  const save = async () => {
    await setCustomAccent(draft);
    onClose();
  };

  const footer = (
    <View style={styles.footer}>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [
          styles.fbtn,
          { backgroundColor: colors.glass, borderColor: colors.glassBorder, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={[styles.fbtnText, { color: colors.text }]}>{t('common.cancel')}</Text>
      </Pressable>
      <Pressable
        onPress={save}
        style={({ pressed }) => [
          styles.fbtn,
          styles.fbtnSave,
          { backgroundColor: colors.tint, borderColor: colors.tint, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={colors.fireText} />
        <Text style={[styles.fbtnText, { color: colors.fireText }]}>{t('appearance.custom_save')}</Text>
      </Pressable>
    </View>
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('appearance.custom_title')}
      subtitle={t('appearance.custom_subtitle')}
      footer={footer}
    >
      {/* Preset chip rail */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        style={styles.railScroll}
      >
        {THEME_PALETTE_IDS.map((id) => {
          const on = seed === id;
          const pd = themePalettes[id].dark;
          return (
            <Pressable
              key={id}
              onPress={() => pickPreset(id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: colors.glass,
                  borderColor: on ? tintRing : colors.glassBorder,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <LinearGradient
                colors={[pd.tint, pd.tint, pd.background, pd.background]}
                locations={[0, 0.5, 0.5, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.swatch, { borderColor: colors.surfaceBorder }]}
              />
              <Text style={[styles.chipText, { color: on ? colors.text : colors.textSecondary }]}>
                {t(THEME_LABEL_KEY[id])}
              </Text>
              {on && (
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={13} color={colors.tint} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Hue + base card */}
      <GlassCard variant="glass" radius={16} style={styles.card}>
        <View style={styles.chead}>
          <Text style={[styles.ct, { color: colors.text }]}>{t('appearance.custom_hue')}</Text>
          <Text style={[styles.eyeb, { color: colors.textSecondary }]} numberOfLines={1}>
            {hex}
            {seed ? ` · ${t('appearance.custom_from_preset', { name: t(THEME_LABEL_KEY[seed]) })}` : ''}
          </Text>
        </View>
        <HueSlider value={hue} onChange={setHue} ticks={ticks} />
        <Hint>{t('appearance.custom_hue_hint')}</Hint>

        <View style={styles.baseLabel}>
          <FieldLabel label={t('appearance.custom_base_label')} />
        </View>
        <View style={styles.nb}>
          {NEUTRAL_BASES.map((b) => {
            const on = base === b;
            const swatch = buildCustomPalette({ hue: 0, base: b, seed: null }).dark.background;
            return (
              <Pressable
                key={b}
                onPress={() => setBase(b)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  styles.nbItem,
                  {
                    backgroundColor: colors.glass,
                    borderColor: on ? tintRing : colors.glassBorder,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <View style={[styles.nbSwatch, { backgroundColor: swatch, borderColor: colors.glassBorder }]} />
                <Text style={[styles.nbText, { color: on ? colors.text : colors.textSecondary }]} numberOfLines={1}>
                  {t(BASE_LABEL_KEY[b])}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Hint>{t('appearance.custom_base_hint')}</Hint>
      </GlassCard>

      {/* Preview rule + honest preview of the draft, in either mode */}
      <View style={styles.srule}>
        <Text style={[styles.eyeb, { color: colors.tint }]}>{t('appearance.preview')}</Text>
        <View style={[styles.ln, { backgroundColor: colors.hairline }]} />
        <Text style={[styles.eyeb, { color: colors.textSecondary }]}>
          {t('appearance.theme_custom')} · {t(previewMode === 'dark' ? 'appearance:dark_mode' : 'appearance:light_mode')}
        </Text>
      </View>
      <SegControl
        options={[
          { key: 'light', label: t('appearance.light_mode'), iosIcon: 'sun.max', androidIcon: 'light-mode' },
          { key: 'dark', label: t('appearance.dark_mode'), iosIcon: 'moon', androidIcon: 'dark-mode' },
        ]}
        value={previewMode}
        onChange={setPreviewMode}
      />
      <ThemePreview palette={draftPalette[previewMode]} />
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  railScroll: { flexGrow: 0, marginHorizontal: -18 },
  rail: { flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  chip: {
    height: 36,
    paddingLeft: 7,
    paddingRight: 11,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
  },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
  chipText: { fontFamily: fonts.body.semibold, fontSize: 12 },
  card: { padding: 12 },
  chead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ct: { flex: 1, fontFamily: fonts.display.semibold, fontSize: 15 },
  eyeb: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  baseLabel: { marginTop: 12 },
  // Six bases → a 3 × 2 grid (a single row squeezed the labels to nothing).
  nb: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  nbItem: {
    flexGrow: 1,
    flexBasis: '31%',
    height: 34,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 4,
  },
  nbSwatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  nbText: { fontFamily: fonts.body.semibold, fontSize: 11.5, flexShrink: 1 },
  srule: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2, marginBottom: -2 },
  ln: { flex: 1, height: 1 },
  footer: { flexDirection: 'row', gap: 11, paddingTop: 12 },
  fbtn: {
    flex: 1,
    height: 47,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
  },
  fbtnSave: { flex: 1.35 },
  fbtnText: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
