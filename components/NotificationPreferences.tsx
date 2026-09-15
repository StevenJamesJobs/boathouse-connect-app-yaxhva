/**
 * Notification preferences — the eight toggle rows (glass FormKit SwitchRows). Lives inside
 * the Profile's Settings pane; each flip writes immediately (optimistic, reverts on error).
 * `onSummary` reports "N of M on" for the Settings tile.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { SwitchRow } from '@/components/content/FormKit';
import { fonts } from '@/constants/fonts';

interface NotificationPreferencesData {
  messages_enabled: boolean;
  rewards_enabled: boolean;
  announcements_enabled: boolean;
  events_enabled: boolean;
  special_features_enabled: boolean;
  custom_notifications_enabled: boolean;
  game_hub_enabled: boolean;
  /** s83: a coworker released a shift you're qualified for */
  shift_releases_enabled: boolean;
}

const DEFAULTS: NotificationPreferencesData = {
  messages_enabled: true,
  rewards_enabled: true,
  announcements_enabled: true,
  events_enabled: true,
  special_features_enabled: true,
  custom_notifications_enabled: true,
  game_hub_enabled: true,
  shift_releases_enabled: true,
};

export const NOTIFICATION_PREF_COUNT = 8;

interface Props {
  /** "N of M on" for the tile that hosts this list. */
  onSummary?: (on: number, total: number) => void;
}

export default function NotificationPreferences({ onSummary }: Props) {
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const currencyName = organization?.reward_currency_name;
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferencesData>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase.rpc('get_my_notification_preferences', { p_actor_id: user.id });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!cancelled && row) {
          setPreferences({
            messages_enabled: row.messages_enabled ?? true,
            rewards_enabled: row.rewards_enabled ?? true,
            announcements_enabled: row.announcements_enabled ?? true,
            events_enabled: row.events_enabled ?? true,
            special_features_enabled: row.special_features_enabled ?? true,
            custom_notifications_enabled: row.custom_notifications_enabled ?? true,
            game_hub_enabled: row.game_hub_enabled ?? true,
            shift_releases_enabled: row.shift_releases_enabled ?? true,
          });
        }
      } catch (e) {
        console.error('Error loading notification preferences:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Report "N of M on" without depending on the callback's identity (an inline arrow from the
  // parent would otherwise re-fire this effect every render — the update-depth loop).
  const onSummaryRef = useRef(onSummary);
  onSummaryRef.current = onSummary;
  const lastOn = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return;
    const on = Object.values(preferences).filter(Boolean).length;
    if (lastOn.current === on) return;
    lastOn.current = on;
    onSummaryRef.current?.(on, NOTIFICATION_PREF_COUNT);
  }, [preferences, loading]);

  async function updatePreference(key: keyof NotificationPreferencesData, value: boolean) {
    if (!user) return;
    setPreferences((prev) => ({ ...prev, [key]: value }));
    try {
      const { error } = await supabase.rpc('upsert_notification_preferences', {
        p_user_id: user.id,
        [`p_${key}`]: value,
        p_organization_id: organizationId,
      } as any);
      if (error) throw error;
    } catch (e) {
      console.error('Error updating preference:', e);
      setPreferences((prev) => ({ ...prev, [key]: !value }));
    }
  }

  const items: { key: keyof NotificationPreferencesData; label: string; icon: string; android: string; description: string }[] = [
    { key: 'messages_enabled', label: t('notifications.messages'), icon: 'message.fill', android: 'message', description: t('notifications.messages_desc') },
    { key: 'rewards_enabled', label: t('notifications.mcloones_bucks', { currencyName }), icon: 'dollarsign.circle.fill', android: 'attach-money', description: t('notifications.mcloones_bucks_desc', { currencyName }) },
    { key: 'announcements_enabled', label: t('notifications.announcements'), icon: 'megaphone.fill', android: 'campaign', description: t('notifications.announcements_desc') },
    { key: 'events_enabled', label: t('notifications.events'), icon: 'calendar', android: 'event', description: t('notifications.events_desc') },
    { key: 'special_features_enabled', label: t('notifications.special_features'), icon: 'star.fill', android: 'star', description: t('notifications.special_features_desc') },
    { key: 'shift_releases_enabled', label: t('notifications.shift_releases'), icon: 'arrow.left.arrow.right', android: 'swap-horiz', description: t('notifications.shift_releases_desc') },
    { key: 'custom_notifications_enabled', label: t('notifications.management_updates'), icon: 'bell.fill', android: 'notifications', description: t('notifications.management_updates_desc') },
    { key: 'game_hub_enabled', label: t('notifications.game_hub'), icon: 'gamecontroller.fill', android: 'sports-esports', description: t('notifications.game_hub_desc') },
  ];

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('notifications.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      <Text style={[styles.intro, { color: colors.textSecondary }]}>{t('notifications.choose_notifications')}</Text>
      {items.map((item) => (
        <SwitchRow
          key={item.key}
          iosIcon={item.icon}
          androidIcon={item.android}
          title={item.label}
          subtitle={item.description}
          value={preferences[item.key]}
          onValueChange={(v) => updatePreference(item.key, v)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  intro: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 16, marginBottom: 2 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  loadingText: { fontFamily: fonts.body.regular, fontSize: 13 },
});
