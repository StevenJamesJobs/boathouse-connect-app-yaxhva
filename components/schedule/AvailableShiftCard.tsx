import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { useLanguage } from '@/contexts/LanguageContext';
import { scheduleHue } from '@/components/schedule/scheduleVisuals';
import { formatDayLead, formatTimeRange, initialsOf, localeFor } from '@/utils/schedule/format';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';

export interface AvailableShift {
  release_id: string;
  shift_id: string;
  status: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[] | null;
  released_by: string;
  releaser_name: string | null;
  releaser_avatar: string | null;
  claimed_by_me: boolean;
}

/**
 * One released shift a coworker can pick up (s83): releaser avatar · "Released by
 * X" · day + time + role pill · the Pick Up chip — or the gold "Awaiting approval"
 * pill once I've claimed it. Used on the flip card's back and the see-all list.
 */
export default function AvailableShiftCard({
  row,
  onPickUp,
  busy = false,
  first = false,
}: {
  row: AvailableShift;
  onPickUp: (row: AvailableShift) => void;
  busy?: boolean;
  first?: boolean;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { language } = useLanguage();
  const locale = localeFor(language);
  const gold = scheduleHue('pending', isDark);
  const role = row.roles && row.roles.length ? row.roles[0] : null;

  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline }]}>
      <View style={[styles.avatar, { backgroundColor: colors.primary + '2E' }]}>
        <Text style={[styles.avatarText, { color: colors.primary }]}>{initialsOf(row.releaser_name)}</Text>
      </View>
      <View style={styles.body}>
        {/* role pill rides the who-line so the when-line keeps its full width
            (sim smoke, s83: time + pill + control truncated on a 390pt phone) */}
        <View style={styles.whoRow}>
          <Text style={[styles.who, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('shift_tools.released_by')}{' '}
            <Text style={{ color: colors.text, fontFamily: fonts.body.semibold }}>{row.releaser_name || t('notifications.an_employee')}</Text>
          </Text>
          {!!role && (
            <View style={[styles.rolePill, { backgroundColor: colors.primary + '24', borderColor: colors.primary + '42' }]}>
              <Text style={[styles.roleText, { color: colors.primary }]} numberOfLines={1}>{role}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.when, { color: colors.text }]} numberOfLines={1}>
          {formatDayLead(row.shift_date, locale)} · {formatTimeRange(row.start_time, row.end_time, locale)}
        </Text>
      </View>
      {row.claimed_by_me ? (
        <View style={[styles.pill, { backgroundColor: hexToRgba(gold, 0.16), borderColor: hexToRgba(gold, 0.34) }]}>
          <Text style={[styles.pillText, { color: gold }]} numberOfLines={1}>{t('shift_tools.awaiting')}</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => onPickUp(row)}
          disabled={busy}
          style={[styles.pickUp, { backgroundColor: colors.primary }, busy && { opacity: 0.6 }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.fireText} />
          ) : (
            <>
              <IconSymbol ios_icon_name="arrow.up.circle" android_material_icon_name="arrow-circle-up" size={14} color={colors.fireText} />
              <Text style={[styles.pickUpText, { color: colors.fireText }]}>{t('shift_tools.pick_up')}</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display.bold, fontSize: 12 },
  body: { flex: 1, minWidth: 0 },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  who: { fontFamily: fonts.body.regular, fontSize: 11.5, flexShrink: 1 },
  when: { fontFamily: fonts.mono.semibold, fontSize: 12.5, marginTop: 3, fontVariant: ['tabular-nums'] },
  rolePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth + 0.5, maxWidth: 96 },
  roleText: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
  pickUp: { height: 32, paddingHorizontal: 12, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pickUpText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  pill: { height: 30, paddingHorizontal: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth + 0.5, justifyContent: 'center' },
  pillText: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 0.6, textTransform: 'uppercase' },
});
