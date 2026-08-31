/**
 * The tip-out percent wheel (s78 lockdown): 0–10% in 0.5 steps on a snapping
 * wheel, plus a Custom field for anything else — 0% is a real choice for
 * houses that don't tip out. Opens from a position row's % chip; the picked
 * value is remembered by the ritual's prefs for next checkout.
 *
 * The wheel lives in its own sheet (not inline in the row): a nested vertical
 * ScrollView inside the page scroll fights for the pan on Android, and the
 * sheet gives the wheel a fixed, snappable viewport instead.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTipsAccent } from '@/components/tips/useTipsAccent';
import { TIP_OUT_WHEEL_STEPS, formatPct } from '@/utils/tips/checkoutMath';
import { fonts } from '@/constants/fonts';

const ITEM_H = 40;
const VISIBLE_H = 200;
const PAD = (VISIBLE_H - ITEM_H) / 2;

export default function PercentWheelSheet({
  visible,
  title,
  initialPct,
  onClose,
  onSelect,
}: {
  visible: boolean;
  /** The position's name — "Busser" — so the sheet says whose cut this is. */
  title: string;
  initialPct: number;
  onClose: () => void;
  onSelect: (pct: number) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const accent = useTipsAccent();
  const scrollRef = useRef<ScrollView>(null);

  const initialIndex = nearestStepIndex(initialPct);
  const [wheelIndex, setWheelIndex] = useState(initialIndex);
  const [customText, setCustomText] = useState(() =>
    isOnWheel(initialPct) ? '' : trimPctText(initialPct),
  );

  // Re-center whenever the sheet opens on a (possibly new) initial value.
  useEffect(() => {
    if (!visible) return;
    const index = nearestStepIndex(initialPct);
    setWheelIndex(index);
    setCustomText(isOnWheel(initialPct) ? '' : trimPctText(initialPct));
    // The Modal's content lays out a beat after `visible` flips.
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: index * ITEM_H, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [visible, initialPct]);

  const onWheelEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_H);
    const clamped = Math.max(0, Math.min(TIP_OUT_WHEEL_STEPS.length - 1, index));
    setWheelIndex(clamped);
    // Landing on the wheel supersedes any typed custom value.
    setCustomText('');
  };

  const customPct = parseCustom(customText);
  const chosenPct = customPct !== null ? customPct : TIP_OUT_WHEEL_STEPS[wheelIndex];

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={t('tips_checkouts.wheel_subtitle')}
      scroll={false}
      footer={
        <TouchableOpacity
          style={[styles.applyBtn, { backgroundColor: accent }]}
          onPress={() => onSelect(chosenPct)}
        >
          <Text style={styles.applyText}>
            {t('tips_checkouts.wheel_apply', { pct: formatPct(chosenPct) })}
          </Text>
        </TouchableOpacity>
      }
    >
      <View style={styles.wheelWrap}>
        <View
          pointerEvents="none"
          style={[
            styles.window,
            { backgroundColor: `${accent}20`, borderColor: `${accent}70` },
          ]}
        />
        <ScrollView
          ref={scrollRef}
          style={styles.wheel}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_H}
          decelerationRate="fast"
          onMomentumScrollEnd={onWheelEnd}
          contentContainerStyle={{ paddingVertical: PAD }}
          nestedScrollEnabled
        >
          {TIP_OUT_WHEEL_STEPS.map((step, index) => {
            const on = customPct === null && index === wheelIndex;
            return (
              <View key={step} style={styles.item}>
                <Text
                  style={[
                    styles.itemText,
                    { color: on ? accent : colors.textSecondary },
                    on && styles.itemTextOn,
                  ]}
                >
                  {formatPct(step)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.customRow}>
        <Text style={[styles.customLabel, { color: colors.textSecondary }]}>
          {t('tips_checkouts.wheel_custom')}
        </Text>
        <View
          style={[
            styles.customField,
            { backgroundColor: colors.glass, borderColor: colors.glassBorder },
            customPct !== null && { borderColor: `${accent}90` },
          ]}
        >
          <TextInput
            style={[styles.customInput, { color: colors.text }]}
            value={customText}
            onChangeText={(text) => setCustomText(text.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0.0"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={[styles.customPct, { color: colors.textSecondary }]}>%</Text>
        </View>
      </View>
    </GlassSheet>
  );
}

function nearestStepIndex(pct: number): number {
  let best = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  TIP_OUT_WHEEL_STEPS.forEach((step, index) => {
    const delta = Math.abs(step - pct);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = index;
    }
  });
  return best;
}

function isOnWheel(pct: number): boolean {
  return TIP_OUT_WHEEL_STEPS.some((step) => Math.abs(step - pct) < 1e-9);
}

function trimPctText(pct: number): string {
  const asPercent = pct * 100;
  return Number.isInteger(asPercent) ? `${asPercent}` : `${asPercent}`;
}

/** '2.5' → 0.025; empty/invalid → null (the wheel value stands). */
function parseCustom(text: string): number | null {
  if (!text.trim()) return null;
  const parsed = parseFloat(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed / 100;
}

const styles = StyleSheet.create({
  wheelWrap: { height: VISIBLE_H, alignSelf: 'center', width: 132 },
  wheel: { flexGrow: 0 },
  window: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: PAD,
    height: ITEM_H,
    borderRadius: 11,
    borderWidth: 1,
    zIndex: 1,
  },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: {
    fontFamily: fonts.mono.medium,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  itemTextOn: { fontFamily: fonts.mono.semibold, fontSize: 17 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  customLabel: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 13 },
  customField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    width: 110,
  },
  customInput: {
    flex: 1,
    fontFamily: fonts.mono.semibold,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    height: 44,
    paddingVertical: 0,
    textAlign: 'right',
  },
  customPct: { fontFamily: fonts.mono.semibold, fontSize: 14 },
  applyBtn: {
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
  },
  applyText: { fontFamily: fonts.body.semibold, fontSize: 14, color: '#FFFFFF' },
});
