import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { IconSymbol } from './IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface NotificationPreferencesProps {
  variant?: 'manager' | 'employee'; // deprecated, kept for backward compatibility
}

interface NotificationPreferencesData {
  messages_enabled: boolean;
  rewards_enabled: boolean;
  announcements_enabled: boolean;
  events_enabled: boolean;
  special_features_enabled: boolean;
  custom_notifications_enabled: boolean;
}

export default function NotificationPreferences({ variant = 'employee' }: NotificationPreferencesProps) {
  const themeColors = useThemeColors();
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferencesData>({
    messages_enabled: true,
    rewards_enabled: true,
    announcements_enabled: true,
    events_enabled: true,
    special_features_enabled: true,
    custom_notifications_enabled: true,
  });

  useEffect(() => {
    loadPreferences();
  }, [user]);

  async function loadPreferences() {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is okay
        console.error('Error loading preferences:', error);
        return;
      }

      if (data) {
        setPreferences({
          messages_enabled: data.messages_enabled,
          rewards_enabled: data.rewards_enabled,
          announcements_enabled: data.announcements_enabled,
          events_enabled: data.events_enabled,
          special_features_enabled: data.special_features_enabled,
          custom_notifications_enabled: data.custom_notifications_enabled,
        });
      }
    } catch (error) {
      console.error('Error in loadPreferences:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updatePreference(key: keyof NotificationPreferencesData, value: boolean) {
    if (!user) return;

    // Optimistically update UI
    setPreferences(prev => ({ ...prev, [key]: value }));

    try {
      // Use RPC function to bypass RLS
      const { error } = await supabase.rpc('upsert_notification_preferences', {
        p_user_id: user.id,
        [`p_${key}`]: value,
      });

      if (error) {
        console.error('Error updating preference:', error);
        // Revert on error
        setPreferences(prev => ({ ...prev, [key]: !value }));
      }
    } catch (error) {
      console.error('Error in updatePreference:', error);
      // Revert on error
      setPreferences(prev => ({ ...prev, [key]: !value }));
    }
  }

  const preferenceItems = [
    {
      key: 'messages_enabled' as keyof NotificationPreferencesData,
      label: t('notifications.messages'),
      icon: 'message.fill',
      androidIcon: 'message',
      description: t('notifications.messages_desc'),
    },
    {
      key: 'rewards_enabled' as keyof NotificationPreferencesData,
      label: t('notifications.mcloones_bucks'),
      icon: 'dollarsign.circle.fill',
      androidIcon: 'attach-money',
      description: t('notifications.mcloones_bucks_desc'),
    },
    {
      key: 'announcements_enabled' as keyof NotificationPreferencesData,
      label: t('notifications.announcements'),
      icon: 'megaphone.fill',
      androidIcon: 'campaign',
      description: t('notifications.announcements_desc'),
    },
    {
      key: 'events_enabled' as keyof NotificationPreferencesData,
      label: t('notifications.events'),
      icon: 'calendar',
      androidIcon: 'event',
      description: t('notifications.events_desc'),
    },
    {
      key: 'special_features_enabled' as keyof NotificationPreferencesData,
      label: t('notifications.special_features'),
      icon: 'star.fill',
      androidIcon: 'star',
      description: t('notifications.special_features_desc'),
    },
    {
      key: 'custom_notifications_enabled' as keyof NotificationPreferencesData,
      label: t('notifications.management_updates'),
      icon: 'bell.fill',
      androidIcon: 'notifications',
      description: t('notifications.management_updates_desc'),
    },
  ];

  return (
    <View style={styles.content}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={themeColors.primary} />
              <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
                {t('notifications.loading')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.description, { color: themeColors.textSecondary }]}>
                {t('notifications.choose_notifications')}
              </Text>
              
              {preferenceItems.map((item, index) => (
                <View
                  key={item.key}
                  style={[
                    styles.preferenceItem,
                    index === preferenceItems.length - 1 && styles.lastItem,
                    { borderBottomColor: themeColors.border },
                  ]}
                >
                  <View style={styles.preferenceLeft}>
                    <IconSymbol
                      ios_icon_name={item.icon}
                      android_material_icon_name={item.androidIcon}
                      size={20}
                      color={themeColors.text}
                    />
                    <View style={styles.preferenceTextContainer}>
                      <Text style={[styles.preferenceLabel, { color: themeColors.text }]}>
                        {item.label}
                      </Text>
                      <Text style={[styles.preferenceDescription, { color: themeColors.textSecondary }]}>
                        {item.description}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={preferences[item.key]}
                    onValueChange={(value) => updatePreference(item.key, value)}
                    trackColor={{ false: '#767577', true: themeColors.primary }}
                    thumbColor="#f4f3f4"
                  />
                </View>
              ))}
            </>
          )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  preferenceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
    marginRight: 12,
  },
  preferenceTextContainer: {
    flex: 1,
  },
  preferenceLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  preferenceDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
});
