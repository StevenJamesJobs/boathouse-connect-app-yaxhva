import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import { GlassToggle } from '@/components/content/FormKit';
import { IconSymbol } from '@/components/IconSymbol';
import { useLanguage } from '@/contexts/LanguageContext';
import type { MenuCategory, MenuSubcategory } from '@/hooks/useMenuCategories';
import { categoryLabel, subcategoryLabel } from '@/utils/menuCategoryLabels';
import { fonts } from '@/constants/fonts';
import type { ThemeColorSet } from '@/styles/commonStyles';

/**
 * The Deck's category sheet (s88) — everything about one category, in ONE
 * modal. Tapping a subcategory's ⋯ does not stack a second sheet: the body
 * turns the page (category → subcategory → move / delete) and a back link
 * returns. One Modal means none of the nested-sheet hazards (a presentation
 * dropped mid-dismissal, a stranded touch-eating layer) can occur; the only
 * nested modals are the host's name prompt and colour picker, passed in as
 * `children` so iOS presents them on THIS sheet's view controller.
 *
 * Top-level component on purpose (a sheet defined inside a screen's render
 * remounts on every keystroke).
 */

const TRASH_RED = '#E53935';
const catKey = (name: string | null | undefined) => (name || '').toLowerCase();

export interface DeckCounts {
  /** What the category's pages show (the tile's number). */
  total: number;
  /** Per subcategory, what its page shows. */
  bySub: Map<string, number>;
  /** Per subcategory, the items FILED here — what a move or a delete touches. */
  ownBySub: Map<string, number>;
  /** Items filed under this category, all subcategories (and none). */
  ownTotal: number;
}

export interface MoveResult {
  items_moved: number;
  merged: boolean;
  category_unhidden: boolean;
}
export interface RemoveResult {
  items_moved: number;
  items_deleted: number;
}
export interface MoveCategoryResult {
  items_moved: number;
  merged: boolean;
  created_subcategory: boolean;
  subcategory_name: string;
  category_unhidden: boolean;
}

type SheetView = 'category' | 'sub' | 'move' | 'remove' | 'deleteCategory' | 'moveCategory';

interface CategoryDeckSheetProps {
  visible: boolean;
  onClose: () => void;
  colors: ThemeColorSet;
  cat: MenuCategory | null;
  /** The whole tree being edited (move targets, sibling subcategories). */
  cats: MenuCategory[];
  counts: Map<string, DeckCounts>;
  busy: boolean;
  /** Shared scope: Lunch / Dinner are meal homes with a "Serve at" choice. */
  sharedScope: boolean;
  onRename: (cat: MenuCategory) => void;
  onPickColour: (cat: MenuCategory) => void;
  onToggleHidden: (cat: MenuCategory) => void;
  onDeleteCategory: (cat: MenuCategory) => Promise<boolean>;
  onAddSub: (cat: MenuCategory) => void;
  onRenameSub: (sub: MenuSubcategory) => void;
  onToggleSubHidden: (sub: MenuSubcategory) => void;
  onToggleSubLinked: (sub: MenuSubcategory) => void;
  onReorderSubs: (catId: string, ordered: MenuSubcategory[]) => void;
  onMoveSub: (
    sub: MenuSubcategory,
    target: MenuCategory,
    meals: { lunch: boolean; dinner: boolean },
  ) => Promise<MoveResult | null>;
  onRemoveSub: (
    sub: MenuSubcategory,
    action: 'move' | 'delete' | null,
    targetSubId: string | null,
  ) => Promise<RemoveResult | null>;
  /** A stand-alone custom category folds into another (s88, Steve's ask). */
  onMoveCategoryInto: (
    cat: MenuCategory,
    target: MenuCategory,
    targetSub: MenuSubcategory | null,
    meals: { lunch: boolean; dinner: boolean },
  ) => Promise<MoveCategoryResult | null>;
  /** After a move the sheet follows the subcategory to its new category. */
  onShowCategory: (catId: string) => void;
  /** Navigates away — fired after the sheet has fully dismissed. */
  onOpenRecipesEditor: () => void;
  /** The host's nested modals (name prompt, colour picker). */
  children?: React.ReactNode;
}

export default function CategoryDeckSheet({
  visible,
  onClose,
  colors,
  cat,
  cats,
  counts,
  busy,
  sharedScope,
  onRename,
  onPickColour,
  onToggleHidden,
  onDeleteCategory,
  onAddSub,
  onRenameSub,
  onToggleSubHidden,
  onToggleSubLinked,
  onReorderSubs,
  onMoveSub,
  onRemoveSub,
  onMoveCategoryInto,
  onShowCategory,
  onOpenRecipesEditor,
  children,
}: CategoryDeckSheetProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { height: winH } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { defer, onDismiss } = useSheetHandoff(onClose);

  const [view, setView] = useState<SheetView>('category');
  const [subId, setSubId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [alsoOtherMeal, setAlsoOtherMeal] = useState(false);
  const [removePick, setRemovePick] = useState<string | null>(null); // 'sub:<id>' | 'other' | 'gone'
  const [moveCatSub, setMoveCatSub] = useState<string | null>(null); // 'own' | '<subcategory id>'
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  // Every open starts on the category page (reset on OPEN, never on close —
  // a close-time reset would be visible mid-slide).
  useEffect(() => {
    if (visible) {
      setView('category');
      setSubId(null);
      setMoveTarget(null);
      setRemovePick(null);
    } else {
      setNotice(null);
    }
  }, [visible]);

  const goCategory = () => {
    setView('category');
    setSubId(null);
    setMoveTarget(null);
    setRemovePick(null);
  };

  if (!cat) return null;

  const c = counts.get(cat.id);
  const catName = categoryLabel(cat, t, language);
  const isLibations = cat.system_key === 'cat.libations';
  const isSpecials = cat.filter_behavior === 'weekly_specials';
  const builtIn = cat.system_key !== null;
  const sub = subId ? cat.subcategories.find((s) => s.id === subId) || null : null;
  const subName = sub ? subcategoryLabel(sub, t, language) : '';
  const subOwn = sub ? c?.ownBySub.get(catKey(sub.display_name)) ?? 0 : 0;
  const subLocked = !!sub && (sub.system_key !== null || sub.is_cocktail_fed);
  const isMeal = (x: MenuCategory) => sharedScope && (x.filter_behavior === 'lunch' || x.filter_behavior === 'dinner');
  // A custom category with no subcategories can fold into another category.
  const standAlone = !builtIn && !isSpecials && cat.subcategories.length === 0;
  const lunchCat = cats.find((x) => x.filter_behavior === 'lunch');
  const dinnerCat = cats.find((x) => x.filter_behavior === 'dinner');
  const lunchName = lunchCat ? categoryLabel(lunchCat, t, language) : t('menu_display.lunch');
  const dinnerName = dinnerCat ? categoryLabel(dinnerCat, t, language) : t('menu_display.dinner');

  // ── pieces ────────────────────────────────────────────────────────────────
  const chip = (
    key: string,
    label: string,
    icon: { ios: string; android: string },
    opts: { tint?: string; dim?: boolean; onPress?: () => void } = {},
  ) => (
    <Pressable
      key={key}
      style={[styles.chip, opts.dim && styles.chipDim]}
      onPress={opts.onPress}
      disabled={busy || opts.dim || !opts.onPress}
    >
      <IconSymbol
        ios_icon_name={icon.ios}
        android_material_icon_name={icon.android}
        size={13}
        color={opts.dim ? colors.textSecondary : opts.tint || colors.primary}
      />
      <Text style={[styles.chipText, opts.tint ? { color: opts.tint } : null]}>{label}</Text>
    </Pressable>
  );

  const actionRow = (opts: {
    key: string;
    icon: { ios: string; android: string };
    label: string;
    sub?: string;
    danger?: boolean;
    disabled?: boolean;
    trailing?: React.ReactNode;
    onPress?: () => void;
  }) => (
    <Pressable
      key={opts.key}
      style={[styles.frow, opts.disabled && styles.frowDisabled]}
      onPress={opts.onPress}
      disabled={busy || opts.disabled || !opts.onPress}
    >
      <IconSymbol
        ios_icon_name={opts.icon.ios}
        android_material_icon_name={opts.icon.android}
        size={17}
        color={opts.danger ? TRASH_RED : colors.primary}
      />
      <View style={styles.frowBody}>
        <Text style={[styles.frowLabel, opts.danger && { color: TRASH_RED }]}>{opts.label}</Text>
        {!!opts.sub && <Text style={styles.frowSub}>{opts.sub}</Text>}
      </View>
      {opts.trailing}
    </Pressable>
  );

  const radioRow = (opts: {
    key: string;
    picked: boolean;
    label: React.ReactNode;
    sub?: string;
    danger?: boolean;
    trailing?: React.ReactNode;
    onPress: () => void;
  }) => {
    const ring = opts.danger ? TRASH_RED : colors.primary;
    return (
      <Pressable
        key={opts.key}
        style={[styles.frow, opts.picked && { borderColor: ring, backgroundColor: ring + '1A' }]}
        onPress={opts.onPress}
        disabled={busy}
        accessibilityRole="radio"
        accessibilityState={{ checked: opts.picked }}
      >
        <View style={[styles.radio, { borderColor: opts.picked ? ring : colors.textSecondary }]}>
          {opts.picked && <View style={[styles.radioDot, { backgroundColor: ring }]} />}
        </View>
        <View style={styles.frowBody}>
          {typeof opts.label === 'string' ? (
            <Text style={[styles.frowLabel, opts.danger && { color: TRASH_RED }]}>{opts.label}</Text>
          ) : (
            opts.label
          )}
          {!!opts.sub && <Text style={styles.frowSub}>{opts.sub}</Text>}
        </View>
        {opts.trailing}
      </Pressable>
    );
  };

  const mealChip = (key: string, label: string, on: boolean, locked: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      style={[styles.tog, on && { borderColor: colors.primary + '99' }]}
      onPress={locked ? undefined : onPress}
      disabled={busy}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: locked }}
    >
      <View
        style={[
          styles.togBox,
          { borderColor: on ? colors.primary : colors.textSecondary, backgroundColor: on ? colors.primary : 'transparent' },
        ]}
      >
        {/* fixed-width slot: the tick appears without reflowing the chip */}
        {on && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={9} color={colors.fireText} />}
      </View>
      <Text style={[styles.togText, { color: on ? colors.text : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );

  const backLink = (label: string, onPress: () => void) => (
    <Pressable style={styles.backLink} onPress={onPress} hitSlop={8} disabled={busy}>
      <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={13} color={colors.primary} />
      <Text style={styles.backLinkText}>{label}</Text>
    </Pressable>
  );

  const cta = (label: string, opts: { danger?: boolean; off?: boolean; onPress: () => void }) => (
    <Pressable
      style={[
        styles.cta,
        { backgroundColor: opts.danger ? TRASH_RED : colors.primary },
        (opts.off || busy) && styles.ctaOff,
      ]}
      onPress={opts.onPress}
      disabled={busy || opts.off}
    >
      <Text style={[styles.ctaText, { color: opts.danger ? '#FFFFFF' : colors.fireText }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

  // ── the category page ─────────────────────────────────────────────────────
  const caption = (() => {
    if (!builtIn) return null;
    const lines: React.ReactNode[] = [];
    if (isSpecials) {
      lines.push(<Text key="s" style={styles.capText}>{t('manage_categories:caption_specials')}</Text>);
    } else {
      lines.push(<Text key="b" style={styles.capText}>{t('manage_categories:caption_builtin')}</Text>);
      if (isMeal(cat)) {
        lines.push(
          <Text key="m" style={styles.capText}>
            {t('manage_categories:caption_meal', { lunch: lunchName, dinner: dinnerName })}
          </Text>,
        );
      }
      if (cat.system_key === 'cat.wine') {
        lines.push(<Text key="w" style={styles.capText}>{t('manage_categories:caption_wine')}</Text>);
      }
      if (isLibations) {
        lines.push(
          <Text key="l1" style={styles.capText}>
            {t('manage_categories:caption_lib_1')}{' '}
            <Text style={styles.capLink} onPress={() => defer(onOpenRecipesEditor)} suppressHighlighting>
              {t('manage_categories:caption_lib_link')} ›
            </Text>
          </Text>,
        );
        lines.push(<Text key="l2" style={styles.capText}>{t('manage_categories:caption_lib_2')}</Text>);
      }
    }
    return <View style={styles.cap}>{lines}</View>;
  })();

  const categoryHead = (
    <View style={styles.headBlock}>
      {!!notice && (
        <View style={styles.notice}>
          <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={13} color={colors.primary} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}
      {caption}
      <View style={styles.frow}>
        <IconSymbol
          ios_icon_name={cat.is_hidden ? 'eye.slash' : 'eye'}
          android_material_icon_name={cat.is_hidden ? 'visibility-off' : 'visibility'}
          size={17}
          color={colors.primary}
        />
        <View style={styles.frowBody}>
          <Text style={styles.frowLabel}>{t('manage_categories:show_on_menu')}</Text>
          <Text style={styles.frowSub}>
            {cat.is_hidden ? t('manage_categories:show_on_menu_off') : t('manage_categories:visible_sub')}
          </Text>
        </View>
        <GlassToggle value={!cat.is_hidden} onValueChange={() => onToggleHidden(cat)} disabled={busy} />
      </View>
      {standAlone &&
        actionRow({
          key: 'moveCat',
          icon: { ios: 'folder', android: 'drive-file-move' },
          label: t('manage_categories:move_cat_row'),
          sub: t('manage_categories:move_cat_row_sub', { count: c?.ownTotal ?? 0 }),
          trailing: (
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={15} color={colors.textSecondary} />
          ),
          onPress: () => {
            setMoveTarget(null);
            setMoveCatSub('own');
            setAlsoOtherMeal(false);
            setView('moveCategory');
          },
        })}
      {isSpecials ? (
        <Text style={styles.wsNote}>{t('manage_categories:ws_no_subcategories', { name: catName })}</Text>
      ) : (
        <View style={styles.zlabelRow}>
          <Text style={styles.zlabel}>{t('manage_categories:subcategories').toUpperCase()}</Text>
          {cat.subcategories.length > 1 && <Text style={styles.zhint}>· {t('manage_categories:hint_drag')}</Text>}
          <View style={styles.zline} />
        </View>
      )}
    </View>
  );

  const renderSubRow = ({ item, drag, isActive }: RenderItemParams<MenuSubcategory>) => {
    const n = c?.bySub.get(catKey(item.display_name)) ?? 0;
    const linkLocked = item.system_key !== null;
    return (
      <ScaleDecorator>
        <View style={[styles.srow, item.is_hidden && styles.srowHidden, isActive && styles.srowActive]}>
          <Pressable onLongPress={drag} disabled={busy} style={styles.grab} hitSlop={6}>
            <IconSymbol ios_icon_name="line.3.horizontal" android_material_icon_name="drag-indicator" size={19} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.srowBody}>
            <Text style={styles.srowName} numberOfLines={1}>{subcategoryLabel(item, t, language)}</Text>
            {item.is_cocktail_fed && (
              <Text style={styles.srowLinked} numberOfLines={1}>{t('manage_categories:linked_to_recipes')}</Text>
            )}
          </View>
          <Text style={styles.srowCount}>{n}</Text>
          {isLibations && (
            <Pressable
              style={[styles.ibtn, item.is_cocktail_fed && styles.ibtnLinked, linkLocked && styles.ibtnLocked]}
              onPress={() => onToggleSubLinked(item)}
              disabled={busy || linkLocked}
              accessibilityRole="switch"
              accessibilityState={{ checked: item.is_cocktail_fed, disabled: linkLocked }}
              accessibilityLabel={t('manage_categories:recipe_backed_toggle')}
            >
              <IconSymbol
                ios_icon_name="link"
                android_material_icon_name={item.is_cocktail_fed ? 'link' : 'link-off'}
                size={16}
                color={item.is_cocktail_fed ? colors.primary : colors.textSecondary}
              />
            </Pressable>
          )}
          <Pressable
            style={styles.ibtn}
            onPress={() => onToggleSubHidden(item)}
            disabled={busy}
            accessibilityLabel={t('manage_categories:hide_show')}
          >
            <IconSymbol
              ios_icon_name={item.is_hidden ? 'eye.slash' : 'eye'}
              android_material_icon_name={item.is_hidden ? 'visibility-off' : 'visibility'}
              size={17}
              color={colors.textSecondary}
            />
          </Pressable>
          <Pressable
            style={[styles.ibtn, styles.ibtnMore]}
            onPress={() => {
              setSubId(item.id);
              setView('sub');
            }}
            disabled={busy}
            accessibilityLabel={subcategoryLabel(item, t, language)}
          >
            <IconSymbol ios_icon_name="ellipsis" android_material_icon_name="more-horiz" size={17} color={colors.text} />
          </Pressable>
        </View>
      </ScaleDecorator>
    );
  };

  const categoryBody = (
    // A Modal is its own native hierarchy: the app-root GestureHandlerRootView
    // does not reach in, and this one must be sized explicitly (its default
    // flex:1 collapses to zero inside a content-sized sheet body).
    <GestureHandlerRootView style={{ maxHeight: Math.max(260, winH * 0.88 - 196), flexShrink: 1 }}>
      <DraggableFlatList
        data={isSpecials ? [] : cat.subcategories}
        keyExtractor={(s) => s.id}
        activationDistance={10}
        renderItem={renderSubRow}
        onDragEnd={({ data, from, to }) => {
          if (from === to) return; // a bare long-press writes nothing
          onReorderSubs(cat.id, data);
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={categoryHead}
        ListEmptyComponent={
          isSpecials ? null : <Text style={styles.emptyLine}>{t('manage_categories:no_subcategories')}</Text>
        }
        ListFooterComponent={
          isSpecials ? null : (
            <Pressable style={styles.addGhost} onPress={() => onAddSub(cat)} disabled={busy}>
              <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={14} color={colors.primary} />
              <Text style={styles.addGhostText}>{t('manage_categories:add_subcategory')}</Text>
            </Pressable>
          )
        }
      />
    </GestureHandlerRootView>
  );

  // ── the subcategory page ──────────────────────────────────────────────────
  const subBody = sub && (
    <>
      {backLink(t('manage_categories:back_to', { name: catName }), goCategory)}
      {actionRow({
        key: 'rename',
        icon: { ios: 'pencil', android: 'edit' },
        label: t('manage_categories:chip_rename'),
        sub: t('manage_categories:rename_hint'),
        onPress: () => onRenameSub(sub),
      })}
      {actionRow({
        key: 'move',
        icon: { ios: 'folder', android: 'drive-file-move' },
        label: t('manage_categories:move_row'),
        sub: subLocked
          ? t('manage_categories:move_row_locked')
          : t('manage_categories:move_row_sub', { count: subOwn }),
        disabled: subLocked,
        trailing: subLocked ? (
          <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={14} color={colors.textSecondary} />
        ) : (
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={15} color={colors.textSecondary} />
        ),
        onPress: () => {
          setMoveTarget(null);
          setAlsoOtherMeal(false);
          setView('move');
        },
      })}
      {isLibations &&
        actionRow({
          key: 'link',
          icon: { ios: 'link', android: 'link' },
          label: t('manage_categories:linked_to_recipes'),
          sub: sub.system_key !== null ? t('manage_categories:linked_row_builtin') : t('manage_categories:linked_row_sub'),
          disabled: sub.system_key !== null,
          trailing: (
            <GlassToggle
              value={sub.is_cocktail_fed}
              onValueChange={() => onToggleSubLinked(sub)}
              disabled={busy || sub.system_key !== null}
            />
          ),
          onPress: () => onToggleSubLinked(sub),
        })}
      {actionRow({
        key: 'show',
        icon: sub.is_hidden ? { ios: 'eye.slash', android: 'visibility-off' } : { ios: 'eye', android: 'visibility' },
        label: t('manage_categories:show_on_menu'),
        sub: t('manage_categories:visible_sub'),
        trailing: <GlassToggle value={!sub.is_hidden} onValueChange={() => onToggleSubHidden(sub)} disabled={busy} />,
        onPress: () => onToggleSubHidden(sub),
      })}
      {subLocked ? (
        <Text style={styles.footNote}>{t('manage_categories:hint_recipe_locked')}</Text>
      ) : (
        actionRow({
          key: 'delete',
          icon: { ios: 'trash', android: 'delete' },
          label: t('manage_categories:delete_sub_row'),
          sub: subOwn > 0
            ? t('manage_categories:delete_sub_row_items', { count: subOwn })
            : t('manage_categories:remove_sub_empty'),
          danger: true,
          onPress: () => {
            setRemovePick(null);
            setView('remove');
          },
        })
      )}
    </>
  );

  // ── the move page ─────────────────────────────────────────────────────────
  const targets = cats.filter((x) => x.id !== cat.id && x.filter_behavior !== 'weekly_specials');
  const target = moveTarget ? cats.find((x) => x.id === moveTarget) || null : null;
  const moveBody = sub && (
    <>
      {backLink(t('manage_categories:back_to', { name: subName }), () => setView('sub'))}
      {targets.map((x) => {
        const same = x.subcategories.find((s) => catKey(s.display_name) === catKey(sub.display_name));
        const theirs = same ? counts.get(x.id)?.ownBySub.get(catKey(same.display_name)) ?? 0 : 0;
        const note = same
          ? same.is_cocktail_fed
            ? t('manage_categories:move_clash_linked', { name: subcategoryLabel(same, t, language) })
            : t('manage_categories:move_merge', { name: subcategoryLabel(same, t, language), a: theirs, b: subOwn })
          : x.is_hidden
            ? t('manage_categories:move_wakes')
            : x.subcategories.length > 0
              ? t('manage_categories:subcats_count', { count: x.subcategories.length })
              : t('manage_categories:items_direct');
        const picked = moveTarget === x.id;
        const blocked = !!same?.is_cocktail_fed;
        return (
          <React.Fragment key={x.id}>
            {radioRow({
              key: x.id,
              picked,
              label: (
                <View style={styles.targetName}>
                  <View style={[styles.dot, { backgroundColor: x.color }]} />
                  <Text style={[styles.frowLabel, styles.targetLabel, blocked && { color: colors.textSecondary }]} numberOfLines={1}>
                    {categoryLabel(x, t, language)}
                  </Text>
                  {x.system_key !== null && (
                    <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={10} color={colors.textSecondary} />
                  )}
                </View>
              ),
              sub: note,
              onPress: () => {
                if (blocked) return;
                setMoveTarget(x.id);
                setAlsoOtherMeal(false);
              },
            })}
            {picked && isMeal(x) && (
              <View style={styles.mealRow}>
                <Text style={styles.mealLabel}>{t('manage_categories:serve_at').toUpperCase()}</Text>
                {mealChip('l', lunchName, x.filter_behavior === 'lunch' || alsoOtherMeal, x.filter_behavior === 'lunch', () =>
                  setAlsoOtherMeal((v) => !v),
                )}
                {mealChip('d', dinnerName, x.filter_behavior === 'dinner' || alsoOtherMeal, x.filter_behavior === 'dinner', () =>
                  setAlsoOtherMeal((v) => !v),
                )}
              </View>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
  const runMove = async () => {
    if (!sub || !target) return;
    const meals = {
      lunch: target.filter_behavior === 'lunch' || (isMeal(target) && alsoOtherMeal),
      dinner: target.filter_behavior === 'dinner' || (isMeal(target) && alsoOtherMeal),
    };
    const name = subName;
    const res = await onMoveSub(sub, target, meals);
    if (!res) return;
    const targetName = categoryLabel(target, t, language);
    onShowCategory(target.id);
    goCategory();
    flash(
      (res.merged
        ? t('manage_categories:merged_notice', { name, category: targetName, count: res.items_moved })
        : t('manage_categories:moved_notice', { name, category: targetName, count: res.items_moved })) +
        (res.category_unhidden ? ` · ${t('manage_categories:woke_suffix', { category: targetName })}` : ''),
    );
  };

  // ── the delete-subcategory page ───────────────────────────────────────────
  const siblings = sub ? cat.subcategories.filter((s) => s.id !== sub.id && !s.is_cocktail_fed) : [];
  const removeBody = sub && (
    <>
      {backLink(t('manage_categories:back_to', { name: subName }), () => setView('sub'))}
      {subOwn > 0 && (
        <>
          <View style={styles.zlabelRow}>
            <Text style={styles.zlabel}>{t('manage_categories:remove_keep_label').toUpperCase()}</Text>
            <View style={styles.zline} />
          </View>
          {siblings.map((s) =>
            radioRow({
              key: s.id,
              picked: removePick === `sub:${s.id}`,
              label: `${catName} › ${subcategoryLabel(s, t, language)}`,
              sub: t('manage_categories:remove_there', { count: c?.ownBySub.get(catKey(s.display_name)) ?? 0 }),
              onPress: () => setRemovePick(`sub:${s.id}`),
            }),
          )}
          {radioRow({
            key: 'other',
            picked: removePick === 'other',
            label: t('manage_categories:remove_other_category'),
            sub: t('manage_categories:remove_other_category_sub'),
            trailing: (
              <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={15} color={colors.textSecondary} />
            ),
            onPress: () => setRemovePick('other'),
          })}
          <View style={styles.zlabelRow}>
            <Text style={styles.zlabel}>{t('manage_categories:remove_or').toUpperCase()}</Text>
            <View style={styles.zline} />
          </View>
          {radioRow({
            key: 'gone',
            picked: removePick === 'gone',
            danger: true,
            label: t('manage_categories:remove_delete_items', { count: subOwn }),
            sub: t('manage_categories:remove_delete_items_sub'),
            onPress: () => setRemovePick('gone'),
          })}
        </>
      )}
    </>
  );
  const runRemove = async () => {
    if (!sub) return;
    if (subOwn > 0 && !removePick) return;
    if (removePick === 'other') {
      // Re-homing to another category IS a move — the subcategory goes along.
      setMoveTarget(null);
      setAlsoOtherMeal(false);
      setView('move');
      return;
    }
    const name = subName;
    const toSub = removePick?.startsWith('sub:') ? siblings.find((s) => `sub:${s.id}` === removePick) || null : null;
    const res = await onRemoveSub(
      sub,
      subOwn === 0 ? null : removePick === 'gone' ? 'delete' : 'move',
      toSub?.id ?? null,
    );
    if (!res) return;
    goCategory();
    flash(
      res.items_moved > 0 && toSub
        ? t('manage_categories:removed_moved_notice', {
            name,
            count: res.items_moved,
            target: subcategoryLabel(toSub, t, language),
          })
        : res.items_deleted > 0
          ? t('manage_categories:removed_with_items_notice', { name, count: res.items_deleted })
          : t('manage_categories:removed_notice', { name }),
    );
  };
  const removeCtaLabel =
    subOwn === 0
      ? t('manage_categories:delete_sub_row')
      : !removePick
        ? t('manage_categories:remove_cta_pick')
        : removePick === 'gone'
          ? t('manage_categories:remove_cta_delete', { count: subOwn })
          : removePick === 'other'
            ? t('manage_categories:remove_cta_elsewhere')
            : t('manage_categories:remove_cta_move', { count: subOwn });

  // ── the move-category-into page (stand-alone custom categories) ───────────
  const ownTotal = c?.ownTotal ?? 0;
  // (`cats` is one menu slot's tree — every target is on the same menu.)
  const catTargets = cats.filter((x) => x.id !== cat.id && x.filter_behavior !== 'weekly_specials');
  const catTarget = moveTarget ? catTargets.find((x) => x.id === moveTarget) || null : null;
  const catClash = catTarget
    ? catTarget.subcategories.find((s) => catKey(s.display_name) === catKey(cat.display_name)) || null
    : null;
  const catTargetSubs = catTarget ? catTarget.subcategories.filter((s) => !s.is_cocktail_fed && s.system_key === null) : [];
  const moveCategoryBody = (
    <>
      {backLink(t('manage_categories:back_to', { name: catName }), goCategory)}
      <View style={styles.cap}>
        <Text style={styles.capText}>{t('manage_categories:move_cat_intro', { name: catName, count: ownTotal })}</Text>
      </View>
      <View style={styles.zlabelRow}>
        <Text style={styles.zlabel}>{t('manage_categories:move_cat_into').toUpperCase()}</Text>
        <View style={styles.zline} />
      </View>
      {catTargets.map((x) => {
        const same = x.subcategories.find((s) => catKey(s.display_name) === catKey(cat.display_name));
        const note = same
          ? same.is_cocktail_fed
            ? t('manage_categories:move_clash_linked', { name: subcategoryLabel(same, t, language) })
            : t('manage_categories:move_cat_merges', { name: subcategoryLabel(same, t, language) })
          : x.is_hidden
            ? t('manage_categories:move_wakes')
            : x.subcategories.length > 0
              ? t('manage_categories:subcats_count', { count: x.subcategories.length })
              : t('manage_categories:items_direct');
        const picked = moveTarget === x.id;
        const blocked = !!same?.is_cocktail_fed;
        return radioRow({
          key: x.id,
          picked,
          label: (
            <View style={styles.targetName}>
              <View style={[styles.dot, { backgroundColor: x.color }]} />
              <Text style={[styles.frowLabel, styles.targetLabel, blocked && { color: colors.textSecondary }]} numberOfLines={1}>
                {categoryLabel(x, t, language)}
              </Text>
              {x.system_key !== null && (
                <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={10} color={colors.textSecondary} />
              )}
            </View>
          ),
          sub: note,
          onPress: () => {
            if (blocked) return;
            setMoveTarget(x.id);
            setMoveCatSub('own');
            setAlsoOtherMeal(false);
          },
        });
      })}
      {catTarget && (
        <>
          <View style={styles.zlabelRow}>
            <Text style={styles.zlabel}>{t('manage_categories:move_cat_file_as').toUpperCase()}</Text>
            <View style={styles.zline} />
          </View>
          {radioRow({
            key: 'own',
            picked: moveCatSub === 'own',
            label: catClash
              ? t('manage_categories:move_cat_as_merge', { name: subcategoryLabel(catClash, t, language) })
              : t('manage_categories:move_cat_as_own', { name: catName }),
            sub: catClash
              ? t('manage_categories:remove_there', { count: counts.get(catTarget.id)?.ownBySub.get(catKey(catClash.display_name)) ?? 0 })
              : t('manage_categories:move_cat_as_own_sub'),
            onPress: () => setMoveCatSub('own'),
          })}
          {catTargetSubs
            .filter((s) => !catClash || s.id !== catClash.id)
            .map((s) =>
              radioRow({
                key: s.id,
                picked: moveCatSub === s.id,
                label: t('manage_categories:move_cat_into_sub', { name: subcategoryLabel(s, t, language) }),
                sub: t('manage_categories:remove_there', { count: counts.get(catTarget.id)?.ownBySub.get(catKey(s.display_name)) ?? 0 }),
                onPress: () => setMoveCatSub(s.id),
              }),
            )}
          {isMeal(catTarget) && (
            <View style={styles.mealRow}>
              <Text style={styles.mealLabel}>{t('manage_categories:serve_at').toUpperCase()}</Text>
              {mealChip('l', lunchName, catTarget.filter_behavior === 'lunch' || alsoOtherMeal, catTarget.filter_behavior === 'lunch', () =>
                setAlsoOtherMeal((v) => !v),
              )}
              {mealChip('d', dinnerName, catTarget.filter_behavior === 'dinner' || alsoOtherMeal, catTarget.filter_behavior === 'dinner', () =>
                setAlsoOtherMeal((v) => !v),
              )}
            </View>
          )}
        </>
      )}
    </>
  );
  const runMoveCategory = async () => {
    if (!catTarget) return;
    const meals = {
      lunch: catTarget.filter_behavior === 'lunch' || (isMeal(catTarget) && alsoOtherMeal),
      dinner: catTarget.filter_behavior === 'dinner' || (isMeal(catTarget) && alsoOtherMeal),
    };
    const toSub = moveCatSub && moveCatSub !== 'own' ? catTargetSubs.find((s) => s.id === moveCatSub) || null : null;
    const name = catName;
    const res = await onMoveCategoryInto(cat, catTarget, toSub, meals);
    if (!res) return;
    const targetName = categoryLabel(catTarget, t, language);
    onShowCategory(catTarget.id);
    goCategory();
    flash(
      t('manage_categories:moved_cat_notice', { name, category: targetName, sub: res.subcategory_name, count: res.items_moved }) +
        (res.category_unhidden ? ` · ${t('manage_categories:woke_suffix', { category: targetName })}` : ''),
    );
  };

  // ── the delete-category page (custom categories only) ─────────────────────
  const deleteCategoryBody = (
    <>
      {backLink(t('manage_categories:back_to', { name: catName }), goCategory)}
      <View style={styles.cap}>
        <Text style={styles.capText}>
          {(c?.ownTotal ?? 0) > 0
            ? t('manage_categories:delete_cat_body', { count: c?.ownTotal ?? 0 })
            : t('manage_categories:delete_cat_body_empty')}
        </Text>
      </View>
    </>
  );

  // ── assemble ──────────────────────────────────────────────────────────────
  const dot = <View style={[styles.titleDot, { backgroundColor: cat.color }]} />;
  let title = catName;
  let subtitle: string | undefined;
  let pinned: React.ReactNode = null;
  let body: React.ReactNode = categoryBody;
  let footer: React.ReactNode = null;

  if (view === 'category') {
    pinned = (
      <View style={styles.chipRow}>
        {chip('rename', t('manage_categories:chip_rename'), { ios: 'pencil', android: 'edit' }, { onPress: () => onRename(cat) })}
        {chip('colour', t('manage_categories:colour'), { ios: 'paintpalette', android: 'palette' }, { onPress: () => onPickColour(cat) })}
        {builtIn
          ? chip('builtin', t('manage_categories:built_in'), { ios: 'lock.fill', android: 'lock' }, { dim: true })
          : chip('delete', t('manage_categories:delete'), { ios: 'trash', android: 'delete' }, {
              tint: TRASH_RED,
              onPress: () => setView('deleteCategory'),
            })}
        <Text style={styles.chipMeta} numberOfLines={1}>
          {t('manage_categories:items_count', { count: c?.total ?? 0 })}
        </Text>
      </View>
    );
  } else if (view === 'sub' && sub) {
    title = subName;
    subtitle = t('manage_categories:sub_in', { category: catName, count: subOwn });
    body = subBody;
  } else if (view === 'move' && sub) {
    title = t('manage_categories:move_title', { name: subName });
    subtitle = t('manage_categories:move_from', { category: catName, count: subOwn });
    body = moveBody;
    footer = cta(
      target
        ? t('manage_categories:move_cta', { category: categoryLabel(target, t, language), count: subOwn })
        : t('manage_categories:move_pick'),
      { off: !target, onPress: runMove },
    );
  } else if (view === 'remove' && sub) {
    title = t('manage_categories:remove_title', { name: subName });
    subtitle = subOwn > 0 ? t('manage_categories:remove_sub_items', { count: subOwn }) : t('manage_categories:remove_sub_empty');
    body = removeBody;
    footer = cta(removeCtaLabel, {
      danger: subOwn === 0 || removePick === 'gone',
      off: subOwn > 0 && !removePick,
      onPress: runRemove,
    });
  } else if (view === 'moveCategory') {
    title = t('manage_categories:move_title', { name: catName });
    subtitle = t('manage_categories:move_cat_subtitle', { count: ownTotal });
    body = moveCategoryBody;
    footer = cta(
      catTarget
        ? t('manage_categories:move_cta', { category: categoryLabel(catTarget, t, language), count: ownTotal })
        : t('manage_categories:move_pick'),
      { off: !catTarget, onPress: runMoveCategory },
    );
  } else if (view === 'deleteCategory') {
    title = t('manage_categories:remove_title', { name: catName });
    body = deleteCategoryBody;
    footer = cta(t('manage_categories:delete_category_title'), {
      danger: true,
      onPress: async () => {
        const ok = await onDeleteCategory(cat);
        if (!ok) goCategory();
      },
    });
  } else {
    // the subcategory this page was about is gone (deleted / moved under us)
    body = categoryBody;
  }

  const onCategoryPage = body === categoryBody;
  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={title}
      subtitle={subtitle}
      titleLeading={onCategoryPage ? dot : undefined}
      pinnedHeader={pinned}
      // The category page's drag list owns its own scrolling.
      scroll={!onCategoryPage}
      footer={footer ? <View style={styles.footer}>{footer}</View> : undefined}
    >
      {body}
      {children}
    </GlassSheet>
  );
}

const createStyles = (colors: ThemeColorSet) =>
  StyleSheet.create({
    titleDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)' },
    dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)' },

    // pinned chip row — Rename · Colour · Built-in | Delete, the count at the far end
    chipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      height: 32,
      borderRadius: 9,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    chipDim: { opacity: 0.6 },
    chipText: { fontFamily: fonts.body.semibold, fontSize: 11.5, color: colors.text },
    chipMeta: { marginLeft: 'auto', fontFamily: fonts.mono.medium, fontSize: 10, color: colors.textSecondary },

    headBlock: { gap: 9 },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
      backgroundColor: colors.primary + '1F',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.primary + '55',
    },
    noticeText: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 12, lineHeight: 16, color: colors.text },
    cap: {
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 13,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    capText: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16.5, color: colors.textSecondary },
    capLink: { fontFamily: fonts.body.semibold, color: colors.primary, textDecorationLine: 'underline' },
    wsNote: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 17, color: colors.textSecondary, paddingHorizontal: 2 },

    zlabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5, marginBottom: 1 },
    zlabel: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1.4, color: colors.textSecondary },
    zhint: { fontFamily: fonts.mono.medium, fontSize: 9.5, color: colors.textSecondary, opacity: 0.8, flexShrink: 1 },
    zline: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border, minWidth: 12 },

    // rows
    frow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: 13,
      paddingVertical: 11,
      minHeight: 52,
      borderRadius: 13,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    frowDisabled: { opacity: 0.5 },
    frowBody: { flex: 1, minWidth: 0 },
    frowLabel: { fontFamily: fonts.body.semibold, fontSize: 13.5, color: colors.text },
    frowSub: { fontFamily: fonts.body.regular, fontSize: 11, lineHeight: 15, marginTop: 1.5, color: colors.textSecondary },
    radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    radioDot: { width: 9, height: 9, borderRadius: 4.5 },
    targetName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    targetLabel: { flexShrink: 1 },

    // subcategory rows (the drag list)
    srow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingLeft: 6,
      paddingRight: 8,
      minHeight: 50,
      marginTop: 7,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    srowHidden: { opacity: 0.5 },
    srowActive: { borderColor: colors.primary, backgroundColor: colors.card },
    grab: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center' },
    srowBody: { flex: 1, minWidth: 0 },
    srowName: { fontFamily: fonts.body.semibold, fontSize: 13.5, color: colors.text },
    srowLinked: {
      fontFamily: fonts.mono.semibold,
      fontSize: 8.5,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginTop: 2,
      color: colors.primary,
    },
    srowCount: { fontFamily: fonts.mono.medium, fontSize: 10.5, color: colors.textSecondary, marginRight: 2 },
    ibtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    ibtnLinked: { backgroundColor: colors.primary + '29' },
    ibtnLocked: { opacity: 0.85 },
    ibtnMore: {
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    emptyLine: {
      fontFamily: fonts.body.regular,
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
      paddingVertical: 14,
      paddingHorizontal: 8,
      color: colors.textSecondary,
    },
    addGhost: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      height: 42,
      marginTop: 8,
      marginBottom: 4,
      borderRadius: 11,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.primary + '8C',
    },
    addGhostText: { fontFamily: fonts.body.semibold, fontSize: 12.5, color: colors.primary },

    backLink: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingVertical: 2 },
    backLinkText: { fontFamily: fonts.body.semibold, fontSize: 12, color: colors.primary },
    footNote: {
      fontFamily: fonts.body.regular,
      fontSize: 11,
      lineHeight: 15.5,
      textAlign: 'center',
      paddingTop: 4,
      paddingHorizontal: 6,
      color: colors.textSecondary,
    },

    // "Serve at" — shared-scope meal homes
    mealRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingLeft: 4 },
    mealLabel: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 1.2, color: colors.textSecondary, marginRight: 2 },
    tog: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    togBox: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    togText: { fontFamily: fonts.body.semibold, fontSize: 11.5 },

    footer: { paddingTop: 10 },
    cta: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
    ctaOff: { opacity: 0.4 },
    ctaText: { fontFamily: fonts.display.bold, fontSize: 15.5 },
  });
