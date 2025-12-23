
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
  useColorScheme,
} from 'react-native';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useNotifications } from '@/contexts/NotificationContext';

export default function NotificationPreferences() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { preferences, updatePreferences, refreshPreferences } = useNotifications();
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [localPreferences, setLocalPreferences] = useState(preferences);

  useEffect(() => {
    setLocalPreferences(preferences);
  }, [preferences]);

  const handleToggle = async (key: keyof typeof preferences, value: boolean) => {
    if (!localPreferences) return;

    try {
      setIsLoading(true);
      setLocalPreferences({ ...localPreferences, [key]: value });
      
      await updatePreferences({ [key]: value });
      
      console.log('Notification preference updated:', key, value);
    } catch (error) {
      console.error('Error updating preference:', error);
      Alert.alert('Error', 'Failed to update notification preference');
      // Revert on error
      await refreshPreferences();
    } finally {
      setIsLoading(false);
    }
  };

  if (!localPreferences) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? colors.darkCard : colors.lightCard }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.darkCard : colors.lightCard }]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <IconSymbol
            ios_icon_name="bell.fill"
            android_material_icon_name="notifications"
            size={24}
            color={colors.primary}
          />
          <Text style={[styles.headerTitle, { color: isDark ? colors.darkText : colors.lightText }]}>
            Notifications
          </Text>
        </View>
        <IconSymbol
          ios_icon_name={isExpanded ? 'chevron.up' : 'chevron.down'}
          android_material_icon_name={isExpanded ? 'expand_less' : 'expand_more'}
          size={24}
          color={isDark ? colors.darkSecondaryText : colors.lightSecondaryText}
        />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          <Text style={[styles.description, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
            Choose which notifications you want to receive
          </Text>

          <View style={styles.preferencesList}>
            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={[styles.preferenceTitle, { color: isDark ? colors.darkText : colors.lightText }]}>
                  Messages
                </Text>
                <Text style={[styles.preferenceDescription, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
                  Get notified when you receive new messages
                </Text>
              </View>
              <Switch
                value={localPreferences.messages_enabled}
                onValueChange={(value) => handleToggle('messages_enabled', value)}
                disabled={isLoading}
                trackColor={{ false: isDark ? '#3A3A3C' : '#D1D1D6', true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.darkBorder : colors.lightBorder }]} />

            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={[styles.preferenceTitle, { color: isDark ? colors.darkText : colors.lightText }]}>
                  Rewards
                </Text>
                <Text style={[styles.preferenceDescription, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
                  Get notified when you earn McLoone&apos;s Bucks
                </Text>
              </View>
              <Switch
                value={localPreferences.rewards_enabled}
                onValueChange={(value) => handleToggle('rewards_enabled', value)}
                disabled={isLoading}
                trackColor={{ false: isDark ? '#3A3A3C' : '#D1D1D6', true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.darkBorder : colors.lightBorder }]} />

            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={[styles.preferenceTitle, { color: isDark ? colors.darkText : colors.lightText }]}>
                  Announcements
                </Text>
                <Text style={[styles.preferenceDescription, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
                  Get notified about new announcements
                </Text>
              </View>
              <Switch
                value={localPreferences.announcements_enabled}
                onValueChange={(value) => handleToggle('announcements_enabled', value)}
                disabled={isLoading}
                trackColor={{ false: isDark ? '#3A3A3C' : '#D1D1D6', true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.darkBorder : colors.lightBorder }]} />

            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={[styles.preferenceTitle, { color: isDark ? colors.darkText : colors.lightText }]}>
                  Events
                </Text>
                <Text style={[styles.preferenceDescription, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
                  Get notified about upcoming events
                </Text>
              </View>
              <Switch
                value={localPreferences.events_enabled}
                onValueChange={(value) => handleToggle('events_enabled', value)}
                disabled={isLoading}
                trackColor={{ false: isDark ? '#3A3A3C' : '#D1D1D6', true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.darkBorder : colors.lightBorder }]} />

            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={[styles.preferenceTitle, { color: isDark ? colors.darkText : colors.lightText }]}>
                  Special Features
                </Text>
                <Text style={[styles.preferenceDescription, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
                  Get notified about new special features
                </Text>
              </View>
              <Switch
                value={localPreferences.special_features_enabled}
                onValueChange={(value) => handleToggle('special_features_enabled', value)}
                disabled={isLoading}
                trackColor={{ false: isDark ? '#3A3A3C' : '#D1D1D6', true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.darkBorder : colors.lightBorder }]} />

            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={[styles.preferenceTitle, { color: isDark ? colors.darkText : colors.lightText }]}>
                  Custom Notifications
                </Text>
                <Text style={[styles.preferenceDescription, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
                  Get notified about important updates from management
                </Text>
              </View>
              <Switch
                value={localPreferences.custom_notifications_enabled}
                onValueChange={(value) => handleToggle('custom_notifications_enabled', value)}
                disabled={isLoading}
                trackColor={{ false: isDark ? '#3A3A3C' : '#D1D1D6', true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>
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
    marginBottom: 16,
    lineHeight: 20,
  },
  preferencesList: {
    gap: 0,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  preferenceInfo: {
    flex: 1,
    marginRight: 12,
  },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  preferenceDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
});
