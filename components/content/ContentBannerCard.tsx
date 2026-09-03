import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { StorageExpoImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

/**
 * The banner-shape content card (s81, Steve's pick "B") — Announcements ·
 * Special Features · Upcoming Events on the Welcome tabs, both View All pages
 * and the editors' Review preview. The photo runs edge-to-edge across the TOP
 * of a surface card and a title bar sits under it, so the image never competes
 * with the text (vs. the menu banner where the copy rides the photo).
 *
 * Every string is PRE-COMPUTED by the caller (localized title, stripped body,
 * the formatted "when" line, the priority / category badge) — this owns layout
 * only. Only the badge pill sits ON the photo, so it keeps white ink; the bar
 * below is a themed surface and reads the theme tokens.
 */
export interface ContentBannerCardProps {
  /** Resolved image URL (or a local uri for the editor preview). */
  imageUrl: string;
  title: string;
  /** Already stripped of formatting tags; clamps to two lines. */
  description?: string | null;
  /** The mono "when" line under the copy: the date line or "Today". */
  eyebrow?: string | null;
  /** Solid hue pill on the photo, top-right: priority (announcements) or category. */
  badge?: { label: string; color: string } | null;
  /** The red NEW pill beside the title. */
  newLabel?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function ContentBannerCard({
  imageUrl,
  title,
  description,
  eyebrow,
  badge,
  newLabel,
  onPress,
  style,
}: ContentBannerCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity style={[styles.card, style]} onPress={onPress} activeOpacity={0.8} disabled={!onPress}>
      <View style={styles.photo}>
        <StorageExpoImage source={imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
        {!!badge && (
          <View style={[styles.badgePill, { backgroundColor: badge.color }]} pointerEvents="none">
            <Text style={styles.badgeText} numberOfLines={1}>{badge.label.toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.bar}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {!!newLabel && (
            <View style={styles.newPill}>
              <Text style={styles.newText}>{newLabel}</Text>
            </View>
          )}
        </View>
        {!!description && (
          <Text style={styles.desc} numberOfLines={2}>{description}</Text>
        )}
        {!!eyebrow && (
          <Text style={styles.when} numberOfLines={1}>{eyebrow}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

/**
 * The "when" line for a dated post — "Sat, Sep 12 · 4:00 PM" (locale-aware,
 * no year: the Welcome tabs only ever show what's current). Shared by every
 * caller so the four surfaces print the same string.
 */
export function formatBannerWhen(iso: string | null | undefined, language: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const locale = language === 'es' ? 'es' : 'en-US';
  const date = d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    // The row card's surface grammar (r16, surface fill, hairline+0.5 border)
    // with the photo clipped to the top corners.
    card: {
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 11,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    photo: {
      height: 150,
      backgroundColor: colors.thumbPlaceholder,
    },
    badgePill: {
      position: 'absolute',
      top: 10,
      right: 10,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 7,
    },
    badgeText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9,
      letterSpacing: 1,
      // Sits on the photo, never on a themed surface.
      color: '#FFFFFF',
    },
    bar: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 11,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    title: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.display.semibold,
      fontSize: 14.5,
      color: colors.text,
    },
    newPill: {
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 5,
      backgroundColor: '#EF4444',
    },
    newText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 8,
      letterSpacing: 0.8,
      color: '#FFFFFF',
    },
    desc: {
      fontFamily: fonts.body.regular,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 3,
      color: colors.textSecondary,
    },
    when: {
      fontFamily: fonts.mono.medium,
      fontSize: 9.5,
      letterSpacing: 0.3,
      marginTop: 5,
      color: colors.primary,
    },
  });
