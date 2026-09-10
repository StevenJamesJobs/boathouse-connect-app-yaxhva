import React from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { fonts } from '@/constants/fonts';
import { formatDayLead, formatTimeRange, localeFor } from '@/utils/schedule/format';

export interface ShiftRowShift {
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[] | null;
  is_opener?: boolean | null;
  is_closer?: boolean | null;
  is_training?: boolean | null;
  room_assignment?: string | null;
}

/**
 * ONE shift line for the whole family — mono day lead · mono time range ·
 * O / C / T flag squares · role pill · optional room — so Schedules, Review,
 * Roster, My Schedule, the release sheet and the available-shifts list all draw
 * the same shift. `leading` (an avatar) and `trailing` (a chip / pencil / ✕)
 * slot in without the row knowing what they are.
 */
export default function ShiftRow({
  shift,
  showDay = true,
  leading,
  trailing,
  onPress,
  dim = false,
  style,
  first = false,
  stacked = false,
  timeTrailing,
}: {
  shift: ShiftRowShift;
  showDay?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  dim?: boolean;
  style?: StyleProp<ViewStyle>;
  /** the first row in a card drops its top hairline */
  first?: boolean;
  /**
   * Two-line row: the time (a touch larger, plus `timeTrailing`) on line one;
   * the role pill, the O / C / T flags and the room on line two — so `trailing`
   * (Schedules' pencil + ✕, the Release control) owns the right edge alone and
   * the TIME never truncates ("5:00 – 11…" on a 390pt phone, sim smoke s83;
   * the line split is Steve's device-round call).
   */
  stacked?: boolean;
  /** rides the time line, right after the time (My Schedule's hours badge) */
  timeTrailing?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { language } = useLanguage();
  const locale = localeFor(language);
  const role = shift.roles && shift.roles.length ? shift.roles[0] : null;
  const flags: string[] = [];
  if (shift.is_opener) flags.push(t('schedule_common.flag_opener'));
  if (shift.is_closer) flags.push(t('schedule_common.flag_closer'));
  if (shift.is_training) flags.push(t('schedule_common.flag_training'));

  const rolePill = (
    <View style={[styles.rolePill, { backgroundColor: colors.primary + '24', borderColor: colors.primary + '42' }]}>
      <Text style={[styles.roleText, { color: colors.primary }]} numberOfLines={1}>
        {role}
      </Text>
    </View>
  );

  const body = (
    <View
      style={[
        styles.row,
        !first && { borderTopColor: colors.hairline, borderTopWidth: StyleSheet.hairlineWidth },
        dim && styles.dim,
        style,
      ]}
    >
      {leading}
      {showDay && (
        <Text style={[styles.day, { color: colors.textSecondary }]} numberOfLines={1}>
          {formatDayLead(shift.shift_date, locale)}
        </Text>
      )}
      <View style={styles.mid}>
        <View style={styles.timeLine}>
          <Text style={[styles.time, stacked && styles.timeStacked, { color: colors.text }]} numberOfLines={1}>
            {formatTimeRange(shift.start_time, shift.end_time, locale)}
          </Text>
          {timeTrailing}
        </View>
        {stacked && (!!role || flags.length > 0 || !!shift.room_assignment) && (
          <View style={styles.underLine}>
            {!!role && rolePill}
            {flags.map((f) => (
              <View key={f} style={[styles.flag, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                <Text style={[styles.flagText, { color: colors.textSecondary }]}>{f}</Text>
              </View>
            ))}
            {!!shift.room_assignment && (
              <Text style={[styles.room, { color: colors.textSecondary }]} numberOfLines={1}>
                {shift.room_assignment}
              </Text>
            )}
          </View>
        )}
        {!stacked && !!shift.room_assignment && (
          <Text style={[styles.room, { color: colors.textSecondary }]} numberOfLines={1}>
            {shift.room_assignment}
          </Text>
        )}
      </View>
      {!stacked &&
        flags.map((f) => (
          <View key={f} style={[styles.flag, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={[styles.flagText, { color: colors.textSecondary }]}>{f}</Text>
          </View>
        ))}
      {!stacked && !!role && rolePill}
      {trailing}
    </View>
  );

  if (!onPress) return body;
  return <Pressable onPress={onPress}>{body}</Pressable>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  dim: { opacity: 0.55 },
  day: { fontFamily: fonts.mono.semibold, fontSize: 11, width: 50 },
  mid: { flex: 1, minWidth: 0 },
  timeLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  underLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  time: { fontFamily: fonts.mono.semibold, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  timeStacked: { fontSize: 14 },
  room: { fontFamily: fonts.mono.medium, fontSize: 10, marginTop: 1, flexShrink: 1 },
  flag: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: { fontFamily: fonts.mono.semibold, fontSize: 9 },
  rolePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    maxWidth: 110,
  },
  roleText: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
});
