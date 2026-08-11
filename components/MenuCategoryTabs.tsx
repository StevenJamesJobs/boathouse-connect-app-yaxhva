import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/contexts/ThemeContext';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';

/**
 * MenuCategoryTabs — the sticky category chip row + plain-text subcategory row
 * that sit in the Menus surface's FIXED header stack, plus the scrolled-state
 * backdrop behind BOTH rows.
 *
 * Category chips are squarer glass chips; the ACTIVE chip underlines in that
 * category's OWN colour (category colours are underline + card-fade only, never
 * text colours). Subcategories drop the chip for plain text with a moving
 * underline in the active category's colour; the virtual 'All' entry comes
 * first (name '__all__', never persisted).
 *
 * The backdrop (blur + background wash + hairline bottom rule) fades in over
 * 150ms once the active page is scrolled (`showBackdrop` = scrollY > 6) and is
 * fully transparent at rest so the layout-level AmbientGlow reads through.
 *
 * Name matching is case-INSENSITIVE (catKey) — the DB uniqueness index is
 * lower()-based, so 'Chow Fun' and 'chow fun' are the same category (s66 fix).
 */
export interface MenuCategoryTabsProps {
  colors: any;
  categories: { name: string; label: string; color: string }[];
  activeCategory: string;           // raw name (catKey-matched by caller)
  onSelectCategory: (name: string) => void;
  subcategories: { name: string; label: string }[];  // for the active category, incl. virtual All entry with name '__all__'
  activeSubcategory: string;        // '__all__' or raw name
  onSelectSubcategory: (name: string) => void;
  activeColor: string;              // active category's colour (underlines)
  showBackdrop: boolean;            // scrollY > 6
}

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
  showBackdrop,
}: MenuCategoryTabsProps) {
  const { resolvedMode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const catScrollRef = useRef<ScrollView>(null);
  const subScrollRef = useRef<ScrollView>(null);
  const catLayoutsRef = useRef<{ [key: string]: { x: number; width: number } }>({});
  const subLayoutsRef = useRef<{ [key: string]: { x: number; width: number } }>({});

  const activeKey = catKey(activeCategory);
  const activeSubKey = catKey(activeSubcategory);

  // Backdrop fade — always mounted so it can fade back OUT.
  const backdropAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(backdropAnim, {
      toValue: showBackdrop ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [showBackdrop, backdropAnim]);

  // Auto-scroll category chips to center the active one.
  useEffect(() => {
    const layout = catLayoutsRef.current[activeKey];
    if (layout && catScrollRef.current) {
      const scrollToX = Math.max(0, layout.x - SCREEN_WIDTH / 2 + layout.width / 2);
      catScrollRef.current.scrollTo({ x: scrollToX, animated: true });
    }
  }, [activeKey]);

  // Auto-scroll subcategory items to center the active one. On a category
  // change the new items are still rendering and their layouts aren't measured
  // yet: scroll to start immediately (first item is always at x=0), then try
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
      <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdropAnim }]}>
        <BlurView
          intensity={18}
          tint={resolvedMode === 'dark' ? 'dark' : 'light'}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
        {/* The wash fades in from its top edge so the bar doesn't meet the
            header's bottom as a hard line when the rows park under it — but it
            reaches full strength quickly so cards never swim visibly through
            the breathing-room strip above the chips. */}
        <LinearGradient
          colors={[
            hexToRgba(colors.background, 0.5),
            hexToRgba(colors.background, 0.78),
            hexToRgba(colors.background, 0.78),
          ]}
          locations={[0, 0.25, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

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

      {/* Subcategory row — plain text + moving underline in the active category's colour. */}
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
                style={styles.subItem}
                onPress={() => onSelectSubcategory(sub.name)}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6 }}
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
      // Air ABOVE the chips, inside the backdrop — when the rows park under
      // the header this is the breathing room (the backdrop covers it, so it
      // reads as part of the frosted bar, never a see-through slot).
      paddingTop: 10,
      paddingBottom: 8,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
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
      gap: 16,
      alignItems: 'center',
    },
    subItem: {
      alignItems: 'center',
    },
    subLabel: {
      fontFamily: fonts.body.semibold,
      fontSize: 13,
      color: colors.textSecondary,
    },
    subLabelActive: {
      color: colors.text,
    },
    subUnderline: {
      alignSelf: 'stretch',
      height: 2,
      borderRadius: 1,
      marginTop: 3,
    },
  });
