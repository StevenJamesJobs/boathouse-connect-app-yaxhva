import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

interface ScreenHeaderProps {
  /** Screen title — pass the SAME expression the old header used (t() stays t()). */
  title: string;
  /** Optional mono uppercase micro-label under the title (as on Rewards & Reviews). */
  eyebrow?: string;
  /** Back handler; defaults to router.back(). */
  onBack?: () => void;
  /** Optional trailing action, replacing the width-38 spacer. */
  right?: React.ReactNode;
}

/**
 * The shared glass screen header: a TRANSPARENT bar (no fill, no bottom border)
 * so the screen-root <AmbientGlow /> runs edge-to-edge behind it, with the
 * 38x38 glass back chip on the left and the display-font title beside it.
 *
 * The screen owns the glow — render <AmbientGlow /> as the FIRST child of the
 * screen's ROOT view, immediately before this header. This component never
 * renders it (it would clip to the header box).
 *
 * Vertical rhythm is paddingTop 48 / paddingHorizontal 16 / paddingBottom 12 —
 * the majority convention (32 screens, incl. manager-approvals). Two other
 * rhythms exist in the repo and DO shift on conversion: the games family sits at
 * paddingTop 60 (rises 12pt) and a cluster at `Platform.OS === 'ios' ? 60 : 16`
 * (rises 12pt on iOS, drops 32pt on Android — where 16 left content under the
 * status bar). Both are unified here on purpose, so expect a small shift when
 * converting a screen from either. Screens with an absolutely-positioned overlay
 * pinned to the old header height need that offset recomputed against this one
 * (see app/schedule-review.tsx styles.savingOverlay).
 */
export default function ScreenHeader({ title, eyebrow, onBack, right }: ScreenHeaderProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const handleBack = onBack ?? (() => router.back());

  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={handleBack}
        hitSlop={8}
        style={[
          styles.backChip,
          { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        ]}
      >
        <IconSymbol
          ios_icon_name="chevron.left"
          android_material_icon_name="chevron-left"
          size={22}
          color={colors.text}
        />
      </TouchableOpacity>

      <View style={styles.titleWrap}>
        {/* No numberOfLines: a long ES title wraps (header grows) rather than
            being truncated — matches the old header, which also wrapped. */}
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {!!eyebrow && (
          <Text style={[styles.eyebrow, { color: colors.tint }]} numberOfLines={1}>
            {eyebrow}
          </Text>
        )}
      </View>

      {/* Always a width-38 box, so a trailing action cannot pull the title off-centre. */}
      <View style={styles.spacer}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  backChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // flex:1 between two width-38 slots => the title stays optically centered,
  // and a long title wraps inside its own box instead of shoving the chips around.
  titleWrap: { flex: 1, alignItems: 'center' },
  title: {
    fontFamily: fonts.display.bold,
    fontSize: 20,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  eyebrow: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 2,
  },
  // alignItems keeps a trailing action optically centred in the slot; without it
  // the child stretches to the full 38pt and the glyph sits flush-left.
  spacer: { width: 38, alignItems: 'center', justifyContent: 'center' },
});
