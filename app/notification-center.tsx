import React, { useState, useMemo, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { sendCustomNotification } from '@/utils/notificationHelpers';
import { supabase } from '@/app/integrations/supabase/client';

const JOB_TITLE_OPTIONS = [
  'Banquet Captain',
  'Banquets',
  'Bartender',
  'Busser',
  'Chef',
  'Host',
  'Kitchen',
  'Lead Server',
  'Manager',
  'Runner',
  'Server',
];

interface SentNotification {
  id: string;
  title: string;
  body: string;
  created_at: string;
  data: any;
}

export default function NotificationCenter() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const DESTINATION_OPTIONS = [
    { value: '', label: t('notification_center.opens_to_none') },
    { value: 'messages', label: t('notification_center.opens_to_messages') },
    { value: 'announcements', label: t('notification_center.opens_to_announcements') },
    { value: 'events', label: t('notification_center.opens_to_events') },
    { value: 'special_features', label: t('notification_center.opens_to_features') },
    { value: 'rewards', label: t('notification_center.opens_to_rewards') },
    { value: 'menus', label: t('notification_center.opens_to_menus') },
    { value: 'tools', label: t('notification_center.opens_to_tools') },
    { value: 'game_hub', label: t('notification_center.opens_to_game_hub') },
  ];

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [destination, setDestination] = useState('');
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [sending, setSending] = useState(false);

  // Audience targeting
  const [audienceMode, setAudienceMode] = useState<'all' | 'job_titles'>('all');
  const [selectedJobTitles, setSelectedJobTitles] = useState<string[]>([]);
  const [showAudiencePicker, setShowAudiencePicker] = useState(false);

  // Sent notification history
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');
  const [sentNotifications, setSentNotifications] = useState<SentNotification[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const maxTitleLength = 50;
  const maxBodyLength = 200;

  const loadSentHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await (supabase
        .from('custom_notifications') as any)
        .select('id, title, body, created_at, data')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setSentNotifications(data as SentNotification[]);
      }
    } catch (err) {
      console.error('Error loading sent history:', err);
    }
    setLoadingHistory(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'history') {
        loadSentHistory();
      }
    }, [activeTab])
  );

  const handleDeleteNotification = (notif: SentNotification) => {
    Alert.alert(
      'Delete Notification',
      `Remove "${notif.title}" from the notification shade for all users?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(notif.id);
            try {
              const { error } = await (supabase
                .from('custom_notifications') as any)
                .delete()
                .eq('id', notif.id);

              if (error) throw error;
              setSentNotifications(prev => prev.filter(n => n.id !== notif.id));
            } catch (err) {
              console.error('Error deleting notification:', err);
              Alert.alert('Error', 'Failed to delete notification.');
            }
            setDeletingId(null);
          },
        },
      ]
    );
  };

  const toggleJobTitle = (title: string) => {
    setSelectedJobTitles(prev => {
      if (prev.includes(title)) {
        return prev.filter(t => t !== title);
      }
      return [...prev, title];
    });
  };

  const getAudienceLabel = () => {
    if (audienceMode === 'all') return 'All Staff';
    if (selectedJobTitles.length === 0) return 'Select job titles...';
    if (selectedJobTitles.length <= 2) return selectedJobTitles.join(', ');
    return `${selectedJobTitles.length} job titles selected`;
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return '1d ago';
    return `${diffDays}d ago`;
  };

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

    if (audienceMode === 'job_titles' && selectedJobTitles.length === 0) {
      Alert.alert('Audience Required', 'Please select at least one job title.');
      return;
    }

    const audienceText = audienceMode === 'all'
      ? 'All Staff'
      : selectedJobTitles.join(', ');

    // Confirm sending
    Alert.alert(
      t('notification_center.send_confirm_title'),
      `${t('notification_center.send_confirm_body')}\n\n${t('notification_center.title_label')}: "${title}"\n${t('notification_center.message_label')}: "${body}"\nTo: ${audienceText}${destination ? `\n${t('notification_center.opens_to')}: ${DESTINATION_OPTIONS.find(d => d.value === destination)?.label}` : ''}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.send'),
          style: 'default',
          onPress: doSendNotification,
        },
      ]
    );
  }

  async function doSendNotification() {
    setSending(true);

    try {
      const extraData: Record<string, any> = {};
      if (destination) extraData.destination = destination;
      if (audienceMode === 'job_titles' && selectedJobTitles.length > 0) {
        extraData.job_titles = selectedJobTitles;
      }

      await sendCustomNotification(title, body, Object.keys(extraData).length > 0 ? extraData : undefined);

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
              setAudienceMode('all');
              setSelectedJobTitles([]);
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
              color={colors.primary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {t('notification_center.title')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Tabs: Compose / Sent History */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'compose' && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab('compose')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'compose' && { color: '#FFFFFF' }]}>
              Compose
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'history' && { backgroundColor: colors.primary }]}
            onPress={() => {
              setActiveTab('history');
              loadSentHistory();
            }}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'history' && { color: '#FFFFFF' }]}>
              Sent History
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'compose' ? (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <View style={styles.card}>
              <View style={styles.iconContainer}>
                <IconSymbol
                  ios_icon_name="megaphone.fill"
                  android_material_icon_name="campaign"
                  size={48}
                  color={colors.primary}
                />
              </View>

              <Text style={styles.cardTitle}>
                Send Notification
              </Text>

              <Text style={styles.cardDescription}>
                {t('notification_center.description')}
              </Text>

              {/* Audience Selector */}
              <View style={styles.inputContainer}>
                <View style={styles.inputHeader}>
                  <Text style={styles.inputLabel}>Send To</Text>
                </View>
                <TouchableOpacity
                  style={styles.destinationSelector}
                  onPress={() => setShowAudiencePicker(true)}
                >
                  <IconSymbol
                    ios_icon_name="person.2.fill"
                    android_material_icon_name="group"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={[
                    styles.destinationSelectorText,
                    audienceMode === 'job_titles' && selectedJobTitles.length === 0 && { color: colors.textSecondary },
                  ]}>
                    {getAudienceLabel()}
                  </Text>
                  <IconSymbol
                    ios_icon_name="chevron.down"
                    android_material_icon_name="expand-more"
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

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
                  placeholderTextColor={colors.textSecondary}
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
                  placeholderTextColor={colors.textSecondary}
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
                    !destination && { color: colors.textSecondary }
                  ]}>
                    {destination
                      ? DESTINATION_OPTIONS.find(d => d.value === destination)?.label
                      : t('notification_center.opens_to_placeholder')}
                  </Text>
                  <IconSymbol
                    ios_icon_name="chevron.down"
                    android_material_icon_name="expand-more"
                    size={20}
                    color={colors.textSecondary}
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
                            color={colors.primary}
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </TouchableOpacity>
              </Modal>

              {/* Audience Picker Modal */}
              <Modal
                visible={showAudiencePicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowAudiencePicker(false)}
              >
                <TouchableOpacity
                  style={styles.pickerOverlay}
                  activeOpacity={1}
                  onPress={() => setShowAudiencePicker(false)}
                >
                  <View style={styles.pickerContainer}>
                    <Text style={styles.pickerTitle}>Send To</Text>
                    {/* All Staff option */}
                    <TouchableOpacity
                      style={[styles.pickerOption, audienceMode === 'all' && styles.pickerOptionSelected]}
                      onPress={() => {
                        setAudienceMode('all');
                        setSelectedJobTitles([]);
                        setShowAudiencePicker(false);
                      }}
                    >
                      <View style={styles.audienceOptionRow}>
                        <IconSymbol
                          ios_icon_name="person.2.fill"
                          android_material_icon_name="group"
                          size={18}
                          color={audienceMode === 'all' ? colors.primary : colors.textSecondary}
                        />
                        <Text style={[
                          styles.pickerOptionText,
                          audienceMode === 'all' && styles.pickerOptionTextSelected,
                        ]}>
                          All Staff
                        </Text>
                      </View>
                      {audienceMode === 'all' && (
                        <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={18} color={colors.primary} />
                      )}
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={[styles.audienceDivider, { backgroundColor: colors.border }]} />
                    <Text style={[styles.audienceSectionLabel, { color: colors.textSecondary }]}>By Job Title</Text>

                    {/* Job title checkboxes */}
                    {JOB_TITLE_OPTIONS.map((jt) => {
                      const isSelected = selectedJobTitles.includes(jt);
                      return (
                        <TouchableOpacity
                          key={jt}
                          style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]}
                          onPress={() => {
                            setAudienceMode('job_titles');
                            toggleJobTitle(jt);
                          }}
                        >
                          <Text style={[
                            styles.pickerOptionText,
                            isSelected && styles.pickerOptionTextSelected,
                          ]}>
                            {jt}
                          </Text>
                          {isSelected && (
                            <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={18} color={colors.primary} />
                          )}
                        </TouchableOpacity>
                      );
                    })}

                    {/* Done button */}
                    <TouchableOpacity
                      style={[styles.audienceDoneBtn, { backgroundColor: colors.primary }]}
                      onPress={() => setShowAudiencePicker(false)}
                    >
                      <Text style={styles.audienceDoneBtnText}>Done</Text>
                    </TouchableOpacity>
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
                    {audienceMode === 'job_titles' && selectedJobTitles.length > 0 && (
                      <Text style={[styles.previewAudience, { color: colors.textSecondary }]}>
                        To: {selectedJobTitles.join(', ')}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Send Button */}
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!title.trim() || !body.trim() || sending || (audienceMode === 'job_titles' && selectedJobTitles.length === 0)) && styles.sendButtonDisabled,
                ]}
                onPress={handleSendNotification}
                disabled={!title.trim() || !body.trim() || sending || (audienceMode === 'job_titles' && selectedJobTitles.length === 0)}
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
                    <Text style={styles.sendButtonText}>
                      {audienceMode === 'all' ? t('notification_center.send_button') : `Send to ${selectedJobTitles.length} Group${selectedJobTitles.length !== 1 ? 's' : ''}`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Info */}
              <View style={styles.infoContainer}>
                <IconSymbol
                  ios_icon_name="info.circle"
                  android_material_icon_name="info"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={styles.infoText}>
                  {t('notification_center.preferences_hint')}
                </Text>
              </View>
            </View>
          </ScrollView>
        ) : (
          /* Sent History Tab */
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <View style={styles.card}>
              <View style={styles.iconContainer}>
                <IconSymbol
                  ios_icon_name="clock.arrow.circlepath"
                  android_material_icon_name="history"
                  size={48}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.cardTitle}>Sent Notifications</Text>
              <Text style={styles.cardDescription}>
                View and manage recently sent custom notifications. Deleting a notification removes it from the notification shade for all users.
              </Text>

              {loadingHistory ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
              ) : sentNotifications.length === 0 ? (
                <View style={styles.historyEmpty}>
                  <Text style={[styles.historyEmptyText, { color: colors.textSecondary }]}>
                    No custom notifications sent yet.
                  </Text>
                </View>
              ) : (
                sentNotifications.map((notif) => (
                  <View key={notif.id} style={[styles.historyItem, { borderColor: colors.border }]}>
                    <View style={styles.historyItemContent}>
                      <Text style={[styles.historyItemTitle, { color: colors.text }]} numberOfLines={1}>
                        {notif.title}
                      </Text>
                      <Text style={[styles.historyItemBody, { color: colors.textSecondary }]} numberOfLines={2}>
                        {notif.body}
                      </Text>
                      <View style={styles.historyItemMeta}>
                        <Text style={[styles.historyItemTime, { color: colors.textSecondary }]}>
                          {getTimeAgo(notif.created_at)}
                        </Text>
                        {notif.data?.job_titles && (
                          <Text style={[styles.historyItemAudience, { color: colors.primary }]}>
                            To: {(notif.data.job_titles as string[]).join(', ')}
                          </Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.historyDeleteBtn}
                      onPress={() => handleDeleteNotification(notif)}
                      disabled={deletingId === notif.id}
                    >
                      {deletingId === notif.id ? (
                        <ActivityIndicator size="small" color="#FF3B30" />
                      ) : (
                        <IconSymbol
                          ios_icon_name="trash.fill"
                          android_material_icon_name="delete"
                          size={20}
                          color="#FF3B30"
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 0,
    backgroundColor: colors.card,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
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
    backgroundColor: colors.card,
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
    color: colors.text,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    color: colors.textSecondary,
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
    color: colors.text,
  },
  characterCount: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.background,
    color: colors.text,
    borderColor: colors.border,
  },
  bodyInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    backgroundColor: colors.background,
    color: colors.text,
    borderColor: colors.border,
  },
  previewContainer: {
    marginBottom: 20,
  },
  previewLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: colors.textSecondary,
  },
  previewCard: {
    borderRadius: 12,
    padding: 16,
    backgroundColor: colors.background,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    color: colors.text,
  },
  previewBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: colors.highlight,
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
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  destinationSelectorText: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  destinationHint: {
    fontSize: 12,
    color: colors.textSecondary,
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
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
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
    backgroundColor: colors.background,
  },
  pickerOptionText: {
    fontSize: 16,
    color: colors.text,
  },
  pickerOptionTextSelected: {
    color: colors.highlight,
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
    color: colors.textSecondary,
  },
  // Audience picker
  audienceOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  audienceDivider: {
    height: 1,
    marginVertical: 8,
  },
  audienceSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    paddingHorizontal: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  audienceDoneBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  audienceDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  previewAudience: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 6,
  },
  // Sent History
  historyEmpty: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  historyEmptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 12,
  },
  historyItemContent: {
    flex: 1,
  },
  historyItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  historyItemBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  historyItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  historyItemTime: {
    fontSize: 11,
  },
  historyItemAudience: {
    fontSize: 11,
    fontWeight: '600',
  },
  historyDeleteBtn: {
    padding: 8,
  },
});
