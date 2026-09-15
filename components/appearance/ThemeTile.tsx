import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import type { PresetPaletteId, ThemePalette } from '@/styles/commonStyles';
import { alpha, THEME_LABEL_KEY } from '@/components/appearance/appearanceKit';

// The tag inks (mockup `.tcard .lab small`): gold for REVIVED, emerald for NEW.
const TAG_GOLD = '#D4AF37';
const TAG_EMERALD = '#34D399';

interface ThemeTileProps {
  id: PresetPaletteId | 'custom';
  palette: ThemePalette;
  selected: boolean;
  tag?: 'revived' | 'new';
  onPress: () => void;
}

/**
 * One gallery tile (mockup `.tcard`): a 58pt band painted with the palette's
 * DARK set — the gallery sells the theme, whatever mode is on — under a label
 * row with the name and a REVIVED / NEW tag, or the tint check when selected.
 */
export default function ThemeTile({ id, palette, selected, tag, onPress }: ThemeTileProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const d = palette.dark;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: selected ? colors.tint : colors.surfaceBorder,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {/* pvb — the dark-set band */}
        <View style={[styles.pvb, { backgroundColor: d.background }]}>
          <LinearGradient
            colors={[alpha(d.tint, 0.35), 'transparent']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0.2, y: 1 }}
            style={styles.pvbGlow}
            pointerEvents="none"
          />
          <View style={styles.pvbHero}>
            <View style={[styles.pvbDot, { backgroundColor: d.tint }]} />
            <View style={[styles.pvbBar, { backgroundColor: d.text }]} />
          </View>
          <View style={[styles.pvbCard, { backgroundColor: d.glass, borderColor: d.glassBorder }]}>
            <View style={[styles.pvbLine, styles.pvbLineA, { backgroundColor: d.text }]} />
            <View style={[styles.pvbLine, styles.pvbLineB, { backgroundColor: d.text }]} />
          </View>
          <View style={[styles.pvbPill, { backgroundColor: d.tint }]} />
        </View>

        {/* label row */}
        <View style={styles.lab}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {t(THEME_LABEL_KEY[id])}
          </Text>
          {selected ? (
            <View style={[styles.check, { backgroundColor: colors.tint }]}>
              <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={11} color={colors.fireText} />
            </View>
          ) : tag ? (
            <Text style={[styles.tag, { color: tag === 'new' ? TAG_EMERALD : TAG_GOLD }]} numberOfLines={1}>
              {t(tag === 'new' ? 'appearance:tag_new' : 'appearance:tag_revived')}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {/* The 1px selection ring (mockup `box-shadow: 0 0 0 1px tint`). */}
      {selected && <View pointerEvents="none" style={[styles.ring, { borderColor: colors.tint }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  card: { borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
  ring: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 16,
    borderWidth: 1,
  },
  pvb: { height: 58, padding: 7, gap: 5, overflow: 'hidden' },
  pvbGlow: { position: 'absolute', top: -30, right: -20, width: 90, height: 80, borderRadius: 45 },
  pvbHero: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pvbDot: { width: 12, height: 12, borderRadius: 6 },
  pvbBar: { width: 52, height: 5, borderRadius: 3, opacity: 0.85 },
  pvbCard: {
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 6,
    gap: 4,
    justifyContent: 'center',
  },
  pvbLine: { height: 4, borderRadius: 2 },
  pvbLineA: { width: '60%', opacity: 0.7 },
  pvbLineB: { width: '80%', opacity: 0.35 },
  pvbPill: { position: 'absolute', right: 7, bottom: 7, width: 34, height: 10, borderRadius: 4 },
  lab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  name: { flex: 1, fontFamily: fonts.display.semibold, fontSize: 12.5 },
  tag: {
    marginLeft: 'auto',
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  check: {
    marginLeft: 'auto',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
