import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  Switch,
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
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { sendCustomNotification } from '@/utils/notificationHelpers';
import { useTranslationSection } from '@/components/TranslationSection';
import i18n from '@/i18n';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AmbientGlow from '@/components/AmbientGlow';
import GlassCard from '@/components/GlassCard';
import ProcedureResizeHandle from '@/components/ProcedureResizeHandle';
import { fonts } from '@/constants/fonts';

// VALUES double as push-targeting filters matched against users.job_titles —
// they must stay English-canonical. Display goes through JOB_TITLE_LABEL_KEYS
// (value/label split, s62); an unmapped value falls back to the raw string.
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

const JOB_TITLE_LABEL_KEYS: Record<string, string> = {
  'Banquet Captain': 'job_titles.banquet_captain',
  'Banquets': 'job_titles.banquets',
  'Bartender': 'job_titles.bartender',
  'Busser': 'job_titles.busser',
  'Chef': 'job_titles.chef',
  'Host': 'job_titles.host',
  'Kitchen': 'job_titles.kitchen',
  'Lead Server': 'job_titles.lead_server',
  'Manager': 'job_titles.manager',
  'Runner': 'job_titles.runner',
  'Server': 'job_titles.server',
};

interface DismissedItem {
  id: string;
  notification_type: string;
  item_id: string;
  dismissed_title: string | null;
  dismissed_at: string;
}

export default function NotificationCenter() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
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
  const [titleEs, setTitleEs] = useState('');
  const [bodyEs, setBodyEs] = useState('');
  const [destination, setDestination] = useState('');
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendPush, setSendPush] = useState(true);

  // Message field auto-grow (mirrors the bartender recipe editors)
  const [bodyH, setBodyH] = useState(100);
  const [bodyDragH, setBodyDragH] = useState(0);

  // Audience targeting
  const [audienceMode, setAudienceMode] = useState<'all' | 'job_titles'>('all');
  const [selectedJobTitles, setSelectedJobTitles] = useState<string[]>([]);
  const [showAudiencePicker, setShowAudiencePicker] = useState(false);

  // Recently Dismissed (replaces the retired Sent History)
  const [activeTab, setActiveTab] = useState<'compose' | 'dismissed'>('compose');
  const [dismissedItems, setDismissedItems] = useState<DismissedItem[]>([]);
  const [loadingDismissed, setLoadingDismissed] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const maxTitleLength = 50;
  const maxBodyLength = 200;

  // Hybrid bilingual authoring (s61 shared section): the primary inputs bind
  // the composer's device language; the section holds the other-language
  // preview + translate button + pencil. resolveOnSave() runs the staleness
  // rules right before send. sessionKey bumps on every successful send so the
  // next compose starts a fresh session.
  const isSpanishAuthor = i18n.language === 'es';
  const sendSessionRef = useRef(0);
  const translation = useTranslationSection({
    fields: [
      {
        key: 'title',
        labelKey: 'translation_section:field_title',
        enValue: title,
        esValue: titleEs,
        setEnValue: setTitle,
        setEsValue: setTitleEs,
      },
      {
        key: 'body',
        labelKey: 'translation_section:field_description',
        enValue: body,
        esValue: bodyEs,
        setEnValue: setBody,
        setEsValue: setBodyEs,
        multiline: true,
      },
    ],
    sessionKey: `compose:${sendSessionRef.current}`,
    // Screen host (not a modal): the draft PERSISTS across tab flips, so
    // active stays true — flipping it would bump the session epoch, which
    // both silently cancels a confirmed in-flight send and re-runs
    // auto-fill against a half-edited draft. The session lifecycle is
    // keyed to sessionKey alone (bumped after each successful send).
    active: true,
  });

  const jobTitleLabel = (v: string) => {
    const key = JOB_TITLE_LABEL_KEYS[v];
    return key ? t(key) : v;
  };

  const loadDismissed = useCallback(async () => {
    setLoadingDismissed(true);
    try {
      const { data, error } = await (supabase.rpc as any)('get_recent_shade_dismissals', {
        p_actor_id: user?.id,
        p_limit: 40,
      });

      if (!error && data) setDismissedItems(data as DismissedItem[]);
    } catch (err) {
      console.error('Error loading dismissed items:', err);
    }
    setLoadingDismissed(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'dismissed') {
        loadDismissed();
      }
    }, [activeTab, loadDismissed])
  );

  const handleRestore = (item: DismissedItem) => {
    Alert.alert(
      t('notification_center.restore_title', 'Restore notification?'),
      t('notification_center.restore_body', "This brings it back to every staff member's notification shade. It does not affect the underlying announcement, event, feature, or special."),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('notification_center.restore', 'Restore'),
          style: 'default',
          onPress: async () => {
            setRestoringId(item.id);
            try {
              const { error } = await (supabase.rpc as any)('restore_shade_item', {
                p_actor_id: user?.id,
                p_id: item.id,
              });
              if (error) throw error;
              setDismissedItems(prev => prev.filter(d => d.id !== item.id));
            } catch (err) {
              console.error('Error restoring notification:', err);
              Alert.alert(t('common.error', 'Error'), t('notification_center.restore_error', 'Failed to restore. Please try again.'));
            }
            setRestoringId(null);
          },
        },
      ]
    );
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'announcement': return t('notification_center.type_announcement', 'Announcement');
      case 'special_feature': return t('notification_center.type_feature', 'Special Feature');
      case 'upcoming_event': return t('notification_center.type_event', 'Event');
      case 'weekly_special': return t('notification_center.type_special', 'Special');
      case 'custom_notification': return t('notification_center.type_custom', 'Notification');
      default: return type;
    }
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
    if (audienceMode === 'all') return t('notification_center.all_staff');
    if (selectedJobTitles.length === 0) return t('notification_center.select_job_titles');
    if (selectedJobTitles.length <= 2) return selectedJobTitles.map(jobTitleLabel).join(', ');
    return t('notification_center.n_job_titles_selected', { count: selectedJobTitles.length });
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return t('notifications.just_now');
    if (diffHours < 24) return t('notification_center.hours_ago', { count: diffHours });
    if (diffDays === 1) return t('notification_center.one_day_ago');
    return t('notification_center.days_ago', { count: diffDays });
  };

  async function handleSendNotification() {
    // Validation runs on the AUTHOR-language side (bind-flip): whichever
    // language the composer is typing in must be filled; the other side is
    // resolved (auto-translate / pencil) at send time.
    const authorTitle = (isSpanishAuthor ? titleEs : title).trim();
    const authorBody = (isSpanishAuthor ? bodyEs : body).trim();
    if (!authorTitle) {
      Alert.alert(t('notification_center.title_required'), t('notification_center.title_required_message'));
      return;
    }

    if (!authorBody) {
      Alert.alert(t('notification_center.message_required'), t('notification_center.message_required_message'));
      return;
    }

    if (audienceMode === 'job_titles' && selectedJobTitles.length === 0) {
      Alert.alert(t('notification_center.audience_required'), t('notification_center.audience_required_message'));
      return;
    }

    const audienceText = audienceMode === 'all'
      ? t('notification_center.all_staff')
      : selectedJobTitles.map(jobTitleLabel).join(', ');

    // Confirm sending
    Alert.alert(
      t('notification_center.send_confirm_title'),
      `${t('notification_center.send_confirm_body')}\n\n${t('notification_center.title_label')}: "${authorTitle}"\n${t('notification_center.message_label')}: "${authorBody}"\n${t('notification_center.to_label')} ${audienceText}${destination ? `\n${t('notification_center.opens_to')}: ${DESTINATION_OPTIONS.find(d => d.value === destination)?.label}` : ''}`,
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
    if (!user?.id) return;
    const actorId = user.id;
    setSending(true);

    try {
      // Fill/refresh the other language per the s61 staleness rules (may ask
      // once). Null = abort (translate toward the author's other side failed,
      // or a double-tap) — keep the typed content and let the manager retry.
      const resolved = await translation.resolveOnSave();
      if (!resolved) {
        setSending(false);
        return;
      }
      const titleFinal = resolved.title.en.trim();
      const bodyFinal = resolved.body.en.trim();
      const titleEsFinal = resolved.title.es.trim();
      const bodyEsFinal = resolved.body.es.trim();

      const extraData: Record<string, any> = {};
      if (destination) extraData.destination = destination;
      if (audienceMode === 'job_titles' && selectedJobTitles.length > 0) {
        extraData.job_titles = selectedJobTitles;
      }

      // Insert the shade row so the broadcast shows in every staff member's
      // notification shade (+ badge), whether or not a push is also sent.
      // Spanish copy rides data.title_es/body_es for the dropdown's
      // viewer-language pick (zero-migration: create_notification passes
      // p_data through verbatim).
      try {
        await supabase.rpc('create_notification', {
          p_actor_id: actorId,
          p_title: titleFinal,
          p_body: bodyFinal,
          p_data: {
            ...extraData,
            notificationType: 'custom',
            notificationSkipped: !sendPush,
            title_es: titleEsFinal || undefined,
            body_es: bodyEsFinal || undefined,
          },
        });
      } catch (err) {
        console.error('Failed to log notification:', err);
      }

      // Physical push only when the toggle is on; silent = shade + badge only.
      if (sendPush) {
        await sendCustomNotification(
          titleFinal,
          bodyFinal,
          Object.keys(extraData).length > 0 ? extraData : undefined,
          organizationId ?? undefined,
          titleEsFinal || undefined,
          bodyEsFinal || undefined
        );
      }

      Alert.alert(
        t('notification_center.sent_title'),
        t('notification_center.sent_body'),
        [
          {
            text: t('common.ok'),
            onPress: () => {
              setTitle('');
              setBody('');
              setTitleEs('');
              setBodyEs('');
              sendSessionRef.current += 1;
              setDestination('');
              setAudienceMode('all');
              setSelectedJobTitles([]);
              setSendPush(true);
              setBodyDragH(0);
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error sending notification:', error);
      console.error('Error context:', JSON.stringify(error?.context));

      // Try to get the actual error message from the response
      let errorMessage = t('notification_center.send_error');

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
        <AmbientGlow />

        {/* Compact glass header (matches Rewards & Reviews) */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="chevron-left"
              size={22}
              color={colors.text}
            />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t('notification_center.title')}</Text>
            <Text style={styles.headerSub}>
              {activeTab === 'compose'
                ? t('notification_center.tab_compose', 'Compose')
                : t('notification_center.tab_dismissed', 'Recently Dismissed')}
            </Text>
          </View>
        </View>

        {/* Glass segmented tabs: Compose / Recently Dismissed */}
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, activeTab === 'compose' && styles.tabOn]}
            onPress={() => setActiveTab('compose')}
          >
            <IconSymbol ios_icon_name="paperplane.fill" android_material_icon_name="send" size={14} color={activeTab === 'compose' ? colors.text : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'compose' && { color: colors.text }]}>
              {t('notification_center.tab_compose', 'Compose')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'dismissed' && styles.tabOn]}
            onPress={() => { setActiveTab('dismissed'); loadDismissed(); }}
          >
            <IconSymbol ios_icon_name="clock.arrow.circlepath" android_material_icon_name="history" size={14} color={activeTab === 'dismissed' ? colors.text : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'dismissed' && { color: colors.text }]}>
              {t('notification_center.tab_dismissed', 'Recently Dismissed')}
            </Text>
          </Pressable>
        </View>

        {activeTab === 'compose' ? (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <GlassCard variant="surface" radius={16} style={styles.card}>
              <View style={styles.iconContainer}>
                <IconSymbol
                  ios_icon_name="megaphone.fill"
                  android_material_icon_name="campaign"
                  size={48}
                  color={colors.primary}
                />
              </View>

              <Text style={styles.cardTitle}>
                {t('notification_center.card_title')}
              </Text>

              <Text style={styles.cardDescription}>
                {t('notification_center.description')}
              </Text>

              {/* Audience Selector */}
              <View style={styles.inputContainer}>
                <View style={styles.inputHeader}>
                  <Text style={styles.inputLabel}>{t('notification_center.send_to')}</Text>
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
                    {(isSpanishAuthor ? titleEs : title).length}/{maxTitleLength}
                  </Text>
                </View>
                <TextInput
                  style={styles.titleInput}
                  placeholder={t('notification_center.title_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={isSpanishAuthor ? titleEs : title}
                  onChangeText={(text) => {
                    if (text.length <= maxTitleLength) {
                      (isSpanishAuthor ? setTitleEs : setTitle)(text);
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
                    {(isSpanishAuthor ? bodyEs : body).length}/{maxBodyLength}
                  </Text>
                </View>
                <View>
                  <TextInput
                    style={[styles.bodyInput, { minHeight: Math.max(100, bodyDragH) }]}
                    placeholder={t('notification_center.message_placeholder')}
                    placeholderTextColor={colors.textSecondary}
                    value={isSpanishAuthor ? bodyEs : body}
                    onChangeText={(text) => {
                      if (text.length <= maxBodyLength) {
                        (isSpanishAuthor ? setBodyEs : setBody)(text);
                      }
                    }}
                    maxLength={maxBodyLength}
                    multiline
                    scrollEnabled={false}
                    textAlignVertical="top"
                    onContentSizeChange={(e) => setBodyH(e.nativeEvent.contentSize.height)}
                  />
                  <ProcedureResizeHandle
                    height={Math.max(100, bodyH, bodyDragH)}
                    minHeight={100}
                    onResize={setBodyDragH}
                  />
                </View>
              </View>

              {/* Bilingual authoring: other-language preview + translate + pencil */}
              {translation.element}

              {/* Destination Picker */}
              <View style={styles.inputContainer}>
                <View style={styles.inputHeader}>
                  <Text style={styles.inputLabel}>
                    {t('notification_center.opens_to')}
                  </Text>
                  <Text style={styles.characterCount}>
                    {t('notification_center.optional')}
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
                    <Text style={styles.pickerTitle}>{t('notification_center.send_to')}</Text>
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
                          {t('notification_center.all_staff')}
                        </Text>
                      </View>
                      {audienceMode === 'all' && (
                        <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={18} color={colors.primary} />
                      )}
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={[styles.audienceDivider, { backgroundColor: colors.border }]} />
                    <Text style={[styles.audienceSectionLabel, { color: colors.textSecondary }]}>{t('notification_center.by_job_title')}</Text>

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
                            {jobTitleLabel(jt)}
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
                      <Text style={styles.audienceDoneBtnText}>{t('notification_center.done')}</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </Modal>

              {/* Preview */}
              {((isSpanishAuthor ? titleEs : title) || (isSpanishAuthor ? bodyEs : body)) && (
                <View style={styles.previewContainer}>
                  <Text style={styles.previewLabel}>
                    {t('notification_center.preview')}
                  </Text>
                  <View style={styles.previewCard}>
                    {(isSpanishAuthor ? titleEs : title) && (
                      <Text style={styles.previewTitle}>
                        {isSpanishAuthor ? titleEs : title}
                      </Text>
                    )}
                    {(isSpanishAuthor ? bodyEs : body) && (
                      <Text style={styles.previewBody}>
                        {isSpanishAuthor ? bodyEs : body}
                      </Text>
                    )}
                    {audienceMode === 'job_titles' && selectedJobTitles.length > 0 && (
                      <Text style={[styles.previewAudience, { color: colors.textSecondary }]}>
                        {t('notification_center.to_label')} {selectedJobTitles.map(jobTitleLabel).join(', ')}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Silent send toggle */}
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>{t('notification_center.push_toggle', 'Send push notification')}</Text>
                  <Text style={styles.toggleHint}>
                    {sendPush
                      ? t('notification_center.push_on_hint', 'Staff get a phone alert + it shows in their shade.')
                      : t('notification_center.push_off_hint', 'Silent — shows in the shade + badge only, no phone alert.')}
                  </Text>
                </View>
                <Switch
                  value={sendPush}
                  onValueChange={setSendPush}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor={colors.fireText}
                />
              </View>

              {/* Send Button */}
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!(isSpanishAuthor ? titleEs : title).trim() || !(isSpanishAuthor ? bodyEs : body).trim() || sending || (audienceMode === 'job_titles' && selectedJobTitles.length === 0)) && styles.sendButtonDisabled,
                ]}
                onPress={handleSendNotification}
                disabled={!(isSpanishAuthor ? titleEs : title).trim() || !(isSpanishAuthor ? bodyEs : body).trim() || sending || (audienceMode === 'job_titles' && selectedJobTitles.length === 0)}
              >
                {sending ? (
                  <ActivityIndicator color={colors.fireText} />
                ) : (
                  <>
                    <IconSymbol
                      ios_icon_name="paperplane.fill"
                      android_material_icon_name="send"
                      size={20}
                      color={colors.fireText}
                    />
                    <Text style={styles.sendButtonText}>
                      {audienceMode === 'all' ? t('notification_center.send_button') : t('notification_center.send_to_groups', { count: selectedJobTitles.length })}
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
            </GlassCard>
          </ScrollView>
        ) : (
          /* Recently Dismissed Tab */
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <GlassCard variant="surface" radius={16} style={styles.card}>
              <View style={styles.iconContainer}>
                <IconSymbol
                  ios_icon_name="clock.arrow.circlepath"
                  android_material_icon_name="history"
                  size={44}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.cardTitle}>{t('notification_center.dismissed_title', 'Recently Dismissed')}</Text>
              <Text style={styles.cardDescription}>
                {t('notification_center.dismissed_desc', "Notifications you've cleared from everyone's shade. Restore one to bring it back for all staff — this never deletes the underlying announcement, event, feature, or special.")}
              </Text>

              {loadingDismissed ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
              ) : dismissedItems.length === 0 ? (
                <View style={styles.historyEmpty}>
                  <Text style={[styles.historyEmptyText, { color: colors.textSecondary }]}>
                    {t('notification_center.dismissed_empty', 'Nothing dismissed recently.')}
                  </Text>
                </View>
              ) : (
                dismissedItems.map((item) => (
                  <View key={item.id} style={[styles.historyItem, { borderColor: colors.surfaceBorder }]}>
                    <View style={styles.historyItemContent}>
                      <View style={styles.historyItemTitleRow}>
                        <Text style={[styles.historyItemTitle, { color: colors.text }]} numberOfLines={1}>
                          {item.dismissed_title || t('notification_center.dismissed_untitled', 'Dismissed notification')}
                        </Text>
                        <View style={[styles.historyTypeBadge, { backgroundColor: colors.primary + '20' }]}>
                          <Text style={[styles.historyTypeBadgeText, { color: colors.primary }]}>
                            {typeLabel(item.notification_type)}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.historyItemTime, { color: colors.textSecondary }]}>
                        {t('notification_center.dismissed_ago', 'Dismissed')} {getTimeAgo(item.dismissed_at)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.restoreBtn, { backgroundColor: colors.primary }]}
                      onPress={() => handleRestore(item)}
                      disabled={restoringId === item.id}
                    >
                      {restoringId === item.id ? (
                        <ActivityIndicator size="small" color={colors.fireText} />
                      ) : (
                        <>
                          <IconSymbol ios_icon_name="arrow.uturn.backward" android_material_icon_name="undo" size={14} color={colors.fireText} />
                          <Text style={[styles.restoreBtnText, { color: colors.fireText }]}>{t('notification_center.restore', 'Restore')}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </GlassCard>
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
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    borderRadius: 13,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tabOn: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surfaceBorder,
  },
  tabText: {
    fontSize: 12,
    fontFamily: fonts.display.semibold,
    color: colors.textSecondary,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 19,
    fontFamily: fonts.display.bold,
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.tint,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  card: {
    padding: 22,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontFamily: fonts.display.bold,
    textAlign: 'center',
    marginBottom: 8,
    color: colors.text,
  },
  cardDescription: {
    fontSize: 14,
    fontFamily: fonts.body.regular,
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
    fontSize: 15,
    fontFamily: fonts.display.semibold,
    color: colors.text,
  },
  characterCount: {
    fontSize: 12,
    fontFamily: fonts.mono.medium,
    color: colors.textSecondary,
  },
  titleInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    fontFamily: fonts.body.regular,
    backgroundColor: colors.glass,
    color: colors.text,
    borderColor: colors.glassBorder,
  },
  bodyInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    paddingBottom: 22,
    fontSize: 16,
    fontFamily: fonts.body.regular,
    minHeight: 100,
    backgroundColor: colors.glass,
    color: colors.text,
    borderColor: colors.glassBorder,
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
    backgroundColor: colors.primary,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: colors.fireText,
    fontSize: 16,
    fontWeight: '600',
  },
  destinationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
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
    color: colors.text,
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
    color: colors.fireText,
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
  historyItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  historyItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  historyTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
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
  historyItemSkipped: {
    fontSize: 11,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  historyDeleteBtn: {
    padding: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  toggleHint: {
    fontSize: 12,
    fontFamily: fonts.body.regular,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 16,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  restoreBtnText: {
    fontSize: 13,
    fontFamily: fonts.display.semibold,
  },
});
