import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { useLanguage } from '@/contexts/LanguageContext';
import { scheduleHue } from '@/components/schedule/scheduleVisuals';
import { formatDateRange, formatDateShort, formatTimeRange, localeFor } from '@/utils/schedule/format';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';

export interface ScheduleDecision {
  kind: string; // 'time_off' | 'pickup'
  id: string;
  status: string; // 'approved' | 'denied'
  my_role: string; // 'requester' | 'releaser' | 'claimer'
  decided_at: string | null;
  decision_reason: string | null;
  start_date: string | null;
  end_date: string | null;
  shift_date: string | null;
  start_time: string | null;
  end_time: string | null;
  roles: string[] | null;
  other_name: string | null;
}

/**
 * The Schedule tab's decision notices (s83): one dismissible glass line per
 * unseen decision on my own requests / releases / pick-ups — green when approved,
 * red when denied, the manager's reason in a quote. ✕ (or simply visiting the
 * tab) acks EVERYTHING via ack_schedule_decisions, which also clears the shade
 * rows, the tab ring and the home-icon badge.
 */
export default function DecisionBlurb({ decisions, onDismiss }: { decisions: ScheduleDecision[]; onDismiss: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const { language } = useLanguage();
  const locale = localeFor(language);
  if (!decisions.length) return null;

  const line = (d: ScheduleDecision): string => {
    const approved = d.status === 'approved';
    if (d.kind === 'time_off' && d.start_date) {
      const range = formatDateRange(d.start_date, d.end_date, locale);
      return approved ? t('shift_tools.blurb_time_off_approved', { range }) : t('shift_tools.blurb_time_off_denied', { range });
    }
    const when = d.shift_date && d.start_time && d.end_time
      ? `${formatDateShort(d.shift_date, locale)} · ${formatTimeRange(d.start_time, d.end_time, locale)}`
      : '';
    const role = d.roles && d.roles.length ? d.roles[0] : t('notifications.shift_generic_role');
    const other = d.other_name || t('notifications.an_employee');
    if (d.my_role === 'releaser') {
      return approved
        ? t('shift_tools.blurb_release_approved', { name: other, role, when })
        : t('shift_tools.blurb_release_denied', { name: other, role, when });
    }
    return approved
      ? t('shift_tools.blurb_pickup_approved', { role, when })
      : t('shift_tools.blurb_pickup_denied', { role, when, name: other });
  };

  return (
    <View style={styles.stack}>
      {decisions.map((d, i) => {
        const approved = d.status === 'approved';
        const hue = scheduleHue(approved ? 'ok' : 'bad', isDark);
        return (
          <View key={d.kind + d.id + d.my_role} style={[styles.blurb, { backgroundColor: hexToRgba(hue, 0.12), borderColor: hexToRgba(hue, 0.32) }]}>
            <IconSymbol
              ios_icon_name={approved ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
              android_material_icon_name={approved ? 'check-circle' : 'cancel'}
              size={18}
              color={hue}
            />
            <View style={styles.body}>
              <Text style={[styles.text, { color: colors.text }]}>{line(d)}</Text>
              {!!d.decision_reason && (
                <Text style={[styles.quote, { color: colors.textSecondary, borderLeftColor: hexToRgba(hue, 0.45) }]}>
                  “{d.decision_reason}”
                </Text>
              )}
            </View>
            {i === 0 && (
              <Pressable onPress={onDismiss} hitSlop={8} style={styles.x} accessibilityLabel={t('common.dismiss', 'Dismiss')}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={14} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8, marginBottom: 12 }, // room before the shifts card (Steve's device round, s83)
  blurb: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 11,
    paddingLeft: 12,
    paddingRight: 36,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    position: 'relative',
  },
  body: { flex: 1, minWidth: 0 },
  text: { fontFamily: fonts.body.medium, fontSize: 13, lineHeight: 17 },
  quote: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 16, fontStyle: 'italic', marginTop: 5, paddingLeft: 9, borderLeftWidth: 2 },
  x: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
