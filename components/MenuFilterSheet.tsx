import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { fonts } from '@/constants/fonts';

/** The nine dietary flags a menu item can carry (menu_items is_* columns). */
export type DietKey = 'gf' | 'gfa' | 'v' | 'va' | 'df' | 'ef' | 'nf' | 'sf' | 'nos';

export interface MenuFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  colors: any;
  /** organization.menu_count === 2 — a single-menu org never sees the Menu section. */
  showMenuSection: boolean;
  /** 'winter' = Menu 1, 'summer' = Menu 2 — legacy wire values, never shown raw. */
  menuValue: 'winter' | 'summer' | 'both';
  onMenuValue: (v: 'winter' | 'summer' | 'both') => void;
  /** The org's OWN menu names (organization.menu_1_name / menu_2_name) — DB values, never translated. */
  menu1Label: string;
  menu2Label: string;
  /** Item-backed per the org's menuValue-scoped corpus — no dead chips. key = catKey(display_name). */
  categoryOptions: { key: string; label: string; color: string }[];
  selectedCategories: string[];
  onToggleCategory: (key: string) => void;
  /** ONLY flags at least one item on this org's menu carries — no dead chips. */
  dietaryOptions: { key: DietKey; label: string; abbrev: string }[];
  selected: DietKey[];
  onToggle: (k: DietKey) => void;
  onClear: () => void;
  onApply: () => void;
}

/**
 * The user-side menu Filter sheet — replaces the hand-rolled 70%-height Modal
 * that used to live inside MenuDisplay. Building on GlassSheet brings
 * statusBarTranslucent, the Android bottom-inset floor and the pinned footer
 * for free (the old modal had none of the three).
 *
 * Everything in the body is state-only — toggling a chip or picking a menu
 * never closes the sheet, so no useSheetHandoff defer() is needed anywhere.
 * Apply/Clear are the caller's callbacks; MenuDisplay owns closing on apply.
 */
export default function MenuFilterSheet({
  visible,
  onClose,
  colors,
  showMenuSection,
  menuValue,
  onMenuValue,
  menu1Label,
  menu2Label,
  categoryOptions,
  selectedCategories,
  onToggleCategory,
  dietaryOptions,
  selected,
  onToggle,
  onClear,
  onApply,
}: MenuFilterSheetProps) {
  const { t } = useTranslation();

  // Menu 1 / Menu 2 keep their legacy 'winter'/'summer' wire values; "Both"
  // widens the list across the two menus. Labels are the org's own menu names.
  const menuChoices: { value: 'winter' | 'summer' | 'both'; label: string }[] = [
    { value: 'winter', label: menu1Label },
    { value: 'summer', label: menu2Label },
    { value: 'both', label: t('menu_display.both_menus') },
  ];

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('menu_display.filter_title')}
      footer={
        <View style={styles.sheetFooter}>
          <Pressable
            style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
            onPress={onClear}
          >
            <Text style={[styles.footerBtnLabel, { color: colors.textSecondary }]}>
              {t('menu_display.clear_all_filters')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.footerBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={onApply}
          >
            <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>
              {t('menu_display.apply_filters')}
              {selected.length + selectedCategories.length > 0
                ? ` (${selected.length + selectedCategories.length})`
                : ''}
            </Text>
          </Pressable>
        </View>
      }
    >
      {showMenuSection && (
        <View>
          {/* Section label reuses menu_sheet.title — the same "Menu" string; no new key. */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t('menu_sheet.title')}
          </Text>
          <View style={[styles.seg, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            {menuChoices.map((choice) => {
              const on = menuValue === choice.value;
              return (
                <Pressable
                  key={choice.value}
                  onPress={() => onMenuValue(choice.value)}
                  style={[styles.segOpt, on && { backgroundColor: colors.primary }]}
                >
                  <Text
                    style={[styles.segLabel, { color: on ? colors.fireText : colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {choice.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {categoryOptions.length > 0 && (
        // dietGap goes on whichever section immediately follows Menu — with
        // Categories now in the middle, Dietary only needs it when Categories
        // is empty (see below), matching the original 2-section spacing exactly.
        <View style={showMenuSection ? styles.dietGap : undefined}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t('menu_display.filter_categories')}
          </Text>
          <View style={styles.chipsWrap}>
            {categoryOptions.map((opt) => {
              const on = selectedCategories.includes(opt.key);
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => onToggleCategory(opt.key)}
                  style={[
                    styles.categoryChip,
                    on
                      ? { backgroundColor: colors.blue + '29', borderColor: colors.blue + '57' }
                      : { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
                  ]}
                >
                  <Text
                    style={[styles.categoryChipLabel, { color: on ? colors.blueText : colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                  {/* Category colour is underline-only — the app's category
                      grammar (MenuCategoryTabs), never coloured text. Always
                      in-flow (transparent when off) so toggling never shifts
                      the chip's height. */}
                  <View style={[styles.categoryChipUnderline, { backgroundColor: on ? opt.color : 'transparent' }]} />
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {dietaryOptions.length > 0 && (
        <View style={showMenuSection && categoryOptions.length === 0 ? styles.dietGap : undefined}>
          {/* Section label reuses menu_detail.dietary — the same "Dietary" string; no new key. */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t('menu_detail.dietary')}
          </Text>
          <View style={styles.chipsWrap}>
            {dietaryOptions.map((opt) => {
              const on = selected.includes(opt.key);
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => onToggle(opt.key)}
                  style={[
                    styles.dietChip,
                    on
                      ? // 16% fill / 34% border of the palette's badge blue — the
                        // mockup's color-mix values. colors.blue is a 6-digit hex
                        // in all four palettes, so the alpha-suffix idiom applies.
                        { backgroundColor: colors.blue + '29', borderColor: colors.blue + '57' }
                      : { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
                  ]}
                >
                  <Text style={[styles.dietAbbrev, { color: on ? colors.blueText : colors.textSecondary }]}>
                    {opt.abbrev}
                  </Text>
                  <Text style={[styles.dietLabel, { color: on ? colors.blueText : colors.textSecondary }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  // Segmented control — same vocabulary as the Menu 1/2 tabs in MenuTopArea
  // (container radius 12/13 family, padding 3, active = primary fill).
  seg: {
    flexDirection: 'row',
    gap: 6,
    padding: 3,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  segOpt: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segLabel: { fontFamily: fonts.display.semibold, fontSize: 12.5 },
  // GlassSheet's body gap is 9; the mockup wants 14 between the two sections.
  dietGap: { marginTop: 5 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dietChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  dietAbbrev: { fontFamily: fonts.mono.medium, fontSize: 10, letterSpacing: 0.4 },
  dietLabel: { fontFamily: fonts.body.semibold, fontSize: 11.5 },
  // Category chips — same pill family + on/off tinted-fill treatment as the
  // dietary chips, PLUS a category-specific signal: the selected chip's
  // underline bar renders in the category's own colour (never its text —
  // matching MenuCategoryTabs' chipUnderline / the app's category grammar).
  categoryChip: {
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 5,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
  },
  categoryChipLabel: { fontFamily: fonts.body.semibold, fontSize: 11.5 },
  categoryChipUnderline: {
    alignSelf: 'stretch',
    height: 2.5,
    borderRadius: 1.5,
    marginTop: 4,
  },
  sheetFooter: { flexDirection: 'row', gap: 11, marginTop: 12 },
  footerBtn: {
    flex: 1,
    height: 47,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
