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
import { useOrgJobTitles } from '@/hooks/useOrgJobTitles';
import { NotificationDraft, newDraftId, listDrafts, saveDraft, deleteDraft } from '@/utils/notificationDrafts';
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
// The picker itself lists the ORG'S titles (useOrgJobTitles) so org-added
// custom titles are targetable; this static list is only the fallback while
// that list loads (or for an org with no titles configured).
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

interface SentItem {
  id: string;
  title: string;
  body: string;
  created_at: string | null;
  data: Record<string, any> | null;
  sender_name: string | null;
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
  // Org-configured job titles (same source as the employee editor), so
  // org-added custom titles can be targeted. Values are the raw org title
  // strings — they match users.job_titles verbatim, which is exactly what the
  // edge function's jobTitles filter compares against. While the list loads
  // the picker offers nothing (not the static fallback) so a selection can
  // never be stranded on a title the loaded list doesn't have.
  const { activeJobTitles, isLoading: jobTitlesLoading } = useOrgJobTitles();
  const pickerJobTitles = jobTitlesLoading
    ? []
    : activeJobTitles.length > 0
      ? activeJobTitles
      : JOB_TITLE_OPTIONS;

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

  // History tab (s63c, Steve's design): two sub-views — Dismissed (the
  // restorable shade hide-list) and Recently Sent (read-only proof-of-send
  // record of composer sends, incl. per-row audience).
  const [activeTab, setActiveTab] = useState<'compose' | 'drafts' | 'history'>('compose');
  const [historyTab, setHistoryTab] = useState<'dismissed' | 'sent'>('dismissed');
  const [dismissedItems, setDismissedItems] = useState<DismissedItem[]>([]);
  const [loadingDismissed, setLoadingDismissed] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [sentItems, setSentItems] = useState<SentItem[]>([]);
  const [loadingSent, setLoadingSent] = useState(false);

  // Drafts (s63b, Steve's design): device-local per-user AsyncStorage.
  // draftIdRef tracks a loaded draft so sending it consumes it and
  // re-saving updates it in place.
  const [drafts, setDrafts] = useState<NotificationDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const draftIdRef = useRef<string | null>(null);

  const maxTitleLength = 50;
  const maxBodyLength = 200;

  // Hybrid bilingual authoring (s61 shared section): the primary inputs bind
  // the composer's device language; the section holds the other-language
  // preview + translate button + pencil. resolveOnSave() runs the staleness
  // rules right before send. sessionKey bumps on every successful send so the
  // next compose starts a fresh session.
  const isSpanishAuthor = i18n.language === 'es';
  const sendSessionRef = useRef(0);
  // Re-entry latch: a double-tap of Send can queue TWO confirm alerts before
  // the `sending` state flips (and the queued onPress closures capture the
  // stale false). The ref is stable across renders, so the second confirm's
  // doSend bails instead of double-posting.
  const sendingRef = useRef(false);
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
    if (!user?.id) return;
    setLoadingDismissed(true);
    try {
      const { data, error } = await supabase.rpc('get_recent_shade_dismissals', {
        p_actor_id: user.id,
        p_limit: 40,
      });

      if (!error && data) setDismissedItems(data);
    } catch (err) {
      console.error('Error loading dismissed items:', err);
    }
    setLoadingDismissed(false);
  }, [user?.id]);

  const loadDraftList = useCallback(async () => {
    if (!user?.id) return;
    setLoadingDrafts(true);
    setDrafts(await listDrafts(user.id));
    setLoadingDrafts(false);
  }, [user?.id]);

  const loadSent = useCallback(async () => {
    if (!user?.id) return;
    setLoadingSent(true);
    try {
      const { data, error } = await supabase.rpc('get_recent_sent_notifications', {
        p_actor_id: user.id,
        p_limit: 40,
      });
      if (!error && data) setSentItems(data as SentItem[]);
    } catch (err) {
      console.error('Error loading sent notifications:', err);
    }
    setLoadingSent(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'history') {
        if (historyTab === 'sent') loadSent();
        else loadDismissed();
      } else if (activeTab === 'drafts') {
        loadDraftList();
      }
    }, [activeTab, historyTab, loadDismissed, loadDraftList, loadSent])
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
            if (!user?.id) return;
            setRestoringId(item.id);
            try {
              const { error } = await supabase.rpc('restore_shade_item', {
                p_actor_id: user.id,
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

  const resetComposeForm = () => {
    setTitle('');
    setBody('');
    setTitleEs('');
    setBodyEs('');
    sendSessionRef.current += 1;
    draftIdRef.current = null;
    setDestination('');
    setAudienceMode('all');
    setSelectedJobTitles([]);
    setSendPush(true);
    setBodyDragH(0);
  };

  // Save the CURRENT form as a device-local draft (upserts when a loaded
  // draft is being edited). Button handler only — the No-Signal alert saves
  // its own send-time snapshot instead of live form state.
  async function saveCurrentAsDraft() {
    if (!user?.id) return;
    const ok = await saveDraft(user.id, {
      id: draftIdRef.current ?? newDraftId(),
      savedAt: Date.now(),
      title,
      body,
      titleEs,
      bodyEs,
      destination,
      audienceMode,
      selectedJobTitles,
      sendPush,
    });
    if (ok) {
      resetComposeForm();
      Alert.alert(
        t('notification_center.draft_saved_title'),
        t('notification_center.draft_saved_body'),
        [{ text: t('common.ok') }]
      );
    } else {
      Alert.alert(t('common.error'), t('notification_center.draft_save_error'));
    }
  }

  const loadDraftIntoForm = (draft: NotificationDraft) => {
    setTitle(draft.title);
    setBody(draft.body);
    setTitleEs(draft.titleEs);
    setBodyEs(draft.bodyEs);
    setDestination(draft.destination);
    setAudienceMode(draft.audienceMode);
    setSelectedJobTitles(draft.selectedJobTitles);
    setSendPush(draft.sendPush);
    setBodyDragH(0);
    // New translation session so the section re-baselines against the
    // loaded values (pre-existing semantics), not the previous compose.
    sendSessionRef.current += 1;
    draftIdRef.current = draft.id;
    setActiveTab('compose');
  };

  // "New Draft" must actually start FRESH — clearing the form and the
  // loaded-draft ref — or a later Save as Draft would silently overwrite the
  // previously loaded draft. Confirm first when the composer holds content
  // (the loaded draft itself stays in storage either way).
  const handleNewDraft = () => {
    const startFresh = () => {
      resetComposeForm();
      setActiveTab('compose');
    };
    if (!(title.trim() || body.trim() || titleEs.trim() || bodyEs.trim())) {
      startFresh();
      return;
    }
    Alert.alert(
      t('notification_center.new_draft_confirm_title'),
      t('notification_center.new_draft_confirm_body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('notification_center.new_draft'), onPress: startFresh },
      ]
    );
  };

  const handleDeleteDraft = (draft: NotificationDraft) => {
    Alert.alert(
      t('notification_center.delete_draft_title'),
      t('notification_center.delete_draft_body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            await deleteDraft(user.id, draft.id);
            if (draftIdRef.current === draft.id) draftIdRef.current = null;
            loadDraftList();
          },
        },
      ]
    );
  };

  async function handleSendNotification() {
    if (sending || sendingRef.current) return;
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
    if (sendingRef.current) return;
    sendingRef.current = true;
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

      // Snapshot this send's identity + content NOW. The outcome alerts run
      // at tap time — by then the manager may have loaded another draft or
      // kept typing (the slow-network window this flow exists for), so the
      // callbacks must act on what was actually sent, never live form state.
      const sentDraftId = draftIdRef.current;
      const sendSnapshot: NotificationDraft = {
        id: sentDraftId ?? newDraftId(),
        savedAt: 0, // stamped when actually saved
        title: titleFinal,
        body: bodyFinal,
        titleEs: titleEsFinal,
        bodyEs: bodyEsFinal,
        destination,
        audienceMode,
        selectedJobTitles,
        sendPush,
      };

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
      let shadePosted = false;
      try {
        // supabase-js resolves RPC failures into { error }, it doesn't throw —
        // capture it so a failed shade insert is visible in logs and the
        // outcome branch below can tell "nothing was posted" from
        // "only the push failed".
        const { error: shadeError } = await supabase.rpc('create_notification', {
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
        if (shadeError) console.error('Failed to log notification:', shadeError);
        else shadePosted = true;
      } catch (err) {
        console.error('Failed to log notification:', err);
      }

      // Physical push only when the toggle is on; silent = shade + badge only.
      // sendCustomNotification never throws — it reports transport failure via
      // its boolean.
      let pushOk = true;
      if (sendPush) {
        pushOk = await sendCustomNotification(
          titleFinal,
          bodyFinal,
          Object.keys(extraData).length > 0 ? extraData : undefined,
          organizationId ?? undefined,
          titleEsFinal || undefined,
          bodyEsFinal || undefined
        );
      }

      if (!shadePosted && (!sendPush || !pushOk)) {
        // Nothing reached anyone (typically: no connection). The form is
        // kept — Close lets the manager retry once signal returns; Save as
        // Draft stores the attempted send locally (device storage works
        // offline, and the snapshot includes any auto-translation that
        // resolveOnSave produced).
        Alert.alert(
          t('notification_center.no_signal_title'),
          t('notification_center.no_signal_body'),
          [
            { text: t('common.close'), style: 'cancel' },
            {
              text: t('notification_center.save_draft'),
              onPress: async () => {
                if (!user?.id) return;
                const ok = await saveDraft(user.id, { ...sendSnapshot, savedAt: Date.now() });
                if (!ok) {
                  Alert.alert(t('common.error'), t('notification_center.draft_save_error'));
                  return;
                }
                // Clear the form only if it still shows this send's content —
                // a draft loaded mid-send is left alone.
                if (draftIdRef.current === sentDraftId) resetComposeForm();
                Alert.alert(
                  t('notification_center.draft_saved_title'),
                  t('notification_center.draft_saved_body'),
                  [{ text: t('common.ok') }]
                );
              },
            },
          ]
        );
        return;
      }

      if (!shadePosted) {
        // Push delivered but the inbox post failed (rare: RPC timeout or a
        // server-side rejection with the edge call succeeding). Keep the form
        // and the loaded draft so the manager can post again — with the push
        // toggle off — without retyping or double-alerting.
        Alert.alert(
          t('notification_center.shade_partial_title'),
          t('notification_center.shade_partial_body'),
          [{ text: t('common.ok') }]
        );
        return;
      }

      // Shade posted — consume the SENT draft (by its captured id). Reset
      // only if the form still shows this send's content; the push_partial
      // alert is informational only: the shade row reached staff inboxes and
      // a resend would duplicate it, so there is deliberately no retry.
      const finishSend = () => {
        if (sentDraftId && user?.id) {
          deleteDraft(user.id, sentDraftId);
        }
        if (draftIdRef.current === sentDraftId) resetComposeForm();
      };
      const partial = sendPush && !pushOk;
      Alert.alert(
        partial ? t('notification_center.push_partial_title') : t('notification_center.sent_title'),
        partial ? t('notification_center.push_partial_body') : t('notification_center.sent_body'),
        [{ text: t('common.ok'), onPress: finishSend }]
      );
    } catch (error: any) {
      // Only resolveOnSave / truly unexpected throws land here — the push
      // call reports via its boolean and the shade insert logs its own error.
      console.error('Error sending notification:', error);
      Alert.alert(
        t('notification_center.error_title'),
        t('notification_center.send_error'),
        [{ text: t('common.ok') }]
      );
    } finally {
      sendingRef.current = false;
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
                : activeTab === 'drafts'
                  ? t('notification_center.tab_drafts')
                  : t('notification_center.tab_history')}
            </Text>
          </View>
        </View>

        {/* Glass segmented tabs: Compose / Drafts / History */}
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
            style={[styles.tab, activeTab === 'drafts' && styles.tabOn]}
            onPress={() => { setActiveTab('drafts'); loadDraftList(); }}
          >
            <IconSymbol ios_icon_name="doc.text" android_material_icon_name="drafts" size={14} color={activeTab === 'drafts' ? colors.text : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'drafts' && { color: colors.text }]}>
              {t('notification_center.tab_drafts')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'history' && styles.tabOn]}
            onPress={() => {
              setActiveTab('history');
              if (historyTab === 'sent') loadSent();
              else loadDismissed();
            }}
          >
            <IconSymbol ios_icon_name="clock.arrow.circlepath" android_material_icon_name="history" size={14} color={activeTab === 'history' ? colors.text : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'history' && { color: colors.text }]}>
              {t('notification_center.tab_history')}
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
                    {pickerJobTitles.map((jt) => {
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

              {/* Save as Draft (secondary) — device-local, works offline.
                  Enabled when ANY field holds text (either language), so a
                  draft loaded after a device-language switch stays savable. */}
              <TouchableOpacity
                style={[
                  styles.saveDraftButton,
                  (!(title.trim() || body.trim() || titleEs.trim() || bodyEs.trim()) || sending) && { opacity: 0.4 },
                ]}
                onPress={saveCurrentAsDraft}
                disabled={!(title.trim() || body.trim() || titleEs.trim() || bodyEs.trim()) || sending}
              >
                <IconSymbol
                  ios_icon_name="tray.and.arrow.down"
                  android_material_icon_name="save"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={[styles.saveDraftButtonText, { color: colors.textSecondary }]}>
                  {t('notification_center.save_draft')}
                </Text>
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
        ) : activeTab === 'drafts' ? (
          /* Drafts Tab */
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <GlassCard variant="surface" radius={16} style={styles.card}>
              <View style={styles.iconContainer}>
                <IconSymbol
                  ios_icon_name="doc.text"
                  android_material_icon_name="drafts"
                  size={44}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.cardTitle}>{t('notification_center.tab_drafts')}</Text>
              <Text style={styles.cardDescription}>
                {t('notification_center.drafts_desc')}
              </Text>

              {loadingDrafts ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
              ) : drafts.length === 0 ? (
                <View style={styles.historyEmpty}>
                  <Text style={[styles.historyEmptyText, { color: colors.textSecondary }]}>
                    {t('notification_center.drafts_empty')}
                  </Text>
                </View>
              ) : (
                drafts.map((draft) => {
                  const draftTitle = (isSpanishAuthor ? draft.titleEs : draft.title) || draft.title || draft.titleEs;
                  const draftBody = (isSpanishAuthor ? draft.bodyEs : draft.body) || draft.body || draft.bodyEs;
                  return (
                    <TouchableOpacity
                      key={draft.id}
                      style={[styles.historyItem, { borderColor: colors.surfaceBorder }]}
                      onPress={() => loadDraftIntoForm(draft)}
                    >
                      <View style={styles.historyItemContent}>
                        <Text style={[styles.historyItemTitle, { color: colors.text }]} numberOfLines={1}>
                          {draftTitle || t('notification_center.draft_untitled')}
                        </Text>
                        {!!draftBody && (
                          <Text style={[styles.draftBodyPreview, { color: colors.textSecondary }]} numberOfLines={2}>
                            {draftBody}
                          </Text>
                        )}
                        <Text style={[styles.historyItemTime, { color: colors.textSecondary }]}>
                          {getTimeAgo(new Date(draft.savedAt).toISOString())}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.draftDeleteBtn}
                        onPress={() => handleDeleteDraft(draft)}
                        hitSlop={8}
                      >
                        <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              )}

              {/* New draft = compose a fresh notification */}
              <TouchableOpacity
                style={[styles.newDraftBtn, { backgroundColor: colors.primary }]}
                onPress={handleNewDraft}
              >
                <IconSymbol ios_icon_name="square.and.pencil" android_material_icon_name="edit" size={16} color={colors.fireText} />
                <Text style={[styles.newDraftBtnText, { color: colors.fireText }]}>
                  {t('notification_center.new_draft')}
                </Text>
              </TouchableOpacity>
            </GlassCard>
          </ScrollView>
        ) : (
          /* History Tab: Dismissed (restorable) / Recently Sent (read-only) */
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <GlassCard variant="surface" radius={16} style={styles.card}>
              {/* Sub-tabs */}
              <View style={styles.subTabBar}>
                <Pressable
                  style={[styles.subTab, historyTab === 'dismissed' && styles.subTabOn]}
                  onPress={() => { setHistoryTab('dismissed'); loadDismissed(); }}
                >
                  <Text style={[styles.subTabText, historyTab === 'dismissed' && { color: colors.text }]}>
                    {t('notification_center.tab_dismissed_short')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.subTab, historyTab === 'sent' && styles.subTabOn]}
                  onPress={() => { setHistoryTab('sent'); loadSent(); }}
                >
                  <Text style={[styles.subTabText, historyTab === 'sent' && { color: colors.text }]}>
                    {t('notification_center.sent_tab')}
                  </Text>
                </Pressable>
              </View>

              {historyTab === 'sent' ? (
                <>
                  <View style={styles.iconContainer}>
                    <IconSymbol
                      ios_icon_name="paperplane.circle"
                      android_material_icon_name="send"
                      size={44}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={styles.cardTitle}>{t('notification_center.sent_title_header')}</Text>
                  <Text style={styles.cardDescription}>
                    {t('notification_center.sent_desc')}
                  </Text>

                  {loadingSent ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
                  ) : sentItems.length === 0 ? (
                    <View style={styles.historyEmpty}>
                      <Text style={[styles.historyEmptyText, { color: colors.textSecondary }]}>
                        {t('notification_center.sent_empty')}
                      </Text>
                    </View>
                  ) : (
                    sentItems.map((item) => {
                      // Viewer-language pick, same rule as the shade dropdown.
                      const viewTitle = (isSpanishAuthor && item.data?.title_es) || item.title;
                      const viewBody = (isSpanishAuthor && item.data?.body_es) || item.body;
                      const targeted: string[] = Array.isArray(item.data?.job_titles) ? item.data.job_titles : [];
                      const audience = targeted.length > 0
                        ? targeted.map(jobTitleLabel).join(', ')
                        : t('notification_center.all_staff');
                      // House locale-arg convention (my-schedule/manage precedent).
                      const dateLocale = i18n.language === 'es' ? 'es-ES' : 'en-US';
                      const sentAt = item.created_at
                        ? `${new Date(item.created_at).toLocaleDateString(dateLocale)} ${new Date(item.created_at).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}`
                        : '';
                      return (
                        <View key={item.id} style={[styles.historyItem, { borderColor: colors.surfaceBorder }]}>
                          <View style={styles.historyItemContent}>
                            <View style={styles.historyItemTitleRow}>
                              <Text style={[styles.historyItemTitle, { color: colors.text }]} numberOfLines={1}>
                                {viewTitle}
                              </Text>
                              {item.data?.notificationSkipped === true && (
                                <View style={[styles.historyTypeBadge, { backgroundColor: colors.primary + '20' }]}>
                                  <Text style={[styles.historyTypeBadgeText, { color: colors.primary }]}>
                                    {t('notification_center.sent_silent')}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.draftBodyPreview, { color: colors.textSecondary }]} numberOfLines={2}>
                              {viewBody}
                            </Text>
                            <Text style={[styles.historyItemTime, { color: colors.textSecondary }]} numberOfLines={1}>
                              {t('notification_center.to_label')} {audience}
                              {item.sender_name ? ` · ${item.sender_name}` : ''}{sentAt ? ` · ${sentAt}` : ''}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </>
              ) : (
                <>
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
                </>
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
  subTabBar: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    borderRadius: 11,
    padding: 3,
    marginBottom: 16,
  },
  subTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabOn: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surfaceBorder,
  },
  subTabText: {
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
  saveDraftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
  },
  saveDraftButtonText: {
    fontSize: 14,
    fontFamily: fonts.display.semibold,
  },
  draftBodyPreview: {
    fontSize: 13,
    fontFamily: fonts.body.regular,
    lineHeight: 17,
    marginTop: 2,
  },
  draftDeleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newDraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  newDraftBtnText: {
    fontSize: 14,
    fontFamily: fonts.display.semibold,
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
