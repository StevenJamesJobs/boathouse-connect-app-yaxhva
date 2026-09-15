import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useAppTheme } from '@/contexts/ThemeContext';
import { fonts } from '@/constants/fonts';
import { INBOX_CAP, INBOX_WARN, msgHue } from './messageVisuals';

/**
 * The near-full inbox strip (L-A/L-B): a quiet gold meter instead of the old red
 * banner — "Inbox 36 / 40 · delete old messages to keep room" with a 54×3 bar.
 * Renders nothing below INBOX_WARN.
 */
export default function InboxMeter({ count }: { count: number }) {
  const { t } = useTranslation();
  const { colors, resolvedMode } = useAppTheme();
  if (count < INBOX_WARN) return null;
  const gold = msgHue('warn', resolvedMode === 'dark');
  const pct = Math.max(0, Math.min(1, count / INBOX_CAP));

  return (
    <View style={[styles.strip, { backgroundColor: gold + '1F', borderColor: gold + '4D' }]}>
      <IconSymbol ios_icon_name="info.circle" android_material_icon_name="info-outline" size={14} color={gold} />
      <Text style={[styles.text, { color: colors.text }]} numberOfLines={1}>
        {t('messages.inbox')}{' '}
        <Text style={[styles.num, { color: gold }]}>
          {count} / {INBOX_CAP}
        </Text>
        {' · '}
        {t('messages.inbox_meter_hint')}
      </Text>
      <View style={[styles.bar, { backgroundColor: colors.glassBorder }]}>
        <View style={[styles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: gold }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  text: { flex: 1, fontFamily: fonts.body.regular, fontSize: 11.5 },
  num: { fontFamily: fonts.mono.semibold, fontSize: 11 },
  bar: { width: 54, height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%' },
});
