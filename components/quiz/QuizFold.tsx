/**
 * QuizFold — the editor's collapsible glass fold (s77 lockdown: Questions and
 * Tracker are folds so the launch row is always two flicks away, and the live
 * tracker sleeps with its ProgressRing in the header). CollapsibleSection's
 * string-title API can't carry a ring or a "locked while live" meta slot, so
 * this is the quiz kit's own: CONTROLLED open state (the editor coordinates
 * the draft↔live↔paused morphs), a mono meta slot, and a free headerExtra
 * node that sits between meta and caret — where the ring lives, both states.
 *
 * Same tap-triggered LayoutAnimation as CollapsibleSection (the house fold
 * pattern) — this is user-tap layout, not scroll-linked chrome, so the s68
 * no-layout-on-scroll rule doesn't apply.
 */

import React, { ReactNode } from 'react';
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
  ViewStyle,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface QuizFoldProps {
  title: string;
  iosIcon: string;
  androidIcon: string;
  iconColor: string;
  /** Mono note beside the caret ("12 · locked while live", "4 of 9"). */
  meta?: string;
  /** Node between meta and caret — the tracker's ProgressRing rides here. */
  headerExtra?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  style?: ViewStyle;
}

export default function QuizFold({
  title,
  iosIcon,
  androidIcon,
  iconColor,
  meta,
  headerExtra,
  open,
  onToggle,
  children,
  style,
}: QuizFoldProps) {
  const colors = useThemeColors();

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  return (
    <View
      style={[
        styles.fold,
        { backgroundColor: colors.glass, borderColor: colors.surfaceBorder },
        style,
      ]}
    >
      <TouchableOpacity style={styles.header} onPress={handleToggle} activeOpacity={0.7}>
        <IconSymbol
          ios_icon_name={iosIcon as any}
          android_material_icon_name={androidIcon as any}
          size={14}
          color={iconColor}
        />
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {!!meta && (
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {meta}
          </Text>
        )}
        {headerExtra}
        <IconSymbol
          ios_icon_name={open ? 'chevron.up' : 'chevron.down'}
          android_material_icon_name={open ? 'expand-less' : 'expand-more'}
          size={15}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  fold: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    minHeight: 44,
  },
  title: {
    fontFamily: fonts.body.semibold,
    fontSize: 13.5,
  },
  meta: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
  },
  body: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
});
