import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

export interface GlassAction {
  key: string;
  label: string;
  iosIcon: string;
  androidIcon: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

interface GlassActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Context line under the title (e.g. "Dinner · Entrees · position 1 of 7"). */
  subtitle?: string;
  actions: GlassAction[];
}

/**
 * The overflow ("meatball") action sheet.
 *
 * ⚠️ Deliberately NOT `Alert.alert(title, undefined, buttons)` — the idiom the
 * menu editor uses (app/menu-editor.tsx:808). Android's AlertDialog exposes only
 * THREE button slots (positive / negative / neutral), so a six-action menu
 * (Edit / Move Up / Move Down / Order Position / Delete / Cancel) silently loses
 * rows there. A real sheet shows every action on both platforms, and it can
 * carry icons and a disabled state, which Alert cannot.
 *
 * Dismissal is the sheet's own scrim / ✕ / hardware back — each action closes
 * before running, and the action is then DEFERRED until this sheet is actually
 * gone. Running it in the same commit as `onClose` was a live bug: every action
 * here opens either another root-level Modal (Edit, Order Position) or an Alert
 * (Delete), and UIKit silently DROPS a presentation issued on a parent view
 * controller that is still animating a dismissal — so those taps did nothing,
 * intermittently.
 */
export default function GlassActionSheet({
  visible,
  onClose,
  title,
  subtitle,
  actions,
}: GlassActionSheetProps) {
  const colors = useThemeColors();
  // Every action here opens another root-level Modal (Edit, Order Position) or
  // an Alert (Delete), so each must wait for this sheet to finish dismissing.
  const { defer, onDismiss } = useSheetHandoff(onClose);

  return (
    <GlassSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} onDismiss={onDismiss}>
      {actions.map((a) => (
        <Pressable
          key={a.key}
          disabled={a.disabled}
          onPress={() => defer(a.onPress)}
          style={[
            styles.row,
            {
              backgroundColor: colors.surface,
              borderColor: colors.surfaceBorder,
              opacity: a.disabled ? 0.35 : 1,
            },
          ]}
        >
          <IconSymbol
            ios_icon_name={a.iosIcon}
            android_material_icon_name={a.androidIcon}
            size={19}
            color={a.destructive ? '#E74C3C' : colors.text}
          />
          <Text
            style={[styles.label, { color: a.destructive ? '#E74C3C' : colors.text }]}
            numberOfLines={1}
          >
            {a.label}
          </Text>
        </Pressable>
      ))}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    // 48pt tall — comfortably over the 44pt minimum touch target.
    paddingVertical: 14,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  label: { flex: 1, flexShrink: 1, fontFamily: fonts.display.semibold, fontSize: 15 },
});
