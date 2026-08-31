/**
 * Checkout details (s78): the saved snapshot behind a Journal entry — the
 * settled verdict, every tip-out line with its math, cash and declare. Opens
 * from the small receipt glyph on an entry row.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTipsAccent } from '@/components/tips/useTipsAccent';
import { formatMoney } from '@/components/tips/TipsBits';
import { formatPct } from '@/utils/tips/checkoutMath';
import type { CheckoutSnapshot } from '@/utils/tips/journal';
import { fonts } from '@/constants/fonts';

export default function CheckoutDetailSheet({
  snapshot,
  onClose,
}: {
  snapshot: CheckoutSnapshot | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const accent = useTipsAccent();

  const facts = snapshot ? snapshotFacts(snapshot) : null;

  return (
    <GlassSheet
      visible={snapshot !== null}
      onClose={onClose}
      title={t('tips_checkouts.detail_title')}
      subtitle={
        snapshot?.mode === 'pooled'
          ? t('tips_checkouts.detail_pooled_sub', { n: snapshot.pooled?.result.serverCount ?? 0 })
          : t('tips_checkouts.detail_solo_sub')
      }
    >
      {facts && (
        <>
          <View
            style={[
              styles.verdict,
              facts.owesHouse
                ? { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.35)' }
                : { backgroundColor: `${accent}14`, borderColor: `${accent}55` },
            ]}
          >
            <Text
              style={[styles.verdictLabel, { color: facts.owesHouse ? '#EF4444' : accent }]}
            >
              {(facts.owesHouse
                ? t('tips_checkouts.res_you_owe')
                : t('tips_checkouts.res_house_owes')
              ).toUpperCase()}
            </Text>
            <Text style={[styles.verdictValue, { color: facts.owesHouse ? '#EF4444' : accent }]}>
              {formatMoney(facts.tally)}
            </Text>
          </View>

          <Line label={t('tips_checkouts.log_sales')} value={formatMoney(facts.sales)} />
          {facts.tipOuts.map((line) => (
            <Line
              key={line.title}
              label={`${line.title} · ${formatPct(line.pct)}`}
              value={formatMoney(line.amount)}
            />
          ))}
          <Line
            label={t('tips_checkouts.res_cash_line')}
            value={`${facts.cash >= 0 ? '+' : '−'}${formatMoney(facts.cash)}`}
            tone={facts.cash >= 0 ? 'pos' : 'neg'}
          />
          <Line
            label={t('tips_checkouts.res_declare_line', { pct: formatPct(facts.declarePct) })}
            value={formatMoney(facts.declareAmount)}
          />
          {facts.perServer !== null && (
            <Line
              label={t('tips_checkouts.detail_per_server')}
              value={formatMoney(facts.perServer)}
            />
          )}
        </>
      )}
    </GlassSheet>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  const colors = useThemeColors();
  const valueColor = tone === 'pos' ? '#10B981' : tone === 'neg' ? '#EF4444' : colors.text;
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.lineDots, { borderBottomColor: colors.hairline }]} />
      <Text style={[styles.lineValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function snapshotFacts(snapshot: CheckoutSnapshot) {
  if (snapshot.mode === 'pooled' && snapshot.pooled) {
    const { inputs, result } = snapshot.pooled;
    return {
      owesHouse: result.owesHouse,
      tally: result.tally,
      sales: result.poolSales,
      cash: result.poolCash,
      tipOuts: result.tipOuts,
      declarePct: inputs.declarePct,
      declareAmount: result.declareAmount,
      perServer: result.tallyPerServer,
    };
  }
  if (snapshot.solo) {
    const { inputs, result } = snapshot.solo;
    return {
      owesHouse: result.owesHouse,
      tally: result.tally,
      sales: inputs.sales,
      cash: result.cash,
      tipOuts: result.tipOuts,
      declarePct: inputs.declarePct,
      declareAmount: result.declareAmount,
      perServer: null,
    };
  }
  return null;
}

const styles = StyleSheet.create({
  verdict: {
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 12,
    gap: 2,
  },
  verdictLabel: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2 },
  verdictValue: { fontFamily: fonts.mono.semibold, fontSize: 26, fontVariant: ['tabular-nums'] },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 7, paddingVertical: 5 },
  lineLabel: { fontFamily: fonts.body.medium, fontSize: 12, flexShrink: 1 },
  lineDots: { flex: 1, borderBottomWidth: 1.5, borderStyle: 'dotted', transform: [{ translateY: -3 }] },
  lineValue: { fontFamily: fonts.mono.semibold, fontSize: 12.5, fontVariant: ['tabular-nums'] },
});
