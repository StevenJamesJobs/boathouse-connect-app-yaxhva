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
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { managerColors } from '@/styles/commonStyles';
import { sendCustomNotification } from '@/utils/notificationHelpers';

export default function NotificationCenter() {
  const router = useRouter();
  const { t } = useTranslation();

  const DESTINATION_OPTIONS = [
    { value: '', label: t('notification_center.opens_to_none') },
    { value: 'messages', label: t('notification_center.opens_to_messages') },
    { value: 'announcements', label: t('notification_center.opens_to_announcements') },
    { value: 'events', label: t('notification_center.opens_to_events') },
    { value: 'special_features', label: t('notification_center.opens_to_features') },
    { value: 'rewards', label: t('notification_center.opens_to_rewards') },
    { value: 'menus', label: t('notification_center.opens_to_menus') },
    { value: 'tools', label: t('notification_center.opens_to_tools') },
  ];

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [destination, setDestination] = useState('');
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [sending, setSending] = useState(false);

  const maxTitleLength = 50;
  const maxBodyLength = 200;

  async function handleSendNotification() {
    // Validation
    if (!title.trim()) {
      Alert.alert(t('notification_center.title_required'), t('notification_center.title_required_message'));
      return;
    }

    if (!body.trim()) {
      Alert.alert(t('notification_center.message_required'), t('notification_center.message_required_message'));
      return;
    }

    // Confirm sending
    Alert.alert(
      t('notification_center.send_confirm_title'),
      `${t('notification_center.send_confirm_body')}\n\n${t('notification_center.title_label')}: "${title}"\n${t('notification_center.message_label')}: "${body}"${destination ? `\n${t('notification_center.opens_to')}: ${DESTINATION_OPTIONS.find(d => d.value === destination)?.label}` : ''}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.send'),
          style: 'default',
          onPress: sendNotification,
        },
      ]
    );
  }

  async function sendNotification() {
    setSending(true);

    try {
      await sendCustomNotification(title, body, destination ? { destination } : undefined);

      Alert.alert(
        t('notification_center.sent_title'),
        t('notification_center.sent_body'),
        [
          {
            text: t('common.ok'),
            onPress: () => {
              setTitle('');
              setBody('');
              setDestination('');
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
        t('notification_center.error_title'),
        errorMessage,
        [{ text: t('common.ok') }]
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
            {t('notification_center.title')}
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
              {t('notification_center.send_to_all')}
            </Text>

            <Text style={styles.cardDescription}>
              {t('notification_center.description')}
            </Text>

            {/* Title Input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputHeader}>
                <Text style={styles.inputLabel}>
                  {t('notification_center.title_label')}
                </Text>
                <Text style={styles.characterCount}>
                  {title.length}/{maxTitleLength}
                </Text>
              </View>
              <TextInput
                style={styles.titleInput}
                placeholder={t('notification_center.title_placeholder')}
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
                  {t('notification_center.message_label')}
                </Text>
                <Text style={styles.characterCount}>
                  {body.length}/{maxBodyLength}
                </Text>
              </View>
              <TextInput
                style={styles.bodyInput}
                placeholder={t('notification_center.message_placeholder')}
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

            {/* Destination Picker */}
            <View style={styles.inputContainer}>
              <View style={styles.inputHeader}>
                <Text style={styles.inputLabel}>
                  {t('notification_center.opens_to')}
                </Text>
                <Text style={styles.characterCount}>
                  Optional
                </Text>
              </View>
              <TouchableOpacity
                style={styles.destinationSelector}
                onPress={() => setShowDestinationPicker(true)}
              >
                <Text style={[
                  styles.destinationSelectorText,
                  !destination && { color: managerColors.textSecondary }
                ]}>
                  {destination
                    ? DESTINATION_OPTIONS.find(d => d.value === destination)?.label
                    : t('notification_center.opens_to_placeholder')}
                </Text>
                <IconSymbol
                  ios_icon_name="chevron.down"
                  android_material_icon_name="expand-more"
                  size={20}
                  color={managerColors.textSecondary}
                />
              </TouchableOpacity>
              <Text style={styles.destinationHint}>
                {t('notification_center.opens_to_hint')}
              </Text>
            </View>

            {/* Destination Picker Modal */}
            <Modal
              visible={showDestinationPicker}
              transparent
              animationType="fade"
              onRequestClose={() => setShowDestinationPicker(false)}
            >
              <TouchableOpacity
                style={styles.pickerOverlay}
                activeOpacity={1}
                onPress={() => setShowDestinationPicker(false)}
              >
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerTitle}>{t('notification_center.opens_to')}</Text>
                  {DESTINATION_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.pickerOption,
                        destination === option.value && styles.pickerOptionSelected,
                      ]}
                      onPress={() => {
                        setDestination(option.value);
                        setShowDestinationPicker(false);
                      }}
                    >
                      <Text style={[
                        styles.pickerOptionText,
                        destination === option.value && styles.pickerOptionTextSelected,
                      ]}>
                        {option.label}
                      </Text>
                      {destination === option.value && (
                        <IconSymbol
                          ios_icon_name="checkmark"
                          android_material_icon_name="check"
                          size={18}
                          color={managerColors.highlight}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableOpacity>
            </Modal>

            {/* Preview */}
            {(title || body) && (
              <View style={styles.previewContainer}>
                <Text style={styles.previewLabel}>
                  {t('notification_center.preview')}
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
                  <Text style={styles.sendButtonText}>{t('notification_center.send_button')}</Text>
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
                {t('notification_center.preferences_hint')}
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
  destinationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    backgroundColor: managerColors.background,
    borderColor: managerColors.border,
  },
  destinationSelectorText: {
    fontSize: 16,
    color: managerColors.text,
    flex: 1,
  },
  destinationHint: {
    fontSize: 12,
    color: managerColors.textSecondary,
    marginTop: 6,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: managerColors.card,
    borderRadius: 16,
    padding: 20,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 4,
  },
  pickerOptionSelected: {
    backgroundColor: managerColors.background,
  },
  pickerOptionText: {
    fontSize: 16,
    color: managerColors.text,
  },
  pickerOptionTextSelected: {
    color: managerColors.highlight,
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
