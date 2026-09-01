/**
 * CommandTile (s79 lockdown) — the Manage cockpit's live-tile grammar minus the
 * flip: the WHOLE face navigates (chevron affordance, zero pre-clicks), the
 * face is TINTED GLASS in the tile's family accent (the r3 winning finish;
 * gradients live only in the hero), the title is full-size display type
 * (Steve's r2 call — the tiny mono eyebrow was too small to read), and a tile
 * with a waiting badge pulses in its own family color.
 *
 * `wide` = the full-width variant (Rewards + Reviews): content flows as a row
 * with a trailing block (rating) supplied via `rightBlock`.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { MessageBadge } from '@/components/MessageBadge';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { hexToRgba } from '@/styles/commonStyles';
import { useAppTheme } from '@/contexts/ThemeContext';
import { AttentionRing } from '@/components/tools/ToolsBits';
import { TILE_BG_ALPHA, TILE_BORDER_ALPHA } from '@/components/tools/toolsVisuals';

interface CommandTileProps {
  accent: string;
  iosIcon: string;
  androidIcon: string;
  title: string;
  /** String, or nested <Text> spans for inline color (the gold rank number). */
  big: React.ReactNode;
  sub: string;
  onPress: () => void;
  width?: number; // grid tiles pass the computed column width; wide omits it
  badgeCount?: number;
  pulse?: boolean;
  /** Premium-locked face: dimmed, gold big line, lock replaces the family icon. */
  locked?: boolean;
  lockedAccent?: string;
  wide?: boolean;
  rightBlock?: React.ReactNode;
}

export default function CommandTile({
  accent,
  iosIcon,
  androidIcon,
  title,
  big,
  sub,
  onPress,
  width,
  badgeCount = 0,
  pulse = false,
  locked = false,
  lockedAccent,
  wide = false,
  rightBlock,
}: CommandTileProps) {
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const scheme = mode === 'dark' ? 'dark' : 'light';

  const bg = hexToRgba(accent, TILE_BG_ALPHA[scheme]);
  const border = hexToRgba(accent, TILE_BORDER_ALPHA[scheme]);
  // The sub line leans toward the family so the wash reads intentional, but
  // stays anchored to the theme's secondary ink for contrast.
  const subInk = locked ? colors.textSecondary : accent;

  const header = (
    <View style={styles.headerRow}>
      <IconSymbol
        ios_icon_name={(locked ? 'lock.fill' : iosIcon) as any}
        android_material_icon_name={(locked ? 'lock' : androidIcon) as any}
        size={15}
        color={locked ? (lockedAccent ?? accent) : accent}
      />
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
        {title}
      </Text>
      {/* Wide keeps ONE chevron — the trailing one after rightBlock (two read
          as clutter, Steve's punch call). */}
      {!wide && (
        <IconSymbol
          ios_icon_name="chevron.right"
          android_material_icon_name="chevron-right"
          size={12}
          color={colors.textSecondary}
        />
      )}
    </View>
  );

  const body = (
    <>
      <Text
        style={[
          styles.big,
          { color: locked ? (lockedAccent ?? accent) : colors.text },
          wide && styles.bigWide,
        ]}
        numberOfLines={1}
      >
        {big}
      </Text>
      <Text style={[styles.sub, { color: subInk }]} numberOfLines={1}>
        {sub}
      </Text>
    </>
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.tile,
        { backgroundColor: bg, borderColor: border },
        width !== undefined && { width },
        wide && styles.tileWide,
        locked && styles.tileLocked,
      ]}
    >
      {wide ? (
        <>
          <View style={styles.wideLeft}>
            {header}
            {body}
          </View>
          {rightBlock}
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={12}
            color={colors.textSecondary}
          />
        </>
      ) : (
        <>
          {header}
          <View style={styles.bodySpacer} />
          {body}
        </>
      )}
      {badgeCount > 0 && (
        <View style={styles.badge}>
          <MessageBadge count={badgeCount} size="small" />
        </View>
      )}
      <AttentionRing active={pulse && !locked} color={accent} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    minHeight: 112,
    position: 'relative',
  },
  tileWide: {
    minHeight: 0,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  tileLocked: {
    opacity: 0.68,
  },
  wideLeft: {
    flex: 1,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  title: {
    fontFamily: fonts.display.semibold,
    fontSize: 14,
    letterSpacing: -0.2,
    lineHeight: 17,
    flex: 1,
    minWidth: 0,
  },
  bodySpacer: {
    flex: 1,
    minHeight: 9,
  },
  big: {
    fontFamily: fonts.display.bold,
    fontSize: 17.5,
    letterSpacing: -0.3,
  },
  bigWide: {
    marginTop: 6,
  },
  sub: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 0.2,
    marginTop: 4,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    zIndex: 2,
  },
});
