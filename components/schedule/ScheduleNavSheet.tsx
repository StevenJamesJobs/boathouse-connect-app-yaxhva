import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { useScheduleSettings } from '@/hooks/useScheduleSettings';
import { useScheduleAttention } from '@/hooks/useScheduleAttention';
import { isManagerOrOwner } from '@/utils/roles';
import ScheduleUploadSheet from '@/components/schedule/ScheduleUploadSheet';
import ScheduleSettingsSheet from '@/components/schedule/ScheduleSettingsSheet';
import { fonts } from '@/constants/fonts';

export type SchedulePage = 'my-schedule' | 'roster' | 'schedules' | 'upload' | 'review' | 'approvals';

export interface ScheduleNavSheetProps {
  visible: boolean;
  onClose: () => void;
  /** which page opened the sheet — its row dims to "You're here" */
  current: SchedulePage;
}

/**
 * The ⚙ Schedule sheet (s83) — MenuSheet's twin for the schedule family. One
 * place to jump between Roster · Schedules · Upload Schedules & View History ·
 * Approvals · Schedule Settings (owners/managers), or My Schedule · Roster
 * (employees). Upload and Settings open NESTED sheets inside this Modal (iOS
 * presents on the nearest ancestor view controller); every navigating row goes
 * through useSheetHandoff so the push lands after the sheet is gone.
 *
 * Locks follow the manager-permissions grammar — locked, never hidden: Upload
 * needs premium AND (owner or the premium.ai_schedule_upload grant); Settings
 * needs owner or org_settings.access.
 */
export default function ScheduleNavSheet({ visible, onClose, current }: ScheduleNavSheetProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { hasPremium, isLoading: subLoading } = useSubscription();
  const { perms, loading: permsLoading } = useManagerPermissions();
  const { settings } = useScheduleSettings();
  const { attention } = useScheduleAttention();
  const { defer, onDismiss } = useSheetHandoff(onClose);

  const isMgr = isManagerOrOwner(user);
  const isOwner = user?.role === 'owner';
  const [uploadVisible, setUploadVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  // Never reopen straight into a nested sheet — reset on OPEN (the MenuSheet rule).
  useLayoutEffect(() => {
    if (visible) {
      setUploadVisible(false);
      setSettingsVisible(false);
    }
  }, [visible]);

  // Staggered close-both (MenuSheet:65-100): hide the child, wait for its Modal
  // to finish (iOS onDismiss / the 450 ms Android floor), then close this sheet
  // through its own handoff with `fn`.
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
      setSettingsVisible(false);
      setTimeout(flushCloseBoth, 450);
    },
    [flushCloseBoth]
  );

  const grantOk = isOwner || perms.aiScheduleUpload;
  // wait for the loads so the row never flashes a lock (sim smoke, s83)
  const uploadLocked = (!hasPremium && !subLoading) || (!grantOk && !permsLoading);
  const uploadLockSub = !hasPremium ? t('schedule_nav.premium_sub') : t('schedule_nav.ask_owner');
  const settingsLocked = !(isOwner || perms.access);

  const go = (path: string) => defer(() => router.push(path as any));

  const row = (opts: {
    key: string;
    iosIcon: string;
    androidIcon: string;
    label: string;
    sub: string;
    here?: boolean;
    locked?: boolean;
    lockSub?: string;
    granted?: boolean;
    count?: number;
    onPress?: () => void;
  }) => (
    <Pressable
      key={opts.key}
      disabled={opts.locked || opts.here}
      onPress={opts.onPress}
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        (opts.locked || opts.here) && styles.rowDim,
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: opts.locked ? colors.glass : colors.primary + '24' }]}>
        <IconSymbol ios_icon_name={opts.iosIcon} android_material_icon_name={opts.androidIcon} size={16} color={opts.locked ? colors.textSecondary : colors.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>{opts.label}</Text>
        <Text style={[styles.rowSub, { color: opts.here || opts.locked ? colors.primary : colors.textSecondary }]} numberOfLines={2}>
          {opts.here ? t('schedule_nav.here') : opts.locked ? opts.lockSub ?? t('schedule_nav.ask_owner') : opts.sub}
        </Text>
      </View>
      {typeof opts.count === 'number' && opts.count > 0 && !opts.here && (
        <View style={[styles.bubble, { backgroundColor: colors.primary }]}>
          <Text style={[styles.bubbleText, { color: colors.fireText }]}>{opts.count > 99 ? '99+' : opts.count}</Text>
        </View>
      )}
      {opts.locked ? (
        <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={16} color={colors.primary} />
      ) : opts.granted ? (
        <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={14} color={colors.primary} />
      ) : !opts.here ? (
        <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
      ) : null}
    </Pressable>
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={t('schedule_nav.title')}
      subtitle={t('schedule_nav.subtitle')}
    >
      {!isMgr &&
        row({
          key: 'my-schedule', iosIcon: 'calendar', androidIcon: 'event',
          label: t('schedule_nav.my_schedule'), sub: t('schedule_nav.my_schedule_sub'),
          here: current === 'my-schedule', onPress: () => go('/my-schedule'),
        })}
      {(isMgr || settings.staffCanViewRoster) &&
        row({
          key: 'roster', iosIcon: 'person.3.fill', androidIcon: 'groups',
          label: t('schedule_nav.roster'), sub: t('schedule_nav.roster_sub'),
          here: current === 'roster', onPress: () => go('/todays-roster'),
        })}
      {isMgr &&
        row({
          key: 'schedules', iosIcon: 'calendar.badge.clock', androidIcon: 'edit-calendar',
          label: t('schedule_nav.schedules'), sub: t('schedule_nav.schedules_sub'),
          here: current === 'schedules', onPress: () => go('/manual-schedule'),
        })}
      {isMgr &&
        row({
          key: 'upload', iosIcon: 'square.and.arrow.up', androidIcon: 'file-upload',
          label: t('schedule_nav.upload'), sub: t('schedule_nav.upload_sub'),
          here: current === 'upload', locked: uploadLocked, lockSub: uploadLockSub,
          granted: user?.role === 'manager' && perms.aiScheduleUpload && hasPremium,
          // nested s2 presentation — this sheet stays open behind, so no defer
          onPress: () => setUploadVisible(true),
        })}
      {isMgr &&
        row({
          key: 'approvals', iosIcon: 'checkmark.circle.fill', androidIcon: 'task-alt',
          label: t('schedule_nav.approvals'), sub: t('schedule_nav.approvals_sub'),
          here: current === 'approvals', count: attention.pendingApprovals,
          onPress: () => go('/schedule-approvals'),
        })}
      {isMgr &&
        row({
          key: 'settings', iosIcon: 'slider.horizontal.3', androidIcon: 'tune',
          label: t('schedule_nav.settings'), sub: t('schedule_nav.settings_sub'),
          locked: settingsLocked, lockSub: t('schedule_nav.ask_owner_access'),
          granted: user?.role === 'manager' && perms.access,
          onPress: () => setSettingsVisible(true),
        })}

      {/* Nested inside this sheet's Modal on purpose — see the docblock. */}
      <ScheduleUploadSheet
        visible={uploadVisible}
        onClose={() => setUploadVisible(false)}
        closeBothThen={closeBothThen}
        onFullyClosed={flushCloseBoth}
      />
      <ScheduleSettingsSheet
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
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
    paddingVertical: 12,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  rowDim: { opacity: 0.6 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, flexShrink: 1 },
  rowLabel: { fontFamily: fonts.display.semibold, fontSize: 14.5 },
  rowSub: { fontFamily: fonts.body.regular, fontSize: 11.5, marginTop: 1 },
  bubble: { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  bubbleText: { fontFamily: fonts.mono.semibold, fontSize: 10 },
});
