/**
 * QuizTile — the s77 role tile for the Quizzes & Exams hub (manager) and the
 * employee shelf. GameSquareTile's arcade geometry grown a quiz foot: the
 * name strip carries the role PLUS a status dot + word (Steve's round-2 note),
 * the caret rides the TOP-right corner, and three variants cover the family:
 *
 *   · role tile   — gradient card, glyph, foot = name + ● STATUS
 *   · done tile   — darkened scrim + green check badge (employee side)
 *   · ghost tile  — dashed glass "＋ Create Quiz" for a role with no quiz yet
 *
 * `wide` is the one-quiz employee case: the tile stretches full-width
 * (aspect ~2.2) so a single quiz never looks lonely (USR·SOLO lockdown).
 * Scrim text/pill colors are LITERALS on purpose — the gradient is a
 * fixed-dark photo-class surface in both themes (the ember rule).
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

export interface QuizTileProps {
  label: string;
  iosIcon: string;
  androidIcon: string;
  /** Two-stop gradient from QUIZ_VISUALS[role].gradient. Ignored for ghosts. */
  gradient: readonly [string, string];
  /** Foot status — dot + uppercase word ("Active"/"Draft"). Omit when done/ghost. */
  status?: { word: string; color: string };
  /** Employee side: taken — darkened tile, check badge, no caret. */
  done?: boolean;
  /** No quiz yet — dashed glass create tile (＋ + createLabel, muted foot). */
  ghost?: boolean;
  /** Center label under the ＋ on ghost tiles ("Create Quiz"). */
  createLabel?: string;
  /** Flips the caret and draws the tint ring while the detail card is open. */
  selected?: boolean;
  /** 1 (default) for shelves; ~2.2 for the single-quiz full-width tile. */
  aspectRatio?: number;
  onPress: () => void;
}

export default function QuizTile({
  label,
  iosIcon,
  androidIcon,
  gradient,
  status,
  done,
  ghost,
  createLabel,
  selected,
  aspectRatio = 1,
  onPress,
}: QuizTileProps) {
  const colors = useThemeColors();

  if (ghost) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={[
          styles.tile,
          styles.ghost,
          { aspectRatio, backgroundColor: colors.glass, borderColor: colors.glassBorder },
        ]}
      >
        <View style={styles.ghostCenter}>
          <IconSymbol
            ios_icon_name="plus"
            android_material_icon_name="add"
            size={26}
            color={colors.textSecondary}
          />
          {!!createLabel && (
            <Text style={[styles.ghostLabel, { color: colors.textSecondary }]} numberOfLines={1}>
              {createLabel}
            </Text>
          )}
        </View>
        <View style={styles.foot}>
          <Text style={[styles.footName, { color: colors.textSecondary }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.tile,
        { aspectRatio, borderColor: colors.glassBorder },
        selected && { borderColor: colors.tint, borderWidth: 1.5 },
      ]}
    >
      <LinearGradient
        colors={[gradient[0], gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glyphBox}>
        <IconSymbol
          ios_icon_name={iosIcon as any}
          android_material_icon_name={androidIcon as any}
          size={aspectRatio > 1.5 ? 32 : 28}
          color="#FFFFFF"
        />
      </View>
      {done && <View style={styles.doneScrim} pointerEvents="none" />}
      {done ? (
        <View style={styles.doneBadge}>
          <IconSymbol
            ios_icon_name="checkmark"
            android_material_icon_name="check"
            size={11}
            color="#FFFFFF"
          />
        </View>
      ) : (
        <View style={styles.cornerChip}>
          <IconSymbol
            ios_icon_name={selected ? 'chevron.up' : 'chevron.down'}
            android_material_icon_name={selected ? 'expand-less' : 'expand-more'}
            size={11}
            color="#FFFFFF"
          />
        </View>
      )}
      <View style={styles.foot}>
        <Text style={styles.footNameLit} numberOfLines={1}>
          {label}
        </Text>
        {status && (
          <View style={styles.statusWrap}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={styles.statusWord} numberOfLines={1}>
              {status.word.toUpperCase()}
            </Text>
          </View>
        )}
        {done && <Text style={styles.statusWord}>✓</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  glyphBox: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    // Keep the glyph above the foot strip's visual weight.
    paddingBottom: 14,
  },
  // Fixed-dark strip over the gradient — literals by design.
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(8,10,14,0.45)',
  },
  footName: {
    flex: 1,
    fontFamily: fonts.display.semibold,
    fontSize: 11,
  },
  footNameLit: {
    flex: 1,
    fontFamily: fonts.display.semibold,
    fontSize: 11,
    color: '#FFFFFF',
  },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusWord: {
    fontFamily: fonts.mono.semibold,
    fontSize: 7.5,
    letterSpacing: 0.6,
    color: '#FFFFFF',
  },
  cornerChip: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 21,
    height: 21,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,10,14,0.45)',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  doneScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8,10,14,0.35)',
  },
  doneBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
  },
  ghost: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  ghostCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 12,
  },
  ghostLabel: {
    fontFamily: fonts.body.semibold,
    fontSize: 10.5,
  },
});
