import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Switch, Alert, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { useScheduleSettings, refreshAllScheduleSettings } from '@/hooks/useScheduleSettings';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';
import { formatTime, localeFor, timeToDate, toTimeParam } from '@/utils/schedule/format';
import { fonts } from '@/constants/fonts';

export interface ScheduleSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** iOS onDismiss relay for a host that nests this sheet (ScheduleNavSheet). */
  onFullyClosed?: () => void;
}

type SettingKey = 'staffCanViewRoster' | 'timeOffEnabled' | 'shiftReleaseEnabled';

/**
 * Schedule Settings (s83) — the toggles that left Org Settings → Access: Staff
 * can view the roster · Request time off · Release shifts · AM/PM cutoff.
 *
 * Writes through update_organization_settings (the ACCESS field group), so an
 * owner or a manager holding org_settings.access may change them; any other
 * manager sees the rows LOCKED with "Ask the owner" (the manager-permissions
 * grammar — locked, never hidden). Optimistic toggles revert on a server no.
 */
export default function ScheduleSettingsSheet({ visible, onClose, onFullyClosed }: ScheduleSettingsSheetProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { language } = useLanguage();
  const { perms } = useManagerPermissions();
  const { settings, refresh } = useScheduleSettings();
  const locale = localeFor(language);

  const canEdit = user?.role === 'owner' || (user?.role === 'manager' && perms.access);

  const [local, setLocal] = useState(settings);
  const [cutoffOpen, setCutoffOpen] = useState(false);
  const [cutoffDraft, setCutoffDraft] = useState<Date>(timeToDate(settings.rosterPmCutoff));
  const [saving, setSaving] = useState(false);

  // mirror the org row whenever it changes underneath us (focus refresh / broadcast)
  useEffect(() => {
    setLocal(settings);
    setCutoffDraft(timeToDate(settings.rosterPmCutoff));
  }, [settings]);

  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) refresh();
    wasVisible.current = visible;
  }, [visible, refresh]);

  const write = async (params: Record<string, unknown>, revert: () => void) => {
    if (!user?.id || !organizationId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('update_organization_settings', {
        p_organization_id: organizationId,
        p_user_id: user.id,
        ...params,
      } as any);
      const res: any = data;
      if (error) throw error;
      if (res && res.success === false) throw new Error(res.error || 'save failed');
      refreshAllScheduleSettings();
    } catch (e: any) {
      revert();
      Alert.alert(t('schedule_settings.save_failed_title'), translateServerError(e, t('schedule_settings.save_failed_msg')));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: SettingKey, param: string) => (value: boolean) => {
    const prev = local[key];
    setLocal((s) => ({ ...s, [key]: value }));
    write({ [param]: value }, () => setLocal((s) => ({ ...s, [key]: prev })));
  };

  const commitCutoff = (picked: Date) => {
    const prev = local.rosterPmCutoff;
    const next = toTimeParam(picked);
    setLocal((s) => ({ ...s, rosterPmCutoff: next + ':00' }));
    write({ p_roster_pm_cutoff: next }, () => setLocal((s) => ({ ...s, rosterPmCutoff: prev })));
  };

  const openCutoff = () => {
    if (!canEdit) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: timeToDate(local.rosterPmCutoff),
        mode: 'time',
        minuteInterval: 15,
        onValueChange: (_e, picked) => commitCutoff(picked),
      });
      return;
    }
    setCutoffDraft(timeToDate(local.rosterPmCutoff));
    setCutoffOpen(true);
  };

  const row = (opts: { iosIcon: string; androidIcon: string; title: string; sub: string; right: React.ReactNode }) => (
    <View style={[styles.row, { backgroundColor: colors.glass, borderColor: colors.glassBorder }, !canEdit && styles.rowLocked]}>
      <IconSymbol ios_icon_name={opts.iosIcon} android_material_icon_name={opts.androidIcon} size={18} color={canEdit ? colors.primary : colors.textSecondary} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{opts.title}</Text>
        <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{opts.sub}</Text>
      </View>
      {canEdit ? opts.right : (
        <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={16} color={colors.primary} />
      )}
    </View>
  );

  const sw = (value: boolean, onChange: (v: boolean) => void) => (
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={saving}
      trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
      thumbColor={colors.card}
    />
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onFullyClosed}
      title={t('schedule_settings.title')}
      subtitle={t('schedule_settings.subtitle')}
    >
      {row({
        iosIcon: 'person.3.fill', androidIcon: 'groups',
        title: t('schedule_settings.roster'), sub: t('schedule_settings.roster_sub'),
        right: sw(local.staffCanViewRoster, toggle('staffCanViewRoster', 'p_staff_can_view_roster')),
      })}
      {row({
        iosIcon: 'calendar.badge.minus', androidIcon: 'event-busy',
        title: t('schedule_settings.time_off'), sub: t('schedule_settings.time_off_sub'),
        right: sw(local.timeOffEnabled, toggle('timeOffEnabled', 'p_time_off_requests_enabled')),
      })}
      {row({
        iosIcon: 'arrow.left.arrow.right', androidIcon: 'swap-horiz',
        title: t('schedule_settings.release'), sub: t('schedule_settings.release_sub'),
        right: sw(local.shiftReleaseEnabled, toggle('shiftReleaseEnabled', 'p_shift_release_enabled')),
      })}
      <Pressable onPress={openCutoff} disabled={!canEdit}>
        {row({
          iosIcon: 'clock', androidIcon: 'schedule',
          title: t('schedule_settings.cutoff'), sub: t('schedule_settings.cutoff_sub'),
          right: (
            <View style={styles.valueWrap}>
              <Text style={[styles.value, { color: colors.primary }]}>{formatTime(local.rosterPmCutoff, locale)}</Text>
              <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={15} color={colors.textSecondary} />
            </View>
          ),
        })}
      </Pressable>
      <Text style={[styles.note, { color: colors.textSecondary }]}>
        {canEdit ? t('schedule_settings.note') : t('schedule_settings.locked_note')}
      </Text>

      {Platform.OS === 'ios' && (
        <GlassSheet
          visible={cutoffOpen}
          onClose={() => setCutoffOpen(false)}
          title={t('schedule_settings.cutoff')}
          scroll={false}
          footer={
            <View style={styles.footerRow}>
              <Pressable style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]} onPress={() => setCutoffOpen(false)}>
                <Text style={[styles.footerBtnLabel, { color: colors.text }]}>{t('common:cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.footerBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => {
                  commitCutoff(cutoffDraft);
                  setCutoffOpen(false);
                }}
              >
                <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>{t('content_editor.done')}</Text>
              </Pressable>
            </View>
          }
        >
          <View style={[styles.spinnerWrap, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <DateTimePicker
              value={cutoffDraft}
              mode="time"
              display="spinner"
              minuteInterval={15}
              themeVariant={isDark ? 'dark' : 'light'}
              locale={locale}
              onValueChange={(_e, picked) => setCutoffDraft(picked)}
              style={styles.spinner}
            />
          </View>
        </GlassSheet>
      )}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  rowLocked: { opacity: 0.72 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.display.semibold, fontSize: 14 },
  rowSub: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { fontFamily: fonts.mono.semibold, fontSize: 12.5 },
  note: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, paddingHorizontal: 2, marginTop: 2 },
  spinnerWrap: { borderRadius: 13, borderWidth: StyleSheet.hairlineWidth + 0.5, overflow: 'hidden', alignItems: 'center' },
  spinner: { width: '100%', height: 200 },
  footerRow: { flexDirection: 'row', gap: 11, paddingTop: 12 },
  footerBtn: { flex: 1, height: 47, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  footerBtnLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
