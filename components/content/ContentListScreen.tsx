import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import GlassActionSheet from '@/components/GlassActionSheet';
import OrderPositionModal from '@/components/OrderPositionModal';
import MenuSearchRow from '@/components/MenuSearchRow';
import BottomNavBar from '@/components/BottomNavBar';
import JoltOverlay from '@/components/JoltOverlay';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

export interface ContentListItem {
  id: string;
  title: string;
  /** The mono meta line: "#1 · Everyone · Sep 1 · 1 file". */
  meta: string;
  thumbnailUrl: string | null;
  shape: 'square' | 'banner';
  /** Category / priority pill above the title. */
  pill?: { label: string; color: string; iosIcon?: string; androidIcon?: string };
  /** Dimmed row (visibility "none"). */
  dim?: boolean;
}

interface ContentListScreenProps {
  title: string;
  eyebrow?: string;
  /** Empty-thumb glyph for the family (megaphone / sparkles / music). */
  emptyIconIos: string;
  emptyIconAndroid: string;
  items: ContentListItem[];
  /** Unfiltered count — the cap counter must not shrink while a search runs. */
  total: number;
  max: number;
  loading: boolean;
  search: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder: string;
  /** "7 announcements" — the caller owns the plural key. */
  countLabel: string;
  onAdd: () => void;
  onEdit: (item: ContentListItem) => void;
  onDelete: (item: ContentListItem) => void;
  /** Receives the full ordered id list (the reorder_* RPCs reindex 0..N-1). */
  onReorder: (orderedIds: string[]) => void;
  emptyTitle: string;
  emptyBody: string;
  limitTitle: string;
  limitMessage: string;
  children?: React.ReactNode;
}

/**
 * The Content & Posts editor page (s80) — one grammar × 3: AmbientGlow +
 * ScreenHeader (no right chip; BottomNavBar carries navigation) · the
 * MenuSearchRow with ＋ · the cap counter row · guides-style row cards
 * (grabber · thumb · pill + title + meta · ⋯) · the canonical five-row
 * GlassActionSheet · OrderPositionModal · BottomNavBar + Jolt.
 *
 * Search disables reordering (a grab handle that cannot grab reads as broken,
 * so it is omitted, not dimmed — the guides editor rule).
 */
export default function ContentListScreen({
  title,
  eyebrow,
  emptyIconIos,
  emptyIconAndroid,
  items,
  total,
  max,
  loading,
  search,
  onSearchChange,
  searchPlaceholder,
  countLabel,
  onAdd,
  onEdit,
  onDelete,
  onReorder,
  emptyTitle,
  emptyBody,
  limitTitle,
  limitMessage,
  children,
}: ContentListScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [action, setAction] = useState<{ item: ContentListItem; index: number } | null>(null);
  const [position, setPosition] = useState<{ item: ContentListItem; index: number } | null>(null);
  const canReorder = search.trim().length === 0;
  const full = total >= max;
  const fill = Math.max(0, Math.min(1, max > 0 ? total / max : 0));

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const ids = items.map((i) => i.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    onReorder(ids);
  };

  const handleAdd = () => {
    if (full) {
      Alert.alert(limitTitle, limitMessage);
      return;
    }
    onAdd();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={title}
        eyebrow={eyebrow}
        onBack={() => router.replace('/(portal)/manager/manage')}
      />

      <MenuSearchRow
        colors={colors}
        mode="editor"
        value={search}
        onChangeText={onSearchChange}
        placeholder={searchPlaceholder}
        onRightPress={handleAdd}
      />

      {/* The cap counter (minted s80): count left · "n / max" + meter right. */}
      <View style={styles.countRow}>
        <Text style={[styles.countText, { color: colors.textSecondary }]} numberOfLines={1}>
          {countLabel}
        </Text>
        <View style={styles.capWrap}>
          <Text style={[styles.capText, { color: full ? colors.primary : colors.textSecondary }]}>
            {total} / {max}
          </Text>
          <View style={[styles.meter, { backgroundColor: colors.hairline }]}>
            <View style={[styles.meterFill, { backgroundColor: colors.primary, width: `${Math.round(fill * 100)}%` }]} />
          </View>
        </View>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.empty, { borderColor: colors.hairline }]}>
            <IconSymbol ios_icon_name={emptyIconIos} android_material_icon_name={emptyIconAndroid} size={28} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{emptyTitle}</Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>{emptyBody}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.list}>
          {items.length > 1 && canReorder && (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('content_editor.reorder_hint')}</Text>
          )}
          <DraggableFlatList
            data={items}
            keyExtractor={(i) => i.id}
            onDragEnd={({ data }) => {
              const ids = data.map((d) => d.id);
              if (ids.join() !== items.map((i) => i.id).join()) onReorder(ids);
            }}
            activationDistance={10}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<ContentListItem>) => {
              const index = getIndex() ?? 0;
              return (
                <ScaleDecorator>
                  <GlassCard variant="surface" radius={17} style={[styles.card, isActive && styles.cardDragging, item.dim && styles.cardDim]}>
                    {canReorder && (
                      <Pressable onLongPress={drag} disabled={isActive} hitSlop={6} style={styles.grabber}>
                        <IconSymbol
                          ios_icon_name="line.3.horizontal"
                          android_material_icon_name="drag-indicator"
                          size={20}
                          color={colors.textSecondary}
                        />
                      </Pressable>
                    )}
                    <Pressable style={styles.tapArea} onPress={() => onEdit(item)}>
                      {item.thumbnailUrl ? (
                        <StorageImage
                          source={{ uri: item.thumbnailUrl }}
                          style={[styles.thumb, item.shape === 'banner' && styles.thumbBanner]}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: colors.thumbPlaceholder }]}>
                          <IconSymbol ios_icon_name={emptyIconIos} android_material_icon_name={emptyIconAndroid} size={20} color={colors.textSecondary} />
                        </View>
                      )}
                      <View style={styles.mid}>
                        {!!item.pill && (
                          <View style={[styles.pill, { backgroundColor: item.pill.color + '1F', borderColor: item.pill.color + '6B' }]}>
                            {!!item.pill.iosIcon && !!item.pill.androidIcon && (
                              <IconSymbol ios_icon_name={item.pill.iosIcon} android_material_icon_name={item.pill.androidIcon} size={9} color={item.pill.color} />
                            )}
                            <Text style={[styles.pillText, { color: item.pill.color }]} numberOfLines={1}>
                              {item.pill.label.toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                          {item.meta}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={[styles.meatball, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                      onPress={() => setAction({ item, index })}
                      hitSlop={6}
                    >
                      <IconSymbol ios_icon_name="ellipsis" android_material_icon_name="more-horiz" size={18} color={colors.text} />
                    </Pressable>
                  </GlassCard>
                </ScaleDecorator>
              );
            }}
          />
        </View>
      )}

      <BottomNavBar activeTab="manage" />
      <JoltOverlay role="manager" />

      <GlassActionSheet
        visible={!!action}
        onClose={() => setAction(null)}
        title={action?.item.title ?? ''}
        subtitle={action ? t('menu_editor:position_of', { n: action.index + 1, total: items.length }) : undefined}
        actions={
          action
            ? [
                { key: 'edit', label: t('common:edit'), iosIcon: 'pencil', androidIcon: 'edit', onPress: () => onEdit(action.item) },
                {
                  key: 'up',
                  label: t('upcoming_events_editor:move_up'),
                  iosIcon: 'arrow.up',
                  androidIcon: 'arrow-upward',
                  disabled: !canReorder || action.index === 0,
                  onPress: () => move(action.index, action.index - 1),
                },
                {
                  key: 'down',
                  label: t('upcoming_events_editor:move_down'),
                  iosIcon: 'arrow.down',
                  androidIcon: 'arrow-downward',
                  disabled: !canReorder || action.index === items.length - 1,
                  onPress: () => move(action.index, action.index + 1),
                },
                {
                  key: 'position',
                  label: t('menu_editor:order_position'),
                  iosIcon: 'arrow.up.arrow.down',
                  androidIcon: 'swap-vert',
                  disabled: !canReorder || items.length < 2,
                  onPress: () => setPosition({ item: action.item, index: action.index }),
                },
                { key: 'delete', label: t('common:delete'), iosIcon: 'trash', androidIcon: 'delete', destructive: true, onPress: () => onDelete(action.item) },
              ]
            : []
        }
      />

      <OrderPositionModal
        visible={!!position}
        title={t('menu_editor:order_position')}
        subtitle={position?.item.title ?? ''}
        count={items.length}
        currentIndex={position?.index ?? 0}
        onClose={() => setPosition(null)}
        onApply={(newPos) => {
          if (position) move(position.index, newPos - 1);
          setPosition(null);
        }}
      />

      {children}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: { flex: 1 },
    countRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 18,
      marginBottom: 11,
    },
    countText: { flexShrink: 1, fontFamily: fonts.mono.semibold, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
    capWrap: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 },
    capText: { fontFamily: fonts.mono.semibold, fontSize: 10, letterSpacing: 1.2, fontVariant: ['tabular-nums'] },
    meter: { width: 54, height: 3, borderRadius: 2, overflow: 'hidden' },
    meterFill: { height: '100%', borderRadius: 2 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
    emptyWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    empty: {
      borderRadius: 17,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      paddingVertical: 26,
      paddingHorizontal: 16,
      alignItems: 'center',
      gap: 6,
    },
    emptyTitle: { fontFamily: fonts.display.semibold, fontSize: 15, marginTop: 4 },
    emptyBody: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 17, textAlign: 'center' },
    hint: { fontFamily: fonts.mono.medium, fontSize: 9.5, letterSpacing: 0.4, textAlign: 'center', marginBottom: 10 },
    list: { flex: 1 },
    listContent: { paddingHorizontal: 16, paddingBottom: 100 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 10 },
    cardDragging: { opacity: 0.9, transform: [{ scale: 1.02 }] },
    cardDim: { opacity: 0.55 },
    grabber: { paddingVertical: 4 },
    tapArea: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
    thumb: { width: 53, height: 53, borderRadius: 13, overflow: 'hidden' },
    thumbBanner: { width: 84 },
    thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
    mid: { flex: 1, minWidth: 0, gap: 3 },
    pill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 7,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
    pillText: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 0.4 },
    cardTitle: { fontFamily: fonts.display.semibold, fontSize: 15 },
    cardMeta: { fontFamily: fonts.mono.medium, fontSize: 10, letterSpacing: 0.5 },
    meatball: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
    },
  });
