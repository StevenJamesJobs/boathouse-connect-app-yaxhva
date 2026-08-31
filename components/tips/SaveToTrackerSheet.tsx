/**
 * Save to Tips Tracker (s78 lockdown): the review sheet after a settled
 * checkout. Everything the checkout knows arrives as locked rows; the sheet
 * asks only what it can't know — tips in pocket (pre-filled where the math CAN
 * know it: the house paid out) plus Steve's round-3 field, "Extra cash tips"
 * (table cash the checkout never saw). The two SUM into the day's tips — the
 * number the Journal and graphs count — and both parts are kept on the entry.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTipsAccent } from '@/components/tips/useTipsAccent';
import { MoneyField, TipsStepper, formatMoney } from '@/components/tips/TipsBits';
import {
  type CheckoutSnapshot,
  type ShiftEntry,
  type ShiftSlot,
  type WeatherKey,
  makeEntryId,
  saveEntry,
} from '@/utils/tips/journal';
import { fonts } from '@/constants/fonts';

export interface CheckoutFacts {
  sales: number;
  tippedOut: number;
  /** What the house hands the server tonight; null when the server owes. */
  housePays: number | null;
}

export interface CheckoutExtras {
  shift: ShiftSlot | null;
  weather: WeatherKey[];
  tables: number;
  covers: number;
  location: string;
}

export default function SaveToTrackerSheet({
  visible,
  date,
  facts,
  extras,
  snapshot,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** Local day key the entry files under. */
  date: string;
  facts: CheckoutFacts;
  extras: CheckoutExtras;
  snapshot: CheckoutSnapshot;
  onClose: () => void;
  onSaved: (entries: ShiftEntry[]) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const accent = useTipsAccent();

  const [tipsText, setTipsText] = useState('');
  const [extraCashText, setExtraCashText] = useState('');
  const [hours, setHours] = useState(0);
  const [covers, setCovers] = useState(extras.covers);

  useEffect(() => {
    if (!visible) return;
    setTipsText(facts.housePays !== null ? String(Math.round(facts.housePays * 100) / 100) : '');
    setExtraCashText('');
    setHours(0);
    setCovers(extras.covers);
  }, [visible, facts.housePays, extras.covers]);

  const tips = parseFloat(tipsText) || 0;
  const extraCash = parseFloat(extraCashText) || 0;
  const dayTotal = tips + extraCash;
  const canSave = tipsText.trim().length > 0;

  const extrasSummary = [
    extras.shift ? t(`tips_checkouts.shift_${extras.shift}`) : null,
    ...extras.weather.map((key) => t(`tips_checkouts.weather_${key}`)),
    extras.tables ? t('tips_checkouts.save_tables_n', { n: extras.tables }) : null,
    extras.covers ? t('tips_checkouts.save_covers_n', { n: extras.covers }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const handleSave = async () => {
    if (!canSave) return;
    const entries = await saveEntry({
      id: makeEntryId(),
      date,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tips,
      extraCashTips: extraCash,
      sales: facts.sales || undefined,
      tippedOut: facts.tippedOut || undefined,
      hours: hours || undefined,
      tables: extras.tables || undefined,
      covers: covers || undefined,
      shift: extras.shift ?? undefined,
      weather: extras.weather.length ? extras.weather : undefined,
      location: extras.location.trim() || undefined,
      checkout: snapshot,
    });
    onSaved(entries);
    onClose();
  };

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('tips_checkouts.save_title')}
      subtitle={t('tips_checkouts.save_subtitle')}
    >
      <LockedRow label={t('tips_checkouts.log_sales')} value={formatMoney(facts.sales)} accent={accent} />
      <LockedRow label={t('tips_checkouts.log_tipped_out')} value={formatMoney(facts.tippedOut)} accent={accent} />
      {!!extrasSummary && <LockedRow label={extrasSummary} value="" accent={accent} />}

      <View style={styles.pairRow}>
        <View style={styles.pairCell}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.save_tips_home')}</Text>
          <MoneyField value={tipsText} onChangeText={setTipsText} />
        </View>
        <View style={styles.pairCell}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.save_extra_cash')}</Text>
          <MoneyField value={extraCashText} onChangeText={setExtraCashText} />
        </View>
      </View>

      <View style={styles.pairRow}>
        <View style={styles.pairCell}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.field_hours')}</Text>
          <TipsStepper value={hours} step={0.5} onChange={setHours} />
        </View>
        <View style={styles.pairCell}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.field_covers')}</Text>
          <TipsStepper value={covers} onChange={setCovers} />
        </View>
      </View>

      <View style={[styles.totalRow, { backgroundColor: `${accent}16`, borderColor: `${accent}4D` }]}>
        <Text style={[styles.totalLabel, { color: accent }]}>{t('tips_checkouts.save_day_total')}</Text>
        <Text style={[styles.totalValue, { color: accent }]}>{formatMoney(dayTotal)}</Text>
      </View>

      <TouchableOpacity
        onPress={handleSave}
        disabled={!canSave}
        style={[styles.saveBtn, !canSave && styles.saveBtnOff]}
      >
        <IconSymbol ios_icon_name="tray.and.arrow.down.fill" android_material_icon_name="download" size={16} color="#1A1204" />
        <Text style={styles.saveText}>{t('tips_checkouts.save_cta')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} style={[styles.laterBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <Text style={[styles.laterText, { color: colors.text }]}>{t('tips_checkouts.save_later')}</Text>
      </TouchableOpacity>
    </GlassSheet>
  );
}

function LockedRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.lockRow, { backgroundColor: `${accent}12`, borderColor: `${accent}33` }]}>
      <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={13} color={accent} />
      <Text style={[styles.lockText, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {!!value && <Text style={[styles.lockValue, { color: colors.text }]}>{value}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 11,
  },
  lockText: { flex: 1, fontFamily: fonts.body.medium, fontSize: 12 },
  lockValue: { fontFamily: fonts.mono.semibold, fontSize: 12, fontVariant: ['tabular-nums'] },
  pairRow: { flexDirection: 'row', gap: 8 },
  pairCell: { flex: 1, gap: 6 },
  fieldLabel: { fontFamily: fonts.body.semibold, fontSize: 12 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  totalLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  totalValue: { fontFamily: fonts.mono.semibold, fontSize: 15, fontVariant: ['tabular-nums'] },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 13,
    paddingVertical: 14,
    backgroundColor: '#F59E0B',
    marginTop: 2,
  },
  saveBtnOff: { opacity: 0.5 },
  saveText: { fontFamily: fonts.body.semibold, fontSize: 15, color: '#1A1204' },
  laterBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: 'center',
  },
  laterText: { fontFamily: fonts.body.semibold, fontSize: 13 },
});
