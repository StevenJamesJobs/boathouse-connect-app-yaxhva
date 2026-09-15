/**
 * Edit favorites — "Your layout" (eight slots, hold to reorder), a category capsule, and the
 * sample grid (every tile drawn with its live line; check to add; a checked sample grows an
 * Options chip). Local draft until Done.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { useTranslation } from 'react-i18next';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { SegControl } from '@/components/content/FormKit';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { fonts } from '@/constants/fonts';
import {
  availableFavorites, defaultFacts, defForId, FavoriteCategory, FavoriteDef, FavoriteTile, LiveData, MAX_FAVORITES, SAMPLE_LIVE_DATA,
} from '@/config/favorites';
import TileOptionsSheet from './TileOptionsSheet';
import { favoriteAccent, hexToRgba, RED_HUE, TILE_BG_ALPHA, TILE_BORDER_ALPHA } from './profileVisuals';

type Cat = 'all' | FavoriteCategory;

interface Props {
  visible: boolean;
  onClose: () => void;
  tiles: FavoriteTile[];
  data?: LiveData;
  onSave: (tiles: FavoriteTile[]) => void;
  /** The hub's visibility gate (org tool mapping, roster setting) — gated tiles never show here either. */
  isAllowed?: (def: FavoriteDef) => boolean;
}

export default function FavoritesEditorSheet({ visible, onClose, tiles, data, onSave, isAllowed }: Props) {
  const colors = useThemeColors();
  const { resolvedMode } = useAppTheme();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isManager = user?.role === 'manager' || user?.role === 'owner';
  const [draft, setDraft] = useState<FavoriteTile[]>(tiles);
  const [cat, setCat] = useState<Cat>('all');
  const [optionsFor, setOptionsFor] = useState<FavoriteTile | null>(null);
  // A tapped slot grows a little and names itself in the layout row with a Remove chip
  // (Steve's round 2) — hold still drags it.
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const pagerRef = useRef<FlatList<{ key: Cat; label: string }>>(null);
  const { onDismiss } = useSheetHandoff(onClose);

  useEffect(() => {
    if (visible) {
      setDraft(tiles);
      setCat('all');
      setSelectedSlot(null);
    }
  }, [visible, tiles]);

  const available = useMemo(
    () => availableFavorites((user?.role as any) || 'employee', user?.jobTitles || []).filter((d) => (isAllowed ? isAllowed(d) : true)),
    [user?.role, user?.jobTitles, isAllowed]
  );
  const shownFor = useCallback((c: Cat) => (c === 'all' ? available : available.filter((d) => d.category === c)), [available]);
  const preview = useMemo<LiveData>(() => ({ ...SAMPLE_LIVE_DATA, ...(data ?? {}) }), [data]);
  const byId = useMemo(() => new Map(draft.map((x) => [x.id, x])), [draft]);
  const full = draft.length >= MAX_FAVORITES;

  const toggle = (def: FavoriteDef) => {
    if (byId.has(def.id)) {
      setDraft(draft.filter((x) => x.id !== def.id));
      return;
    }
    if (full) return;
    setDraft([...draft, { id: def.id, size: def.sizes.includes('wide') ? 'wide' : 'square', simple: false, facts: defaultFacts(def) }]);
  };

  const cats: { key: Cat; label: string }[] = [
    { key: 'all', label: t('profile_hub.cat_all') },
    { key: 'work', label: t('profile_hub.cat_work') },
    { key: 'learn', label: t('profile_hub.cat_learn') },
    { key: 'play', label: t('profile_hub.cat_play') },
    ...(isManager ? [{ key: 'manage' as Cat, label: t('profile_hub.cat_manage') }] : []),
  ];

  // ── slots strip ──
  const slotW = Math.floor((width - 36 - 7 * 6) / 8);
  // Measured, not assumed: the pager bleeds through the sheet's side padding but sits inside its
  // hairline border, so a screen-width page drifted 2pt per swipe.
  const [pageW, setPageW] = useState(width);
  const selectedDef = selectedSlot ? defForId(selectedSlot) : undefined;
  const tint = colors.tint.startsWith('#') ? colors.tint : '#FF7A2F';

  const renderSlot = useCallback(
    ({ item, drag, isActive }: RenderItemParams<FavoriteTile>) => {
      const def = defForId(item.id);
      if (!def) return null;
      const acc = favoriteAccent(def.accent, colors, resolvedMode);
      const sel = selectedSlot === item.id;
      return (
        <ScaleDecorator>
          <TouchableOpacity
            onPress={() => setSelectedSlot((cur) => (cur === item.id ? null : item.id))}
            onLongPress={drag}
            delayLongPress={160}
            disabled={isActive}
            activeOpacity={0.9}
            style={[
              styles.slot,
              {
                width: slotW,
                height: slotW,
                marginRight: 6,
                backgroundColor: hexToRgba(acc, sel ? 0.24 : 0.12),
                borderColor: sel ? tint : hexToRgba(acc, isActive ? 0.7 : 0.3),
                borderWidth: sel ? 2 : 1,
              },
            ]}
          >
            <IconSymbol ios_icon_name={def.iosIcon} android_material_icon_name={def.androidIcon} size={sel ? 19 : 15} color={acc} />
            <Text style={[styles.slotGrab, { color: colors.textSecondary }]}>⋮⋮</Text>
          </TouchableOpacity>
        </ScaleDecorator>
      );
    },
    [colors, resolvedMode, slotW, selectedSlot, tint]
  );

  const removeSelected = () => {
    if (!selectedSlot) return;
    const id = selectedSlot;
    setDraft((cur) => cur.filter((x) => x.id !== id));
    setSelectedSlot(null);
  };

  // ── category pager ──
  const goCat = (k: Cat) => {
    setCat(k);
    const index = cats.findIndex((c) => c.key === k);
    if (index >= 0) pagerRef.current?.scrollToIndex({ index, animated: true });
  };
  const onPageEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / pageW);
    const next = cats[index]?.key;
    if (next && next !== cat) setCat(next);
  };

  const renderSample = (def: FavoriteDef) => {
    const tile = byId.get(def.id);
    const on = !!tile;
    const acc = favoriteAccent(def.accent, colors, resolvedMode);
    const line = def.line?.(preview, t) ?? null;
    const isWide = def.sizes.includes('wide');
    const factsOn = tile && def.facts ? def.facts.filter((f) => tile.facts[f.key] !== false).length : 0;
    const cfg = tile
      ? tile.simple
        ? t('profile_hub.cfg_simple')
        : tile.size === 'wide'
        ? t('profile_hub.cfg_wide', { on: factsOn, total: def.facts?.length ?? 0 })
        : t('profile_hub.cfg_square')
      : null;
    return (
      <TouchableOpacity
        key={def.id}
        onPress={() => toggle(def)}
        activeOpacity={0.85}
        disabled={!on && full}
        style={[
          styles.samp,
          isWide && styles.sampWide,
          { backgroundColor: hexToRgba(acc, TILE_BG_ALPHA[resolvedMode]), borderColor: hexToRgba(acc, on ? 0.5 : TILE_BORDER_ALPHA[resolvedMode]) },
          !on && full && { opacity: 0.4 },
        ]}
      >
        <View style={[styles.sampInner, isWide && styles.sampInnerWide]}>
          <IconSymbol ios_icon_name={def.iosIcon} android_material_icon_name={def.androidIcon} size={16} color={acc} />
          <View style={styles.sampText}>
            <Text style={[styles.sampTitle, { color: colors.text }]} numberOfLines={1}>
              {t(def.labelKey)}
            </Text>
            {line ? (
              <Text style={[styles.sampLine, { color: colors.textSecondary }]} numberOfLines={1}>
                {line.parts.map((p, i) => (
                  <Text key={i} style={p.strong ? { color: acc, fontFamily: fonts.mono.semibold } : undefined}>
                    {p.text}
                  </Text>
                ))}
              </Text>
            ) : null}
            {cfg ? (
              <Text style={[styles.cfg, { color: acc }]} numberOfLines={1}>
                {cfg}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={[styles.ck, { borderColor: colors.glassBorder }, on && { backgroundColor: colors.tint, borderColor: colors.tint }]}>
          {on ? <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={11} color={colors.fireText} /> : null}
        </View>
        {on ? (
          <TouchableOpacity
            onPress={() => setOptionsFor(tile!)}
            hitSlop={6}
            style={[styles.optc, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          >
            <IconSymbol ios_icon_name="slider.horizontal.3" android_material_icon_name="tune" size={11} color={colors.tint} />
            {isWide ? <Text style={[styles.optcText, { color: colors.text }]}>{t('profile_hub.options')}</Text> : null}
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <GlassSheet
        visible={visible}
        onClose={onClose}
        onDismiss={onDismiss}
        scroll={false}
        fill
        title={t('profile_hub.editor_title')}
        subtitle={t('profile_hub.editor_sub', { count: draft.length, max: MAX_FAVORITES })}
        footer={
          <TouchableOpacity
            onPress={() => {
              onSave(draft);
              onClose();
            }}
            activeOpacity={0.85}
            style={[styles.done, { backgroundColor: colors.tint }]}
          >
            <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={colors.fireText} />
            <Text style={[styles.doneText, { color: colors.fireText }]}>{t('profile_hub.save_favorites')}</Text>
          </TouchableOpacity>
        }
      >
        <View style={styles.col}>
          {/* Fixed top: the layout row (+ the selected slot's name and Remove), the slots, the capsule */}
          <View style={styles.layoutRow}>
            <Text style={[styles.psub, { color: colors.tint }]}>{t('profile_hub.your_layout')}</Text>
            {selectedDef ? (
              <View style={styles.slotSel}>
                <Text style={[styles.slotSelName, { color: colors.text }]} numberOfLines={1}>
                  {t(selectedDef.labelKey)}
                </Text>
                <TouchableOpacity
                  onPress={removeSelected}
                  hitSlop={6}
                  style={[styles.removeChip, { backgroundColor: hexToRgba(RED_HUE[resolvedMode], 0.14), borderColor: hexToRgba(RED_HUE[resolvedMode], 0.4) }]}
                >
                  <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={11} color={RED_HUE[resolvedMode]} />
                  <Text style={[styles.removeText, { color: RED_HUE[resolvedMode] }]}>{t('profile_hub.slot_remove')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          <View style={styles.slotsRow}>
            <GestureHandlerRootView style={{ height: slotW + 4, flexDirection: 'row' }}>
              <DraggableFlatList
                horizontal
                data={draft}
                keyExtractor={(x) => x.id}
                renderItem={renderSlot}
                onDragEnd={({ data: next }) => setDraft(next)}
                activationDistance={10}
                showsHorizontalScrollIndicator={false}
                scrollEnabled={false}
                containerStyle={{ flexGrow: 0 }}
              />
              {Array.from({ length: Math.max(0, MAX_FAVORITES - draft.length) }).map((_, i) => (
                <View key={`e${i}`} style={[styles.slot, styles.slotEmpty, { width: slotW, height: slotW, marginRight: 6, borderColor: colors.glassBorder }]}>
                  <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={14} color={colors.textSecondary} />
                </View>
              ))}
            </GestureHandlerRootView>
          </View>
          <Text style={[styles.hint, { color: selectedDef ? colors.tint : colors.textSecondary }]}>
            {selectedDef ? t('profile_hub.slot_hint_selected') : t('profile_hub.editor_hold_hint')}
          </Text>

          <SegControl options={cats.map((c) => ({ key: c.key, label: c.label }))} value={cat} onChange={goCat} />

          {/* One page per category, swipeable; the capsule and the swipe stay in step */}
          <FlatList
            ref={pagerRef}
            horizontal
            pagingEnabled
            data={cats}
            keyExtractor={(c) => c.key}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onPageEnd}
            getItemLayout={(_, index) => ({ length: pageW, offset: pageW * index, index })}
            onLayout={(e) => {
              const w = Math.round(e.nativeEvent.layout.width);
              if (w > 0 && w !== pageW) setPageW(w);
            }}
            style={styles.pager}
            renderItem={({ item }) => (
              <ScrollView
                style={{ width: pageW }}
                contentContainerStyle={styles.page}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.grid}>{shownFor(item.key).map(renderSample)}</View>
              </ScrollView>
            )}
          />
        </View>

        {/* NESTED on purpose: a Modal rendered as a SIBLING of an open Modal never presents on iOS
            (UIKit drops it), and its transparent window can outlive the editor and swallow every
            touch on the page underneath — the "frozen Profile" Steve hit. Inside the sheet it
            presents from the sheet's own view controller and tears down with it. */}
        <TileOptionsSheet
          visible={!!optionsFor}
          onClose={() => setOptionsFor(null)}
          tile={optionsFor}
          data={preview}
          onChange={(next) => setDraft((cur) => cur.map((x) => (x.id === next.id ? next : x)))}
          onRemove={(x) => setDraft((cur) => cur.filter((y) => y.id !== x.id))}
        />
      </GlassSheet>
    </>
  );
}

const styles = StyleSheet.create({
  col: { flex: 1, gap: 10 },
  layoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 24 },
  slotSel: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  slotSelName: { fontFamily: fonts.body.semibold, fontSize: 12.5, flexShrink: 1 },
  removeChip: { height: 24, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  removeText: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
  pager: { flex: 1, marginHorizontal: -18 },
  page: { paddingHorizontal: 18, paddingBottom: 8 },
  psub: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.3, textTransform: 'uppercase' },
  slotsRow: { flexDirection: 'row' },
  slot: { borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  slotEmpty: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  slotGrab: { position: 'absolute', top: 1, right: 3, fontSize: 8, letterSpacing: -1 },
  hint: { fontFamily: fonts.body.regular, fontSize: 11, lineHeight: 15, marginTop: -4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  samp: { width: '48%', flexGrow: 1, borderRadius: 13, borderWidth: 1, padding: 9, minHeight: 76, position: 'relative', justifyContent: 'space-between' },
  sampWide: { width: '100%', minHeight: 0 },
  sampInner: { gap: 6 },
  sampInnerWide: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 96 },
  sampText: { flex: 1, minWidth: 0, paddingRight: 22 },
  sampTitle: { fontFamily: fonts.display.semibold, fontSize: 12.5 },
  sampLine: { fontFamily: fonts.mono.medium, fontSize: 9.5, marginTop: 2 },
  cfg: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 3 },
  ck: { position: 'absolute', top: 7, right: 7, width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  optc: { position: 'absolute', bottom: 7, right: 7, height: 22, paddingHorizontal: 7, borderRadius: 7, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  optcText: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 0.6, textTransform: 'uppercase' },
  done: { height: 47, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  doneText: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
