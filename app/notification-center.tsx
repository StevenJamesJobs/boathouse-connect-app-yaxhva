
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useNotifications } from '@/contexts/NotificationContext';
import { useAuth } from '@/contexts/AuthContext';

export default function NotificationCenter() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { sendNotification } = useNotifications();
  const { user } = useAuth();
  
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSendNotification = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Error', 'Please enter both title and message');
      return;
    }

    Alert.alert(
      'Send Notification',
      'This will send a notification to all staff members. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'default',
          onPress: async () => {
            try {
              setIsSending(true);
              
              await sendNotification({
                notificationType: 'custom',
                title: title.trim(),
                body: body.trim(),
                data: {
                  type: 'custom',
                  sentBy: user?.name,
                },
              });

              Alert.alert('Success', 'Notification sent to all staff members!');
              setTitle('');
              setBody('');
            } catch (error) {
              console.error('Error sending notification:', error);
              Alert.alert('Error', 'Failed to send notification. Please try again.');
            } finally {
              setIsSending(false);
            }
          },
        },
      ]
    );
  };

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
            android_material_icon_name="arrow_back"
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
              ios_icon_name="bell.badge.fill"
              android_material_icon_name="notifications_active"
              size={48}
              color={colors.primary}
            />
          </View>
          
          <Text style={[styles.description, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
            Send custom notifications to all staff members. Use this for important announcements, 
            menu updates, or any time-sensitive information.
          </Text>

          <View style={styles.form}>
            <Text style={[styles.label, { color: isDark ? colors.darkText : colors.lightText }]}>
              Notification Title
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.darkBackground : colors.lightBackground,
                  color: isDark ? colors.darkText : colors.lightText,
                  borderColor: isDark ? colors.darkBorder : colors.lightBorder,
                }
              ]}
              placeholder="e.g., New Weekly Specials Added"
              placeholderTextColor={isDark ? colors.darkSecondaryText : colors.lightSecondaryText}
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />

            <Text style={[styles.label, { color: isDark ? colors.darkText : colors.lightText }]}>
              Message
            </Text>
            <TextInput
              style={[
                styles.textArea,
                {
                  backgroundColor: isDark ? colors.darkBackground : colors.lightBackground,
                  color: isDark ? colors.darkText : colors.lightText,
                  borderColor: isDark ? colors.darkBorder : colors.lightBorder,
                }
              ]}
              placeholder="Enter your message here..."
              placeholderTextColor={isDark ? colors.darkSecondaryText : colors.lightSecondaryText}
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={6}
              maxLength={500}
              textAlignVertical="top"
            />

            <Text style={[styles.charCount, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
              {body.length}/500 characters
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: colors.primary },
              (!title.trim() || !body.trim() || isSending) && styles.sendButtonDisabled
            ]}
            onPress={handleSendNotification}
            disabled={!title.trim() || !body.trim() || isSending}
          >
            {isSending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <IconSymbol
                  ios_icon_name="paperplane.fill"
                  android_material_icon_name="send"
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.sendButtonText}>Send to All Staff</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={[styles.infoBox, { backgroundColor: isDark ? colors.darkBackground : colors.lightBackground }]}>
            <IconSymbol
              ios_icon_name="info.circle.fill"
              android_material_icon_name="info"
              size={20}
              color={colors.primary}
            />
            <Text style={[styles.infoText, { color: isDark ? colors.darkSecondaryText : colors.lightSecondaryText }]}>
              Staff members can manage their notification preferences in their profile settings.
            </Text>
          </View>
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
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  form: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 120,
    marginBottom: 8,
  },
  charCount: {
    fontSize: 13,
    textAlign: 'right',
    marginBottom: 20,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
