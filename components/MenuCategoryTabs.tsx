import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { fonts } from '@/constants/fonts';

/**
 * MenuCategoryTabs — the sticky category chip row + subcategory pill row that
 * sit in the Menus surface's FIXED header stack (user Menu + Menu Editor).
 *
 * Category chips are squarer surface chips; the ACTIVE chip underlines in that
 * category's OWN colour (category colours are underline + card-fade only, never
 * text colours). Subcategories are smaller surface pills (s89) with the same
 * moving underline in the active category's colour. Row order is the caller's
 * page order (s88: no virtual 'All'; a trailing 'Other' entry may close the row).
 *
 * There is NO backdrop behind the rows any more (s89, Steve's call: the old
 * blur + 78% background wash read as a solid bar that cut the AmbientGlow
 * off). The rows float on the glow at rest AND parked; what keeps them
 * legible while cards scroll up is the host's ContentFadeMask over the pager —
 * cards dissolve to nothing at the pill row's bottom edge, so nothing ever
 * sits behind a chip. The 10pt above the chips is open glow, by design.
 *
 * Name matching is case-INSENSITIVE (catKey) — the DB uniqueness index is
 * lower()-based, so 'Chow Fun' and 'chow fun' are the same category (s66 fix).
 */
export interface MenuCategoryTabsProps {
  colors: any;
  categories: { name: string; label: string; color: string }[];
  activeCategory: string;           // raw name (catKey-matched by caller)
  onSelectCategory: (name: string) => void;
  subcategories: { name: string; label: string }[];  // for the active category, in page order
  activeSubcategory: string;        // raw name (or the caller's virtual key)
  onSelectSubcategory: (name: string) => void;
  activeColor: string;              // active category's colour (underlines)
}

/** Bottom padding under the pill row — hosts subtract it from the measured
 *  tabs height to find the pills' bottom edge (the fade mask's `from`). */
export const CATEGORY_TABS_PAD_BOTTOM = 8;

const SCREEN_WIDTH = Dimensions.get('window').width;

// Case-insensitive name key — the DB unique index is on lower(display_name).
const catKey = (name: string | null | undefined) => (name || '').toLowerCase();

export default function MenuCategoryTabs({
  colors,
  categories,
  activeCategory,
  onSelectCategory,
  subcategories,
  activeSubcategory,
  onSelectSubcategory,
  activeColor,
}: MenuCategoryTabsProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  const catScrollRef = useRef<ScrollView>(null);
  const subScrollRef = useRef<ScrollView>(null);
  const catLayoutsRef = useRef<{ [key: string]: { x: number; width: number } }>({});
  const subLayoutsRef = useRef<{ [key: string]: { x: number; width: number } }>({});

  const activeKey = catKey(activeCategory);
  const activeSubKey = catKey(activeSubcategory);

  // Auto-scroll category chips to center the active one.
  useEffect(() => {
    const layout = catLayoutsRef.current[activeKey];
    if (layout && catScrollRef.current) {
      const scrollToX = Math.max(0, layout.x - SCREEN_WIDTH / 2 + layout.width / 2);
      catScrollRef.current.scrollTo({ x: scrollToX, animated: true });
    }
  }, [activeKey]);

  // Auto-scroll subcategory pills to center the active one. On a category
  // change the new pills are still rendering and their layouts aren't measured
  // yet: scroll to start immediately (first pill is always at x=0), then try
  // to center after a short delay once onLayout has fired.
  const prevCategoryRef = useRef(activeKey);
  useEffect(() => {
    if (!activeSubKey || !subScrollRef.current) return;

    const categoryChanged = prevCategoryRef.current !== activeKey;
    prevCategoryRef.current = activeKey;
    const layoutKey = `${activeKey}_${activeSubKey}`;

    if (categoryChanged) {
      subLayoutsRef.current = {};
      subScrollRef.current.scrollTo({ x: 0, animated: true });
      setTimeout(() => {
        const layout = subLayoutsRef.current[layoutKey];
        if (layout && subScrollRef.current) {
          const scrollToX = Math.max(0, layout.x - SCREEN_WIDTH / 2 + layout.width / 2);
          subScrollRef.current.scrollTo({ x: scrollToX, animated: true });
        }
      }, 100);
    } else {
      const layout = subLayoutsRef.current[layoutKey];
      if (layout) {
        const scrollToX = Math.max(0, layout.x - SCREEN_WIDTH / 2 + layout.width / 2);
        subScrollRef.current.scrollTo({ x: scrollToX, animated: true });
      }
    }
  }, [activeKey, activeSubKey]);

  return (
    <View style={styles.wrap}>
      {/* Category chips */}
      <ScrollView
        ref={catScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.catScroll}
        contentContainerStyle={styles.catContent}
      >
        {categories.map((cat) => {
          const active = catKey(cat.name) === activeKey;
          return (
            <TouchableOpacity
              key={cat.name}
              style={styles.chip}
              onPress={() => onSelectCategory(cat.name)}
              activeOpacity={0.7}
              onLayout={(e) => {
                catLayoutsRef.current[catKey(cat.name)] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                };
              }}
            >
              <View style={styles.chipInner}>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={1}>
                  {cat.label}
                </Text>
                {/* Active underline in the category's OWN colour. */}
                <View
                  style={[styles.chipUnderline, { backgroundColor: active ? cat.color : 'transparent' }]}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Subcategory pills — smaller surface pills, moving underline in the active category's colour. */}
      {subcategories.length > 0 && (
        <ScrollView
          ref={subScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.subScroll}
          contentContainerStyle={styles.subContent}
        >
          {subcategories.map((sub) => {
            const active = catKey(sub.name) === activeSubKey;
            return (
              <TouchableOpacity
                key={sub.name}
                style={styles.subPill}
                onPress={() => onSelectSubcategory(sub.name)}
                activeOpacity={0.7}
                hitSlop={{ top: 4, bottom: 4 }}
                onLayout={(e) => {
                  subLayoutsRef.current[`${activeKey}_${catKey(sub.name)}`] = {
                    x: e.nativeEvent.layout.x,
                    width: e.nativeEvent.layout.width,
                  };
                }}
              >
                <Text style={[styles.subLabel, active && styles.subLabelActive]} numberOfLines={1}>
                  {sub.label}
                </Text>
                <View
                  style={[styles.subUnderline, { backgroundColor: active ? activeColor : 'transparent' }]}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    wrap: {
      position: 'relative',
      // Air above the chips when the rows park under the header — open glow,
      // not a frosted strip (the backdrop is gone, s89).
      paddingTop: 10,
      paddingBottom: CATEGORY_TABS_PAD_BOTTOM,
    },
    catScroll: {
      flexGrow: 0,
    },
    catContent: {
      paddingHorizontal: 16,
      gap: 7,
    },
    chip: {
      height: 38,
      borderRadius: 11,
      paddingHorizontal: 13,
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    chipInner: {
      alignItems: 'center',
    },
    chipLabel: {
      fontFamily: fonts.display.semibold,
      fontSize: 13,
      color: colors.textSecondary,
    },
    chipLabelActive: {
      color: colors.text,
    },
    chipUnderline: {
      alignSelf: 'stretch',
      height: 2.5,
      borderRadius: 2,
      marginTop: 2.5,
    },
    subScroll: {
      flexGrow: 0,
      marginTop: 8,
    },
    subContent: {
      paddingHorizontal: 16,
      gap: 8,
      alignItems: 'center',
    },
    subPill: {
      height: 30,
      borderRadius: 9,
      paddingHorizontal: 11,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    subLabel: {
      fontFamily: fonts.body.semibold,
      fontSize: 12.5,
      color: colors.textSecondary,
    },
    subLabelActive: {
      color: colors.text,
    },
    subUnderline: {
      alignSelf: 'stretch',
      height: 2,
      borderRadius: 1,
      marginTop: 2,
    },
  });
