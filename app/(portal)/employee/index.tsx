
import ContentDetailModal from '@/components/ContentDetailModal';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import WeatherDetailModal from '@/components/WeatherDetailModal';

import { getLocalizedField } from '@/utils/translateContent';
import { useLanguage } from '@/contexts/LanguageContext';
import FormattedText from '@/components/FormattedText';
import { stripFormattingTags } from '@/components/FormattedText';
import { fetchContentImagesBatch, ContentType } from '@/utils/contentImages';
import WelcomeHeader from '@/components/WelcomeHeader';
import NotificationDropdown from '@/components/NotificationDropdown';
import ConnectBar, { ConnectBarTab } from '@/components/ConnectBar';
import WeeklyCalendarStrip from '@/components/WeeklyCalendarStrip';
import UpcomingShiftsCard from '@/components/UpcomingShiftsCard';
import { eventFallsOnDate } from '@/utils/dateUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MenuItem {
  id: string;
  name: string;
  name_es?: string | null;
  description: string | null;
  description_es?: string | null;
  price: string;
  category: string;
  subcategory: string | null;
  is_gluten_free: boolean;
  is_gluten_free_available: boolean;
  is_vegetarian: boolean;
  is_vegetarian_available: boolean;
  thumbnail_url: string | null;
  thumbnail_shape: string;
  display_order: number;
  is_active: boolean;
}

interface GuideFile {
  id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_type: string;
}

interface Announcement {
  id: string;
  title: string;
  title_es?: string | null;
  content: string;
  content_es?: string | null;
  message: string | null;
  thumbnail_url: string | null;
  thumbnail_shape: string;
  priority: string;
  visibility: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  link: string | null;
  guide_file_id: string | null;
  guide_file?: GuideFile | null;
}

interface UpcomingEvent {
  id: string;
  title: string;
  title_es?: string | null;
  content: string;
  content_es?: string | null;
  message: string | null;
  thumbnail_url: string | null;
  thumbnail_shape: string;
  start_date_time: string | null;
  end_date_time: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  link: string | null;
  guide_file_id: string | null;
  guide_file?: GuideFile | null;
  category: string;
}

interface SpecialFeature {
  id: string;
  title: string;
  title_es?: string | null;
  content: string;
  content_es?: string | null;
  message: string | null;
  thumbnail_url: string | null;
  thumbnail_shape: string;
  start_date_time: string | null;
  end_date_time: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  link: string | null;
  guide_file_id: string | null;
  guide_file?: GuideFile | null;
}

export default function EmployeePortalScreen() {
  const colors = useThemeColors();
  const { user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { unreadCount } = useUnreadMessages();
  const { language } = useLanguage();
  const [weeklySpecials, setWeeklySpecials] = useState<MenuItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [specialFeatures, setSpecialFeatures] = useState<SpecialFeature[]>([]);
  const [loadingSpecials, setLoadingSpecials] = useState(true);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingFeatures, setLoadingFeatures] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);

  // What's Happening tab state (Announcements / Special Features)
  const [whatsHappeningTab, setWhatsHappeningTab] = useState<'Announcements' | 'Special Features'>('Announcements');

  // ConnectBar active tab
  const [activeSection, setActiveSection] = useState<ConnectBarTab>('today');
  const sectionListRef = useRef<FlatList>(null);
  const isScrollingRef = useRef(false);

  // Events section state (calendar + tabs - managed here for sticky layout)
  const [eventsSelectedDate, setEventsSelectedDate] = useState<Date | null>(null);
  const [eventsTab, setEventsTab] = useState<'Event' | 'Entertainment'>('Event');

  // Weather detail modal state
  const [weatherDetailVisible, setWeatherDetailVisible] = useState(false);

  // Notification dropdown state
  const [notificationVisible, setNotificationVisible] = useState(false);

  // Content images maps (content_id -> additional image URLs)
  const [contentImagesMap, setContentImagesMap] = useState<Map<string, string[]>>(new Map());

  // Detail modal state
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{
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
  } | null>(null);

  const SECTIONS: ConnectBarTab[] = ['today', 'events', 'specials'];

  useEffect(() => {
    loadWeeklySpecials();
    loadAnnouncements();
    loadUpcomingEvents();
    loadSpecialFeatures();
  }, []);

  // Reload data when language changes
  useEffect(() => {
    loadWeeklySpecials();
    loadAnnouncements();
    loadUpcomingEvents();
    loadSpecialFeatures();
  }, [language]);

  useFocusEffect(
    React.useCallback(() => {
      loadWeeklySpecials();
      loadAnnouncements();
      loadUpcomingEvents();
      loadSpecialFeatures();
    }, [])
  );

  // Handle deep link params from notification taps
  useEffect(() => {
    async function openDeepLinkItem() {
      const { openAnnouncementId, openEventId, openFeatureId } = params;
      if (!openAnnouncementId && !openEventId && !openFeatureId) return;

      try {
        if (openAnnouncementId) {
          const { data } = await supabase
            .from('announcements')
            .select('*, guide_file:guides_and_training!announcements_guide_file_id_fkey(id, title, file_url, file_name, file_type)')
            .eq('id', openAnnouncementId)
            .single();
          if (data) {
            const imgs = await fetchContentImagesBatch('announcement', [data.id]);
            const additionalImgs = imgs.get(data.id);
            const allImgs = additionalImgs && additionalImgs.length > 0
              ? [data.thumbnail_url, ...additionalImgs].filter(Boolean) as string[]
              : undefined;
            openDetailModal({
              title: getLocalizedField(data, 'title', language),
              content: getLocalizedField(data, 'content', language) || data.content,
              thumbnailUrl: data.thumbnail_url,
              thumbnailShape: data.thumbnail_shape,
              imageUrls: allImgs,
              priority: data.priority,
              link: data.link,
              guideFile: data.guide_file,
            });
          }
        } else if (openEventId) {
          const { data } = await supabase
            .from('upcoming_events')
            .select('*, guide_file:guides_and_training!upcoming_events_guide_file_id_fkey(id, title, file_url, file_name, file_type)')
            .eq('id', openEventId)
            .single();
          if (data) {
            const imgs = await fetchContentImagesBatch('upcoming_event', [data.id]);
            const additionalImgs = imgs.get(data.id);
            const allImgs = additionalImgs && additionalImgs.length > 0
              ? [data.thumbnail_url, ...additionalImgs].filter(Boolean) as string[]
              : undefined;
            openDetailModal({
              title: getLocalizedField(data, 'title', language),
              content: getLocalizedField(data, 'content', language) || data.content,
              thumbnailUrl: data.thumbnail_url,
              thumbnailShape: data.thumbnail_shape,
              imageUrls: allImgs,
              startDateTime: data.start_date_time,
              endDateTime: data.end_date_time,
              link: data.link,
              guideFile: data.guide_file,
            });
          }
        } else if (openFeatureId) {
          const { data } = await supabase
            .from('special_features')
            .select('*, guide_file:guides_and_training!special_features_guide_file_id_fkey(id, title, file_url, file_name, file_type)')
            .eq('id', openFeatureId)
            .single();
          if (data) {
            const imgs = await fetchContentImagesBatch('special_feature', [data.id]);
            const additionalImgs = imgs.get(data.id);
            const allImgs = additionalImgs && additionalImgs.length > 0
              ? [data.thumbnail_url, ...additionalImgs].filter(Boolean) as string[]
              : undefined;
            openDetailModal({
              title: getLocalizedField(data, 'title', language),
              content: getLocalizedField(data, 'content', language) || data.content,
              thumbnailUrl: data.thumbnail_url,
              thumbnailShape: data.thumbnail_shape,
              imageUrls: allImgs,
              startDateTime: data.start_date_time,
              endDateTime: data.end_date_time,
              link: data.link,
              guideFile: data.guide_file,
            });
          }
        }
      } catch (error) {
        console.error('Error opening deep link item:', error);
      }
    }

    openDeepLinkItem();
  }, [params.openAnnouncementId, params.openEventId, params.openFeatureId]);

  const loadWeeklySpecials = async () => {
    try {
      setLoadingSpecials(true);
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('category', 'Weekly Specials')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setWeeklySpecials(data || []);
    } catch (error) {
      console.error('Error loading weekly specials:', error);
    } finally {
      setLoadingSpecials(false);
    }
  };

  const loadAnnouncements = async () => {
    try {
      setLoadingAnnouncements(true);
      const { data, error } = await supabase
        .from('announcements')
        .select(`
          *,
          guide_file:guides_and_training!announcements_guide_file_id_fkey(
            id, title, file_url, file_name, file_type
          )
        `)
        .eq('is_active', true)
        .in('visibility', ['everyone', 'employees'])
        .order('display_order', { ascending: true })
        .limit(4);

      if (error) throw error;
      setAnnouncements(data || []);
      if (data && data.length > 0) {
        const ids = data.map((a: any) => a.id);
        const imagesMap = await fetchContentImagesBatch('announcement', ids);
        setContentImagesMap(prev => {
          const newMap = new Map(prev);
          imagesMap.forEach((urls, id) => newMap.set(id, urls));
          return newMap;
        });
      }
    } catch (error) {
      console.error('Error loading announcements:', error);
    } finally {
      setLoadingAnnouncements(false);
    }
  };

  const loadUpcomingEvents = async () => {
    try {
      setLoadingEvents(true);
      const { data, error } = await supabase
        .from('upcoming_events')
        .select(`
          *,
          guide_file:guides_and_training!upcoming_events_guide_file_id_fkey(
            id, title, file_url, file_name, file_type
          )
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUpcomingEvents(data || []);
      if (data && data.length > 0) {
        const ids = data.map((e: any) => e.id);
        const imagesMap = await fetchContentImagesBatch('upcoming_event', ids);
        setContentImagesMap(prev => {
          const newMap = new Map(prev);
          imagesMap.forEach((urls, id) => newMap.set(id, urls));
          return newMap;
        });
      }
    } catch (error) {
      console.error('Error loading upcoming events:', error);
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadSpecialFeatures = async () => {
    try {
      setLoadingFeatures(true);
      const { data, error } = await supabase
        .from('special_features')
        .select(`
          *,
          guide_file:guides_and_training!special_features_guide_file_id_fkey(
            id, title, file_url, file_name, file_type
          )
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(4);

      if (error) throw error;
      setSpecialFeatures(data || []);
      if (data && data.length > 0) {
        const ids = data.map((f: any) => f.id);
        const imagesMap = await fetchContentImagesBatch('special_feature', ids);
        setContentImagesMap(prev => {
          const newMap = new Map(prev);
          imagesMap.forEach((urls, id) => newMap.set(id, urls));
          return newMap;
        });
      }
    } catch (error) {
      console.error('Error loading special features:', error);
    } finally {
      setLoadingFeatures(false);
    }
  };

  const openDetailModal = (item: {
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
  }) => {
    setSelectedItem(item);
    setDetailModalVisible(true);
  };

  const closeDetailModal = () => {
    setDetailModalVisible(false);
    setSelectedItem(null);
  };

  const openWeatherDetail = () => setWeatherDetailVisible(true);
  const closeWeatherDetail = () => setWeatherDetailVisible(false);

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  };

  const buildImageUrls = (id: string, thumbnailUrl: string | null): string[] | undefined => {
    const additionalImages = contentImagesMap.get(id);
    if (!additionalImages || additionalImages.length === 0) return undefined;
    const images: string[] = [];
    if (thumbnailUrl) images.push(thumbnailUrl);
    images.push(...additionalImages);
    return images;
  };

  const formatPrice = (price: string) => {
    if (price.includes('$')) return price;
    return `$${price}`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'new': return '#3498DB';
      case 'important': return '#E74C3C';
      case 'update': return '#F39C12';
      default: return colors.textSecondary;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'new': return 'New';
      case 'important': return 'Important';
      case 'update': return 'Update';
      default: return priority.charAt(0).toUpperCase() + priority.slice(1);
    }
  };

  const truncateText = (text: string | null, maxLength: number = 125): string => {
    if (!text) return '';
    const stripped = stripFormattingTags(text);
    if (stripped.length <= maxLength) return stripped;
    const truncated = stripped.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 100) return truncated.substring(0, lastSpace) + '...';
    return truncated + '...';
  };

  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return null;
    const date = new Date(dateTime);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Compute filtered events for the Events section
  const eventsDisplayList = (() => {
    if (eventsSelectedDate !== null) {
      return upcomingEvents.filter(event =>
        eventFallsOnDate(event.start_date_time, event.end_date_time, eventsSelectedDate)
      );
    }
    const filtered = upcomingEvents.filter(event => event.category === eventsTab);
    return filtered.slice(0, 6);
  })();

  const renderEventCard = (event: UpcomingEvent, index: number) => {
    const additionalImages = contentImagesMap.get(event.id);
    let imageUrls: string[] | undefined;
    if (additionalImages && additionalImages.length > 0) {
      imageUrls = [];
      if (event.thumbnail_url) imageUrls.push(event.thumbnail_url);
      imageUrls.push(...additionalImages);
    }

    return (
      <TouchableOpacity
        key={event.id}
        style={[styles.card, { backgroundColor: colors.card, borderLeftColor: '#4CAF50' }]}
        onPress={() => openDetailModal({
          title: getLocalizedField(event, 'title', language),
          content: getLocalizedField(event, 'content', language) || event.content || event.message || '',
          thumbnailUrl: event.thumbnail_url,
          thumbnailShape: event.thumbnail_shape,
          imageUrls,
          startDateTime: event.start_date_time,
          endDateTime: event.end_date_time,
          link: event.link,
          guideFile: event.guide_file || null,
        })}
        activeOpacity={0.7}
      >
        <View style={styles.cardRow}>
          {event.thumbnail_url && (
            <Image
              source={{ uri: getImageUrl(event.thumbnail_url)! }}
              style={styles.cardImage}
            />
          )}
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {getLocalizedField(event, 'title', language)}
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {truncateText(getLocalizedField(event, 'content', language) || event.content || event.message)}
            </Text>
            {event.start_date_time && (
              <Text style={[styles.cardDate, { color: colors.textSecondary }]}>
                {formatDateTime(event.start_date_time)}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Handle section swipe
  const handleSectionScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / SCREEN_WIDTH);
    const newTab = SECTIONS[pageIndex];
    if (newTab && newTab !== activeSection) {
      setActiveSection(newTab);
    }
  }, [activeSection]);

  // Handle ConnectBar tab press
  const handleTabChange = useCallback((tab: ConnectBarTab) => {
    setActiveSection(tab);
    const index = SECTIONS.indexOf(tab);
    sectionListRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  // ===== RENDER CARD COMPONENTS =====

  const renderAnnouncementCard = (announcement: Announcement, index: number) => (
    <TouchableOpacity
      key={announcement.id}
      style={[styles.card, { backgroundColor: colors.card, borderLeftColor: getPriorityColor(announcement.priority) }]}
      onPress={() => openDetailModal({
        title: getLocalizedField(announcement, 'title', language),
        content: getLocalizedField(announcement, 'content', language) || announcement.content || announcement.message || '',
        thumbnailUrl: announcement.thumbnail_url,
        thumbnailShape: announcement.thumbnail_shape,
        imageUrls: buildImageUrls(announcement.id, announcement.thumbnail_url),
        priority: announcement.priority,
        link: announcement.link,
        guideFile: announcement.guide_file || null,
      })}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        {announcement.thumbnail_url && (
          <Image
            source={{ uri: getImageUrl(announcement.thumbnail_url)! }}
            style={styles.cardImage}
          />
        )}
        <View style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {getLocalizedField(announcement, 'title', language)}
            </Text>
            {announcement.priority && announcement.priority !== 'none' && (
              <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(announcement.priority) }]}>
                <Text style={styles.priorityText}>{getPriorityLabel(announcement.priority).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {truncateText(getLocalizedField(announcement, 'content', language) || announcement.content || announcement.message)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderFeatureCard = (feature: SpecialFeature, index: number) => (
    <TouchableOpacity
      key={feature.id}
      style={[styles.card, { backgroundColor: colors.card, borderLeftColor: '#FF9800' }]}
      onPress={() => openDetailModal({
        title: getLocalizedField(feature, 'title', language),
        content: getLocalizedField(feature, 'content', language) || feature.content || feature.message || '',
        thumbnailUrl: feature.thumbnail_url,
        thumbnailShape: feature.thumbnail_shape,
        imageUrls: buildImageUrls(feature.id, feature.thumbnail_url),
        startDateTime: feature.start_date_time,
        endDateTime: feature.end_date_time,
        link: feature.link,
        guideFile: feature.guide_file || null,
      })}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        {feature.thumbnail_url && (
          <Image
            source={{ uri: getImageUrl(feature.thumbnail_url)! }}
            style={styles.cardImage}
          />
        )}
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {getLocalizedField(feature, 'title', language)}
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {truncateText(getLocalizedField(feature, 'content', language) || feature.content || feature.message)}
          </Text>
          {feature.start_date_time && (
            <Text style={[styles.cardDate, { color: colors.textSecondary }]}>
              {formatDateTime(feature.start_date_time)}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderSpecialCard = (item: MenuItem, index: number) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.card, { backgroundColor: colors.card, borderLeftColor: '#F44336' }]}
      onPress={() => openDetailModal({
        title: getLocalizedField(item, 'name', language),
        content: `${getLocalizedField(item, 'description', language) || item.description || ''}\n\nPrice: ${formatPrice(item.price)}${item.is_gluten_free ? '\n• Gluten Free' : ''}${item.is_gluten_free_available ? '\n• Gluten Free Available' : ''}${item.is_vegetarian ? '\n• Vegetarian' : ''}${item.is_vegetarian_available ? '\n• Vegetarian Available' : ''}`,
        thumbnailUrl: item.thumbnail_url,
        thumbnailShape: item.thumbnail_shape,
      })}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        {item.thumbnail_url && (
          <Image
            source={{ uri: getImageUrl(item.thumbnail_url)! }}
            style={styles.cardImage}
          />
        )}
        <View style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {getLocalizedField(item, 'name', language)}
            </Text>
            <Text style={[styles.priceText, { color: colors.primary }]}>
              {formatPrice(item.price)}
            </Text>
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {getLocalizedField(item, 'description', language) || item.description}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  // ===== SECTION RENDERERS =====

  const renderTodaySection = () => (
    <View style={[styles.sectionPage, { width: SCREEN_WIDTH }]}>
      <ScrollView
        style={styles.sectionScroll}
        contentContainerStyle={styles.sectionContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {/* Upcoming Shifts Card */}
        <UpcomingShiftsCard
          userId={user?.id}
          colors={{
            primary: colors.primary,
            background: colors.background,
            text: colors.text,
            textSecondary: colors.darkSecondaryText,
            card: colors.card,
          }}
        />

        {/* Sub-tabs card: Announcements / Special Features */}
        <View style={[styles.todayTabsCard, { backgroundColor: colors.card }]}>
          <View style={[styles.subTabsContainer, { backgroundColor: colors.background, marginBottom: 0 }]}>
            <TouchableOpacity
              style={[styles.subTab, whatsHappeningTab === 'Announcements' && { backgroundColor: colors.primary }]}
              onPress={() => setWhatsHappeningTab('Announcements')}
              activeOpacity={0.7}
            >
              <Text style={[styles.subTabText, { color: colors.textSecondary }, whatsHappeningTab === 'Announcements' && { color: '#FFFFFF' }]}>
                {t('manager_home.announcements')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTab, whatsHappeningTab === 'Special Features' && { backgroundColor: colors.primary }]}
              onPress={() => setWhatsHappeningTab('Special Features')}
              activeOpacity={0.7}
            >
              <Text style={[styles.subTabText, { color: colors.textSecondary }, whatsHappeningTab === 'Special Features' && { color: '#FFFFFF' }]}>
                {t('manager_home.special_features')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Announcements */}
        {whatsHappeningTab === 'Announcements' && (
          <>
            {loadingAnnouncements ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : announcements.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {t('manager_home.no_announcements', 'No announcements')}
                </Text>
              </View>
            ) : (
              announcements.map((a, i) => renderAnnouncementCard(a, i))
            )}
          </>
        )}

        {/* Special Features */}
        {whatsHappeningTab === 'Special Features' && (
          <>
            {/* View All link */}
            <TouchableOpacity
              style={styles.viewAllRow}
              onPress={() => router.push('/view-all-special-features')}
              activeOpacity={0.7}
            >
              <Text style={[styles.viewAllText, { color: colors.primary }]}>
                {t('manager_home.view_all', 'View All')}
              </Text>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={16}
                color={colors.primary}
              />
            </TouchableOpacity>
            {loadingFeatures ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : specialFeatures.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {t('manager_home.no_features', 'No special features')}
                </Text>
              </View>
            ) : (
              specialFeatures.map((f, i) => renderFeatureCard(f, i))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );

  const renderEventsSection = () => (
    <View style={[styles.sectionPage, { width: SCREEN_WIDTH }]}>
      {/* Sticky: Calendar strip + Event/Entertainment tabs + View All */}
      <View style={styles.eventsStickyHeader}>
        <WeeklyCalendarStrip
          selectedDate={eventsSelectedDate}
          onSelectDate={setEventsSelectedDate}
          colors={{
            primary: colors.primary,
            background: colors.background,
            text: colors.text,
            textSecondary: colors.darkSecondaryText,
            card: colors.card,
          }}
          events={upcomingEvents}
          onViewAll={() => router.push('/view-all-upcoming-events')}
        >
          {/* Events / Entertainment tabs — nested inside calendar card */}
          <View style={[styles.subTabsContainer, { backgroundColor: colors.background, marginTop: 8 }]}>
            <TouchableOpacity
              style={[styles.subTab, eventsTab === 'Event' && { backgroundColor: colors.primary }]}
              onPress={() => setEventsTab('Event')}
              activeOpacity={0.7}
            >
              <Text style={[styles.subTabText, { color: colors.textSecondary }, eventsTab === 'Event' && { color: '#FFFFFF' }]}>
                {t('upcoming_events.events', 'Events')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTab, eventsTab === 'Entertainment' && { backgroundColor: colors.primary }]}
              onPress={() => setEventsTab('Entertainment')}
              activeOpacity={0.7}
            >
              <Text style={[styles.subTabText, { color: colors.textSecondary }, eventsTab === 'Entertainment' && { color: '#FFFFFF' }]}>
                {t('upcoming_events.entertainment', 'Entertainment')}
              </Text>
            </TouchableOpacity>
          </View>
        </WeeklyCalendarStrip>
      </View>

      {/* Scrollable event cards only */}
      <ScrollView
        style={styles.sectionScroll}
        contentContainerStyle={styles.sectionContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {loadingEvents ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : eventsDisplayList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t('employee_home.no_events', 'No events')}
            </Text>
          </View>
        ) : (
          eventsDisplayList.map((event, index) => renderEventCard(event, index))
        )}
      </ScrollView>
    </View>
  );

  const renderSpecialsSection = () => (
    <View style={[styles.sectionPage, { width: SCREEN_WIDTH }]}>
      <ScrollView
        style={styles.sectionScroll}
        contentContainerStyle={styles.sectionContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {loadingSpecials ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : weeklySpecials.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t('manager_home.no_specials', 'No weekly specials')}
            </Text>
          </View>
        ) : (
          weeklySpecials.map((s, i) => renderSpecialCard(s, i))
        )}
      </ScrollView>
    </View>
  );

  const renderSection = ({ item }: { item: ConnectBarTab }) => {
    switch (item) {
      case 'today': return renderTodaySection();
      case 'events': return renderEventsSection();
      case 'specials': return renderSpecialsSection();
      default: return null;
    }
  };

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerArea}>
        {/* Welcome Header */}
        <View style={styles.headerPadding}>
          <WelcomeHeader
            onWeatherPress={openWeatherDetail}
            onNotificationPress={() => setNotificationVisible(true)}
          />

          {/* Connect Bar */}
          <ConnectBar
            activeTab={activeSection}
            onTabChange={handleTabChange}
          />
        </View>
      </View>

      {/* Horizontal Swipeable Sections */}
      <FlatList
        ref={sectionListRef}
        data={SECTIONS}
        renderItem={renderSection}
        keyExtractor={(item) => item}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleSectionScroll}
        scrollEventThrottle={16}
        bounces={false}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      {/* Notification Dropdown */}
      <NotificationDropdown
        visible={notificationVisible}
        onClose={() => setNotificationVisible(false)}
        onItemPress={openDetailModal}
        visibility="employees"
      />

      {/* Content Detail Modal */}
      {selectedItem && (
        <ContentDetailModal
          visible={detailModalVisible}
          onClose={closeDetailModal}
          title={selectedItem.title}
          content={selectedItem.content}
          thumbnailUrl={selectedItem.thumbnailUrl}
          thumbnailShape={selectedItem.thumbnailShape}
          imageUrls={selectedItem.imageUrls}
          startDateTime={selectedItem.startDateTime}
          endDateTime={selectedItem.endDateTime}
          priority={selectedItem.priority}
          link={selectedItem.link}
          guideFile={selectedItem.guideFile}
          colors={{
            text: colors.text,
            textSecondary: colors.textSecondary,
            card: colors.card,
            primary: colors.primary,
          }}
        />
      )}

      <WeatherDetailModal
        visible={weatherDetailVisible}
        onClose={closeWeatherDetail}
        language={language}
        colors={{
          text: colors.text,
          textSecondary: colors.textSecondary,
          card: colors.card,
          primary: colors.primary,
          border: colors.border,
        }}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerArea: {
    zIndex: 10,
  },
  headerPadding: {
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  sectionPage: {
    flex: 1,
  },
  sectionScroll: {
    flex: 1,
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 120,
  },
  subTabsContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  subTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    borderRadius: 12,
    marginBottom: 10,
    padding: 12,
    borderLeftWidth: 4,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardDate: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  priceText: {
    fontSize: 16,
    fontWeight: '700',
  },
  eventsContainer: {
    padding: 12,
  },
  todayTabsCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  eventsStickyHeader: {
    backgroundColor: 'transparent',
    zIndex: 5,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 8,
    gap: 4,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
