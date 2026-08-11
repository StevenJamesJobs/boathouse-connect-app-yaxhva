import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { menuIconAndroid } from '@/constants/menuIcons';
import { useOrganization } from '@/contexts/OrganizationContext';
import { fonts } from '@/constants/fonts';

/**
 * MenuTopArea — the FIXED chrome at the top of the Menus surface: the
 * "Menus" header (title + org eyebrow + manager/owner action chips) and the
 * Menu 1 / Menu 2 segmented control.
 *
 * Shared by the user-facing MenuDisplay (mode='user') and, in s69, the menu
 * editor (mode='editor') — Steve's rule is that this chrome is IDENTICAL on
 * both sides; only the flip chip's glyph differs (pencil → editor, eye → user).
 * Season keeps the legacy wire values: 'winter' = Menu 1, 'summer' = Menu 2.
 */
export interface MenuTopAreaProps {
  colors: any;                      // ThemeColorSet as MenuDisplay receives
  mode: 'user' | 'editor';
  showActionChips: boolean;         // manager/owner only
  onOpenMenuSheet: () => void;
  onFlipSide: () => void;           // user: push('/menu-editor'); (editor s69: back)
  season: 'winter' | 'summer';
  onSeasonChange: (s: 'winter' | 'summer') => void;
  showMenuTabs: boolean;            // organization.menu_count === 2
  menu1Label: string;
  menu2Label: string;
  menu1Icon: string;
  menu2Icon: string;
}

/**
 * The Menu 1 / Menu 2 segmented control on its own — exported because on the
 * Menus surface it lives in the COLLAPSING band (it dissolves with the search
 * row while the category rows stick under the header; Steve's round-4 call:
 * a scrolled user has settled their menu choice). MenuTopArea renders it
 * in-flow only where the chrome does not collapse (search mode; sheets later).
 */
export interface MenuSeasonTabsProps {
  colors: any;
  season: 'winter' | 'summer';
  onSeasonChange: (s: 'winter' | 'summer') => void;
  menu1Label: string;
  menu2Label: string;
  menu1Icon: string;
  menu2Icon: string;
  /** Standalone (overlay) use adds its own horizontal padding. */
  style?: object;
}

export function MenuSeasonTabs({
  colors,
  season,
  onSeasonChange,
  menu1Label,
  menu2Label,
  menu1Icon,
  menu2Icon,
  style,
}: MenuSeasonTabsProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderSegment = (value: 'winter' | 'summer', label: string, icon: string) => {
    const active = season === value;
    return (
      <TouchableOpacity
        style={[styles.segHalf, active && styles.segHalfActive]}
        onPress={() => onSeasonChange(value)}
        activeOpacity={0.8}
      >
        <IconSymbol
          ios_icon_name={icon}
          android_material_icon_name={menuIconAndroid(icon)}
          size={15}
          color={active ? colors.fireText : colors.textSecondary}
        />
        <Text style={[styles.segLabel, active && styles.segLabelActive]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.seg, style]}>
      {renderSegment('winter', menu1Label, menu1Icon)}
      {renderSegment('summer', menu2Label, menu2Icon)}
    </View>
  );
}

export default function MenuTopArea({
  colors,
  mode,
  showActionChips,
  onOpenMenuSheet,
  onFlipSide,
  season,
  onSeasonChange,
  showMenuTabs,
  menu1Label,
  menu2Label,
  menu1Icon,
  menu2Icon,
}: MenuTopAreaProps) {
  const { t } = useTranslation();
  const { organization } = useOrganization();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{t('tabs.menus')}</Text>
          <Text style={styles.eyebrow} numberOfLines={1}>
            {organization.name}
          </Text>
        </View>
        {showActionChips && (
          <View style={styles.chipGroup}>
            <TouchableOpacity style={styles.menuChip} onPress={onOpenMenuSheet} activeOpacity={0.7}>
              <IconSymbol
                ios_icon_name="gearshape.fill"
                android_material_icon_name="settings"
                size={15}
                color={colors.text}
              />
              <Text style={styles.menuChipLabel}>{t('menu_sheet.title')}</Text>
            </TouchableOpacity>
            {/* Flip side: pencil on the user side (→ editor), eye on the editor side (→ user). */}
            <TouchableOpacity style={styles.flipChip} onPress={onFlipSide} activeOpacity={0.7}>
              <IconSymbol
                ios_icon_name={mode === 'editor' ? 'eye.fill' : 'pencil'}
                android_material_icon_name={mode === 'editor' ? 'visibility' : 'edit'}
                size={18}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Menu 1 / Menu 2 segmented control — hidden when the org has one menu,
          and ALSO hidden in the normal Menus browse mode, where the tabs live
          in the collapsing chrome band instead (MenuSeasonTabs above). */}
      {showMenuTabs && (
        <MenuSeasonTabs
          colors={colors}
          season={season}
          onSeasonChange={onSeasonChange}
          menu1Label={menu1Label}
          menu2Label={menu2Label}
          menu1Icon={menu1Icon}
          menu2Icon={menu2Icon}
        />
      )}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    wrap: {
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    titleBlock: {
      flex: 1,
    },
    title: {
      fontFamily: fonts.display.bold,
      fontSize: 26,
      letterSpacing: -0.4,
      color: colors.text,
    },
    eyebrow: {
      fontFamily: fonts.mono.semibold,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.accent,
      marginTop: 2,
    },
    chipGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    menuChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 38,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    menuChipLabel: {
      fontFamily: fonts.body.semibold,
      fontSize: 13,
      color: colors.text,
    },
    // The mockup's .hbtn.pri — primary-tinted 38×38 icon chip.
    flipChip: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary + '2E',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.primary + '6B',
    },
    seg: {
      flexDirection: 'row',
      borderRadius: 13,
      padding: 3,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
      marginBottom: 11,
    },
    segHalf: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 10,
    },
    segHalfActive: {
      backgroundColor: colors.primary,
    },
    segLabel: {
      fontFamily: fonts.display.semibold,
      fontSize: 12.5,
      color: colors.textSecondary,
    },
    segLabelActive: {
      color: colors.fireText,
    },
  });
