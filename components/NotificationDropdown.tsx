import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Pressable,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/app/integrations/supabase/client';
import { weeklySpecialsNames } from '@/utils/categoryNames';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { getLocalizedField } from '@/utils/translateContent';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { fetchContentImagesBatch } from '@/utils/contentImages';
import { stripFormattingTags } from '@/components/FormattedText';
import { useUnreadContent } from '@/hooks/useUnreadContent';
import { useOrganization } from '@/contexts/OrganizationContext';
import GlassCard from '@/components/GlassCard';
import { fonts } from '@/constants/fonts';
import { Image } from 'expo-image';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PAGE_SIZE = 25;
const SOURCE_FETCH_LIMIT = 100;

type NotificationType = 'announcement' | 'special_feature' | 'upcoming_event' | 'weekly_special' | 'custom_notification';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string;
  createdAt: string;
  // Raw data for opening detail modal
  rawData: any;
  imageUrls?: string[];
}

interface GuideFile {
  id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_type: string;
}

interface NotificationDropdownProps {
  visible: boolean;
  onClose: () => void;
  onItemPress: (item: {
    title: string;
    content: string;
    thumbnailUrl?: string | null;
    thumbnailShape?: string;
    imageUrls?: string[];
    startDateTime?: string | null;
    endDateTime?: string | null;
    priority?: string;
    link?: string | null;
    guideFile?: GuideFile | null;
  }) => void;
  visibility?: 'everyone' | 'managers' | 'employees';
  isManager?: boolean;
}

const TYPE_CONFIG: Record<NotificationType, {
  iconIos: string;
  iconAndroid: string;
  color: string;
}> = {
  announcement: {
    iconIos: 'megaphone.fill',
    iconAndroid: 'campaign',
    color: '#2196F3', // Blue
  },
  special_feature: {
    iconIos: 'star.fill',
    iconAndroid: 'star',
    color: '#FF9800', // Orange
  },
  upcoming_event: {
    iconIos: 'calendar',
    iconAndroid: 'event',
    color: '#4CAF50', // Green
  },
  weekly_special: {
    iconIos: 'fork.knife',
    iconAndroid: 'restaurant',
    color: '#F44336', // Red
  },
  custom_notification: {
    iconIos: 'bell.fill',
    iconAndroid: 'notifications',
    color: '#9C27B0', // Purple
  },
};

export default function NotificationDropdown({
  visible,
  onClose,
  onItemPress,
  visibility = 'everyone',
  isManager = false,
}: NotificationDropdownProps) {
  const colors = useThemeColors();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const { markAnnouncementViewed, markSpecialFeatureViewed } = useUnreadContent();
  const { organizationId } = useOrganization();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDisplayCount(PAGE_SIZE);
      loadNotifications();
    }
  }, [visible]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const items: NotificationItem[] = [];

      // Load shade dismissals so we can filter out dismissed items
      const { data: dismissals } = await (supabase
        .from('shade_dismissals') as any)
        .select('notification_type, item_id');
      const dismissedSet = new Set(
        (dismissals || []).map((d: any) => `${d.notification_type}:${d.item_id}`)
      );

      // Fetch announcements
      const visibilityFilter = visibility === 'managers'
        ? ['everyone', 'managers']
        : ['everyone', 'employees'];

      const { data: announcements } = await supabase
        .from('announcements')
        .select('*, guide_file:guides_and_training!announcements_guide_file_id_fkey(id, title, file_url, file_name, file_type)')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .in('visibility', visibilityFilter)
        .order('created_at', { ascending: false })
        .limit(SOURCE_FETCH_LIMIT);

      if (announcements) {
        for (const a of announcements) {
          items.push({
            id: a.id,
            type: 'announcement',
            title: getLocalizedField(a, 'title', language),
            subtitle: stripFormattingTags(getLocalizedField(a, 'content', language) || a.content || a.message || ''),
            createdAt: a.created_at,
            rawData: a,
          });
        }
      }

      // Fetch special features
      const { data: features } = await supabase
        .from('special_features')
        .select('*, guide_file:guides_and_training!special_features_guide_file_id_fkey(id, title, file_url, file_name, file_type)')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(SOURCE_FETCH_LIMIT);

      if (features) {
        for (const f of features) {
          items.push({
            id: f.id,
            type: 'special_feature',
            title: getLocalizedField(f, 'title', language),
            subtitle: stripFormattingTags(getLocalizedField(f, 'content', language) || f.content || f.message || ''),
            createdAt: f.created_at,
            rawData: f,
          });
        }
      }

      // Fetch upcoming events
      const { data: events } = await supabase
        .from('upcoming_events')
        .select('*, guide_file:guides_and_training!upcoming_events_guide_file_id_fkey(id, title, file_url, file_name, file_type)')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(SOURCE_FETCH_LIMIT);

      if (events) {
        for (const e of events) {
          items.push({
            id: e.id,
            type: 'upcoming_event',
            title: getLocalizedField(e, 'title', language),
            subtitle: stripFormattingTags(getLocalizedField(e, 'content', language) || e.content || e.message || ''),
            createdAt: e.created_at,
            rawData: e,
          });
        }
      }

      // Weekly specials = items in the Weekly Specials category (resolved by
      // system_key → follows renames) PLUS any item FEATURED via is_weekly_special
      // (overlay). Featured-but-not-categorized items surface by their feature
      // time (updated_at). Merge + dedupe by id.
      const wsNames = await weeklySpecialsNames(user?.id ?? '');
      // RPC returns all matching active items; apply the recency sort + cap client-side.
      const [byCatRpc, byFlagRpc] = await Promise.all([
        supabase.rpc('get_menu_items', { p_actor_id: user?.id ?? '', p_categories: wsNames }),
        supabase.rpc('get_menu_items', { p_actor_id: user?.id ?? '', p_weekly_special: true }),
      ]);
      const byCatSpecials = {
        data: ((byCatRpc.data as any[]) || [])
          .slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, SOURCE_FETCH_LIMIT),
      };
      const byFlagSpecials = {
        data: ((byFlagRpc.data as any[]) || [])
          .slice().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, SOURCE_FETCH_LIMIT),
      };
      const specialsById = new Map<string, any>();
      for (const s of (byCatSpecials.data || [])) specialsById.set(s.id, { ...s, __ts: s.created_at });
      for (const s of (byFlagSpecials.data || [])) {
        if (!specialsById.has(s.id)) specialsById.set(s.id, { ...s, __ts: s.updated_at || s.created_at });
      }
      for (const s of specialsById.values()) {
        items.push({
          id: s.id,
          type: 'weekly_special',
          title: getLocalizedField(s, 'name', language),
          subtitle: stripFormattingTags(getLocalizedField(s, 'description', language) || s.description || ''),
          createdAt: s.__ts,
          rawData: s,
        });
      }

      // Fetch custom notifications
      const { data: customNotifs } = await (supabase
        .from('custom_notifications') as any)
        .select('id, title, body, created_at, data')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(SOURCE_FETCH_LIMIT);

      // Load this user's quiz dismissals so we can hide the bell entry
      // after they've already tapped it once.
      let dismissedExamIds = new Set<string>();
      if (user?.id) {
        const { data: dismissals } = await (supabase
          .from('quiz_notification_dismissals' as any) as any)
          .select('exam_id')
          .eq('user_id', user.id);
        if (dismissals) {
          dismissedExamIds = new Set((dismissals as any[]).map((d) => d.exam_id));
        }
      }

      if (customNotifs) {
        for (const cn of customNotifs) {
          // Hide quiz bell entries that this user has already dismissed
          if (
            cn.data?.destination === 'weekly-quizzes' &&
            cn.data?.exam_id &&
            dismissedExamIds.has(cn.data.exam_id)
          ) {
            continue;
          }
          // Skip rows that mirror a content-table item (announcement/event/special_feature/weekly_special).
          // Those are already shown in the shade via the content tables themselves; including them
          // again here would cause duplicate entries. Only general/custom notifications should pass.
          const linkedType = cn.data?.notificationType;
          if (
            linkedType === 'announcement' ||
            linkedType === 'special_feature' ||
            linkedType === 'event' ||
            linkedType === 'weekly_special'
          ) {
            continue;
          }
          // Redemption shade entries are role/user-targeted
          if (linkedType === 'redemption_requested') {
            if (user?.role !== 'manager' && user?.role !== 'owner') continue;
          }
          if (linkedType === 'redemption_decision') {
            if (cn.data?.targetUserId !== user?.id) continue;
          }
          // Leaderboard pass entries are per-recipient; hide for everyone else.
          if (linkedType === 'leaderboard_pass') {
            if (cn.data?.targetUserId !== user?.id) continue;
          }
          items.push({
            id: cn.id,
            type: 'custom_notification',
            title: cn.title,
            subtitle: cn.body,
            createdAt: cn.created_at,
            rawData: cn,
          });
        }
      }

      // Remove items that have been dismissed via the shade or Sent History
      const visibleItems = items.filter(item => !dismissedSet.has(`${item.type}:${item.id}`));

      // Sort all by created_at descending — keep the full pool for paginated load-more.
      visibleItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Batch fetch images for the visible pool (one query per type).
      const announcementIds = visibleItems.filter(i => i.type === 'announcement').map(i => i.id);
      const featureIds = visibleItems.filter(i => i.type === 'special_feature').map(i => i.id);
      const eventIds = visibleItems.filter(i => i.type === 'upcoming_event').map(i => i.id);

      const [annImgs, featImgs, evtImgs] = await Promise.all([
        announcementIds.length > 0 ? fetchContentImagesBatch('announcement', announcementIds) : new Map<string, string[]>(),
        featureIds.length > 0 ? fetchContentImagesBatch('special_feature', featureIds) : new Map<string, string[]>(),
        eventIds.length > 0 ? fetchContentImagesBatch('upcoming_event', eventIds) : new Map<string, string[]>(),
      ]);

      for (const item of visibleItems) {
        let additionalImgs: string[] | undefined;
        if (item.type === 'announcement') additionalImgs = annImgs.get(item.id) as string[] | undefined;
        else if (item.type === 'special_feature') additionalImgs = featImgs.get(item.id) as string[] | undefined;
        else if (item.type === 'upcoming_event') additionalImgs = evtImgs.get(item.id) as string[] | undefined;

        if (additionalImgs && additionalImgs.length > 0 && item.rawData.thumbnail_url) {
          item.imageUrls = [item.rawData.thumbnail_url, ...additionalImgs];
        }
      }

      setNotifications(visibleItems);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleItemPress = (item: NotificationItem) => {
    const data = item.rawData;

    if (item.type === 'weekly_special') {
      const formatPrice = (price: string) => price.includes('$') ? price : `$${price}`;
      onItemPress({
        title: getLocalizedField(data, 'name', language),
        content: `${getLocalizedField(data, 'description', language) || data.description || ''}\n\nPrice: ${formatPrice(data.price)}${data.is_gluten_free ? '\n• Gluten Free' : ''}${data.is_gluten_free_available ? '\n• Gluten Free Available' : ''}${data.is_vegetarian ? '\n• Vegetarian' : ''}${data.is_vegetarian_available ? '\n• Vegetarian Available' : ''}`,
        thumbnailUrl: data.thumbnail_url,
        thumbnailShape: data.thumbnail_shape,
      });
    } else if (item.type === 'custom_notification') {
      // Weekly quiz deep-link: route to the quizzes screen and record dismissal
      if (data.data?.destination === 'weekly-quizzes') {
        if (data.data?.exam_id && user?.id) {
          (supabase
            .from('quiz_notification_dismissals' as any) as any)
            .insert({ user_id: user.id, exam_id: data.data.exam_id })
            .then(() => {}, () => {});
        }
        // Optimistically hide the entry immediately
        setNotifications((prev) => prev.filter((n) => n.id !== item.id));
        onClose();
        router.push('/weekly-quizzes' as any);
        return;
      }
      // Manager: redemption request → Approvals
      if (data.data?.notificationType === 'redemption_requested') {
        setNotifications((prev) => prev.filter((n) => n.id !== item.id));
        onClose();
        router.push('/manager-approvals' as any);
        return;
      }
      // Leaderboard pass → master leaderboard (mark-viewed clears the badge there)
      if (data.data?.notificationType === 'leaderboard_pass') {
        onClose();
        router.push('/master-leaderboard' as any);
        return;
      }
      // Employee: decision → Redeem (lands on Recent Awards via the page itself)
      if (data.data?.notificationType === 'redemption_decision') {
        setNotifications((prev) => prev.filter((n) => n.id !== item.id));
        // Drop the row so the badge clears
        (supabase.from('custom_notifications') as any).delete().eq('id', item.id).then(() => {}, () => {});
        onClose();
        const portalPrefix = (user?.role === 'manager' || user?.role === 'owner') ? '/(portal)/manager' : '/(portal)/employee';
        router.push(`${portalPrefix}/rewards` as any);
        return;
      }
      onItemPress({
        title: data.title,
        content: data.body,
      });
    } else {
      // Mark per-item NEW state cleared when the user opens the detail modal from the shade.
      if (item.type === 'announcement') {
        markAnnouncementViewed(item.id);
      } else if (item.type === 'special_feature') {
        markSpecialFeatureViewed(item.id);
      }
      const contentField = item.type === 'announcement' ? 'content' : 'content';
      onItemPress({
        title: getLocalizedField(data, 'title', language),
        content: getLocalizedField(data, contentField, language) || data.content || data.message || '',
        thumbnailUrl: data.thumbnail_url,
        thumbnailShape: data.thumbnail_shape,
        imageUrls: item.imageUrls,
        startDateTime: data.start_date_time,
        endDateTime: data.end_date_time,
        priority: data.priority,
        link: data.link,
        guideFile: data.guide_file || null,
      });
    }
    onClose();
  };

  const handleDeleteNotification = async (item: NotificationItem) => {
    setDeletingId(item.id);
    try {
      // Global hide-list: include organization_id (NOT NULL — so the dismiss actually
      // persists) and snapshot the title for the Recently Dismissed / undo view.
      const { error } = await (supabase.from('shade_dismissals') as any)
        .insert({
          notification_type: item.type,
          item_id: item.id,
          dismissed_by: user?.id,
          organization_id: organizationId,
          dismissed_title: item.title,
        });
      // 23505 = already dismissed (unique on type + item_id) — treat as success.
      if (error && error.code !== '23505') throw error;
      setNotifications(prev => prev.filter(n => !(n.id === item.id && n.type === item.type)));
    } catch (err) {
      console.error('Error dismissing notification:', err);
    }
    setDeletingId(null);
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return t('notifications.just_now', 'Just now');
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return '1d ago';
    return `${diffDays}d ago`;
  };

  const truncate = (text: string, max: number = 40) => {
    if (!text) return '';
    return text.length > max ? text.substring(0, max) + '...' : text;
  };

  // Subtle uppercase label showing the item kind (muted/tint mono, not the loud
  // per-type colors). Generic custom notifications get none — their own title is
  // self-describing.
  const typeLabel = (type: NotificationType): string => {
    switch (type) {
      case 'announcement': return t('notification_center.type_announcement', 'Announcement');
      case 'special_feature': return t('notification_center.type_feature', 'Special Feature');
      case 'upcoming_event': return t('notification_center.type_event', 'Event');
      case 'weekly_special': return t('notification_center.type_special', 'Special');
      default: return '';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View
          style={styles.dropdownWrap}
          onStartShouldSetResponder={() => true}
        >
          <GlassCard variant="glass" radius={16} intensity={44}>
            {/* Semi-opaque backing so text stays readable over busy content behind the glass */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card, opacity: 0.5 }]} pointerEvents="none" />
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.hairline }]}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                {t('notifications.title', 'Notifications')}
              </Text>
              <View style={styles.headerActions}>
                {isManager && (
                  <TouchableOpacity
                    onPress={() => { onClose(); router.push('/notification-center' as any); }}
                    style={[styles.sendPill, { backgroundColor: colors.primary }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <IconSymbol
                      ios_icon_name="paperplane.fill"
                      android_material_icon_name="send"
                      size={13}
                      color={colors.fireText}
                    />
                    <Text style={[styles.sendPillText, { color: colors.fireText }]}>
                      {t('notifications.send', 'Send')}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <IconSymbol
                    ios_icon_name="xmark.circle.fill"
                    android_material_icon_name="cancel"
                    size={24}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Content */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : notifications.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {t('notifications.empty', 'No notifications')}
                </Text>
              </View>
            ) : (
              <FlatList
                data={notifications.slice(0, displayCount)}
                keyExtractor={(item) => `${item.type}-${item.id}`}
                style={{ maxHeight: SCREEN_HEIGHT * 0.6 }}
                onEndReachedThreshold={0.3}
                onEndReached={() => {
                  if (displayCount < notifications.length) {
                    setDisplayCount((c) => Math.min(c + PAGE_SIZE, notifications.length));
                  }
                }}
                ListFooterComponent={
                  displayCount < notifications.length ? (
                    <View style={styles.footerLoading}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  ) : null
                }
                renderItem={({ item, index }) => {
                  const config = TYPE_CONFIG[item.type];
                  const visibleCount = Math.min(displayCount, notifications.length);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.notificationItem,
                        index < visibleCount - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
                      ]}
                      onPress={() => handleItemPress(item)}
                      activeOpacity={0.7}
                    >
                      {item.rawData?.thumbnail_url ? (
                        <Image source={{ uri: item.rawData.thumbnail_url }} style={styles.iconThumb} contentFit="cover" />
                      ) : (
                        <View style={[styles.iconCircle, { backgroundColor: config.color + '22', borderColor: config.color + '55', borderWidth: StyleSheet.hairlineWidth }]}>
                          <IconSymbol
                            ios_icon_name={config.iconIos as any}
                            android_material_icon_name={config.iconAndroid as any}
                            size={18}
                            color={config.color}
                          />
                        </View>
                      )}
                      <View style={styles.notificationContent}>
                        <Text style={[styles.notificationTitle, { color: colors.text }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.notificationSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                          {truncate(item.subtitle)}
                        </Text>
                      </View>
                      <View style={styles.metaCol}>
                        {typeLabel(item.type) ? (
                          <Text style={[styles.metaType, { color: colors.tint }]} numberOfLines={1}>
                            {typeLabel(item.type)}
                          </Text>
                        ) : null}
                        <Text style={[styles.timeAgo, { color: colors.textSecondary }]}>
                          {getTimeAgo(item.createdAt)}
                        </Text>
                      </View>
                      {isManager && (
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleDeleteNotification(item);
                          }}
                          disabled={deletingId === item.id}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          {deletingId === item.id ? (
                            <ActivityIndicator size="small" color={colors.textSecondary} />
                          ) : (
                            <IconSymbol
                              ios_icon_name="xmark.circle.fill"
                              android_material_icon_name="cancel"
                              size={18}
                              color={colors.textSecondary}
                            />
                          )}
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </GlassCard>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-start',
    paddingTop: 140,
    paddingHorizontal: 16,
  },
  dropdownWrap: {
    borderRadius: 16,
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: fonts.display.bold,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  sendPillText: {
    fontSize: 12,
    fontFamily: fonts.display.semibold,
  },
  loadingContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconThumb: {
    width: 36,
    height: 36,
    borderRadius: 11,
  },
  notificationContent: {
    flex: 1,
    gap: 2,
  },
  metaCol: {
    alignItems: 'flex-end',
    gap: 3,
  },
  metaType: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    maxWidth: 92,
  },
  notificationTitle: {
    fontSize: 14,
    fontFamily: fonts.display.semibold,
  },
  notificationSubtitle: {
    fontSize: 12,
    fontFamily: fonts.body.regular,
  },
  timeAgo: {
    fontSize: 12,
    fontFamily: fonts.mono.medium,
  },
  deleteBtn: {
    padding: 4,
    marginLeft: 4,
  },
  footerLoading: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
