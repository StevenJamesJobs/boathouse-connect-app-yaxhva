import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import MenuUploadSheet from '@/components/MenuUploadSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { fonts } from '@/constants/fonts';

export interface MenuSheetProps {
  visible: boolean;
  onClose: () => void;
  colors: any;
  /** Employees never see the ⚙ chip, so this sheet only ever opens for these. */
  role: 'owner' | 'manager';
  /**
   * Which side opened the sheet. In the editor the first row flips to
   * "Back to Menu" (the host passes an onEditMenu that navigates back) —
   * Steve's smoke: "Edit Menu" reads wrong when you're already editing.
   */
  mode?: 'user' | 'editor';
  /** From useManagerPermissions — owners arrive with all three true. */
  perms: { menuConfig: boolean; editCategories: boolean; aiUpload: boolean };
  /** Host navigates (push '/menu-editor') — fired AFTER this sheet dismisses. */
  onEditMenu: () => void;
  /** Grant-locked row — enabled for owner or perms.editCategories
   *  ('menu.edit_categories'); LOCKED (not hidden) otherwise. */
  onEditCategories: () => void;
  /** Host navigates to the scoped Org Settings Menu tab — fired after dismiss. */
  onMenuConfiguration: () => void;
  /** For the upload sheet's credits strip. */
  quota: { remaining: number; max: number; freeAvailable: boolean } | null;
  refreshQuota: () => void;
}

/**
 * The ⚙ Menu sheet — everything behind the menu, in one place.
 *
 * Managers see the owner-gated rows LOCKED rather than hidden, so the
 * capability is discoverable and they know who to ask; the grants come from
 * useManagerPermissions ('org_settings.menu' / 'menu.edit_categories' /
 * 'premium.ai_menu_upload').
 *
 * Upload Menu opens MenuUploadSheet NESTED inside this sheet's Modal (iOS
 * presents on the nearest ancestor view controller — a root-level sibling
 * would be silently dropped; the CategorySheet `renameSheet` rule). Every row
 * that closes this sheet and then navigates goes through useSheetHandoff.
 */
export default function MenuSheet({
  visible,
  onClose,
  colors,
  role,
  mode = 'user',
  perms,
  onEditMenu,
  onEditCategories,
  onMenuConfiguration,
  quota,
  refreshQuota,
}: MenuSheetProps) {
  const { t } = useTranslation();
  // Edit Menu / Edit Categories / Menu Configuration all navigate once this
  // sheet is gone — defer + onDismiss are BOTH required (one alone is a no-op).
  const { defer, onDismiss } = useSheetHandoff(onClose);
  const [uploadVisible, setUploadVisible] = useState(false);

  // Never reopen straight into the nested upload sheet — reset on OPEN, not on
  // close (the close-time reset would be visible mid-slide; CategorySheet's
  // edit-mode reset documents the same rule).
  useLayoutEffect(() => {
    if (visible) setUploadVisible(false);
  }, [visible]);

  const canUpload = role === 'owner' || perms.aiUpload;
  const canConfig = role === 'owner' || perms.menuConfig;
  const canEditCategories = role === 'owner' || perms.editCategories;

  // The upload sheet's navigating exits (View History, the review push, the
  // premium upsell) must drop BOTH sheets — but STAGGERED, never in one commit:
  // dismissing this Modal while its nested child Modal is also mid-dismissal
  // strands the child's presentation on iOS (an invisible layer that eats every
  // touch on the destination screen — smoke-found on View History). So: hide
  // the child, wait for its Modal to actually finish (child onDismiss on iOS;
  // RN's Modal onDismiss never fires on Android, so a timer is the floor), and
  // only then close THIS sheet with `fn` routed through its handoff.
  const pendingBothRef = useRef<(() => void) | null>(null);
  const flushCloseBoth = useCallback(() => {
    const fn = pendingBothRef.current;
    if (!fn) return;
    pendingBothRef.current = null;
    defer(fn);
  }, [defer]);
  const closeBothThen = useCallback(
    (fn: () => void) => {
      pendingBothRef.current = fn;
      setUploadVisible(false);
      setTimeout(flushCloseBoth, 450);
    },
    [flushCloseBoth]
  );

  const row = (opts: {
    key: string;
    iosIcon: string;
    androidIcon: string;
    label: string;
    sub: string;
    locked?: boolean;
    /** Manager unlocked this row via an owner grant — marked with a star where
     *  the padlock sits when locked (Steve's smoke ask: granted ≠ ordinary). */
    granted?: boolean;
    onPress?: () => void;
  }) => (
    <Pressable
      key={opts.key}
      disabled={opts.locked}
      onPress={opts.onPress}
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        opts.locked && styles.rowLocked,
      ]}
    >
      <IconSymbol
        ios_icon_name={opts.iosIcon}
        android_material_icon_name={opts.androidIcon}
        size={20}
        color={colors.textSecondary}
      />
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
          {opts.label}
        </Text>
        <Text style={[styles.rowSub, { color: opts.locked ? colors.primary : colors.textSecondary }]}>
          {opts.locked ? t('menu_sheet.ask_owner') : opts.sub}
        </Text>
      </View>
      {opts.locked && (
        <IconSymbol
          ios_icon_name="lock.fill"
          android_material_icon_name="lock"
          size={17}
          color={colors.primary}
        />
      )}
      {!opts.locked && opts.granted && (
        <IconSymbol
          ios_icon_name="star.fill"
          android_material_icon_name="star"
          size={15}
          color={colors.primary}
        />
      )}
    </Pressable>
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={t('menu_sheet.title')}
      subtitle={t('menu_sheet.subtitle')}
    >
      {mode === 'editor'
        ? row({
            key: 'edit',
            iosIcon: 'eye.fill',
            androidIcon: 'visibility',
            label: t('menu_sheet.back_to_menu'),
            sub: t('menu_sheet.back_to_menu_sub'),
            onPress: () => defer(onEditMenu),
          })
        : row({
            key: 'edit',
            iosIcon: 'pencil',
            androidIcon: 'edit',
            label: t('menu_sheet.edit_menu'),
            sub: t('menu_sheet.edit_menu_sub'),
            onPress: () => defer(onEditMenu),
          })}

      {row({
        key: 'categories',
        iosIcon: 'square.grid.2x2',
        androidIcon: 'grid-view',
        label: t('menu_sheet.edit_categories'),
        sub: t('menu_sheet.edit_categories_sub'),
        locked: !canEditCategories,
        granted: role === 'manager' && perms.editCategories,
        onPress: () => defer(onEditCategories),
      })}

      {row({
        key: 'upload',
        iosIcon: 'square.and.arrow.up',
        androidIcon: 'file-upload',
        label: t('menu_sheet.upload_menu'),
        sub: t('menu_sheet.upload_menu_sub'),
        locked: !canUpload,
        granted: role === 'manager' && perms.aiUpload,
        // Nested s2 presentation — the sheet stays open behind, so no defer.
        onPress: () => setUploadVisible(true),
      })}

      {row({
        key: 'config',
        iosIcon: 'slider.horizontal.3',
        androidIcon: 'tune',
        label: t('menu_sheet.menu_configuration'),
        sub: t('menu_sheet.menu_configuration_sub'),
        locked: !canConfig,
        granted: role === 'manager' && perms.menuConfig,
        onPress: () => defer(onMenuConfiguration),
      })}

      {role === 'manager' && (perms.aiUpload || perms.menuConfig || perms.editCategories) && (
        <View style={styles.noteRow}>
          <IconSymbol
            ios_icon_name="star.fill"
            android_material_icon_name="star"
            size={13}
            color={colors.primary}
          />
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {t('menu_sheet.granted_note') + (perms.aiUpload ? ' ' + t('menu_sheet.granted_credits') : '')}
          </Text>
        </View>
      )}

      {/* Nested inside this sheet's Modal on purpose — see the docblock. A
          hidden Modal renders null, so the closed sheet costs the body nothing
          (not even the 9pt gap). */}
      <MenuUploadSheet
        visible={uploadVisible}
        onClose={() => setUploadVisible(false)}
        colors={colors}
        quota={quota}
        refreshQuota={refreshQuota}
        closeBothThen={closeBothThen}
        onFullyClosed={flushCloseBoth}
      />
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  // The mockup's locked treatment: dimmed row, primary "ask your owner"
  // sub-line, padlock on the right — discoverable, not hidden.
  rowLocked: { opacity: 0.62 },
  rowBody: { flex: 1, flexShrink: 1 },
  rowLabel: { fontFamily: fonts.display.semibold, fontSize: 15 },
  rowSub: { fontFamily: fonts.body.regular, fontSize: 11.5, marginTop: 2 },
  // 12.5 (was 11) — Steve's smoke: the granted footnote was too small to read.
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingRight: 4 },
  note: { flex: 1, fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 18 },
});
