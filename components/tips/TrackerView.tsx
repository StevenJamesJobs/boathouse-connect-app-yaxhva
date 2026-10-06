/**
 * The Tips Tracker (s78 lockdown): the Console dashboard — KPI tiles + the
 * period chart with Log Shift / Journal moved UP under the tabs (small-phone
 * reach) — and the Ledger Journal that swaps IN PLACE: the Journal button
 * becomes Dashboard to swap back, a selected day shows its entries (a double =
 * two entries under one day total), and an empty day offers "Add a shift for
 * that day" pre-dated to it. Chart scopes per the locked mapping: WK = 7
 * nights (ghost = last week) · MO = day-by-day · 3M = 13 weeks · YR = 12
 * months (ghost = last year). All data is the on-device journal.
 *
 * PAYCHECKS (s89 "G", J-B): a payday is a journal entry of its own kind. It
 * counts in the period total and the chart (stacked as the OUTLINED emerald
 * segment above the tips bar), never in shift count, $/hr, tip average, best
 * day or the "a double" label. The Journal's dashed add row splits into
 * "Add a shift" / "Add a paycheck"; the top Log Shift button stays shift-only.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useFocusEffect } from "expo-router/react-navigation";
import { LinearGradient } from 'expo-linear-gradient';
import GlassCard from '@/components/GlassCard';
import GameToast from '@/components/game/GameToast';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useJournalAccent, useTipsAccent } from '@/components/tips/useTipsAccent';
import { TIPS_PAYCHECK, TIPS_VISUALS } from '@/components/tips/tipsVisuals';
import LogShiftSheet, { WEATHER_ICONS } from '@/components/tips/LogShiftSheet';
import CheckoutDetailSheet from '@/components/tips/CheckoutDetailSheet';
import { formatMoney } from '@/components/tips/TipsBits';
import {
  type CheckoutSnapshot,
  type DayRollup,
  type EntryKind,
  type ShiftEntry,
  type TrackerPeriod,
  addDays,
  chartBars,
  dateKey,
  entriesForDay,
  entryTotalTips,
  isPaycheck,
  loadEntries,
  parseDateKey,
  periodRange,
  rollupByDay,
  summarizeRange,
} from '@/utils/tips/journal';
import { fonts } from '@/constants/fonts';

const CHART_H = 74;
const PERIODS: TrackerPeriod[] = ['week', 'month', 'quarter', 'year'];

export default function TrackerView({ active }: { active: boolean }) {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const accent = useTipsAccent();
  const journalAccent = useJournalAccent();
  const locale = i18n.language === 'es' ? 'es' : 'en-US';

  const [entries, setEntries] = useState<ShiftEntry[]>([]);
  const [mode, setMode] = useState<'dash' | 'journal'>('dash');
  const [period, setPeriod] = useState<TrackerPeriod>('week');
  /** 0 = the current period; each ◀ steps one period back (chart card only). */
  const [chartOffset, setChartOffset] = useState(0);
  const todayKey = dateKey(new Date());
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [logSheet, setLogSheet] = useState<{
    open: boolean;
    date: string;
    edit: ShiftEntry | null;
    /** What a NEW entry from this opener is; an edit opens as its own kind. */
    mode: EntryKind;
  }>({
    open: false,
    date: todayKey,
    edit: null,
    mode: 'shift',
  });
  const [detailSnapshot, setDetailSnapshot] = useState<CheckoutSnapshot | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadEntries().then(setEntries);
  }, []);

  useEffect(() => {
    if (active) reload();
  }, [active, reload]);
  useFocusEffect(
    useCallback(() => {
      if (active) reload();
    }, [active, reload]),
  );

  const today = new Date();
  const range = useMemo(() => periodRange(period, today), [period, todayKey]);
  const summary = useMemo(() => summarizeRange(entries, range.from, range.to), [entries, range]);
  const prevSummary = useMemo(
    () => summarizeRange(entries, range.prevFrom, range.prevTo),
    [entries, range],
  );
  // The chart pages back through earlier periods on its own (◀ ▶ bumpers);
  // the KPI tiles stay pinned to the CURRENT period.
  const chartRef = useMemo(
    () => shiftPeriodRef(period, chartOffset, today),
    [period, chartOffset, todayKey],
  );
  const chartRange = useMemo(() => periodRange(period, chartRef), [period, chartRef]);
  const chartSummary = useMemo(
    () => summarizeRange(entries, chartRange.from, chartRange.to),
    [entries, chartRange],
  );
  const chartPrevSummary = useMemo(
    () => summarizeRange(entries, chartRange.prevFrom, chartRange.prevTo),
    [entries, chartRange],
  );
  const bars = useMemo(() => chartBars(entries, period, chartRef), [entries, period, chartRef]);
  const hasPaydayBar = bars.some((b) => b.paychecks > 0);
  const hasGhost = bars.some((b) => b.prevTips !== null);

  const dayRollups = useMemo(() => rollupByDay(entries), [entries]);
  const selectedEntries = useMemo(() => entriesForDay(entries, selectedDay), [entries, selectedDay]);

  const openLog = (date: string, edit: ShiftEntry | null = null, mode: EntryKind = 'shift') =>
    setLogSheet({ open: true, date, edit, mode });

  const onLogSaved = (next: ShiftEntry[]) => {
    setEntries(next);
    setToast(t('tips_checkouts.toast_saved'));
  };

  const tipsDelta = prevSummary.tips > 0 ? (summary.tips - prevSummary.tips) / prevSummary.tips : null;

  return (
    <View>
      {/* Log Shift + Journal live RIGHT under the tabs (Steve's move order). */}
      <View style={styles.topRow}>
        <TouchableOpacity
          onPress={() => openLog(mode === 'journal' ? selectedDay : todayKey)}
          style={[styles.topBtn, { borderColor: `${accent}66`, backgroundColor: `${accent}14` }]}
        >
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={14} color={accent} />
          <Text style={[styles.topBtnText, { color: accent }]}>{t('tips_checkouts.log_shift')}</Text>
        </TouchableOpacity>
        {/* Its own indigo, so it stands apart from the emerald and the greys
            (Steve's punch-round call), and it always names the OTHER view. */}
        <TouchableOpacity
          onPress={() => setMode(mode === 'dash' ? 'journal' : 'dash')}
          style={[
            styles.topBtn,
            { borderColor: `${journalAccent}66`, backgroundColor: `${journalAccent}14` },
            mode === 'journal' && { borderColor: journalAccent, backgroundColor: `${journalAccent}22` },
          ]}
        >
          <IconSymbol
            ios_icon_name={mode === 'dash' ? 'calendar' : 'chart.bar.fill'}
            android_material_icon_name={mode === 'dash' ? 'event' : 'bar-chart'}
            size={14}
            color={journalAccent}
          />
          <Text style={[styles.topBtnText, { color: journalAccent }]}>
            {mode === 'dash' ? t('tips_checkouts.journal') : t('tips_checkouts.dashboard')}
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'dash' ? (
        <>
          <View style={styles.periodRow}>
            {PERIODS.map((p) => {
              const on = p === period;
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => {
                    setPeriod(p);
                    setChartOffset(0);
                  }}
                  style={[
                    styles.periodChip,
                    { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                    on && { backgroundColor: `${accent}16`, borderColor: `${accent}70` },
                  ]}
                >
                  <Text style={[styles.periodText, { color: on ? accent : colors.textSecondary }]}>
                    {t(`tips_checkouts.period_${p}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* KPI tiles — explicit pair rows, never a percentage wrap grid. */}
          <View style={styles.kpiRow}>
            {/* The total is all-in; with a payday in range the detail line
                becomes the Tips · Paycheck split (mockup D) so the number's
                two parts are always visible. */}
            <Kpi
              iosIcon="dollarsign.circle.fill"
              androidIcon="attach-money"
              label={t(`tips_checkouts.kpi_total_${period}`)}
              value={moneyWhole(summary.total)}
              detail={
                tipsDelta !== null
                  ? t('tips_checkouts.kpi_vs_last', { pct: `${tipsDelta >= 0 ? '▲' : '▼'}${Math.abs(Math.round(tipsDelta * 100))}%` })
                  : t('tips_checkouts.kpi_shifts_n', { n: summary.shiftCount })
              }
              detailTone={tipsDelta === null ? undefined : tipsDelta >= 0 ? 'up' : 'down'}
              split={summary.paychecks > 0 ? { tips: summary.tips, paychecks: summary.paychecks } : undefined}
            />
            <Kpi
              iosIcon="clock.fill"
              androidIcon="schedule"
              label={t('tips_checkouts.kpi_per_hour')}
              value={summary.perHour !== null ? formatMoney(summary.perHour) : '—'}
              detail={t('tips_checkouts.kpi_hours_n', { n: Math.round(summary.hours * 10) / 10 })}
            />
          </View>
          <View style={styles.kpiRow}>
            <Kpi
              iosIcon="chart.bar.fill"
              androidIcon="bar-chart"
              label={t('tips_checkouts.kpi_tip_avg')}
              value={summary.avgTipPct !== null ? `${(summary.avgTipPct * 100).toFixed(1)}%` : '—'}
              detail={t('tips_checkouts.kpi_shifts_n', { n: summary.shiftCount })}
            />
            <Kpi
              iosIcon="flame.fill"
              androidIcon="local-fire-department"
              label={t('tips_checkouts.kpi_best_day')}
              value={summary.bestDay ? moneyWhole(summary.bestDay.tips) : '—'}
              detail={
                summary.bestDay
                  ? parseDateKey(summary.bestDay.date).toLocaleDateString(locale, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : t('tips_checkouts.kpi_no_shifts')
              }
            />
          </View>

          <GlassCard style={styles.chartCard}>
            <View style={styles.chartHead}>
              <IconSymbol ios_icon_name="chart.bar.fill" android_material_icon_name="bar-chart" size={15} color={accent} />
              <Text style={[styles.chartTitle, { color: colors.text }]}>
                {t(`tips_checkouts.chart_title_${period}`)}
              </Text>
              <TouchableOpacity
                onPress={() => setChartOffset(chartOffset + 1)}
                hitSlop={8}
                style={[styles.chartNav, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              >
                <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={13} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.chartRange, { color: colors.textSecondary }]}>
                {rangeLabel(chartRange.from, chartRange.to, locale)}
              </Text>
              <TouchableOpacity
                onPress={() => setChartOffset(Math.max(0, chartOffset - 1))}
                disabled={chartOffset === 0}
                hitSlop={8}
                style={[
                  styles.chartNav,
                  { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                  chartOffset === 0 && styles.chartNavOff,
                ]}
              >
                <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={13} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Chart
              bars={bars}
              onBarPress={(fromDate) => {
                setSelectedDay(fromDate);
                const d = parseDateKey(fromDate);
                setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                setMode('journal');
              }}
            />
            {/* One legend row: Tips / Paycheck whenever a payday is in the
                chart's range (else the plain "this period" swatch), plus the
                ghost swatch on the periods that draw one. */}
            {(hasPaydayBar || hasGhost) && (
              <View style={styles.legendRow}>
                <View style={[styles.legendSwatch, { backgroundColor: accent }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                  {hasPaydayBar ? t('tips_checkouts.kpi_split_tips') : t('tips_checkouts.legend_this')}
                </Text>
                {hasPaydayBar && (
                  <>
                    <View style={[styles.legendSwatch, styles.paycheckOutline]} />
                    <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                      {t('tips_checkouts.kpi_split_paycheck')}
                    </Text>
                  </>
                )}
                {hasGhost && (
                  <>
                    <View style={[styles.legendSwatch, { backgroundColor: colors.glassBorder }]} />
                    <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                      {t('tips_checkouts.legend_last')}
                    </Text>
                  </>
                )}
              </View>
            )}
            {/* All-in, like the bars it sits under (the ghost bar is all-in too). */}
            {chartPrevSummary.total > 0 && (
              <View style={[styles.chartNote, { borderTopColor: colors.hairline }]}>
                <Text style={[styles.chartNoteLabel, { color: colors.textSecondary }]}>
                  {t('tips_checkouts.chart_vs_last')}
                </Text>
                <Text style={[styles.chartNoteValue, { color: colors.text }]}>
                  {`${chartSummary.total - chartPrevSummary.total >= 0 ? '+' : '−'}${formatMoney(chartSummary.total - chartPrevSummary.total)}`}
                </Text>
              </View>
            )}
          </GlassCard>

          {entries.length === 0 && (
            <View style={[styles.emptyBlurb, { backgroundColor: `${accent}10`, borderColor: `${accent}30` }]}>
              <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={15} color={accent} />
              <Text style={[styles.emptyBlurbText, { color: colors.text }]}>
                {t('tips_checkouts.tracker_empty')}
              </Text>
            </View>
          )}
        </>
      ) : (
        <JournalBody
          entries={entries}
          dayRollups={dayRollups}
          monthCursor={monthCursor}
          setMonthCursor={setMonthCursor}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          selectedEntries={selectedEntries}
          todayKey={todayKey}
          locale={locale}
          onAddShift={(date) => openLog(date)}
          onAddPaycheck={(date) => openLog(date, null, 'paycheck')}
          onEditEntry={(entry) => openLog(entry.date, entry, isPaycheck(entry) ? 'paycheck' : 'shift')}
          onCheckoutDetail={setDetailSnapshot}
        />
      )}

      <GameToast message={toast} onDone={() => setToast(null)} />

      <LogShiftSheet
        visible={logSheet.open}
        initialDate={logSheet.date}
        allEntries={entries}
        editEntry={logSheet.edit}
        mode={logSheet.mode}
        onClose={() => setLogSheet((s) => ({ ...s, open: false }))}
        onSaved={onLogSaved}
      />
      <CheckoutDetailSheet snapshot={detailSnapshot} onClose={() => setDetailSnapshot(null)} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Journal (calendar + day detail)                                     */
/* ------------------------------------------------------------------ */

function JournalBody({
  entries,
  dayRollups,
  monthCursor,
  setMonthCursor,
  selectedDay,
  setSelectedDay,
  selectedEntries,
  todayKey,
  locale,
  onAddShift,
  onAddPaycheck,
  onEditEntry,
  onCheckoutDetail,
}: {
  entries: ShiftEntry[];
  dayRollups: Map<string, DayRollup>;
  monthCursor: Date;
  setMonthCursor: (d: Date) => void;
  selectedDay: string;
  setSelectedDay: (key: string) => void;
  selectedEntries: ShiftEntry[];
  todayKey: string;
  locale: string;
  onAddShift: (date: string) => void;
  onAddPaycheck: (date: string) => void;
  onEditEntry: (entry: ShiftEntry) => void;
  onCheckoutDetail: (snapshot: CheckoutSnapshot) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const accent = useTipsAccent();

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = new Date(year, month, 1).getDay(); // Sunday-first grid

  // Dot tiers size by the day's all-in take (a payday is still money).
  const monthMax = useMemo(() => {
    let max = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const roll = dayRollups.get(dateKey(new Date(year, month, d)));
      if (roll && roll.total > max) max = roll.total;
    }
    return max;
  }, [dayRollups, year, month, daysInMonth]);

  const dow = useMemo(
    () =>
      // Aug 2 2026 is a Sunday — a fixed anchor for localized narrow weekday names.
      Array.from({ length: 7 }, (_, i) =>
        new Date(2026, 7, 2 + i).toLocaleDateString(locale, { weekday: 'narrow' }),
      ),
    [locale],
  );

  const cells: Array<{ key: string; day: number } | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      key: dateKey(new Date(year, month, i + 1)),
      day: i + 1,
    })),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<{ key: string; day: number } | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // The day row keeps the shift math visible — "tips · hrs" — and appends the
  // paycheck as its own "+ $" term; a payday alone shows just that term.
  const dayShifts = selectedEntries.filter((e) => !isPaycheck(e));
  const dayTips = dayShifts.reduce((sum, e) => sum + entryTotalTips(e), 0);
  const dayHours = dayShifts.reduce((sum, e) => sum + (e.hours || 0), 0);
  const dayPaychecks = selectedEntries
    .filter(isPaycheck)
    .reduce((sum, e) => sum + entryTotalTips(e), 0);
  const dayTotalText = [
    dayShifts.length > 0
      ? t('tips_checkouts.journal_day_total', {
          total: formatMoney(dayTips),
          hours: Math.round(dayHours * 10) / 10,
        })
      : null,
    dayPaychecks > 0 ? `+ ${formatMoney(dayPaychecks)}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const selectedLabel = parseDateKey(selectedDay).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <>
      <GlassCard style={styles.calCard}>
        <View style={styles.calHead}>
          <TouchableOpacity
            onPress={() => setMonthCursor(new Date(year, month - 1, 1))}
            hitSlop={8}
            style={[styles.calNav, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          >
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={15} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.calTitle, { color: colors.text }]}>
            {monthCursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity
            onPress={() => setMonthCursor(new Date(year, month + 1, 1))}
            hitSlop={8}
            style={[styles.calNav, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          >
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={15} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.dowRow}>
          {dow.map((d, i) => (
            <Text key={i} style={[styles.dowText, { color: colors.textSecondary }]}>
              {d.toUpperCase()}
            </Text>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((cell, ci) => {
              if (!cell) return <View key={ci} style={styles.dayCell} />;
              const roll = dayRollups.get(cell.key);
              const tier = roll && monthMax > 0 ? dotTier(roll.total, monthMax) : 0;
              // A payday's dot is the outlined square (the mockup's calendar mark).
              const payday = !!roll && roll.paychecks > 0;
              const sel = cell.key === selectedDay;
              const isToday = cell.key === todayKey;
              return (
                <TouchableOpacity
                  key={ci}
                  onPress={() => setSelectedDay(cell.key)}
                  style={[
                    styles.dayCell,
                    isToday && { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.glassBorder },
                    sel && { backgroundColor: `${accent}1F`, borderWidth: 1, borderColor: `${accent}80` },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNum,
                      { color: roll || sel || isToday ? colors.text : colors.textSecondary },
                      !roll && !sel && !isToday && styles.dayNumDim,
                    ]}
                  >
                    {cell.day}
                  </Text>
                  <View
                    style={[
                      styles.dayDot,
                      tier === 0 && styles.dayDotNone,
                      tier === 1 && { width: 5, height: 5, backgroundColor: `${accent}73` },
                      tier === 2 && { width: 7, height: 7, backgroundColor: `${accent}BF` },
                      tier === 3 && { width: 9, height: 9, backgroundColor: accent },
                      payday && styles.dayDotPayday,
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </GlassCard>

      {selectedEntries.length > 0 ? (
        <>
          <View style={[styles.dayTotalRow, { backgroundColor: `${accent}14`, borderColor: `${accent}4D` }]}>
            <Text style={[styles.dayTotalLabel, { color: accent }]} numberOfLines={1}>
              {dayShifts.length > 1
                ? t('tips_checkouts.journal_day_double', { date: selectedLabel })
                : selectedLabel}
            </Text>
            <Text style={[styles.dayTotalValue, { color: accent }]}>{dayTotalText}</Text>
          </View>
          {selectedEntries.map((entry) =>
            isPaycheck(entry) ? (
              // Same row, banknote in the disc, outlined PAYCHECK pill, the note as subline.
              <TouchableOpacity
                key={entry.id}
                onPress={() => onEditEntry(entry)}
                style={[styles.entryRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              >
                <View style={[styles.entryIcon, { backgroundColor: `${accent}1F` }]}>
                  <IconSymbol ios_icon_name="banknote" android_material_icon_name="payments" size={15} color={accent} />
                </View>
                <View style={styles.entryMid}>
                  <View style={styles.entryTitleRow}>
                    <Text style={[styles.entryTitle, { color: colors.text }]} numberOfLines={1}>
                      {t('tips_checkouts.entry_paycheck')}
                    </Text>
                    <View style={styles.paycheckPill}>
                      <Text style={styles.paycheckPillText}>{t('tips_checkouts.entry_paycheck').toUpperCase()}</Text>
                    </View>
                  </View>
                  {!!entry.note && (
                    <Text style={[styles.entrySub, { color: colors.textSecondary }]} numberOfLines={1}>
                      {entry.note}
                    </Text>
                  )}
                </View>
                <Text style={[styles.entryValue, { color: accent }]}>{formatMoney(entryTotalTips(entry))}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                key={entry.id}
                onPress={() => onEditEntry(entry)}
                style={[styles.entryRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              >
                <View style={[styles.entryIcon, { backgroundColor: `${accent}1F` }]}>
                  <IconSymbol
                    ios_icon_name={entry.weather?.[0] ? WEATHER_ICONS[entry.weather[0]].ios : 'book.fill'}
                    android_material_icon_name={entry.weather?.[0] ? WEATHER_ICONS[entry.weather[0]].android : 'menu-book'}
                    size={15}
                    color={accent}
                  />
                </View>
                <View style={styles.entryMid}>
                  <Text style={[styles.entryTitle, { color: colors.text }]} numberOfLines={1}>
                    {entry.shift ? t(`tips_checkouts.shift_${entry.shift}`) : t('tips_checkouts.log_saved_shift')}
                  </Text>
                  <Text style={[styles.entrySub, { color: colors.textSecondary }]} numberOfLines={1}>
                    {entrySubline(entry, t)}
                  </Text>
                </View>
                {entry.checkout && (
                  <TouchableOpacity onPress={() => onCheckoutDetail(entry.checkout!)} hitSlop={8}>
                    <IconSymbol ios_icon_name="doc.plaintext" android_material_icon_name="receipt-long" size={17} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
                <Text style={[styles.entryValue, { color: accent }]}>{formatMoney(entryTotalTips(entry))}</Text>
              </TouchableOpacity>
            ),
          )}
          <AddPair accent={accent} onAddShift={() => onAddShift(selectedDay)} onAddPaycheck={() => onAddPaycheck(selectedDay)} />
        </>
      ) : (
        <>
          <GlassCard style={styles.emptyDayCard}>
            <IconSymbol ios_icon_name="book.fill" android_material_icon_name="menu-book" size={24} color={colors.textSecondary} />
            <Text style={[styles.emptyDayTitle, { color: colors.text }]}>
              {t('tips_checkouts.journal_empty_title', { date: selectedLabel })}
            </Text>
            <Text style={[styles.emptyDaySub, { color: colors.textSecondary }]}>
              {t('tips_checkouts.journal_empty_sub')}
            </Text>
          </GlassCard>
          <AddPair accent={accent} onAddShift={() => onAddShift(selectedDay)} onAddPaycheck={() => onAddPaycheck(selectedDay)} />
        </>
      )}
    </>
  );
}

/** The J-B pair: two dashed buttons side by side, a paycheck one tap away. */
function AddPair({
  accent,
  onAddShift,
  onAddPaycheck,
}: {
  accent: string;
  onAddShift: () => void;
  onAddPaycheck: () => void;
}) {
  const { t } = useTranslation();
  const dashStyle = [styles.addDash, { borderColor: `${accent}70`, backgroundColor: `${accent}10` }];
  return (
    <View style={styles.addPair}>
      <TouchableOpacity onPress={onAddShift} style={dashStyle}>
        <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={14} color={accent} />
        <Text style={[styles.addDashText, { color: accent }]} numberOfLines={1}>
          {t('tips_checkouts.journal_add_shift_short')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onAddPaycheck} style={dashStyle}>
        <IconSymbol ios_icon_name="banknote" android_material_icon_name="payments" size={14} color={accent} />
        <Text style={[styles.addDashText, { color: accent }]} numberOfLines={1}>
          {t('tips_checkouts.journal_add_paycheck')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* KPI tile + chart                                                    */
/* ------------------------------------------------------------------ */

function Kpi({
  iosIcon,
  androidIcon,
  label,
  value,
  detail,
  detailTone,
  split,
}: {
  iosIcon: string;
  androidIcon: string;
  label: string;
  value: string;
  detail: string;
  detailTone?: 'up' | 'down';
  /** Tips · Paycheck swatch line — takes the detail slot when present. */
  split?: { tips: number; paychecks: number };
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const accent = useTipsAccent();
  const toneColor =
    detailTone === 'up' ? '#10B981' : detailTone === 'down' ? '#EF4444' : colors.textSecondary;
  return (
    <GlassCard style={styles.kpiCard}>
      <View style={styles.kpiLabelRow}>
        <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={12} color={accent} />
        <Text style={[styles.kpiLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {label.toUpperCase()}
        </Text>
      </View>
      <Text style={[styles.kpiValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {split ? (
        <View style={styles.kpiSplit}>
          <View style={styles.kpiSplitItem}>
            <LinearGradient
              colors={[TIPS_VISUALS.gradient[1], TIPS_VISUALS.gradient[0]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.kpiSwatch}
            />
            <Text style={[styles.kpiSplitText, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('tips_checkouts.kpi_split_tips')}{' '}
              <Text style={[styles.kpiSplitValue, { color: colors.text }]}>{moneyWhole(split.tips)}</Text>
            </Text>
          </View>
          <View style={styles.kpiSplitItem}>
            <View style={[styles.kpiSwatch, styles.paycheckOutline]} />
            <Text style={[styles.kpiSplitText, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('tips_checkouts.kpi_split_paycheck')}{' '}
              <Text style={[styles.kpiSplitValue, { color: colors.text }]}>{moneyWhole(split.paychecks)}</Text>
            </Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.kpiDetail, { color: toneColor }]} numberOfLines={1}>
          {detail}
        </Text>
      )}
    </GlassCard>
  );
}

function Chart({
  bars,
  onBarPress,
}: {
  bars: ReturnType<typeof chartBars>;
  onBarPress: (fromDate: string) => void;
}) {
  const colors = useThemeColors();
  // Scale by the all-in bar (tips + paycheck stacked) so a payday fits.
  const max = Math.max(1, ...bars.map((b) => Math.max(b.tips, b.prevTips ?? 0)));
  // "Best" is the best TIPS bucket — a payday never steals the highlight.
  const bestIndex = bars.reduce(
    (best, bar, i) => (bar.shiftTips > bars[best].shiftTips ? i : best),
    0,
  );
  // Month has up to 31 bars — labels every ~5th keep the axis readable.
  const labelEvery = bars.length > 14 ? 5 : 1;
  return (
    <View style={styles.chartRow}>
      {bars.map((bar, i) => {
        const showGhost = bar.prevTips !== null;
        const isBest = i === bestIndex && bar.shiftTips > 0;
        const tipsH = bar.shiftTips > 0 ? Math.max(2, (bar.shiftTips / max) * CHART_H) : 0;
        const payH = bar.paychecks > 0 ? Math.max(2, (bar.paychecks / max) * CHART_H) : 0;
        return (
          <TouchableOpacity
            key={`${bar.fromDate}-${i}`}
            style={styles.chartCol}
            onPress={() => onBarPress(bar.fromDate)}
          >
            <View style={styles.chartBarsWrap}>
              {showGhost && (
                <View
                  style={[
                    styles.chartBar,
                    { height: Math.max(3, ((bar.prevTips ?? 0) / max) * CHART_H), backgroundColor: colors.glassBorder },
                  ]}
                />
              )}
              {/* The stack: tips below, the outlined paycheck segment above;
                  an empty bucket keeps the 3pt stub in the tips colour. */}
              <View style={styles.chartStack}>
                {payH > 0 && (
                  <View style={[styles.chartSegment, styles.paycheckOutline, styles.chartPaySegment, { height: payH }]} />
                )}
                {(tipsH > 0 || payH === 0) && (
                  <View
                    style={[
                      styles.chartSegment,
                      {
                        height: tipsH > 0 ? tipsH : 3,
                        backgroundColor: TIPS_VISUALS.accent,
                        marginTop: payH > 0 ? 2 : 0,
                      },
                      isBest && { backgroundColor: TIPS_VISUALS.gradient[1] },
                    ]}
                  />
                )}
              </View>
            </View>
            <Text style={[styles.chartLabel, { color: colors.textSecondary }]} numberOfLines={1}>
              {i % labelEvery === 0 ? bar.label : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function dotTier(tips: number, max: number): 0 | 1 | 2 | 3 {
  if (tips <= 0) return 0;
  const ratio = tips / max;
  if (ratio >= 0.75) return 3;
  if (ratio >= 0.4) return 2;
  return 1;
}

function entrySubline(entry: ShiftEntry, t: TFunction): string {
  const bits: string[] = [];
  if (entry.hours) bits.push(t('tips_checkouts.sub_hours', { n: entry.hours }));
  if (entry.tables) bits.push(t('tips_checkouts.save_tables_n', { n: entry.tables }));
  if (entry.covers) bits.push(t('tips_checkouts.save_covers_n', { n: entry.covers }));
  if (entry.location) bits.push(entry.location);
  return bits.join(' · ') || t('tips_checkouts.sub_tap_edit');
}

function moneyWhole(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/** The chart's reference date, `offset` periods back from today. */
function shiftPeriodRef(period: TrackerPeriod, offset: number, today: Date): Date {
  if (offset === 0) return today;
  if (period === 'week') return addDays(today, -7 * offset);
  if (period === 'month') return new Date(today.getFullYear(), today.getMonth() - offset, 1);
  if (period === 'quarter') return new Date(today.getFullYear(), today.getMonth() - 3 * offset, 1);
  return new Date(today.getFullYear() - offset, 0, 1);
}

function rangeLabel(from: string, to: string, locale: string): string {
  const f = parseDateKey(from);
  const t2 = parseDateKey(to);
  const fmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${f.toLocaleDateString(locale, fmt)} – ${t2.toLocaleDateString(locale, fmt)}`.toUpperCase();
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  topBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 10,
  },
  topBtnText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  periodRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  periodChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  periodText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  kpiCard: { flex: 1, padding: 12 },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  kpiLabel: { fontFamily: fonts.mono.medium, fontSize: 8.5, letterSpacing: 1, flexShrink: 1 },
  kpiValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 20,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  kpiDetail: { fontFamily: fonts.body.medium, fontSize: 9.5, marginTop: 2 },
  kpiSplit: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  kpiSplitItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  kpiSwatch: { width: 7, height: 7, borderRadius: 2 },
  kpiSplitText: { fontFamily: fonts.mono.medium, fontSize: 9, flexShrink: 1 },
  kpiSplitValue: { fontFamily: fonts.mono.semibold, fontVariant: ['tabular-nums'] },
  /** The paycheck mark everywhere: 40% emerald behind a 1px emerald line. */
  paycheckOutline: {
    backgroundColor: TIPS_PAYCHECK.fill,
    borderWidth: 1,
    borderColor: TIPS_PAYCHECK.line,
  },
  chartCard: { padding: 14, marginBottom: 10 },
  chartHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  chartTitle: { flex: 1, fontFamily: fonts.display.semibold, fontSize: 14.5 },
  chartRange: { fontFamily: fonts.mono.medium, fontSize: 9, letterSpacing: 0.5 },
  chartNav: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartNavOff: { opacity: 0.35 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartBarsWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: CHART_H,
    width: '100%',
    justifyContent: 'center',
  },
  chartBar: { flex: 1, maxWidth: 14, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  // The stacked column takes the bar's slot in the row (flex 1 across, 14 max);
  // its segments are plain height-sized views — `chartBar`'s flex would fight
  // the column's main axis — and stretch to the column's width.
  chartStack: { flex: 1, maxWidth: 14, justifyContent: 'flex-end' },
  chartSegment: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  chartPaySegment: { borderBottomWidth: 0 },
  chartLabel: { fontFamily: fonts.mono.medium, fontSize: 7.5 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  legendSwatch: { width: 8, height: 8, borderRadius: 3 },
  legendText: { fontFamily: fonts.mono.medium, fontSize: 8.5, marginRight: 6 },
  chartNote: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    paddingTop: 8,
  },
  chartNoteLabel: { fontFamily: fonts.mono.medium, fontSize: 9 },
  chartNoteValue: { fontFamily: fonts.mono.semibold, fontSize: 10, fontVariant: ['tabular-nums'] },
  emptyBlurb: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: 13,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  emptyBlurbText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 17 },
  calCard: { padding: 12, marginBottom: 10 },
  calHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  calNav: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.display.semibold, fontSize: 15 },
  dowRow: { flexDirection: 'row', marginBottom: 4 },
  dowText: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.mono.medium,
    fontSize: 8,
    letterSpacing: 0.5,
  },
  weekRow: { flexDirection: 'row' },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    gap: 2,
    margin: 1,
  },
  dayNum: { fontFamily: fonts.body.semibold, fontSize: 11 },
  dayNumDim: { opacity: 0.5 },
  dayDot: { borderRadius: 5 },
  dayDotNone: { width: 5, height: 5, backgroundColor: 'transparent' },
  dayDotPayday: {
    width: 7,
    height: 7,
    borderRadius: 2,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: TIPS_PAYCHECK.line,
  },
  dayTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 7,
  },
  dayTotalLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  dayTotalValue: { fontFamily: fonts.mono.semibold, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 13,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 7,
  },
  entryIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryMid: { flex: 1, minWidth: 0 },
  entryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entryTitle: { fontFamily: fonts.body.semibold, fontSize: 12.5, flexShrink: 1 },
  entrySub: { fontFamily: fonts.mono.medium, fontSize: 9, marginTop: 2 },
  entryValue: { fontFamily: fonts.mono.semibold, fontSize: 14.5, fontVariant: ['tabular-nums'] },
  // The outlined mono pill after a paycheck row's title (mockup's .pcpill).
  paycheckPill: {
    borderWidth: 1,
    borderColor: `${TIPS_PAYCHECK.line}8C`,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  paycheckPillText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 7.5,
    letterSpacing: 1,
    color: TIPS_PAYCHECK.line,
  },
  addPair: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  addDash: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    height: 40,
    paddingHorizontal: 8,
  },
  addDashText: { fontFamily: fonts.body.semibold, fontSize: 12.5, flexShrink: 1 },
  emptyDayCard: { alignItems: 'center', padding: 20, marginBottom: 10, gap: 6 },
  emptyDayTitle: { fontFamily: fonts.display.semibold, fontSize: 14.5, textAlign: 'center' },
  emptyDaySub: { fontFamily: fonts.body.regular, fontSize: 11, textAlign: 'center' },
});
