import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { FieldLabel, GlassTextInput } from '@/components/content/FormKit';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';
import { notifyTimeOffRequested } from '@/utils/schedule/notify';
import {
  addDays, daysBetween, formatDateRange, formatDayLead, formatTimeRange, localeFor, parseISODate, toISODate, todayISO,
} from '@/utils/schedule/format';
import { fonts } from '@/constants/fonts';

interface MyShift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[] | null;
}

/**
 * Request time off (s83, Steve's S1/S2): a mini month calendar (tap a day; tap a
 * later day for a range), an optional reason, then a Review pane in the SAME
 * sheet ("You're requesting off Sat, Sep 20 – Wed, Sep 23" + the quoted reason +
 * an honest line about shifts inside the range) and Submit to Manager →
 * request_time_off → the managers' shade row + push.
 */
export default function TimeOffSheet({ visible, onClose, onSubmitted }: { visible: boolean; onClose: () => void; onSubmitted?: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { language } = useLanguage();
  const { user } = useAuth();
  const locale = localeFor(language);

  const today = todayISO();
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'pick' | 'review'>('pick');
  const [submitting, setSubmitting] = useState(false);
  const [shifts, setShifts] = useState<MyShift[]>([]);

  useEffect(() => {
    if (!visible) return;
    const d = new Date();
    d.setDate(1);
    setCursor(d);
    setStart(null);
    setEnd(null);
    setReason('');
    setStep('pick');
    setSubmitting(false);
  }, [visible]);

  // my shifts across the visible month ± a week — the dots under the days
  useEffect(() => {
    if (!visible || !user?.id) return;
    const from = addDays(cursor, -7);
    const to = addDays(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), 7);
    let alive = true;
    supabase
      .rpc('get_my_shifts', { p_actor_id: user.id, p_start_date: toISODate(from), p_end_date: toISODate(to) })
      .then(({ data }) => {
        if (alive) setShifts((data || []) as MyShift[]);
      });
    return () => {
      alive = false;
    };
  }, [visible, user?.id, cursor]);

  const shiftDays = useMemo(() => new Set(shifts.map((s) => s.shift_date)), [shifts]);

  const grid = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const lead = first.getDay(); // Sunday-first
    const cells: (string | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(toISODate(new Date(y, m, d)));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [cursor]);

  const tapDay = (iso: string) => {
    if (iso < today) return;
    if (!start || (start && end)) {
      setStart(iso);
      setEnd(null);
    } else if (iso > start) {
      setEnd(iso);
    } else {
      setStart(iso);
      setEnd(null);
    }
  };

  const inRange = (iso: string) => !!start && !!end && iso > start && iso < end;
  const rangeEnd = end ?? start;
  const conflicts = useMemo(
    () => (start ? shifts.filter((s) => s.shift_date >= start && s.shift_date <= (rangeEnd as string)).sort((a, b) => a.shift_date.localeCompare(b.shift_date)) : []),
    [shifts, start, rangeEnd]
  );

  const submit = async () => {
    if (!user?.id || !start) return;
    setSubmitting(true);
    try {
      const { data: requestId, error } = await supabase.rpc('request_time_off', {
        p_actor_id: user.id,
        p_start_date: start,
        p_end_date: rangeEnd,
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
      notifyTimeOffRequested({ id: user.id, name: user.name }, String(requestId), start, rangeEnd);
      onSubmitted?.();
      onClose();
    } catch (e: any) {
      Alert.alert(t('time_off.failed_title'), translateServerError(e, t('time_off.failed_msg')));
    } finally {
      setSubmitting(false);
    }
  };

  const monthLabel = cursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const dayHeads = useMemo(() => {
    const base = new Date(2026, 0, 4); // a Sunday
    return Array.from({ length: 7 }, (_, i) => addDays(base, i).toLocaleDateString(locale, { weekday: 'narrow' }));
  }, [locale]);

  const footer =
    step === 'pick' ? (
      <View style={styles.footer}>
        <Pressable style={[styles.btn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]} onPress={onClose}>
          <Text style={[styles.btnLabel, { color: colors.text }]}>{t('common:cancel')}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.primary, borderColor: colors.primary }, !start && { opacity: 0.5 }]}
          disabled={!start}
          onPress={() => setStep('review')}
        >
          <Text style={[styles.btnLabel, { color: colors.fireText }]}>{t('time_off.review')}</Text>
          <IconSymbol ios_icon_name="arrow.right" android_material_icon_name="arrow-forward" size={15} color={colors.fireText} />
        </Pressable>
      </View>
    ) : (
      <View style={styles.footer}>
        <Pressable style={[styles.btn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]} onPress={() => setStep('pick')} disabled={submitting}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={15} color={colors.text} />
          <Text style={[styles.btnLabel, { color: colors.text }]}>{t('time_off.back')}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.primary, borderColor: colors.primary }, submitting && { opacity: 0.6 }]}
          disabled={submitting}
          onPress={submit}
        >
          <IconSymbol ios_icon_name="paperplane.fill" android_material_icon_name="send" size={15} color={colors.fireText} />
          <Text style={[styles.btnLabel, { color: colors.fireText }]}>{submitting ? t('time_off.submitting') : t('time_off.submit')}</Text>
        </Pressable>
      </View>
    );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={step === 'pick' ? t('time_off.title') : t('time_off.review_title')}
      subtitle={step === 'pick' ? t('time_off.subtitle') : t('time_off.review_subtitle')}
      footer={footer}
    >
      {step === 'pick' ? (
        <>
          <View style={[styles.cal, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <View style={styles.calNav}>
              <Pressable style={[styles.calBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
                <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={14} color={colors.text} />
              </Pressable>
              <Text style={[styles.month, { color: colors.text }]}>{monthLabel}</Text>
              <Pressable style={[styles.calBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
                <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={14} color={colors.text} />
              </Pressable>
            </View>
            <View style={styles.grid}>
              {dayHeads.map((h, i) => (
                <Text key={'h' + i} style={[styles.dh, { color: colors.textSecondary }]}>{h}</Text>
              ))}
              {grid.map((iso, i) => {
                if (!iso) return <View key={'b' + i} style={styles.cell} />;
                const past = iso < today;
                const sel = iso === start || iso === rangeEnd;
                const mid = inRange(iso);
                const isToday = iso === today;
                return (
                  <Pressable
                    key={iso}
                    onPress={() => tapDay(iso)}
                    disabled={past}
                    style={[
                      styles.cell,
                      mid && { backgroundColor: colors.primary + '2E', borderRadius: 0 },
                      sel && { backgroundColor: colors.primary },
                      isToday && !sel && !mid && { borderWidth: 1, borderColor: colors.primary + '80' },
                    ]}
                  >
                    <Text style={[styles.dayNum, { color: sel ? colors.fireText : mid ? colors.primary : colors.text }, past && { opacity: 0.3 }]}>
                      {parseISODate(iso).getDate()}
                    </Text>
                    {shiftDays.has(iso) && !sel && <View style={[styles.dot, { backgroundColor: colors.textSecondary }]} />}
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('time_off.dots_hint')}</Text>
          </View>
          <View>
            <FieldLabel label={t('time_off.reason')} trailing={t('time_off.optional')} />
            <GlassTextInput
              value={reason}
              onChangeText={setReason}
              placeholder={t('time_off.reason_ph')}
              multiline
              maxLength={500}
              style={{ minHeight: 76 }}
            />
          </View>
        </>
      ) : (
        <>
          <View style={[styles.review, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>{t('time_off.you_request')}</Text>
            <Text style={[styles.big, { color: colors.text }]}>{start ? formatDateRange(start, rangeEnd, locale) : ''}</Text>
            <Text style={[styles.small, { color: colors.textSecondary }]}>
              {start && rangeEnd ? t('time_off.days_count', { n: daysBetween(start, rangeEnd) }) : ''}
              {conflicts.length ? ` · ${t('time_off.scheduled_days', { n: conflicts.length })}` : ''}
            </Text>
            {!!reason.trim() && <Text style={[styles.quote, { color: colors.textSecondary, borderLeftColor: colors.primary + '60' }]}>“{reason.trim()}”</Text>}
          </View>
          {conflicts.length > 0 && (
            <View style={[styles.info, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <IconSymbol ios_icon_name="info.circle" android_material_icon_name="info" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoTitle, { color: colors.text }]}>{t('time_off.conflict_title')}</Text>
                <Text style={[styles.infoBody, { color: colors.textSecondary }]}>{t('time_off.conflict_body')}</Text>
                {conflicts.slice(0, 4).map((s) => (
                  <Text key={s.id} style={[styles.conflictLine, { color: colors.textSecondary }]}>
                    {formatDayLead(s.shift_date, locale)} · {formatTimeRange(s.start_time, s.end_time, locale)}{s.roles && s.roles.length ? ` · ${s.roles[0]}` : ''}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  cal: { borderRadius: 16, padding: 12, borderWidth: StyleSheet.hairlineWidth + 0.5 },
  calNav: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  calBtn: { width: 30, height: 30, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth + 0.5, alignItems: 'center', justifyContent: 'center' },
  month: { flex: 1, textAlign: 'center', fontFamily: fonts.display.semibold, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dh: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  dayNum: { fontFamily: fonts.mono.semibold, fontSize: 12.5 },
  dot: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2 },
  hint: { fontFamily: fonts.body.regular, fontSize: 11, marginTop: 8 },
  review: { borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth + 0.5, alignItems: 'center' },
  eyebrow: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  big: { fontFamily: fonts.display.bold, fontSize: 22, letterSpacing: -0.3, marginTop: 6, textAlign: 'center' },
  small: { fontFamily: fonts.body.regular, fontSize: 12, marginTop: 2, textAlign: 'center' },
  quote: { alignSelf: 'stretch', marginTop: 10, paddingLeft: 10, borderLeftWidth: 2, fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 16, fontStyle: 'italic' },
  info: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth + 0.5, alignItems: 'flex-start' },
  infoTitle: { fontFamily: fonts.display.semibold, fontSize: 14 },
  infoBody: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  conflictLine: { fontFamily: fonts.mono.medium, fontSize: 11, marginTop: 4 },
  footer: { flexDirection: 'row', gap: 11, paddingTop: 12 },
  btn: { flex: 1, height: 47, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: StyleSheet.hairlineWidth + 0.5 },
  btnPrimary: { flex: 1.35 },
  btnLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
