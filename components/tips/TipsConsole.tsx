/**
 * The Checkouts consoles (s78 lockdown) — FIXED-DARK emerald slabs in both
 * themes (ember rule: literal inks, never theme tokens).
 *
 * ConsoleStrip — the COMPACT live readout that rides above the steps rail for
 * the whole ritual (Steve's round-3 pick over the full slab): verdict word +
 * running tally + one stat line, ~64pt. It stays emerald while live — the
 * verdict only takes over the slab color once settled.
 *
 * SettledConsole — the results slab the strip "solidifies" into: RED gradient
 * when the user owes the house (round-3 note), emerald when the house owes
 * them, with the 2×2 action keys ON the slab (Save to Tracker · Adjust · New
 * checkout · Done — the quiz-console deliberate-reach grammar).
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import {
  TIPS_CONSOLE_EMBER,
  TIPS_CONSOLE_OWE,
  TIPS_VERDICT_INK,
  TIPS_VISUALS,
} from '@/components/tips/tipsVisuals';
import { formatMoney } from '@/components/tips/TipsBits';
import { fonts } from '@/constants/fonts';

export interface StripStat {
  label: string;
  value: string;
}

export interface StripMode {
  /** e.g. "CHECKOUT" — the mono eyebrow the capsule balances against. */
  eyebrow: string;
  pooled: boolean;
  soloLabel: string;
  poolLabel: string;
  onChange: (pooled: boolean) => void;
}

export function ConsoleStrip({
  stats,
  verdict,
  amount,
  owes,
  mode,
}: {
  /** Left column — "OUT / $161.20", "DECL / $297.60" (+ "POOL / 3"). */
  stats: StripStat[];
  /** Sits directly ABOVE the big amount (Steve's punch-round move). */
  verdict: string;
  /** Running tally; null renders the honest "$—" (nothing computable yet). */
  amount: number | null;
  /**
   * Once the tally is live and says the user will owe, the whole strip turns
   * red — no waiting for the results screen to find out.
   */
  owes?: boolean;
  /**
   * The Solo|Pool capsule in the console's top-right corner (s79 presets
   * phase — it moved OUT of the ScreenHeader so the house-defaults gear fits
   * on both tabs without truncating the title; Steve's placement pick). Adds
   * one slim header row; omit and the strip renders exactly as before.
   */
  mode?: StripMode;
}) {
  const slab = owes ? TIPS_CONSOLE_OWE : TIPS_VISUALS.console;
  const verdictInk =
    amount === null ? TIPS_CONSOLE_EMBER : owes ? TIPS_VERDICT_INK.owe : TIPS_VERDICT_INK.owed;
  return (
    <View style={styles.stripShell}>
      <LinearGradient
        colors={[slab[0], slab[1], slab[2]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {mode && (
        <View style={styles.stripHead}>
          <Text style={styles.stripHeadEyebrow} numberOfLines={1}>
            {mode.eyebrow}
          </Text>
          <View style={styles.modeCap}>
            <ModeCapHalf
              on={!mode.pooled}
              label={mode.soloLabel}
              iosIcon="person.fill"
              androidIcon="person"
              onPress={() => mode.onChange(false)}
            />
            <ModeCapHalf
              on={mode.pooled}
              label={mode.poolLabel}
              iosIcon="person.2.fill"
              androidIcon="people"
              onPress={() => mode.onChange(true)}
            />
          </View>
        </View>
      )}
      <View style={styles.stripBody}>
        <View style={styles.stripLeft}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.stripStatRow}>
              <Text style={styles.stripStatLabel} numberOfLines={1}>
                {stat.label}
              </Text>
              <Text style={styles.stripStatValue} numberOfLines={1}>
                {stat.value}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.stripRight}>
          <Text style={[styles.stripVerdict, { color: verdictInk }]} numberOfLines={1}>
            {verdict}
          </Text>
          <Text style={styles.stripAmount} numberOfLines={1}>
            {amount === null ? '$—' : formatMoney(amount)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Fixed-dark mini capsule half — literal white inks on the emerald/red slab. */
function ModeCapHalf({
  on,
  label,
  iosIcon,
  androidIcon,
  onPress,
}: {
  on: boolean;
  label: string;
  iosIcon: string;
  androidIcon: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.modeCapHalf, on && styles.modeCapHalfOn]}
      hitSlop={6}
    >
      <IconSymbol
        ios_icon_name={iosIcon as any}
        android_material_icon_name={androidIcon as any}
        size={11}
        color={on ? '#FFFFFF' : 'rgba(255,255,255,0.55)'}
      />
      <Text style={[styles.modeCapLabel, on && styles.modeCapLabelOn]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export interface SettledKey {
  label: string;
  iosIcon: string;
  androidIcon: string;
  onPress: () => void;
  gold?: boolean;
}

function pairRows(keys: SettledKey[]): SettledKey[][] {
  const rows: SettledKey[][] = [];
  for (let i = 0; i < keys.length; i += 2) rows.push(keys.slice(i, i + 2));
  return rows;
}

export function SettledConsole({
  owesHouse,
  amount,
  verdict,
  eyebrow,
  dateLabel,
  keys,
}: {
  owesHouse: boolean;
  amount: number;
  /** "YOU OWE THE HOUSE" / "THE HOUSE OWES YOU" — pre-composed, uppercase. */
  verdict: string;
  /** "CHECKOUT · SETTLED" — pre-composed, uppercase. */
  eyebrow: string;
  dateLabel: string;
  keys: SettledKey[];
}) {
  const slab = owesHouse ? TIPS_CONSOLE_OWE : TIPS_VISUALS.console;
  const verdictInk = owesHouse ? TIPS_VERDICT_INK.owe : TIPS_VERDICT_INK.owed;
  return (
    <View style={styles.slabShell}>
      <LinearGradient
        colors={[slab[0], slab[1], slab[2]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.slabTopRow}>
        <Text style={styles.slabEyebrow} numberOfLines={1}>
          {eyebrow}
        </Text>
        <Text style={styles.slabDate} numberOfLines={1}>
          {dateLabel}
        </Text>
      </View>
      <Text style={styles.slabAmount} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(amount)}
      </Text>
      <Text style={[styles.slabVerdict, { color: verdictInk }]} numberOfLines={1}>
        {verdict}
      </Text>
      {/* Explicit pair rows — never percentage flexBasis in a wrap grid (the
          exam-play lesson: it silently laid 4-across). */}
      {pairRows(keys).map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.keysRow, rowIndex === 0 && styles.keysRowFirst]}>
          {row.map((key) => (
            <TouchableOpacity
              key={key.label}
              onPress={key.onPress}
              style={[styles.key, key.gold && styles.keyGold]}
            >
              <IconSymbol
                ios_icon_name={key.iosIcon}
                android_material_icon_name={key.androidIcon}
                size={14}
                color={key.gold ? '#FFD48A' : '#FFFFFF'}
              />
              <Text style={[styles.keyText, key.gold && styles.keyTextGold]} numberOfLines={1}>
                {key.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stripShell: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 11,
    paddingHorizontal: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  stripBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stripHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 9,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  stripHeadEyebrow: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 1.4,
    color: TIPS_CONSOLE_EMBER,
    flexShrink: 1,
  },
  modeCap: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  modeCapHalf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  modeCapHalfOn: {
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  modeCapLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
  },
  modeCapLabelOn: {
    color: '#FFFFFF',
  },
  stripLeft: { flex: 1, minWidth: 0, gap: 3 },
  stripStatRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  stripStatLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1.1,
    color: TIPS_CONSOLE_EMBER,
    width: 42,
  },
  stripStatValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.92)',
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  stripRight: { alignItems: 'flex-end', gap: 1 },
  stripVerdict: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 1.1,
  },
  stripAmount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 25,
    letterSpacing: -0.5,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  slabShell: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  slabTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  slabEyebrow: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 1.5,
    color: TIPS_CONSOLE_EMBER,
  },
  slabDate: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
  },
  slabAmount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 40,
    letterSpacing: -1,
    color: '#FFFFFF',
    marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  slabVerdict: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 2,
  },
  keysRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  keysRowFirst: { marginTop: 12 },
  key: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 11,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  keyGold: { backgroundColor: 'rgba(245,158,11,0.20)', borderColor: 'rgba(245,158,11,0.55)' },
  keyText: { fontFamily: fonts.body.semibold, fontSize: 12, color: '#FFFFFF' },
  keyTextGold: { color: '#FFD48A' },
});
