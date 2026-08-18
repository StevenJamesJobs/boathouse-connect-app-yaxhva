import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { fonts } from '@/constants/fonts';

/**
 * MenuSearchRow — the glass search field + right-slot button shared by the
 * user-facing MenuDisplay (right slot = Filter, with an active-count badge)
 * and, in s69, the menu editor (right slot = ＋). The geometry is identical on
 * both sides by design; only the right slot's content differs.
 *
 * The 30×30 `joltSlot` holding the magnifier is an INERT dock target for the
 * later Jolt session — no setJoltDockTarget wiring here yet.
 *
 * MenuDisplay mounts this row inside its scroll-collapsing wrapper; the row
 * itself is a fixed 46pt field + 11pt bottom margin (57pt total).
 */
export interface MenuSearchRowProps {
  colors: any;
  mode: 'user' | 'editor';
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  onRightPress: () => void;         // Filter (user) / + (editor)
  filterCount?: number;             // user mode badge
  /**
   * Editor mode only (s73, Libations editors): an extra neutral-glass reorder
   * button between the field and the ＋. Absent → the row renders exactly as
   * before, so the menu editor is untouched.
   */
  onReorderPress?: () => void;
}

export default function MenuSearchRow({
  colors,
  mode,
  value,
  onChangeText,
  placeholder,
  onRightPress,
  filterCount,
  onReorderPress,
}: MenuSearchRowProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const showBadge = mode === 'user' && (filterCount ?? 0) > 0;

  return (
    <View style={styles.row}>
      <View style={styles.searchField}>
        {/* Inert Jolt dock slot — holds the magnifier until the FAB docks (later session). */}
        <View style={styles.joltSlot}>
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search"
            size={20}
            color={colors.textSecondary}
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          value={value}
          onChangeText={onChangeText}
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChangeText('')} hitSlop={8}>
            <IconSymbol
              ios_icon_name="xmark.circle.fill"
              android_material_icon_name="cancel"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      {mode === 'user' ? (
        <TouchableOpacity style={styles.rightBtn} onPress={onRightPress} activeOpacity={0.7}>
          <IconSymbol
            ios_icon_name="line.3.horizontal.decrease.circle"
            android_material_icon_name="filter-list"
            size={20}
            color={colors.text}
          />
          <Text style={styles.rightBtnLabel}>{t('menu_display.filter')}</Text>
          {showBadge && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      ) : (
        <>
          {!!onReorderPress && (
            <TouchableOpacity
              style={[styles.rightBtn, styles.rightBtnIconOnly]}
              onPress={onReorderPress}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="arrow.up.arrow.down"
                android_material_icon_name="swap-vert"
                size={20}
                color={colors.text}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.rightBtn, styles.rightBtnIconOnly, styles.rightBtnAdd]}
            onPress={onRightPress}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={22} color={colors.primary} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      marginBottom: 11,
    },
    searchField: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 46,
      borderRadius: 13,
      paddingHorizontal: 13,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    joltSlot: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      flex: 1,
      fontFamily: fonts.body.regular,
      fontSize: 15,
      color: colors.text,
      padding: 0,
    },
    rightBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 46,
      borderRadius: 13,
      paddingHorizontal: 14,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    rightBtnIconOnly: {
      width: 46,
      paddingHorizontal: 0,
    },
    // The editor's + is primary-tinted (the mockup's .sbtn.add — same fire
    // 18%/42% mix as the header's flip chip); the user side's Filter stays
    // neutral glass.
    rightBtnAdd: {
      backgroundColor: colors.primary + '2E',
      borderColor: colors.primary + '6B',
    },
    rightBtnLabel: {
      fontFamily: fonts.body.semibold,
      fontSize: 14,
      color: colors.text,
    },
    filterBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    filterBadgeText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 11,
      color: colors.fireText,
    },
  });
