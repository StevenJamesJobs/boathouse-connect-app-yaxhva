import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/app/integrations/supabase/client';
import { getLocalizedField } from '@/utils/translateContent';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { fetchContentImagesBatch } from '@/utils/contentImages';
import { stripFormattingTags } from '@/components/FormattedText';

type NotificationType = 'announcement' | 'special_feature' | 'upcoming_event' | 'weekly_special';

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
};

export default function NotificationDropdown({
  visible,
  onClose,
  onItemPress,
  visibility = 'everyone',
}: NotificationDropdownProps) {
  const colors = useThemeColors();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadNotifications();
    }
  }, [visible]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const items: NotificationItem[] = [];

      // Fetch announcements
      const visibilityFilter = visibility === 'managers'
        ? ['everyone', 'managers']
        : ['everyone', 'employees'];

      const { data: announcements } = await supabase
        .from('announcements')
        .select('*, guide_file:guides_and_training!announcements_guide_file_id_fkey(id, title, file_url, file_name, file_type)')
        .eq('is_active', true)
        .in('visibility', visibilityFilter)
        .order('created_at', { ascending: false })
        .limit(5);

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
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5);

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
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5);

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

      // Fetch weekly specials
      const { data: specials } = await supabase
        .from('menu_items')
        .select('*')
        .eq('category', 'Weekly Specials')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5);

      if (specials) {
        for (const s of specials) {
          items.push({
            id: s.id,
            type: 'weekly_special',
            title: getLocalizedField(s, 'name', language),
            subtitle: stripFormattingTags(getLocalizedField(s, 'description', language) || s.description || ''),
            createdAt: s.created_at,
            rawData: s,
          });
        }
      }

      // Sort all by created_at descending, take top 5
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Fetch images for the top 5
      const top5 = items.slice(0, 5);

      // Batch fetch images by type
      const announcementIds = top5.filter(i => i.type === 'announcement').map(i => i.id);
      const featureIds = top5.filter(i => i.type === 'special_feature').map(i => i.id);
      const eventIds = top5.filter(i => i.type === 'upcoming_event').map(i => i.id);

      const [annImgs, featImgs, evtImgs] = await Promise.all([
        announcementIds.length > 0 ? fetchContentImagesBatch('announcement', announcementIds) : new Map<string, string[]>(),
        featureIds.length > 0 ? fetchContentImagesBatch('special_feature', featureIds) : new Map<string, string[]>(),
        eventIds.length > 0 ? fetchContentImagesBatch('upcoming_event', eventIds) : new Map<string, string[]>(),
      ]);

      // Attach image URLs
      for (const item of top5) {
        let additionalImgs: string[] | undefined;
        if (item.type === 'announcement') additionalImgs = annImgs.get(item.id) as string[] | undefined;
        else if (item.type === 'special_feature') additionalImgs = featImgs.get(item.id) as string[] | undefined;
        else if (item.type === 'upcoming_event') additionalImgs = evtImgs.get(item.id) as string[] | undefined;

        if (additionalImgs && additionalImgs.length > 0 && item.rawData.thumbnail_url) {
          item.imageUrls = [item.rawData.thumbnail_url, ...additionalImgs];
        }
      }

      setNotifications(top5);
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
    } else {
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={[styles.dropdown, { backgroundColor: colors.card }]}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                {t('notifications.title', 'Notifications')}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={24}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
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
              notifications.map((item, index) => {
                const config = TYPE_CONFIG[item.type];
                return (
                  <TouchableOpacity
                    key={`${item.type}-${item.id}`}
                    style={[
                      styles.notificationItem,
                      index < notifications.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border || '#F0F0F0' },
                    ]}
                    onPress={() => handleItemPress(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconCircle, { backgroundColor: config.color }]}>
                      <IconSymbol
                        ios_icon_name={config.iconIos as any}
                        android_material_icon_name={config.iconAndroid as any}
                        size={16}
                        color="#FFFFFF"
                      />
                    </View>
                    <View style={styles.notificationContent}>
                      <Text style={[styles.notificationTitle, { color: colors.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.notificationSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                        {truncate(item.subtitle)}
                      </Text>
                    </View>
                    <Text style={[styles.timeAgo, { color: colors.textSecondary }]}>
                      {getTimeAgo(item.createdAt)}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
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
  dropdown: {
    borderRadius: 16,
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
    elevation: 8,
    overflow: 'hidden',
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
    fontWeight: '700',
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
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationContent: {
    flex: 1,
    gap: 2,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  notificationSubtitle: {
    fontSize: 12,
  },
  timeAgo: {
    fontSize: 12,
    fontWeight: '500',
  },
});
