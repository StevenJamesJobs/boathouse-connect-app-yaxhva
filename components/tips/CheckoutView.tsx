/**
 * The Checkouts ritual (s78 lockdown): five steps — Sales (+ declare + the
 * shared-party fold) → Cash (signed) → Tip-outs (positions from the org's job
 * titles, wheel percentages, remembered) → Extras (the Journal's questions,
 * all optional/skippable) → Done. The COMPACT console strip rides pinned above
 * the steps recomputing live (remembered %s mean the tally is live from the
 * cash step), then SOLIDIFIES into the red/emerald settled slab with the 2×2
 * actions. Pooled mode (the header's Solo|Pool capsule) turns Sales and Cash
 * into per-server rows — labels only, nothing about teammates is ever saved —
 * and hides the party fold (the whole night is shared).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/GlassCard';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import GameToast from '@/components/game/GameToast';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useOrgJobTitles } from '@/hooks/useOrgJobTitles';
import { useTipsAccent } from '@/components/tips/useTipsAccent';
import { ConsoleStrip, SettledConsole, type StripStat } from '@/components/tips/TipsConsole';
import PercentWheelSheet from '@/components/tips/PercentWheelSheet';
import SaveToTrackerSheet, {
  type CheckoutExtras,
  type CheckoutFacts,
} from '@/components/tips/SaveToTrackerSheet';
import {
  ChipRow,
  MoneyField,
  StepsRail,
  TipsStepper,
  cleanMoneyText,
  formatMoney,
} from '@/components/tips/TipsBits';
import {
  type SoloResult,
  type PooledResult,
  type TipOutLine,
  calculatePooled,
  calculateSolo,
  formatPct,
} from '@/utils/tips/checkoutMath';
import {
  SHIFT_SLOTS,
  WEATHER_KEYS,
  type CheckoutSnapshot,
  type ShiftSlot,
  type WeatherKey,
  dateKey,
  entryTotalTips,
  loadEntries,
} from '@/utils/tips/journal';
import { WEATHER_ICONS } from '@/components/tips/LogShiftSheet';
import {
  DEFAULT_DECLARE_PCT,
  loadCheckoutPrefs,
  saveCheckoutPrefs,
  stashTodayCheckout,
} from '@/utils/tips/checkoutPrefs';
import { fonts } from '@/constants/fonts';

export type CheckoutMode = 'solo' | 'pooled';

interface ServerRow {
  id: string;
  label: string;
  salesText: string;
  cashText: string;
  cashPositive: boolean;
}

const DECLARE_CHIPS = [0.12, 0.08];

export default function CheckoutView({
  mode,
  onDone,
}: {
  mode: CheckoutMode;
  /** Done key on the settled slab — the screen flips back to the Tracker. */
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const accent = useTipsAccent();
  const { activeJobTitles, isLoading: rolesLoading } = useOrgJobTitles();
  const locale = i18n.language === 'es' ? 'es' : 'en-US';

  const [step, setStep] = useState(0);
  const [prefsState, setPrefsState] = useState<'pending' | 'found' | 'empty'>('pending');

  // Solo inputs.
  const [salesText, setSalesText] = useState('');
  const [cashText, setCashText] = useState('');
  const [cashPositive, setCashPositive] = useState(true);

  // Pooled inputs.
  const [servers, setServers] = useState<ServerRow[]>([]);

  // Shared.
  const [declarePct, setDeclarePct] = useState(DEFAULT_DECLARE_PCT);
  const [customDeclareText, setCustomDeclareText] = useState('');
  const [customDeclareOn, setCustomDeclareOn] = useState(false);
  const [tipOuts, setTipOuts] = useState<TipOutLine[]>([]);
  const [wheelFor, setWheelFor] = useState<number | null>(null);
  const [customPosOpen, setCustomPosOpen] = useState(false);

  // Party fold (solo only).
  const [partyOn, setPartyOn] = useState(false);
  const [partySubtotalText, setPartySubtotalText] = useState('');
  const [partyGratuityText, setPartyGratuityText] = useState('');
  const [underMyName, setUnderMyName] = useState<boolean | null>(null);

  // Extras.
  const [shift, setShift] = useState<ShiftSlot | null>(null);
  const [weather, setWeather] = useState<WeatherKey[]>([]);
  const [tables, setTables] = useState(0);
  const [covers, setCovers] = useState(0);
  const [location, setLocation] = useState('');

  const [settledSnapshot, setSettledSnapshot] = useState<CheckoutSnapshot | null>(null);
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const [avgTipOutRate, setAvgTipOutRate] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Remembered setup arrives once per mount (percentages editable anytime).
  useEffect(() => {
    let alive = true;
    loadCheckoutPrefs().then((prefs) => {
      if (!alive) return;
      if (prefs) {
        setDeclarePct(prefs.declarePct);
        setTipOuts(prefs.tipOuts);
        if (!DECLARE_CHIPS.includes(prefs.declarePct)) {
          setCustomDeclareOn(true);
          setCustomDeclareText(String(Math.round(prefs.declarePct * 1000) / 10));
        }
        setPrefsState('found');
      } else {
        setPrefsState('empty');
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // First run: seed Busser → Runner → Bartender IF those roles exist among the
  // org's job titles — whichever exist, in that order; none if none (Steve's
  // punch-round spec). The org's own casing is adopted.
  useEffect(() => {
    if (prefsState !== 'empty' || rolesLoading) return;
    const seeds: TipOutLine[] = [];
    const grab = (want: string, pct: number) => {
      const match = activeJobTitles.find((title) => title.toLowerCase().includes(want));
      if (match && !seeds.some((seed) => seed.title === match)) seeds.push({ title: match, pct });
    };
    grab('busser', 0.035);
    grab('runner', 0.01);
    grab('bartender', 0.02);
    setTipOuts(seeds);
    setPrefsState('found');
  }, [prefsState, rolesLoading, activeJobTitles]);

  // Pool needs at least "You" + one teammate to mean anything.
  useEffect(() => {
    if (mode === 'pooled' && servers.length === 0) {
      setServers([
        { id: 'you', label: t('tips_checkouts.pool_you'), salesText: '', cashText: '', cashPositive: true },
        { id: makeRowId(), label: '', salesText: '', cashText: '', cashPositive: true },
      ]);
    }
  }, [mode, servers.length, t]);

  const sales = parseFloat(salesText) || 0;
  const cash = (parseFloat(cashText) || 0) * (cashPositive ? 1 : -1);

  const soloResult: SoloResult = useMemo(
    () =>
      calculateSolo({
        sales,
        cash,
        declarePct,
        tipOuts,
        party:
          partyOn && underMyName !== null
            ? {
                subtotal: parseFloat(partySubtotalText) || 0,
                gratuity: parseFloat(partyGratuityText) || 0,
                checkUnderMyName: underMyName,
              }
            : null,
      }),
    [sales, cash, declarePct, tipOuts, partyOn, underMyName, partySubtotalText, partyGratuityText],
  );

  const pooledResult: PooledResult = useMemo(
    () =>
      calculatePooled({
        servers: servers.map((row) => ({
          label: row.label,
          sales: parseFloat(row.salesText) || 0,
          cash: (parseFloat(row.cashText) || 0) * (row.cashPositive ? 1 : -1),
        })),
        declarePct,
        tipOuts,
      }),
    [servers, declarePct, tipOuts],
  );

  const isPooled = mode === 'pooled';
  const tally = isPooled ? pooledResult.tally : soloResult.tally;
  const owesHouse = isPooled ? pooledResult.owesHouse : soloResult.owesHouse;
  const tipOutTotal = isPooled ? pooledResult.tipOutTotal : soloResult.tipOutTotal;
  const declareAmount = isPooled ? pooledResult.declareAmount : soloResult.declareAmount;
  const shownSales = isPooled ? pooledResult.poolSales : sales;

  // The tally shows once any cash is entered — no fake zeros before that.
  const cashEntered = isPooled
    ? servers.some((row) => row.cashText.trim().length > 0)
    : cashText.trim().length > 0;
  const stripAmount = cashEntered ? Math.abs(tally) : null;

  // Verdict rides ABOVE the amount on the right; stats stack larger on the
  // left; the whole strip goes red the moment the live tally says "owe"
  // (Steve's punch-round console notes).
  const stripOwes = cashEntered && owesHouse;
  const stripVerdict = (
    cashEntered
      ? owesHouse
        ? t('tips_checkouts.strip_owe')
        : t('tips_checkouts.strip_owed')
      : t('tips_checkouts.strip_building')
  ).toUpperCase();
  const stripStats: StripStat[] = [
    { label: t('tips_checkouts.strip_out'), value: formatMoney(tipOutTotal) },
    { label: t('tips_checkouts.strip_decl'), value: formatMoney(declareAmount) },
  ];
  if (isPooled) {
    stripStats.push({ label: t('tips_checkouts.strip_pool_label'), value: `${servers.length}` });
  }

  const stepLabels = [
    t('tips_checkouts.step_sales'),
    t('tips_checkouts.step_cash'),
    t('tips_checkouts.step_tipouts'),
    t('tips_checkouts.step_extras'),
    t('tips_checkouts.step_done'),
  ];

  const buildSnapshot = (): CheckoutSnapshot =>
    isPooled
      ? {
          mode: 'pooled',
          pooled: {
            inputs: {
              servers: servers.map((row) => ({
                label: row.label,
                sales: parseFloat(row.salesText) || 0,
                cash: (parseFloat(row.cashText) || 0) * (row.cashPositive ? 1 : -1),
              })),
              declarePct,
              tipOuts,
            },
            result: pooledResult,
          },
          settledAt: Date.now(),
        }
      : {
          mode: 'solo',
          solo: {
            inputs: {
              sales,
              cash,
              declarePct,
              tipOuts,
              party:
                partyOn && underMyName !== null
                  ? {
                      subtotal: parseFloat(partySubtotalText) || 0,
                      gratuity: parseFloat(partyGratuityText) || 0,
                      checkUnderMyName: underMyName,
                    }
                  : null,
            },
            result: soloResult,
          },
          settledAt: Date.now(),
        };

  const settle = async () => {
    const snapshot = buildSnapshot();
    setSettledSnapshot(snapshot);
    setStep(4);
    // Remembered for next checkout + import-row fuel; failures are silent.
    saveCheckoutPrefs({ declarePct, tipOuts, mode });
    stashTodayCheckout(dateKey(new Date()), snapshot);
    // Tonight vs your average: tip-out rate across the last 28 logged days.
    const entries = await loadEntries();
    const cutoff = dateKey(new Date(Date.now() - 28 * 24 * 3600 * 1000));
    let rateSum = 0;
    let rateCount = 0;
    for (const entry of entries) {
      if (entry.date >= cutoff && entry.sales && entry.sales > 0 && entry.tippedOut) {
        rateSum += entry.tippedOut / entry.sales;
        rateCount += 1;
      }
    }
    setAvgTipOutRate(rateCount > 0 ? rateSum / rateCount : null);
  };

  // Adding a custom position hands off from its sheet to the wheel sheet —
  // two root Modals must never swap in one commit (the s74 dropped-present).
  const closeCustomPos = () => setCustomPosOpen(false);
  const { defer: deferAfterCustomPos, onDismiss: customPosDismiss } = useSheetHandoff(closeCustomPos);

  const resetAll = () => {
    setStep(0);
    setSalesText('');
    setCashText('');
    setCashPositive(true);
    setServers([]);
    setPartyOn(false);
    setPartySubtotalText('');
    setPartyGratuityText('');
    setUnderMyName(null);
    setShift(null);
    setWeather([]);
    setTables(0);
    setCovers(0);
    setLocation('');
    setSettledSnapshot(null);
  };

  const goNext = () => {
    if (step === 3) settle();
    else setStep(step + 1);
  };

  const usedTitles = new Set(tipOuts.map((line) => line.title.toLowerCase()));
  const availableRoles = activeJobTitles.filter((title) => !usedTitles.has(title.toLowerCase()));

  const todayLabel = new Date()
    .toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase();

  const saveFacts: CheckoutFacts = isPooled
    ? {
        sales: pooledResult.poolSales / pooledResult.serverCount,
        tippedOut: pooledResult.tipOutTotal / pooledResult.serverCount,
        housePays: pooledResult.owesHouse ? null : Math.abs(pooledResult.tallyPerServer),
      }
    : {
        sales,
        tippedOut: soloResult.tipOutTotal,
        housePays: soloResult.owesHouse ? null : Math.abs(soloResult.tally),
      };
  const saveExtras: CheckoutExtras = { shift, weather, tables, covers, location };

  if (prefsState !== 'found') return null;

  return (
    <View>
      {step < 4 ? (
        <ConsoleStrip stats={stripStats} verdict={stripVerdict} amount={stripAmount} owes={stripOwes} />
      ) : (
        <SettledConsole
          owesHouse={owesHouse}
          amount={Math.abs(tally)}
          verdict={(owesHouse ? t('tips_checkouts.res_you_owe') : t('tips_checkouts.res_house_owes')).toUpperCase()}
          eyebrow={t('tips_checkouts.res_settled').toUpperCase()}
          dateLabel={todayLabel}
          keys={[
            {
              label: t('tips_checkouts.res_save'),
              iosIcon: 'tray.and.arrow.down.fill',
              androidIcon: 'download',
              gold: true,
              onPress: () => setSaveSheetOpen(true),
            },
            {
              label: t('tips_checkouts.res_adjust'),
              iosIcon: 'pencil',
              androidIcon: 'edit',
              onPress: () => setStep(0),
            },
            {
              label: t('tips_checkouts.res_new'),
              iosIcon: 'plus',
              androidIcon: 'add',
              onPress: resetAll,
            },
            {
              label: t('tips_checkouts.res_done'),
              iosIcon: 'checkmark',
              androidIcon: 'check',
              onPress: onDone,
            },
          ]}
        />
      )}

      {step < 4 && (
        <View style={styles.railWrap}>
          <StepsRail labels={stepLabels} current={step} />
        </View>
      )}

      {step === 0 && !isPooled && (
        <GlassCard style={[styles.stepCard, { borderColor: `${accent}59` }] as never}>
          <StepTitle icon="dollarsign.circle.fill" androidIcon="attach-money" text={t('tips_checkouts.s1_title')} />
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.s1_sales')}</Text>
          <MoneyField value={salesText} onChangeText={setSalesText} />
          <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 12 }]}>
            {t('tips_checkouts.s1_declare')}
          </Text>
          <DeclarePicker
            declarePct={declarePct}
            setDeclarePct={setDeclarePct}
            customOn={customDeclareOn}
            setCustomOn={setCustomDeclareOn}
            customText={customDeclareText}
            setCustomText={setCustomDeclareText}
          />
          {shownSales > 0 && (
            <InfoRow text={t('tips_checkouts.s1_declare_preview', { amount: formatMoney(soloResult.declareAmount) })} />
          )}

          {/* The shared-party fold — solo only; it adjusts declared sales. */}
          <TouchableOpacity onPress={() => setPartyOn(!partyOn)} style={styles.foldHead}>
            <IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="people" size={15} color={accent} />
            <Text style={[styles.foldTitle, { color: colors.text }]}>{t('tips_checkouts.party_q')}</Text>
            <Text style={[styles.foldHint, { color: colors.textSecondary }]}>
              {t('tips_checkouts.optional')}
            </Text>
            <IconSymbol
              ios_icon_name={partyOn ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={partyOn ? 'expand-less' : 'expand-more'}
              size={16}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
          {partyOn && (
            <View style={styles.foldBody}>
              <View style={styles.pairRow}>
                <View style={styles.pairCell}>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.party_subtotal')}</Text>
                  <MoneyField value={partySubtotalText} onChangeText={setPartySubtotalText} />
                </View>
                <View style={styles.pairCell}>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.party_gratuity')}</Text>
                  <MoneyField value={partyGratuityText} onChangeText={setPartyGratuityText} />
                </View>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 10 }]}>
                {t('tips_checkouts.party_under_name')}
              </Text>
              <ChipRow
                options={[
                  { key: 'yes', label: t('tips_checkouts.yes') },
                  { key: 'no', label: t('tips_checkouts.no') },
                ]}
                selectedKeys={underMyName === null ? [] : [underMyName ? 'yes' : 'no']}
                onToggle={(key) => {
                  const next = key === 'yes';
                  setUnderMyName(underMyName === next ? null : next);
                }}
              />
              {soloResult.party && (
                <InfoRow
                  text={t('tips_checkouts.party_preview', {
                    amount: formatMoney(Math.abs(soloResult.party.splitAmount)),
                  })}
                />
              )}
            </View>
          )}
        </GlassCard>
      )}

      {step === 0 && isPooled && (
        <GlassCard style={[styles.stepCard, { borderColor: `${accent}59` }] as never}>
          <StepTitle icon="dollarsign.circle.fill" androidIcon="attach-money" text={t('tips_checkouts.s1_pool_title')} />
          {servers.map((row, index) => (
            <ServerSalesRow
              key={row.id}
              row={row}
              index={index}
              onChange={(next) => setServers(servers.map((r) => (r.id === row.id ? next : r)))}
              onRemove={
                index > 0 ? () => setServers(servers.filter((r) => r.id !== row.id)) : undefined
              }
            />
          ))}
          <TouchableOpacity
            onPress={() =>
              setServers([
                ...servers,
                { id: makeRowId(), label: '', salesText: '', cashText: '', cashPositive: true },
              ])
            }
            style={[styles.addDash, { borderColor: `${accent}70`, backgroundColor: `${accent}10` }]}
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={14} color={accent} />
            <Text style={[styles.addDashText, { color: accent }]}>{t('tips_checkouts.pool_add')}</Text>
          </TouchableOpacity>
          <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 4 }]}>
            {t('tips_checkouts.s1_pool_declare')}
          </Text>
          <DeclarePicker
            declarePct={declarePct}
            setDeclarePct={setDeclarePct}
            customOn={customDeclareOn}
            setCustomOn={setCustomDeclareOn}
            customText={customDeclareText}
            setCustomText={setCustomDeclareText}
          />
          {pooledResult.poolSales > 0 && (
            <InfoRow
              text={t('tips_checkouts.s1_pool_preview', {
                total: formatMoney(pooledResult.declareAmount),
                each: formatMoney(pooledResult.declarePerServer),
              })}
            />
          )}
        </GlassCard>
      )}

      {step === 1 && (
        <GlassCard style={[styles.stepCard, { borderColor: `${accent}59` }] as never}>
          <StepTitle icon="dollarsign.circle.fill" androidIcon="attach-money" text={t('tips_checkouts.s2_title')} />
          {!isPooled ? (
            <>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.s2_field')}</Text>
              <View style={styles.cashRow}>
                <SignCapsule positive={cashPositive} onToggle={setCashPositive} />
                <MoneyField value={cashText} onChangeText={setCashText} />
              </View>
              {/* Two honest lines, one per sign — a single green sentence read
                  like "you're holding house cash AND they owe you" (Steve). */}
              <SignKeyRow sign="+" tone="#10B981" text={t('tips_checkouts.s2_key_plus')} />
              <SignKeyRow sign="−" tone="#EF4444" text={t('tips_checkouts.s2_key_minus')} />
            </>
          ) : (
            <>
              {servers.map((row) => (
                <View key={row.id} style={styles.poolCashRow}>
                  <Text style={[styles.poolCashLabel, { color: colors.text }]} numberOfLines={1}>
                    {row.label || t('tips_checkouts.pool_server_ph')}
                  </Text>
                  <SignCapsule
                    positive={row.cashPositive}
                    onToggle={(positive) =>
                      setServers(servers.map((r) => (r.id === row.id ? { ...r, cashPositive: positive } : r)))
                    }
                  />
                  <MoneyField
                    value={row.cashText}
                    onChangeText={(text) =>
                      setServers(servers.map((r) => (r.id === row.id ? { ...r, cashText: text } : r)))
                    }
                  />
                </View>
              ))}
              <InfoRow
                text={t('tips_checkouts.s2_pool_combined', {
                  amount: `${pooledResult.poolCash >= 0 ? '+' : '−'}${formatMoney(pooledResult.poolCash)}`,
                })}
              />
            </>
          )}
        </GlassCard>
      )}

      {step === 2 && (
        <GlassCard style={[styles.stepCard, { borderColor: `${accent}59` }] as never}>
          <StepTitle icon="person.2.fill" androidIcon="people" text={t('tips_checkouts.s3_title')} />
          {tipOuts.map((line, index) => (
            <View
              key={`${line.title}-${index}`}
              style={[styles.posRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
            >
              <View style={[styles.posIcon, { backgroundColor: `${accent}1F` }]}>
                <IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="people" size={14} color={accent} />
              </View>
              <View style={styles.posMid}>
                <Text style={[styles.posTitle, { color: colors.text }]} numberOfLines={1}>
                  {line.title}
                </Text>
                <Text style={[styles.posSub, { color: colors.textSecondary }]} numberOfLines={1}>
                  {t('tips_checkouts.s3_remembered')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setWheelFor(index)} style={styles.pctChip} hitSlop={6}>
                <Text style={[styles.pctText, { color: accent }]}>{formatPct(line.pct)}</Text>
                <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.posAmount, { color: colors.textSecondary }]}>
                {formatMoney(shownSales * line.pct)}
              </Text>
              <TouchableOpacity
                onPress={() => setTipOuts(tipOuts.filter((_, i) => i !== index))}
                hitSlop={8}
              >
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={13} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
          <Text style={[styles.rolesHint, { color: colors.textSecondary }]}>
            {t('tips_checkouts.s3_add_hint')}
          </Text>
          <ChipRow
            options={[
              ...availableRoles.map((title) => ({ key: title, label: `+ ${title}` })),
              { key: '__custom__', label: `+ ${t('tips_checkouts.custom')}`, iosIcon: 'pencil', androidIcon: 'edit' },
            ]}
            selectedKeys={[]}
            onToggle={(key) => {
              if (key === '__custom__') {
                setCustomPosOpen(true);
                return;
              }
              setTipOuts([...tipOuts, { title: key, pct: 0 }]);
              setWheelFor(tipOuts.length);
            }}
          />
        </GlassCard>
      )}

      {step === 3 && (
        <GlassCard style={[styles.stepCard, { borderColor: `${accent}59` }] as never}>
          <StepTitle icon="sparkles" androidIcon="auto-awesome" text={t('tips_checkouts.s4_title')} />
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.field_shift')}</Text>
          <ChipRow
            options={SHIFT_SLOTS.map((slot) => ({ key: slot, label: t(`tips_checkouts.shift_${slot}`) }))}
            selectedKeys={shift ? [shift] : []}
            onToggle={(key) => setShift(shift === key ? null : (key as ShiftSlot))}
          />
          <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 10 }]}>
            {t('tips_checkouts.field_weather')}
          </Text>
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
          <View style={[styles.pairRow, { marginTop: 10 }]}>
            <View style={styles.pairCell}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.field_tables')}</Text>
              <TipsStepper value={tables} onChange={setTables} />
            </View>
            <View style={styles.pairCell}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('tips_checkouts.field_covers')}</Text>
              <TipsStepper value={covers} onChange={setCovers} />
            </View>
          </View>
          <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 10 }]}>
            {t('tips_checkouts.field_location')}
          </Text>
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
        </GlassCard>
      )}

      {step < 4 && (
        <View style={styles.navRow}>
          <TouchableOpacity
            onPress={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            style={[
              styles.navBtn,
              { backgroundColor: colors.glass, borderColor: colors.glassBorder },
              step === 0 && styles.navBtnOff,
            ]}
          >
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={14} color={colors.text} />
            <Text style={[styles.navText, { color: colors.text }]}>{t('tips_checkouts.back')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goNext}
            style={[styles.navBtn, { backgroundColor: `${accent}14`, borderColor: `${accent}66` }]}
          >
            <Text style={[styles.navText, { color: accent }]}>
              {step === 3 ? t('tips_checkouts.see_results') : t('tips_checkouts.next_to', { step: stepLabels[step + 1] })}
            </Text>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={14} color={accent} />
          </TouchableOpacity>
        </View>
      )}
      {step === 3 && (
        <TouchableOpacity
          onPress={settle}
          style={[styles.skipBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
        >
          <Text style={[styles.navText, { color: colors.text }]}>{t('tips_checkouts.skip_extras')}</Text>
        </TouchableOpacity>
      )}

      {step === 4 && (
        <>
          <GlassCard style={styles.stepCard}>
            <StepTitle icon="person.2.fill" androidIcon="people" text={t('tips_checkouts.res_where')} />
            {(isPooled ? pooledResult.tipOuts : soloResult.tipOuts).map((line) => (
              <View
                key={line.title}
                style={[styles.posRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              >
                <View style={[styles.posIcon, { backgroundColor: `${accent}1F` }]}>
                  <IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="people" size={14} color={accent} />
                </View>
                <View style={styles.posMid}>
                  <Text style={[styles.posTitle, { color: colors.text }]} numberOfLines={1}>
                    {line.title}
                  </Text>
                  <Text style={[styles.posSub, { color: colors.textSecondary }]} numberOfLines={1}>
                    {t('tips_checkouts.res_pct_of', { pct: formatPct(line.pct), sales: formatMoney(shownSales) })}
                  </Text>
                </View>
                <Text style={[styles.posAmountBig, { color: colors.text }]}>{formatMoney(line.amount)}</Text>
              </View>
            ))}
            {/* Cash + declare (+ pooled ÷N) wear the same row treatment as the
                positions above — Steve's punch-round highlight ask. */}
            <ResultFactRow
              iosIcon="dollarsign.circle.fill"
              androidIcon="attach-money"
              title={t('tips_checkouts.res_cash_line')}
              value={`${(isPooled ? pooledResult.poolCash : cash) >= 0 ? '+' : '−'}${formatMoney(isPooled ? pooledResult.poolCash : cash)}`}
              valueColor={(isPooled ? pooledResult.poolCash : cash) >= 0 ? '#10B981' : '#EF4444'}
            />
            <ResultFactRow
              iosIcon="chart.bar.fill"
              androidIcon="bar-chart"
              title={t('tips_checkouts.res_declare_line', { pct: formatPct(declarePct) })}
              value={formatMoney(declareAmount)}
            />
            {isPooled && (
              <ResultFactRow
                iosIcon="person.2.fill"
                androidIcon="people"
                title={t('tips_checkouts.res_each', { n: pooledResult.serverCount })}
                value={formatMoney(Math.abs(pooledResult.tallyPerServer))}
              />
            )}
          </GlassCard>

          {!isPooled && soloResult.party && (
            <View style={[styles.partyCard, { backgroundColor: `${accent}10`, borderColor: `${accent}33` }]}>
              <Text style={[styles.partyVerdict, { color: soloResult.party.youOweTeammate ? '#EF4444' : '#10B981' }]}>
                {soloResult.party.youOweTeammate
                  ? t('tips_checkouts.party_you_owe', { amount: formatMoney(Math.abs(soloResult.party.splitAmount)) })
                  : t('tips_checkouts.party_owes_you', { amount: formatMoney(Math.abs(soloResult.party.splitAmount)) })}
              </Text>
              <Text style={[styles.partyNote, { color: colors.textSecondary }]}>
                {t('tips_checkouts.party_note')}
              </Text>
            </View>
          )}

          {avgTipOutRate !== null && shownSales > 0 && (
            <View style={[styles.insight, { backgroundColor: `${accent}10`, borderColor: `${accent}30` }]}>
              <IconSymbol ios_icon_name="chart.bar.fill" android_material_icon_name="bar-chart" size={14} color={accent} />
              <Text style={[styles.insightText, { color: colors.text }]}>
                {t('tips_checkouts.res_insight', {
                  rate: `${((tipOutTotal / shownSales) * 100).toFixed(1)}%`,
                  avg: `${(avgTipOutRate * 100).toFixed(1)}%`,
                })}
              </Text>
            </View>
          )}
        </>
      )}

      <GameToast message={toast} onDone={() => setToast(null)} />

      <CustomPositionSheet
        visible={customPosOpen}
        onClose={closeCustomPos}
        onDismiss={customPosDismiss}
        onAdd={(name) => {
          const index = tipOuts.length;
          setTipOuts([...tipOuts, { title: name, pct: 0 }]);
          deferAfterCustomPos(() => setWheelFor(index));
        }}
      />

      <PercentWheelSheet
        visible={wheelFor !== null}
        title={wheelFor !== null && tipOuts[wheelFor] ? tipOuts[wheelFor].title : ''}
        initialPct={wheelFor !== null && tipOuts[wheelFor] ? tipOuts[wheelFor].pct : 0}
        onClose={() => setWheelFor(null)}
        onSelect={(pct) => {
          if (wheelFor !== null) {
            setTipOuts(tipOuts.map((line, i) => (i === wheelFor ? { ...line, pct } : line)));
          }
          setWheelFor(null);
        }}
      />

      {settledSnapshot && (
        <SaveToTrackerSheet
          visible={saveSheetOpen}
          date={dateKey(new Date())}
          facts={saveFacts}
          extras={saveExtras}
          snapshot={settledSnapshot}
          onClose={() => setSaveSheetOpen(false)}
          onSaved={() => setToast(t('tips_checkouts.toast_saved'))}
        />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function StepTitle({ icon, androidIcon, text }: { icon: string; androidIcon: string; text: string }) {
  const colors = useThemeColors();
  const accent = useTipsAccent();
  return (
    <View style={styles.stepTitleRow}>
      <IconSymbol ios_icon_name={icon} android_material_icon_name={androidIcon} size={15} color={accent} />
      <Text style={[styles.stepTitle, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function InfoRow({ text }: { text: string }) {
  const colors = useThemeColors();
  const accent = useTipsAccent();
  return (
    <View style={[styles.infoRow, { backgroundColor: `${accent}12`, borderColor: `${accent}33` }]}>
      <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={12} color={accent} />
      <Text style={[styles.infoText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function SignCapsule({ positive, onToggle }: { positive: boolean; onToggle: (positive: boolean) => void }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.signCap, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <TouchableOpacity
        onPress={() => onToggle(true)}
        style={[styles.signHalf, positive && { backgroundColor: 'rgba(16,185,129,0.18)' }]}
      >
        <Text style={[styles.signText, { color: positive ? '#10B981' : colors.textSecondary }]}>+</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onToggle(false)}
        style={[styles.signHalf, !positive && { backgroundColor: 'rgba(239,68,68,0.18)' }]}
      >
        <Text style={[styles.signText, { color: !positive ? '#EF4444' : colors.textSecondary }]}>−</Text>
      </TouchableOpacity>
    </View>
  );
}

function DeclarePicker({
  declarePct,
  setDeclarePct,
  customOn,
  setCustomOn,
  customText,
  setCustomText,
}: {
  declarePct: number;
  setDeclarePct: (pct: number) => void;
  customOn: boolean;
  setCustomOn: (on: boolean) => void;
  customText: string;
  setCustomText: (text: string) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const accent = useTipsAccent();
  return (
    <View style={styles.declareRow}>
      {DECLARE_CHIPS.map((pct) => {
        const on = !customOn && Math.abs(declarePct - pct) < 1e-9;
        return (
          <TouchableOpacity
            key={pct}
            onPress={() => {
              setCustomOn(false);
              setDeclarePct(pct);
            }}
            style={[
              styles.declareChip,
              { backgroundColor: colors.glass, borderColor: colors.glassBorder },
              on && { backgroundColor: `${accent}16`, borderColor: `${accent}70` },
            ]}
          >
            <Text style={[styles.declareText, { color: on ? accent : colors.text }]}>{formatPct(pct)}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        onPress={() => setCustomOn(true)}
        style={[
          styles.declareChip,
          { backgroundColor: colors.glass, borderColor: colors.glassBorder },
          customOn && { backgroundColor: `${accent}16`, borderColor: `${accent}70` },
        ]}
      >
        <Text style={[styles.declareText, { color: customOn ? accent : colors.text }]}>
          {t('tips_checkouts.custom')}
        </Text>
      </TouchableOpacity>
      {customOn && (
        <View style={[styles.declareCustom, { backgroundColor: colors.glass, borderColor: `${accent}70` }]}>
          <TextInput
            style={[styles.declareInput, { color: colors.text }]}
            value={customText}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9.]/g, '');
              setCustomText(cleaned);
              const parsed = parseFloat(cleaned);
              if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) setDeclarePct(parsed / 100);
            }}
            keyboardType="decimal-pad"
            placeholder="0.0"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={[styles.declarePctSign, { color: colors.textSecondary }]}>%</Text>
        </View>
      )}
    </View>
  );
}

function ServerSalesRow({
  row,
  index,
  onChange,
  onRemove,
}: {
  row: ServerRow;
  index: number;
  onChange: (next: ServerRow) => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const accent = useTipsAccent();
  return (
    <View style={[styles.serverRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <View style={[styles.serverAv, { backgroundColor: `${accent}26` }]}>
        <Text style={[styles.serverAvText, { color: accent }]}>{index + 1}</Text>
      </View>
      <TextInput
        style={[styles.serverName, { color: colors.text }]}
        value={row.label}
        onChangeText={(label) => onChange({ ...row, label })}
        placeholder={t('tips_checkouts.pool_server_ph')}
        placeholderTextColor={colors.textSecondary}
        editable={index > 0}
      />
      <View style={styles.serverSales}>
        <MoneyField
          value={row.salesText}
          onChangeText={(salesText) => onChange({ ...row, salesText: cleanMoneyText(salesText) })}
        />
      </View>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={13} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function SignKeyRow({ sign, tone, text }: { sign: string; tone: string; text: string }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.signKeyRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <View style={[styles.signKeyBadge, { backgroundColor: `${tone}26` }]}>
        <Text style={[styles.signKeySign, { color: tone }]}>{sign}</Text>
      </View>
      <Text style={[styles.signKeyText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function ResultFactRow({
  iosIcon,
  androidIcon,
  title,
  value,
  valueColor,
}: {
  iosIcon: string;
  androidIcon: string;
  title: string;
  value: string;
  valueColor?: string;
}) {
  const colors = useThemeColors();
  const accent = useTipsAccent();
  return (
    <View style={[styles.posRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <View style={[styles.posIcon, { backgroundColor: `${accent}1F` }]}>
        <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={14} color={accent} />
      </View>
      <Text style={[styles.posTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.posAmountBig, { color: valueColor ?? colors.text }]}>{value}</Text>
    </View>
  );
}

function CustomPositionSheet({
  visible,
  onClose,
  onDismiss,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onDismiss: () => void;
  onAdd: (name: string) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const accent = useTipsAccent();
  const [name, setName] = useState('');
  useEffect(() => {
    if (visible) setName('');
  }, [visible]);
  const trimmed = name.trim();
  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={t('tips_checkouts.custom_pos_title')}
    >
      <View style={[styles.customPosField, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={15} color={colors.textSecondary} />
        <TextInput
          style={[styles.customPosInput, { color: colors.text }]}
          value={name}
          onChangeText={setName}
          placeholder={t('tips_checkouts.custom_pos_ph')}
          placeholderTextColor={colors.textSecondary}
          autoFocus
        />
      </View>
      <TouchableOpacity
        onPress={() => trimmed && onAdd(trimmed)}
        disabled={!trimmed}
        style={[styles.customPosAdd, { backgroundColor: accent }, !trimmed && styles.customPosAddOff]}
      >
        <Text style={styles.customPosAddText}>{t('tips_checkouts.custom_pos_add')}</Text>
      </TouchableOpacity>
    </GlassSheet>
  );
}

function makeRowId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const styles = StyleSheet.create({
  railWrap: { marginBottom: 2 },
  stepCard: { padding: 14, marginBottom: 10, borderWidth: 1 },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  stepTitle: { fontFamily: fonts.display.semibold, fontSize: 14.5 },
  fieldLabel: { fontFamily: fonts.body.semibold, fontSize: 12, marginBottom: 6 },
  pairRow: { flexDirection: 'row', gap: 8 },
  pairCell: { flex: 1 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 11,
    marginTop: 10,
  },
  infoText: { flex: 1, fontFamily: fonts.body.medium, fontSize: 11.5 },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingVertical: 2 },
  foldTitle: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 13 },
  foldHint: {
    fontFamily: fonts.mono.medium,
    fontSize: 8.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  foldBody: { marginTop: 10 },
  cashRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  signCap: { flexDirection: 'row', borderRadius: 11, borderWidth: 1, overflow: 'hidden' },
  signHalf: { width: 38, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  signText: { fontFamily: fonts.mono.semibold, fontSize: 17 },
  poolCashRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  poolCashLabel: { width: 82, fontFamily: fonts.body.semibold, fontSize: 12 },
  posRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 13,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 7,
  },
  posIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  posMid: { flex: 1, minWidth: 0 },
  posTitle: { fontFamily: fonts.body.semibold, fontSize: 13 },
  posSub: { fontFamily: fonts.mono.medium, fontSize: 8.5, marginTop: 1 },
  pctChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pctText: { fontFamily: fonts.mono.semibold, fontSize: 14.5, fontVariant: ['tabular-nums'] },
  posAmount: { fontFamily: fonts.mono.medium, fontSize: 11.5, width: 62, textAlign: 'right', fontVariant: ['tabular-nums'] },
  posAmountBig: { fontFamily: fonts.mono.semibold, fontSize: 14, fontVariant: ['tabular-nums'] },
  rolesHint: {
    fontFamily: fonts.mono.medium,
    fontSize: 8.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 4,
    marginBottom: 6,
  },
  addDash: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 10,
    marginBottom: 10,
  },
  addDashText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 13,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 7,
  },
  serverAv: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  serverAvText: { fontFamily: fonts.mono.semibold, fontSize: 11 },
  serverName: { width: 86, fontFamily: fonts.body.semibold, fontSize: 12.5, paddingVertical: 0 },
  serverSales: { flex: 1 },
  navRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 11,
  },
  navBtnOff: { opacity: 0.4 },
  navText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  skipBtn: {
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 8,
  },
  signKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  signKeyBadge: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signKeySign: { fontFamily: fonts.mono.semibold, fontSize: 15 },
  signKeyText: { flex: 1, fontFamily: fonts.body.medium, fontSize: 11.5, lineHeight: 16 },
  customPosField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
  },
  customPosInput: { flex: 1, fontFamily: fonts.body.medium, fontSize: 14, height: 48, paddingVertical: 0 },
  customPosAdd: { borderRadius: 13, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  customPosAddOff: { opacity: 0.5 },
  customPosAddText: { fontFamily: fonts.body.semibold, fontSize: 14, color: '#FFFFFF' },
  partyCard: {
    borderRadius: 13,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  partyVerdict: { fontFamily: fonts.mono.semibold, fontSize: 13, fontVariant: ['tabular-nums'] },
  partyNote: { fontFamily: fonts.body.regular, fontSize: 10.5, textAlign: 'center' },
  insight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: 13,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  insightText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 17 },
  declareRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  declareChip: { borderRadius: 999, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14 },
  declareText: { fontFamily: fonts.mono.semibold, fontSize: 12.5 },
  declareCustom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 38,
    width: 86,
  },
  declareInput: {
    flex: 1,
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    textAlign: 'right',
    paddingVertical: 0,
    height: 38,
    fontVariant: ['tabular-nums'],
  },
  declarePctSign: { fontFamily: fonts.mono.semibold, fontSize: 12 },
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
});
