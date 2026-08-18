import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import GlassActionSheet, { GlassAction } from '@/components/GlassActionSheet';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * The recipe screens' header nav pill (s73) — HeaderNavButton grown into a
 * dropdown, the Menus family's familiar top-right hub. The pill shows the
 * primary jump (To Editor / To User) plus a chevron; tapping opens a
 * GlassActionSheet with the full nav list (the To-X row, Edit Categories,
 * Edit Menu — callers append future rows like the premium cocktail upload).
 *
 * Navigation actions ride GlassActionSheet's defer handoff, so a push/replace
 * never fires in the same commit as the sheet's dismissal (the freeze class).
 * Grant gating stays the MenuSheet contract: locked rows come in DISABLED,
 * never hidden — pass `disabled` on the action.
 */
interface HeaderNavMenuProps {
  /** Pill label — the primary jump (To Editor / To User). */
  label: string;
  iconIos: string;
  iconAndroid: string;
  /** Sheet title — usually the screen's own title. */
  sheetTitle: string;
  actions: GlassAction[];
}

export default function HeaderNavMenu({
  label,
  iconIos,
  iconAndroid,
  sheetTitle,
  actions,
}: HeaderNavMenuProps) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={[styles.btn, { backgroundColor: colors.primary + '18' }]}
      >
        <IconSymbol ios_icon_name={iconIos} android_material_icon_name={iconAndroid} size={15} color={colors.primary} />
        <Text style={[styles.txt, { color: colors.primary }]} numberOfLines={1}>{label}</Text>
        <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={12} color={colors.primary} />
      </TouchableOpacity>

      <GlassActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={sheetTitle}
        actions={actions}
      />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  txt: { fontSize: 13, fontWeight: '700' },
});
