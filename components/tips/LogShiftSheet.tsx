/**
 * The Log Shift sheet (s78 "Ledger sheet" lockdown): the big number IS the
 * entry field, chips for everything chippable, and one import row when TODAY's
 * checkout was calculated — otherwise plain Sales / Tipped-out fields. A day
 * that already has entries shows them as locked rows and this save ADDS a
 * shift (the doubles model: an entry belongs to a shift, the Journal rolls the
 * day up). Opened from the Journal with a day selected, it arrives PRE-DATED
 * to that day — the date row's arrows can still re-date it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTipsAccent } from '@/components/tips/useTipsAccent';
import { TIPS_VISUALS } from '@/components/tips/tipsVisuals';
import {
  ChipRow,
  MoneyField,
  TipsStepper,
  cleanMoneyText,
  formatMoney,
} from '@/components/tips/TipsBits';
import {
  SHIFT_SLOTS,
  WEATHER_KEYS,
  type CheckoutSnapshot,
  type ShiftEntry,
  type ShiftSlot,
  type WeatherKey,
  addDays,
  dateKey,
  deleteEntry,
  entriesForDay,
  entryTotalTips,
  makeEntryId,
  parseDateKey,
  saveEntry,
} from '@/utils/tips/journal';
import { loadStashedCheckout } from '@/utils/tips/checkoutPrefs';
import { fonts } from '@/constants/fonts';

export const WEATHER_ICONS: Record<WeatherKey, { ios: string; android: string }> = {
  sun: { ios: 'sun.max.fill', android: 'wb-sunny' },
  cloud: { ios: 'cloud.fill', android: 'cloud' },
  rain: { ios: 'cloud.rain.fill', android: 'water-drop' },
  snow: { ios: 'snowflake', android: 'ac-unit' },
  wind: { ios: 'wind', android: 'air' },
  cold: { ios: 'thermometer.snowflake', android: 'thermostat' },
  humid: { ios: 'humidity.fill', android: 'opacity' },
  hot: { ios: 'thermometer.sun.fill', android: 'whatshot' },
};

export default function LogShiftSheet({
  visible,
  initialDate,
  allEntries,
  editEntry,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** Local day key the sheet opens pre-dated to (the Journal's selected day). */
  initialDate: string;
  /**
   * The FULL journal — the sheet derives the current date's existing entries
   * itself, so re-dating with the arrows swaps the locked rows too (the smoke
   * bug: a fixed day-list followed the sheet to every other day).
   */
  allEntries: ShiftEntry[];
  /** Editing an existing entry instead of adding one. */
  editEntry?: ShiftEntry | null;
  onClose: () => void;
  onSaved: (entries: ShiftEntry[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const accent = useTipsAccent();

  const [date, setDate] = useState(initialDate);
  const [tipsText, setTipsText] = useState('');
  const [extraCashText, setExtraCashText] = useState('');
  const [salesText, setSalesText] = useState('');
  const [tippedOutText, setTippedOutText] = useState('');
  const [hours, setHours] = useState(0);
  const [tables, setTables] = useState(0);
  const [covers, setCovers] = useState(0);
  const [shift, setShift] = useState<ShiftSlot | null>(null);
  const [weather, setWeather] = useState<WeatherKey[]>([]);
  const [location, setLocation] = useState('');
  const [stash, setStash] = useState<CheckoutSnapshot | null>(null);
  const [imported, setImported] = useState(false);
  const [attachedCheckout, setAttachedCheckout] = useState<CheckoutSnapshot | null>(null);

  // Reset to the opening state each time the sheet shows.
  useEffect(() => {
    if (!visible) return;
    setDate(editEntry?.date ?? initialDate);
    setTipsText(editEntry ? trimMoney(editEntry.tips) : '');
    setExtraCashText(editEntry && editEntry.extraCashTips ? trimMoney(editEntry.extraCashTips) : '');
    setSalesText(editEntry?.sales ? trimMoney(editEntry.sales) : '');
    setTippedOutText(editEntry?.tippedOut ? trimMoney(editEntry.tippedOut) : '');
    setHours(editEntry?.hours ?? 0);
    setTables(editEntry?.tables ?? 0);
    setCovers(editEntry?.covers ?? 0);
    setShift(editEntry?.shift ?? null);
    setWeather(editEntry?.weather ?? []);
    setLocation(editEntry?.location ?? '');
    setImported(false);
    setAttachedCheckout(editEntry?.checkout ?? null);
  }, [visible, editEntry, initialDate]);

  // The import row only ever offers TODAY's settled checkout (locked contract).
  const todayKey = dateKey(new Date());
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    loadStashedCheckout(todayKey).then((snapshot) => {
      if (alive) setStash(snapshot);
    });
    return () => {
      alive = false;
    };
  }, [visible, todayKey]);

  const importable = !editEntry && !imported && date === todayKey && stash !== null;
  const showManualFields = !importable;

  const stashFacts = useMemo(() => {
    if (!stash) return null;
    if (stash.mode === 'solo' && stash.solo) {
      return {
        sales: stash.solo.inputs.sales,
        tippedOut: stash.solo.result.tipOutTotal,
        housePays: stash.solo.result.owesHouse ? null : Math.abs(stash.solo.result.tally),
      };
    }
    if (stash.mode === 'pooled' && stash.pooled) {
      const { result } = stash.pooled;
      return {
        sales: result.poolSales / result.serverCount,
        tippedOut: result.tipOutTotal / result.serverCount,
        housePays: result.owesHouse ? null : Math.abs(result.tallyPerServer),
      };
    }
    return null;
  }, [stash]);

  const applyImport = () => {
    if (!stash || !stashFacts) return;
    setSalesText(trimMoney(stashFacts.sales));
    setTippedOutText(trimMoney(stashFacts.tippedOut));
    // Take-home pre-fills only where the math can know it (the house paid out).
    if (stashFacts.housePays !== null && !tipsText) setTipsText(trimMoney(stashFacts.housePays));
    setAttachedCheckout(stash);
    setImported(true);
  };

  const shiftDate = (days: number) => setDate(dateKey(addDays(parseDateKey(date), days)));

  const tips = parseFloat(tipsText) || 0;
  const canSave = tipsText.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    const base: ShiftEntry = editEntry ?? {
      id: makeEntryId(),
      date,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tips: 0,
      extraCashTips: 0,
    };
    const entries = await saveEntry({
      ...base,
      date,
      tips,
      extraCashTips: parseFloat(extraCashText) || 0,
      sales: parseFloat(salesText) || undefined,
      tippedOut: parseFloat(tippedOutText) || undefined,
      hours: hours || undefined,
      tables: tables || undefined,
      covers: covers || undefined,
      shift: shift ?? undefined,
      weather: weather.length ? weather : undefined,
      location: location.trim() || undefined,
      checkout: attachedCheckout ?? undefined,
    });
    onSaved(entries);
    onClose();
  };

  const handleDelete = () => {
    if (!editEntry) return;
    Alert.alert(
      t('tips_checkouts.delete_confirm_title'),
      t('tips_checkouts.delete_confirm_msg'),
      [
        { text: t('tips_checkouts.delete_cancel'), style: 'cancel' },
        {
          text: t('tips_checkouts.delete_do'),
          style: 'destructive',
          onPress: async () => {
            const entries = await deleteEntry(editEntry.id);
            onSaved(entries);
            onClose();
          },
        },
      ],
    );
  };

  // Derived from the sheet's CURRENT date, so the arrows swap these rows too.
  const others = entriesForDay(allEntries, date).filter((e) => e.id !== editEntry?.id);
  const title = editEntry
    ? t('tips_checkouts.log_edit_title')
    : others.length > 0
      ? t('tips_checkouts.log_add_title')
      : t('tips_checkouts.log_title');

  const dateLabel = parseDateKey(date).toLocaleDateString(i18n.language === 'es' ? 'es' : 'en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
  });

  return (
    <GlassSheet visible={visible} onClose={onClose} title={title}>
      {/* Date row — pre-dated to the selected day, arrows re-date it. */}
      <View style={styles.dateRow}>
        <TouchableOpacity onPress={() => shiftDate(-1)} hitSlop={10} style={[styles.dateChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={15} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.dateText, { color: colors.text }]}>{dateLabel}</Text>
        <TouchableOpacity
          onPress={() => shiftDate(1)}
          hitSlop={10}
          disabled={date >= todayKey}
          style={[styles.dateChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }, date >= todayKey && styles.dateChipOff]}
        >
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={15} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* A double-in-progress: the day's other shifts, locked. */}
      {others.map((entry) => (
        <View key={entry.id} style={[styles.lockRow, { backgroundColor: `${accent}12`, borderColor: `${accent}33` }]}>
          <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={13} color={accent} />
          <Text style={[styles.lockText, { color: colors.text }]} numberOfLines={1}>
            {entry.shift ? t(`tips_checkouts.shift_${entry.shift}`) : t('tips_checkouts.log_saved_shift')}
          </Text>
          <Text style={[styles.lockValue, { color: colors.text }]}>{formatMoney(entryTotalTips(entry))}</Text>
        </View>
      ))}

      {/* The big number IS the field. */}
      <View style={styles.bigWrap}>
        <View style={[styles.bigLine, { borderBottomColor: `${accent}70` }]}>
          <Text style={[styles.bigCur, { color: colors.textSecondary }]}>$</Text>
          <TextInput
            style={[styles.bigInput, { color: accent }]}
            value={tipsText}
            onChangeText={(text) => setTipsText(cleanMoneyText(text))}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
          />
        </View>
        <Text style={[styles.bigUnder, { color: colors.textSecondary }]}>
          {t('tips_checkouts.log_tips_hint')}
        </Text>
      </View>

      {editEntry && (
        <View style={styles.fieldBlock}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.save_extra_cash')}</Text>
          <MoneyField value={extraCashText} onChangeText={setExtraCashText} />
        </View>
      )}

      {importable && stashFacts ? (
        <TouchableOpacity onPress={applyImport} style={[styles.importRow, { backgroundColor: `${accent}14`, borderColor: `${accent}44` }]}>
          <IconSymbol ios_icon_name="tray.and.arrow.down.fill" android_material_icon_name="download" size={15} color={accent} />
          <Text style={[styles.importText, { color: colors.text }]} numberOfLines={1}>
            {t('tips_checkouts.log_import')}
          </Text>
          <Text style={[styles.importFacts, { color: accent }]} numberOfLines={1}>
            {t('tips_checkouts.log_import_facts', {
              sales: formatMoney(stashFacts.sales),
              out: formatMoney(stashFacts.tippedOut),
            })}
          </Text>
        </TouchableOpacity>
      ) : null}

      {showManualFields && (
        <View style={styles.pairRow}>
          <View style={styles.pairCell}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.log_sales')}</Text>
            <MoneyField value={salesText} onChangeText={setSalesText} />
          </View>
          <View style={styles.pairCell}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.log_tipped_out')}</Text>
            <MoneyField value={tippedOutText} onChangeText={setTippedOutText} />
          </View>
        </View>
      )}

      <View style={styles.fieldBlock}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.field_shift')}</Text>
        <ChipRow
          options={SHIFT_SLOTS.map((slot) => ({ key: slot, label: t(`tips_checkouts.shift_${slot}`) }))}
          selectedKeys={shift ? [shift] : []}
          onToggle={(key) => setShift(shift === key ? null : (key as ShiftSlot))}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.field_weather')}</Text>
        <ChipRow
          options={WEATHER_KEYS.map((key) => ({
            key,
            label: t(`tips_checkouts.weather_${key}`),
            iosIcon: WEATHER_ICONS[key].ios,
            androidIcon: WEATHER_ICONS[key].android,
          }))}
          selectedKeys={weather}
          onToggle={(key) =>
            setWeather(
              weather.includes(key as WeatherKey)
                ? weather.filter((w) => w !== key)
                : [...weather, key as WeatherKey],
            )
          }
        />
      </View>

      <View style={styles.trioRow}>
        <View style={styles.trioCell}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.field_hours')}</Text>
          <TipsStepper value={hours} step={0.5} onChange={setHours} />
        </View>
        <View style={styles.trioCell}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.field_tables')}</Text>
          <TipsStepper value={tables} onChange={setTables} />
        </View>
        <View style={styles.trioCell}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.field_covers')}</Text>
          <TipsStepper value={covers} onChange={setCovers} />
        </View>
      </View>

      <View style={styles.fieldBlock}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.field_location')}</Text>
        <View style={[styles.locationField, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <IconSymbol ios_icon_name="mappin.and.ellipse" android_material_icon_name="place" size={15} color={colors.textSecondary} />
          <TextInput
            style={[styles.locationInput, { color: colors.text }]}
            value={location}
            onChangeText={setLocation}
            placeholder={t('tips_checkouts.field_location_ph')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      </View>

      <View style={styles.actionRow}>
        {editEntry && (
          <TouchableOpacity
            onPress={handleDelete}
            style={[styles.deleteBtn, { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.45)' }]}
          >
            <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={15} color="#EF4444" />
            <Text style={styles.deleteText}>{t('tips_checkouts.delete_entry')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleSave}
          disabled={!canSave}
          style={[styles.saveBtn, !canSave && styles.saveBtnOff]}
        >
          <LinearGradient
            colors={[TIPS_VISUALS.gradient[0], TIPS_VISUALS.gradient[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color="#FFFFFF" />
          <Text style={styles.saveText}>
            {editEntry ? t('tips_checkouts.log_save_edit') : t('tips_checkouts.log_save')}
          </Text>
        </TouchableOpacity>
      </View>
    </GlassSheet>
  );
}

function trimMoney(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  dateChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChipOff: { opacity: 0.35 },
  dateText: { fontFamily: fonts.body.semibold, fontSize: 13 },
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
  bigWrap: { alignItems: 'center', paddingVertical: 4 },
  bigLine: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    paddingBottom: 2,
    paddingHorizontal: 10,
  },
  bigCur: { fontFamily: fonts.mono.semibold, fontSize: 22, marginRight: 2 },
  bigInput: {
    fontFamily: fonts.mono.semibold,
    fontSize: 38,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    minWidth: 130,
    textAlign: 'center',
    paddingVertical: 0,
  },
  bigUnder: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 11,
  },
  importText: { flexShrink: 1, fontFamily: fonts.body.semibold, fontSize: 12 },
  importFacts: {
    marginLeft: 'auto',
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
    fontVariant: ['tabular-nums'],
  },
  pairRow: { flexDirection: 'row', gap: 8 },
  pairCell: { flex: 1, gap: 6 },
  trioRow: { flexDirection: 'row', gap: 7 },
  trioCell: { flex: 1, gap: 6 },
  fieldBlock: { gap: 6 },
  fieldLabel: { fontFamily: fonts.body.semibold, fontSize: 12 },
  locationField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
  },
  locationInput: { flex: 1, fontFamily: fonts.body.medium, fontSize: 13, height: 46, paddingVertical: 0 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 13,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  deleteText: { fontFamily: fonts.body.semibold, fontSize: 13.5, color: '#EF4444' },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 13,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  saveBtnOff: { opacity: 0.5 },
  saveText: { fontFamily: fonts.body.semibold, fontSize: 15, color: '#FFFFFF' },
});
