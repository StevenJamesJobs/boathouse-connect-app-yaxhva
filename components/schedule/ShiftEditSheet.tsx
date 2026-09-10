import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Alert, ScrollView } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import GlassActionSheet from '@/components/GlassActionSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { FieldLabel, GlassTextInput, SelectRow, Hint } from '@/components/content/FormKit';
import EmployeePickerSheet, { type PickedEmployee } from '@/components/schedule/EmployeePickerSheet';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';
import { localeFor, toISODate, toTimeParam, timeToDate, parseISODate } from '@/utils/schedule/format';
import { fonts } from '@/constants/fonts';

export interface ShiftLike {
  id: string;
  upload_id?: string;
  user_id: string | null;
  employee_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[];
  is_closer: boolean;
  is_opener: boolean;
  is_training: boolean;
  room_assignment: string | null;
}

export interface ShiftEditSheetProps {
  visible: boolean;
  mode: 'add' | 'edit';
  /** required when mode === 'edit' */
  shift?: ShiftLike;
  /** add mode: who the shift belongs to (prefilled, lockable) */
  employeeName?: string;
  userId?: string | null;
  /** add mode: attach to this upload; omitted = the server finds/creates the week's Manual Entry upload */
  uploadId?: string;
  defaultDate?: Date;
  /** the employee row can't be changed (adding from an employee's own card) */
  lockEmployee?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

/**
 * ShiftEditSheet (s83) — the GlassSheet replacement for the old pageSheet
 * ShiftEditForm, shared by Schedules, Review and Roster. Employee (nested
 * picker) · Role chips from the org's own job titles · Date · Start / End (the
 * DateTimeField picker grammar: iOS nested spinner sheet, Android dialogs) ·
 * Opener / Closer / Training tags (opener ↔ closer exclusive) · Section / Room
 * (room_assignment finally has a control). Delete lives ONLY in the ⋯ red row.
 */
export default function ShiftEditSheet({
  visible,
  mode,
  shift,
  employeeName,
  userId,
  uploadId,
  defaultDate,
  lockEmployee = false,
  onClose,
  onSaved,
  onDeleted,
}: ShiftEditSheetProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { language } = useLanguage();
  const { user } = useAuth();
  const locale = localeFor(language);

  const [name, setName] = useState('');
  const [empId, setEmpId] = useState<string | null>(null);
  const [date, setDate] = useState<Date>(new Date());
  const [start, setStart] = useState<Date>(timeToDate('16:30'));
  const [end, setEnd] = useState<Date>(timeToDate('22:00'));
  const [role, setRole] = useState<string>('');
  const [opener, setOpener] = useState(false);
  const [closer, setCloser] = useState(false);
  const [training, setTraining] = useState(false);
  const [room, setRoom] = useState('');
  const [titles, setTitles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [ios, setIos] = useState<{ mode: 'date' | 'time'; field: 'date' | 'start' | 'end' } | null>(null);
  const [draft, setDraft] = useState<Date>(new Date());

  // seed on open
  useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && shift) {
      setName(shift.employee_name);
      setEmpId(shift.user_id);
      setDate(parseISODate(shift.shift_date));
      setStart(timeToDate(shift.start_time));
      setEnd(timeToDate(shift.end_time));
      setRole(shift.roles?.[0] ?? '');
      setOpener(!!shift.is_opener);
      setCloser(!!shift.is_closer);
      setTraining(!!shift.is_training);
      setRoom(shift.room_assignment ?? '');
    } else {
      setName(employeeName ?? '');
      setEmpId(userId ?? null);
      setDate(defaultDate ?? new Date());
      setStart(timeToDate('16:30'));
      setEnd(timeToDate('22:00'));
      setRole('');
      setOpener(false);
      setCloser(false);
      setTraining(false);
      setRoom('');
    }
    setMoreOpen(false);
    setPickerOpen(false);
    setIos(null);
  }, [visible, mode, shift, employeeName, userId, defaultDate]);

  // the org's job titles feed the role chips (the shift's stored role joins the set)
  useEffect(() => {
    if (!visible || !user?.id) return;
    let alive = true;
    supabase.rpc('get_org_job_titles', { p_actor_id: user.id }).then(({ data }) => {
      if (!alive) return;
      setTitles((data || []).filter((r) => r.is_active !== false).map((r) => r.title));
    });
    return () => {
      alive = false;
    };
  }, [visible, user?.id]);

  const roleOptions = useMemo(() => {
    const set = new Set(titles);
    if (role && !set.has(role)) set.add(role);
    if (!set.size) ['Server', 'Bartender', 'Host'].forEach((r) => set.add(r));
    return Array.from(set);
  }, [titles, role]);

  const openPicker = (field: 'date' | 'start' | 'end') => {
    const pickMode = field === 'date' ? 'date' : 'time';
    const current = field === 'date' ? date : field === 'start' ? start : end;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: pickMode,
        minuteInterval: 5,
        onValueChange: (_e, picked) => commit(field, picked),
      });
      return;
    }
    setDraft(current);
    setIos({ mode: pickMode, field });
  };

  const commit = (field: 'date' | 'start' | 'end', picked: Date) => {
    if (field === 'date') setDate(picked);
    else if (field === 'start') setStart(picked);
    else setEnd(picked);
  };

  const save = async () => {
    if (!user?.id) return;
    if (!name.trim()) {
      Alert.alert(t('shift_edit.need_employee_title'), t('shift_edit.need_employee_msg'));
      return;
    }
    setSaving(true);
    try {
      const common = {
        p_actor_id: user.id,
        p_employee_name: name.trim(),
        p_shift_date: toISODate(date),
        p_start_time: toTimeParam(start),
        p_end_time: toTimeParam(end),
        p_roles: role ? [role] : [],
        p_is_opener: opener,
        p_is_closer: closer,
        p_is_training: training,
        p_room_assignment: room.trim() || null,
      };
      if (mode === 'edit' && shift) {
        const { error } = await supabase.rpc('update_shift', { ...common, p_shift_id: shift.id, p_user_id: empId ?? undefined } as any);
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('add_shift', { ...common, p_upload_id: uploadId, p_user_id: empId ?? undefined } as any);
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert(t('shift_edit.save_failed_title'), translateServerError(e, t('shift_edit.save_failed_msg')));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!shift || !user?.id) return;
    Alert.alert(t('shift_edit.delete_title'), t('shift_edit.delete_msg'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('shift_edit.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.rpc('delete_shift', { p_actor_id: user.id, p_shift_id: shift.id });
            if (error) throw error;
            onDeleted?.();
            onSaved();
            onClose();
          } catch (e: any) {
            Alert.alert(t('shift_edit.save_failed_title'), translateServerError(e, t('shift_edit.save_failed_msg')));
          }
        },
      },
    ]);
  };

  const chip = (label: string, on: boolean, onPress: () => void, key?: string) => (
    <Pressable
      key={key ?? label}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        on && { backgroundColor: colors.primary + '24', borderColor: colors.primary + '80' },
      ]}
    >
      <Text style={[styles.chipText, { color: on ? colors.primary : colors.text }]}>{label}</Text>
    </Pressable>
  );

  const pickerRow = (field: 'date' | 'start' | 'end', value: Date, label: string, iosIcon: string, androidIcon: string) => (
    <View style={styles.field}>
      <FieldLabel label={label} />
      <Pressable onPress={() => openPicker(field)} style={[styles.pickRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={16} color={colors.primary} />
        <Text style={[field === 'date' ? styles.pickDate : styles.pickTime, { color: colors.text }]} numberOfLines={1}>
          {field === 'date'
            ? value.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
            : value.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={mode === 'edit' ? t('shift_edit.title_edit') : t('shift_edit.title_add')}
      subtitle={mode === 'edit' && shift ? shift.employee_name : undefined}
      headerAction={
        mode === 'edit' ? (
          <Pressable onPress={() => setMoreOpen(true)} style={styles.more} hitSlop={6}>
            <IconSymbol ios_icon_name="ellipsis" android_material_icon_name="more-horiz" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : undefined
      }
      footer={
        <View style={styles.footer}>
          <Pressable style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]} onPress={onClose} disabled={saving}>
            <Text style={[styles.footerLabel, { color: colors.text }]}>{t('common:cancel')}</Text>
          </Pressable>
          <Pressable
            style={[styles.footerBtn, styles.footerPrimary, { backgroundColor: colors.primary, borderColor: colors.primary }, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            <Text style={[styles.footerLabel, { color: colors.fireText }]}>
              {saving ? t('shift_edit.saving') : mode === 'edit' ? t('shift_edit.save') : t('shift_edit.add')}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.field}>
        <FieldLabel label={t('shift_edit.employee')} trailing={lockEmployee ? undefined : t('shift_edit.tap_to_change')} />
        <SelectRow
          iosIcon="person.fill"
          androidIcon="person"
          iconColor={colors.primary}
          value={name}
          placeholder={t('shift_edit.pick_employee')}
          onPress={() => {
            if (!lockEmployee) setPickerOpen(true);
          }}
        />
        {!empId && !!name && <Hint>{t('shift_edit.unmatched_hint')}</Hint>}
      </View>

      <View style={styles.field}>
        <FieldLabel label={t('shift_edit.role')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {roleOptions.map((r) => chip(r, role === r, () => setRole(role === r ? '' : r), r))}
        </ScrollView>
      </View>

      {pickerRow('date', date, t('shift_edit.date'), 'calendar', 'event')}
      <View style={styles.two}>
        <View style={styles.twoItem}>{pickerRow('start', start, t('shift_edit.start'), 'clock', 'schedule')}</View>
        <View style={styles.twoItem}>{pickerRow('end', end, t('shift_edit.end'), 'clock.fill', 'schedule')}</View>
      </View>

      <View style={styles.field}>
        <FieldLabel label={t('shift_edit.tags')} />
        <View style={styles.chipRowWrap}>
          {chip(t('schedule_common.opener'), opener, () => { setOpener(!opener); if (!opener) setCloser(false); }, 'opener')}
          {chip(t('schedule_common.closer'), closer, () => { setCloser(!closer); if (!closer) setOpener(false); }, 'closer')}
          {chip(t('schedule_common.training'), training, () => setTraining(!training), 'training')}
        </View>
      </View>

      <View style={styles.field}>
        <FieldLabel label={t('shift_edit.section')} trailing={t('shift_edit.optional')} />
        <GlassTextInput value={room} onChangeText={setRoom} placeholder={t('shift_edit.section_ph')} autoCapitalize="words" maxLength={40} />
      </View>

      <EmployeePickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedId={empId}
        filterRole={role || null}
        onSelect={(emp: PickedEmployee | null) => {
          if (emp) {
            setEmpId(emp.id);
            setName(emp.name);
          }
          setPickerOpen(false);
        }}
      />

      <GlassActionSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={t('shift_edit.more_title')}
        actions={[
          { key: 'delete', label: t('shift_edit.delete'), iosIcon: 'trash', androidIcon: 'delete', destructive: true, onPress: confirmDelete },
        ]}
      />

      {Platform.OS === 'ios' && (
        <GlassSheet
          visible={!!ios}
          onClose={() => setIos(null)}
          title={ios?.field === 'date' ? t('shift_edit.date') : ios?.field === 'start' ? t('shift_edit.start') : t('shift_edit.end')}
          scroll={false}
          footer={
            <View style={styles.footer}>
              <Pressable style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]} onPress={() => setIos(null)}>
                <Text style={[styles.footerLabel, { color: colors.text }]}>{t('common:cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.footerBtn, styles.footerPrimary, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => {
                  if (ios) commit(ios.field, new Date(draft));
                  setIos(null);
                }}
              >
                <Text style={[styles.footerLabel, { color: colors.fireText }]}>{t('content_editor.done')}</Text>
              </Pressable>
            </View>
          }
        >
          <View style={[styles.spinnerWrap, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            {!!ios && (
              <DateTimePicker
                value={draft}
                mode={ios.mode}
                display="spinner"
                minuteInterval={5}
                themeVariant={isDark ? 'dark' : 'light'}
                locale={locale}
                onValueChange={(_e, picked) => setDraft(picked)}
                style={styles.spinner}
              />
            )}
          </View>
        </GlassSheet>
      )}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  field: { gap: 0 },
  two: { flexDirection: 'row', gap: 10 },
  twoItem: { flex: 1, minWidth: 0 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 43,
    borderRadius: 13,
    paddingHorizontal: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  pickDate: { flex: 1, fontFamily: fonts.body.medium, fontSize: 14 },
  pickTime: { flex: 1, fontFamily: fonts.mono.medium, fontSize: 13, fontVariant: ['tabular-nums'] },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth + 0.5 },
  chipText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  more: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: 11, paddingTop: 12 },
  footerBtn: { flex: 1, height: 47, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  footerPrimary: { flex: 1.35 },
  footerLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
  spinnerWrap: { borderRadius: 13, borderWidth: StyleSheet.hairlineWidth + 0.5, overflow: 'hidden', alignItems: 'center' },
  spinner: { width: '100%', height: 200 },
});
