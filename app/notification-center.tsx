import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { managerColors } from '@/styles/commonStyles';
import { sendCustomNotification } from '@/utils/notificationHelpers';

export default function NotificationCenter() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const maxTitleLength = 50;
  const maxBodyLength = 200;

  async function handleSendNotification() {
    // Validation
    if (!title.trim()) {
      Alert.alert('Title Required', 'Please enter a notification title');
      return;
    }

    if (!body.trim()) {
      Alert.alert('Message Required', 'Please enter a notification message');
      return;
    }

    // Confirm sending
    Alert.alert(
      'Send Notification?',
      `This will send a notification to all staff members.\n\nTitle: "${title}"\nMessage: "${body}"`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'default',
          onPress: sendNotification,
        },
      ]
    );
  }

  async function sendNotification() {
    setSending(true);

    try {
      await sendCustomNotification(title, body);

      Alert.alert(
        '✅ Notification Sent!',
        'Your notification has been sent to all staff members.',
        [
          {
            text: 'OK',
            onPress: () => {
              setTitle('');
              setBody('');
              router.back();
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error sending notification:', error);
      console.error('Error context:', JSON.stringify(error?.context));

      // Try to get the actual error message from the response
      let errorMessage = 'Failed to send notification. Please try again.';

      if (error?.context) {
        try {
          // Clone the response before reading it
          const response = error.context;
          if (typeof response.text === 'function') {
            const textResponse = await response.text();
            console.error('Error response text:', textResponse);
            try {
              const errorData = JSON.parse(textResponse);
              errorMessage = errorData.error || errorData.message || errorMessage;
              console.error('Parsed error data:', errorData);
            } catch (e) {
              console.error('Could not parse error as JSON');
              errorMessage = textResponse || errorMessage;
            }
          }
        } catch (e) {
          console.error('Could not read error response:', e);
        }
      }

      Alert.alert(
        'Error',
        errorMessage,
        [{ text: 'OK' }]
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow-back"
              size={24}
              color={managerColors.highlight}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            Notification Center
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <IconSymbol
                ios_icon_name="megaphone.fill"
                android_material_icon_name="campaign"
                size={48}
                color={managerColors.highlight}
              />
            </View>

            <Text style={styles.cardTitle}>
              Send Notification to All Staff
            </Text>

            <Text style={styles.cardDescription}>
              This notification will be sent to all staff members who have notifications enabled.
            </Text>

            {/* Title Input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputHeader}>
                <Text style={styles.inputLabel}>
                  Title
                </Text>
                <Text style={styles.characterCount}>
                  {title.length}/{maxTitleLength}
                </Text>
              </View>
              <TextInput
                style={styles.titleInput}
                placeholder="Enter notification title"
                placeholderTextColor={managerColors.textSecondary}
                value={title}
                onChangeText={(text) => {
                  if (text.length <= maxTitleLength) {
                    setTitle(text);
                  }
                }}
                maxLength={maxTitleLength}
              />
            </View>

            {/* Body Input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputHeader}>
                <Text style={styles.inputLabel}>
                  Message
                </Text>
                <Text style={styles.characterCount}>
                  {body.length}/{maxBodyLength}
                </Text>
              </View>
              <TextInput
                style={styles.bodyInput}
                placeholder="Enter notification message"
                placeholderTextColor={managerColors.textSecondary}
                value={body}
                onChangeText={(text) => {
                  if (text.length <= maxBodyLength) {
                    setBody(text);
                  }
                }}
                maxLength={maxBodyLength}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Preview */}
            {(title || body) && (
              <View style={styles.previewContainer}>
                <Text style={styles.previewLabel}>
                  Preview:
                </Text>
                <View style={styles.previewCard}>
                  {title && (
                    <Text style={styles.previewTitle}>
                      {title}
                    </Text>
                  )}
                  {body && (
                    <Text style={styles.previewBody}>
                      {body}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Send Button */}
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!title.trim() || !body.trim() || sending) && styles.sendButtonDisabled,
              ]}
              onPress={handleSendNotification}
              disabled={!title.trim() || !body.trim() || sending}
            >
              {sending ? (
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

            {/* Info */}
            <View style={styles.infoContainer}>
              <IconSymbol
                ios_icon_name="info.circle"
                android_material_icon_name="info"
                size={16}
                color={managerColors.textSecondary}
              />
              <Text style={styles.infoText}>
                Staff members can manage their notification preferences in their profile settings
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
    backgroundColor: managerColors.card,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: managerColors.text,
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
    backgroundColor: managerColors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: managerColors.text,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    color: managerColors.textSecondary,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
  },
  characterCount: {
    fontSize: 12,
    color: managerColors.textSecondary,
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    backgroundColor: managerColors.background,
    color: managerColors.text,
    borderColor: managerColors.border,
  },
  bodyInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    backgroundColor: managerColors.background,
    color: managerColors.text,
    borderColor: managerColors.border,
  },
  previewContainer: {
    marginBottom: 20,
  },
  previewLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: managerColors.textSecondary,
  },
  previewCard: {
    borderRadius: 12,
    padding: 16,
    backgroundColor: managerColors.background,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    color: managerColors.text,
  },
  previewBody: {
    fontSize: 14,
    lineHeight: 20,
    color: managerColors.textSecondary,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: managerColors.highlight,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: managerColors.textSecondary,
  },
});
