import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Text, View, Pressable, StyleSheet } from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

export interface CategoryOption {
  /** The value stored in the DB `category` column — never a translated label. */
  name: string;
  /** Display label (the Spanish name when one exists, else the stored name). */
  label: string;
  count: number;
  /** guide_categories.id. Absent on the synthetic ALL row. */
  id?: string;
  isHidden?: boolean;
  /**
   * `guide_categories.system_key !== null` — one of the shipped defaults.
   * Renameable and hideable per org, but NEVER deletable (the server refuses),
   * which is why its row shows a lock where a custom one shows a trash.
   */
  isBuiltIn?: boolean;
}

export interface CategoryEditing {
  editLabel: string;
  doneLabel: string;
  onToggleHidden: (id: string, nextHidden: boolean) => void;
  /** Real category ids in their new order (the ALL row is never included). */
  onReorder: (orderedIds: string[]) => void;
  /** The HOST owns the rename prompt — this only says which row was tapped. */
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  /**
   * accessibilityLabel for the built-in lock. Passed in because this component
   * takes no `t` — and the lock is the one row control with nothing but its
   * shape to explain itself (there is no icon legend in a bottom sheet).
   */
  builtInHint?: string;
  /**
   * The host's rename prompt, mounted INSIDE this sheet's Modal.
   *
   * ⚠️ NOT optional decoration — it is where the prompt has to live. RN presents
   * an iOS Modal on the nearest ancestor view controller (`reactViewController`),
   * so a ROOT-level sheet issued while this one is up presents on a VC that is
   * already presenting and is silently dropped: the pencil would do nothing.
   * Nesting it here is the same fix guides-and-training-editor already uses to
   * put its ＋New category sheet over the open Add/Edit form, and it is what
   * lets Edit mode stay open behind the prompt so the renamed row is visible
   * the instant it closes.
   */
  renameSheet?: React.ReactNode;
}

interface CategorySheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: CategoryOption[];
  /** The currently selected `name` (not label). */
  selected: string;
  onSelect: (name: string) => void;
  /** EDITOR ONLY — renders the dashed `＋ New category…` row when provided. */
  onNewCategory?: () => void;
  newCategoryLabel?: string;
  /**
   * EDITOR FILTER SHEET ONLY. Its presence adds the Edit toggle. Deliberately
   * NOT passed by the Add/Edit form's category picker — reordering the whole
   * org's categories while filing one guide is not a thing anyone means to do.
   */
  editing?: CategoryEditing;
}

/**
 * The category picker bottom sheet — the approved "filing cabinet" direction.
 * Every category in one tap with a live count, no swiping.
 *
 * Shared by BOTH guides screens *and* the editor's Add/Edit form, so the list,
 * the counts and the ordering can never drift between the filter and the picker.
 *
 * EDIT MODE (editor filter sheet only) turns the same rows into a reorderable
 * list with a per-row pencil / eye / trash-or-lock, which is why renaming,
 * hiding, deleting and reordering need no screen of their own.
 */
export default function CategorySheet({
  visible,
  onClose,
  title,
  options,
  selected,
  onSelect,
  onNewCategory,
  newCategoryLabel,
  editing,
}: CategorySheetProps) {
  const colors = useThemeColors();
  // `＋ New category…` opens another sheet, so it has to wait for this one to
  // finish dismissing — see useSheetHandoff. Picking a category only sets
  // state, so it stays immediate.
  const { defer, onDismiss } = useSheetHandoff(onClose);
  const [editMode, setEditMode] = useState(false);

  // Never reopen straight into edit mode — the sheet's job is picking. Reset on
  // the next OPEN, not on close: `visible === false` lands at the START of the
  // slide-out, so the user would watch the handles and eyes vanish and the
  // counts + `＋ New category…` row reappear as the sheet leaves. Resetting on
  // open is invisible (nothing is on screen yet) and, unlike Modal.onDismiss,
  // it works on Android too. useLayoutEffect so the reset is committed before
  // the first frame is drawn — a plain effect would paint one edit-mode frame.
  useLayoutEffect(() => {
    if (visible) setEditMode(false);
  }, [visible]);

  // Reorder and hide act on REAL categories; the synthetic ALL row has no id
  // and must never appear in edit mode or in an ordered-ids payload.
  const [dragRows, setDragRows] = useState<CategoryOption[]>(() =>
    options.filter((o) => !!o.id),
  );
  useEffect(() => {
    setDragRows(options.filter((o) => !!o.id));
  }, [options]);

  const renderRow = (opt: CategoryOption, drag?: () => void, isActive?: boolean) => {
    // Case-INSENSITIVE, like every other join in this feature: the stored name
    // IS the key (both guides screens' `catKey` lowercases, and the server's
    // uniqueness index is on `lower(name)`), so a row stored as 'cheat sheets'
    // and a filter holding 'Cheat Sheets' are the SAME category and the row has
    // to read as selected. `===` left this one comparison the odd one out —
    // the case-divergent row highlighted nowhere while its guides listed fine.
    const active = !editMode && opt.name.toLowerCase() === selected.toLowerCase();
    const dimmed = !!opt.isHidden;
    return (
      <Pressable
        onPress={editMode ? undefined : () => { onSelect(opt.name); onClose(); }}
        disabled={editMode}
        style={[
          styles.row,
          {
            backgroundColor: active ? colors.primary + '24' : colors.surface,
            borderColor: active ? colors.primary + '6B' : colors.surfaceBorder,
            // Hidden reads as hidden in EVERY mode. The form's picker never has
            // `editing`, so it can never enter edit mode — gating the cue on
            // edit mode let a manager file a guide into a category their staff
            // cannot see, with the row looking pixel-identical to a visible one.
            opacity: isActive ? 0.9 : dimmed ? 0.5 : 1,
          },
        ]}
      >
        {editMode && (
          <Pressable onLongPress={drag} disabled={isActive} hitSlop={6}>
            <IconSymbol
              ios_icon_name="line.3.horizontal.decrease"
              android_material_icon_name="drag-indicator"
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
        )}

        <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
          {opt.label}
        </Text>

        {editMode ? (
          // pencil → eye → trash-or-lock. Only REAL rows reach here (the ALL
          // row has no id and is filtered out of the drag list), so every id!
          // guard below is belt-and-braces. The eye TOGGLE stays exclusive to
          // edit mode; the icon in the other branch is a read-only state cue.
          <View style={styles.actions}>
            <Pressable
              onPress={() => opt.id && editing?.onRename(opt.id)}
              style={styles.iconBtn}
            >
              <IconSymbol
                ios_icon_name="pencil"
                android_material_icon_name="edit"
                size={19}
                color={colors.primary}
              />
            </Pressable>

            <Pressable
              onPress={() => opt.id && editing?.onToggleHidden(opt.id, !opt.isHidden)}
              style={styles.iconBtn}
            >
              <IconSymbol
                ios_icon_name={opt.isHidden ? 'eye.slash' : 'eye'}
                android_material_icon_name={opt.isHidden ? 'visibility-off' : 'visibility'}
                size={20}
                color={opt.isHidden ? colors.textSecondary : colors.primary}
              />
            </Pressable>

            {opt.isBuiltIn ? (
              // A built-in is renameable and hideable but never deletable, so it
              // gets a STATE CUE, not a control — a trash that always errored
              // would read as broken, and omitting the slot entirely would slide
              // the pencil and eye out from under the finger row-to-row. Same
              // 38pt box, so the two real buttons stay column-aligned.
              <View
                style={styles.iconBtn}
                accessible
                accessibilityLabel={editing?.builtInHint}
              >
                <IconSymbol
                  ios_icon_name="lock.fill"
                  android_material_icon_name="lock"
                  size={17}
                  color={colors.textSecondary}
                />
              </View>
            ) : (
              <Pressable
                onPress={() => opt.id && editing?.onDelete(opt.id)}
                style={styles.iconBtn}
              >
                <IconSymbol
                  ios_icon_name="trash"
                  android_material_icon_name="delete"
                  size={19}
                  color="#E74C3C"
                />
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.countWrap}>
            {dimmed && (
              <IconSymbol
                ios_icon_name="eye.slash"
                android_material_icon_name="visibility-off"
                size={15}
                color={colors.textSecondary}
              />
            )}
            <Text style={[styles.count, { color: colors.textSecondary }]}>{opt.count}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={title}
      onDismiss={onDismiss}
      // In edit mode DraggableFlatList owns the scrolling: a VirtualizedList
      // inside GlassSheet's ScrollView would break both.
      scroll={!editMode}
      headerAction={
        editing ? (
          <Pressable onPress={() => setEditMode((v) => !v)} hitSlop={10}>
            <Text style={[styles.editBtn, { color: colors.primary }]}>
              {editMode ? editing.doneLabel : editing.editLabel}
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      {editMode ? (
        // A Modal is a separate native view hierarchy, so the app-root
        // GestureHandlerRootView does not reach in here — without this nested
        // one the drag never starts on Android.
        <GestureHandlerRootView style={styles.dragWrap}>
          <DraggableFlatList
            data={dragRows}
            keyExtractor={(item) => item.id!}
            activationDistance={10}
            contentContainerStyle={styles.dragContent}
            onDragEnd={({ data }) => {
              // The library fires onDragEnd even when the row never moved, so a
              // bare long-press on a handle would otherwise write a reorder.
              const nextIds = data.map((d) => d.id!);
              const unchanged =
                nextIds.length === dragRows.length &&
                nextIds.every((id, i) => id === dragRows[i].id);
              if (unchanged) return;
              setDragRows(data);
              editing?.onReorder(nextIds);
            }}
            renderItem={({ item, drag, isActive }: RenderItemParams<CategoryOption>) => (
              <ScaleDecorator>{renderRow(item, drag, isActive)}</ScaleDecorator>
            )}
          />
        </GestureHandlerRootView>
      ) : (
        <>
          {options.map((opt) => (
            <React.Fragment key={opt.id ?? opt.name}>{renderRow(opt)}</React.Fragment>
          ))}

          {!!onNewCategory && (
            <Pressable
              onPress={() => defer(onNewCategory)}
              style={[styles.row, styles.newRow, { borderColor: colors.primary + '6B' }]}
            >
              <Text
                style={[styles.label, styles.newLabel, { color: colors.primary }]}
                numberOfLines={1}
              >
                {newCategoryLabel}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {/* The host's rename prompt. Mounted inside this sheet purely so iOS
          presents it on THIS sheet's view controller (see
          CategoryEditing.renameSheet). Outside the edit-mode branch so leaving
          edit mode cannot yank it off screen mid-edit. Costs this body NOTHING
          in EITHER state: RN's Modal renders `null` while `visible` is false,
          so a closed prompt is not a child at all — no row, and no 9pt `gap`
          either, since `gap` only spaces children that exist — and an open one
          renders into its own view hierarchy rather than into this layout.
          Exactly like the two sheets guides-and-training-editor already nests
          inside its Add/Edit form. */}
      {editing?.renameSheet}
    </GlassSheet>
  );
}

// The row's own vertical padding, named because `actions` cancels it with an
// equal NEGATIVE margin to let the icon buttons span the full row (see below).
// The two must move together — change this alone and the targets stop lining up
// with the row they belong to.
const ROW_PAD_V = 13;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: ROW_PAD_V,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  // flex:1 + flexShrink:1 (RN defaults flexShrink to 0) so a long custom
  // category name ellipsizes instead of pushing the count off the row.
  label: { flex: 1, flexShrink: 1, fontFamily: fonts.display.semibold, fontSize: 15 },
  count: { fontFamily: fonts.mono.medium, fontSize: 11 },
  // The hidden cue sits beside the count, not in place of it.
  countWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // EDIT MODE'S CROWDED ROW: handle + label + three 38pt icon slots. Everything
  // but the label is fixed width, so the icons must never shrink — RN already
  // defaults flexShrink to 0, pinned here as documentation, since a squeezed
  // group would push the trash off the row on a long ES name.
  // WIDEST the furniture ever gets: 28 (row padding) + 2 (borders) + 20 (handle)
  // + 12 + 12 (two row gaps) + 118 (3×38 icons + 2×2 gaps) = 192pt. Inside the
  // sheet's 18pt padding that leaves the label 147pt at 375pt of device width
  // and 92pt at 320pt (SE) — tight, ellipsized, never collapsed to nothing.
  //
  // THIS GROUP IS THE BLOCKING ANCESTOR, so it has to be the full height of the
  // row or the buttons inside it cannot be: RN dispatches a touch to a child
  // only after the point falls inside each ancestor's own rect, which is why the
  // old `hitSlop` was dead — it escaped a group that was 20pt of glyph tall.
  // The group takes its height from the padded buttons (46) and cancels the
  // row's padding with an equal negative margin, so its MARGIN box is still the
  // 20pt the row lays out against (46 − 13 − 13) and its BORDER box lands
  // exactly on the row's inner edges. The row is not one pixel taller for it —
  // edit rows must stay the height of pick rows, the sheet's job being picking.
  // `alignItems:'stretch'` so all three slots are the SAME height: the glyphs
  // are 17–20pt apiece, so left to their own padding the lock and pencil would
  // sit a point short of the eye and leave dead strips at the row's edges.
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginVertical: -ROW_PAD_V,
    flexShrink: 0,
    gap: 2,
  },
  // 38 × 46pt — the target as MEASURED, not as hoped for. It was a 32pt box the
  // height of its own ~20pt glyph carrying `hitSlop={{top:12,bottom:12}}` that
  // never applied (see `actions`), i.e. ~32×22 against a comment claiming 44.
  // The height now comes from real padding — 13 + 20 + 13 = the row's full
  // inner height — because a hard 44×44 is not reachable inside a 46pt row
  // without growing the row, so 38 wide is the honest maximum three slots can
  // afford. Still NO horizontal hitSlop, and the boxes sit 2pt apart rather
  // than overlapping: slop here would hand a tap meant for the eye to the TRASH.
  iconBtn: {
    width: 38,
    paddingVertical: ROW_PAD_V,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: { fontFamily: fonts.body.semibold, fontSize: 14 },
  newRow: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  newLabel: { flex: 0 },
  // maxHeight is the CEILING; flexShrink:1 (RN defaults it to 0) is what lets
  // the list give the height back when the sheet's own 88% cap is tighter than
  // 420 — GlassCard clips (overflow:hidden), so without it the last rows are
  // unreachable on a short device. The rows carry their own spacing since the
  // list replaces GlassSheet's gap.
  dragWrap: { maxHeight: 420, flexShrink: 1 },
  dragContent: { gap: 9, paddingBottom: 4 },
});
