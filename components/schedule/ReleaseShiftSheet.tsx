import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import ShiftRow from '@/components/schedule/ShiftRow';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';
import { notifyShiftReleased } from '@/utils/schedule/notify';
import { refreshAllScheduleAttention } from '@/hooks/useScheduleAttention';
import { scheduleHue } from '@/components/schedule/scheduleVisuals';
import { addDays, toISODate, todayISO } from '@/utils/schedule/format';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';

interface MyShift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[] | null;
  is_closer: boolean;
  is_opener: boolean;
  is_training: boolean;
  room_assignment: string | null;
}

interface MyRelease {
  release_id: string;
  shift_id: string;
  status: string;
  claimed_by_name: string | null;
}

/**
 * Release a shift (s83, Steve's S3): my upcoming shifts as ShiftRows with a
 * Release chip each; released rows show their state pill (open → tap to cancel,
 * claimed → awaiting approval). Releasing needs no approval; the pick-up does.
 * The same controls live on My Schedule's day cards — one grammar, two homes.
 */
export default function ReleaseShiftSheet({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged?: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { user } = useAuth();
  const gold = scheduleHue('pending', isDark);
  const [shifts, setShifts] = useState<MyShift[]>([]);
  const [releases, setReleases] = useState<Record<string, MyRelease>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const today = todayISO();
      const [shiftRes, relRes] = await Promise.all([
        supabase.rpc('get_my_shifts', { p_actor_id: user.id, p_start_date: today, p_end_date: toISODate(addDays(new Date(), 60)) }),
        supabase.rpc('get_my_shift_releases', { p_actor_id: user.id }),
      ]);
      setShifts(((shiftRes.data || []) as MyShift[]).filter((s) => s.shift_date >= today));
      const map: Record<string, MyRelease> = {};
      for (const r of (relRes.data || []) as MyRelease[]) {
        // the newest live row wins (a denied pick-up re-opens as a fresh open row)
        if (!map[r.shift_id] || (r.status === 'open' || r.status === 'claimed')) map[r.shift_id] = r;
      }
      setReleases(map);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const release = (s: MyShift) => {
    Alert.alert(t('release_sheet.confirm_title'), t('release_sheet.confirm_msg'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('release_sheet.release'),
        onPress: async () => {
          if (!user?.id) return;
          setBusyId(s.id);
          try {
            const { data: releaseId, error } = await supabase.rpc('release_shift', { p_actor_id: user.id, p_shift_id: s.id });
            if (error) throw error;
            notifyShiftReleased({ id: user.id, name: user.name }, String(releaseId), s);
            refreshAllScheduleAttention();
            onChanged?.();
            await load();
          } catch (e: any) {
            Alert.alert(t('release_sheet.failed_title'), translateServerError(e, t('release_sheet.failed_msg')));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const cancelRelease = (r: MyRelease) => {
    Alert.alert(t('release_sheet.cancel_title'), t('release_sheet.cancel_msg'), [
      { text: t('release_sheet.keep_open'), style: 'cancel' },
      {
        text: t('release_sheet.cancel_release'),
        style: 'destructive',
        onPress: async () => {
          if (!user?.id) return;
          setBusyId(r.shift_id);
          try {
            const { error } = await supabase.rpc('cancel_shift_release', { p_actor_id: user.id, p_release_id: r.release_id });
            if (error) throw error;
            refreshAllScheduleAttention();
            onChanged?.();
            await load();
          } catch (e: any) {
            Alert.alert(t('release_sheet.failed_title'), translateServerError(e, t('release_sheet.failed_msg')));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const trailing = (s: MyShift) => {
    const r = releases[s.id];
    const live = r && (r.status === 'open' || r.status === 'claimed') ? r : null;
    if (busyId === s.id) return <ActivityIndicator size="small" color={colors.primary} />;
    if (!live) {
      return (
        <Pressable onPress={() => release(s)} style={[styles.chip, { borderColor: colors.primary + '66', backgroundColor: colors.glass }]}>
          <Text style={[styles.chipText, { color: colors.primary }]}>{t('release_sheet.release')}</Text>
        </Pressable>
      );
    }
    const label = live.status === 'open' ? t('release_sheet.released_open') : t('release_sheet.awaiting');
    const pill = (
      <View style={[styles.pill, { backgroundColor: hexToRgba(gold, 0.16), borderColor: hexToRgba(gold, 0.34) }]}>
        <Text style={[styles.pillText, { color: gold }]} numberOfLines={1}>{label}</Text>
      </View>
    );
    return live.status === 'open' ? <Pressable onPress={() => cancelRelease(live)}>{pill}</Pressable> : pill;
  };

  const rows = useMemo(() => shifts, [shifts]);

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('release_sheet.title')}
      subtitle={t('release_sheet.subtitle')}
      footer={
        <View style={styles.footer}>
          <Pressable style={[styles.btn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]} onPress={onClose}>
            <Text style={[styles.btnLabel, { color: colors.text }]}>{t('content_editor.done')}</Text>
          </Pressable>
        </View>
      }
    >
      <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        {loading && !rows.length ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 18 }} />
        ) : rows.length ? (
          rows.map((s, i) => (
            // stacked: the role pill drops under the time so the control rides the
            // right edge on one row — shorter, and the time never truncates
            // (Steve's device round, s83)
            <ShiftRow key={s.id} shift={s} first={i === 0} stacked trailing={trailing(s)} />
          ))
        ) : (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('release_sheet.empty')}</Text>
        )}
      </View>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('release_sheet.hint')}</Text>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4, borderWidth: StyleSheet.hairlineWidth + 0.5 },
  chip: { height: 30, paddingHorizontal: 11, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth + 0.5, justifyContent: 'center' },
  chipText: { fontFamily: fonts.body.semibold, fontSize: 12 },
  pill: { height: 28, paddingHorizontal: 9, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth + 0.5, justifyContent: 'center', maxWidth: 130 },
  pillText: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 0.7, textTransform: 'uppercase' },
  empty: { fontFamily: fonts.body.regular, fontSize: 13, textAlign: 'center', paddingVertical: 18 },
  hint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, paddingHorizontal: 2 },
  footer: { flexDirection: 'row', paddingTop: 12 },
  btn: { flex: 1, height: 47, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth + 0.5 },
  btnLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
