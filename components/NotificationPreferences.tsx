
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';

export default function NotificationPreferences() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.darkCard : colors.lightCard }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconSymbol
            ios_icon_name="bell.slash.fill"
            android_material_icon_name="notifications-off"
            size={24}
            color={isDark ? colors.darkSecondaryText : colors.lightSecondaryText}
          />
          <Text style={[styles.headerTitle, { color: isDark ? colors.darkText : colors.lightText }]}>
            Notifications
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={[styles.description, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
          Push notification preferences are temporarily unavailable. This feature will be re-enabled in a future update.
        </Text>
      </View>
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
    fontStyle: 'italic',
  },
});
