
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';

export default function NotificationCenter() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.darkBackground : colors.lightBackground }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? colors.darkCard : colors.lightCard }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? colors.darkText : colors.lightText }]}>
          Notification Center
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={[styles.card, { backgroundColor: isDark ? colors.darkCard : colors.lightCard }]}>
          <View style={styles.iconContainer}>
            <IconSymbol
              ios_icon_name="bell.slash.fill"
              android_material_icon_name="notifications-off"
              size={64}
              color={isDark ? colors.darkSecondaryText : colors.lightSecondaryText}
            />
          </View>
          
          <Text style={[styles.title, { color: isDark ? colors.darkText : colors.lightText }]}>
            Push Notifications Temporarily Disabled
          </Text>
          
          <Text style={[styles.description, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
            Push notification functionality has been temporarily disabled to improve app stability. 
            This feature will be re-enabled in a future update.
          </Text>

          <Text style={[styles.description, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
            In the meantime, you can still:
          </Text>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.featureText, { color: isDark ? colors.darkText : colors.lightText }]}>
                Send and receive messages through the Messages tab
              </Text>
            </View>
            <View style={styles.featureItem}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.featureText, { color: isDark ? colors.darkText : colors.lightText }]}>
                View announcements on your home feed
              </Text>
            </View>
            <View style={styles.featureItem}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.featureText, { color: isDark ? colors.darkText : colors.lightText }]}>
                Check upcoming events and special features
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.backToHomeButton, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.backToHomeButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightBorder,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  card: {
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },
  featureList: {
    width: '100%',
    marginTop: 8,
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    marginLeft: 12,
  },
  backToHomeButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 8,
  },
  backToHomeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
