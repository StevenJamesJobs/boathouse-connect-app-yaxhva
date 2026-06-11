
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
  ActivityIndicator,
  Modal,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { weeklySpecialsNames } from '@/utils/categoryNames';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import WeatherDetailModal from '@/components/WeatherDetailModal';

import { getLocalizedField } from '@/utils/translateContent';
import { useLanguage } from '@/contexts/LanguageContext';
import FormattedText from '@/components/FormattedText';
import { stripFormattingTags } from '@/components/FormattedText';
import { fetchContentImagesBatch, ContentType } from '@/utils/contentImages';
import { getImageUrl } from '@/utils/imageUrl';
import WelcomeHeader from '@/components/WelcomeHeader';
import NotificationDropdown from '@/components/NotificationDropdown';
import ConnectBar, { ConnectBarTab } from '@/components/ConnectBar';
import { useUnreadContent } from '@/hooks/useUnreadContent';
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
  available_for_lunch: boolean;
  available_for_dinner: boolean;
  is_gluten_free: boolean;
  is_gluten_free_available: boolean;
  is_vegetarian: boolean;
  is_vegetarian_available: boolean;
  thumbnail_url: string | null;
  thumbnail_shape: string;
  display_order: number;
  is_active: boolean;
  updated_at?: string;
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
  updated_at?: string;
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
  updated_at?: string;
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
  updated_at?: string;
  link: string | null;
  guide_file_id: string | null;
  guide_file?: GuideFile | null;
}

export default function EmployeePortalScreen() {
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ openAnnouncementId?: string; openEventId?: string; openFeatureId?: string }>();
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

  // ConnectBar active tab + unread content badges
  const [activeSection, setActiveSection] = useState<ConnectBarTab>('today');
  const {
    todayHasNew,
    eventsHasNew,
    specialsHasNew,
    announcementsHasNew,
    specialFeaturesHasNew,
    eventsEventHasNew,
    eventsEntertainmentHasNew,
    lastViewedAnnouncements,
    lastViewedSpecialFeatures,
    lastViewedEvents,
    viewedAnnouncementIds,
    viewedSpecialFeatureIds,
    viewedEventIds,
    newContentCount,
    markTabViewed,
    markWelcomeTabViewed,
    markAnnouncementViewed,
    markSpecialFeatureViewed,
    markEventViewed,
    markEventsTabVisited,
    markAllEventsViewed,
  } = useUnreadContent();
  const sectionListRef = useRef<FlatList>(null);
  const isScrollingRef = useRef(false);
  const lastMarkedSectionRef = useRef<ConnectBarTab>('today');

  // Today header collapse state — only active when there are Happening Today events
  const [todayHeaderCollapsed, setTodayHeaderCollapsed] = useState(false);

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
  // Flat pager: each leaf (sub-tab) is its own page so horizontal swipes traverse
  // both top-level Connect bar tabs and their internal sub-tabs in a single sequence.
  // The section-level static UI (shifts/happening header for Today, calendar strip
  // for Events) lives OUTSIDE the FlatList — only the cards content swipes.
  const FLATLIST_PAGES = [
    'today-announcements',
    'today-special-features',
    'events-event',
    'events-entertainment',
    'specials',
    'menu-bridge',
  ] as const;
  const MENU_BRIDGE_INDEX = 5;
  const SECTION_FIRST_LEAF: Record<ConnectBarTab, number> = { today: 0, events: 2, specials: 4 };
  const pageIndexToSection = (index: number): ConnectBarTab | 'menu-bridge' => {
    if (index <= 1) return 'today';
    if (index <= 3) return 'events';
    if (index === 4) return 'specials';
    return 'menu-bridge';
  };
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  const loadAllContent = async () => {
    // Org context resolves asynchronously on fresh login; bail until we have an
    // org id so we never fire queries filtered on organization_id = null (which
    // return empty and leave the home screen blank). The [organizationId] effect
    // below re-runs this once the id lands.
    if (!organizationId) return;

    setLoadingSpecials(true);
    setLoadingAnnouncements(true);
    setLoadingEvents(true);
    setLoadingFeatures(true);

    try {
      const wsNames = await weeklySpecialsNames(organizationId);
      const [specialsResult, announcementsResult, eventsResult, featuresResult] = await Promise.all([
        // Weekly Specials = items categorized as Weekly Specials PLUS any item
        // flagged is_weekly_special (overlay — the item stays in its home
        // category but is featured here too). Merge + dedupe by id.
        (async () => {
          const [byCategory, flagged] = await Promise.all([
            supabase.from('menu_items').select('*').eq('organization_id', organizationId).in('category', wsNames).eq('is_active', true),
            supabase.from('menu_items').select('*').eq('organization_id', organizationId).eq('is_weekly_special', true).eq('is_active', true),
          ]);
          const byId = new Map<string, any>();
          for (const row of [...(byCategory.data || []), ...(flagged.data || [])]) byId.set(row.id, row);
          const merged = Array.from(byId.values()).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
          return { data: merged };
        })(),
        supabase
          .from('announcements')
          .select(`
            *,
            guide_file:guides_and_training!announcements_guide_file_id_fkey(
              id, title, file_url, file_name, file_type
            )
          `)
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .in('visibility', ['everyone', 'employees'])
          .order('display_order', { ascending: true })
          .limit(6),
        (async () => {
          try { await supabase.rpc('delete_expired_upcoming_events', { p_organization_id: organizationId }); } catch {}
          return supabase
            .from('upcoming_events')
            .select(`
              *,
              guide_file:guides_and_training!upcoming_events_guide_file_id_fkey(
                id, title, file_url, file_name, file_type
              )
            `)
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .order('display_order', { ascending: true })
            .order('created_at', { ascending: false });
        })(),
        supabase
          .from('special_features')
          .select(`
            *,
            guide_file:guides_and_training!special_features_guide_file_id_fkey(
              id, title, file_url, file_name, file_type
            )
          `)
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      const specials = specialsResult.data || [];
      const anns = announcementsResult.data || [];
      const events = eventsResult.data || [];
      const features = featuresResult.data || [];

      setWeeklySpecials(specials as MenuItem[]);
      setAnnouncements(anns as Announcement[]);
      setUpcomingEvents(events as UpcomingEvent[]);
      setSpecialFeatures(features as SpecialFeature[]);

      const newImagesMap = new Map<string, string[]>();
      const imagePromises: Promise<void>[] = [];

      if (anns.length > 0) {
        imagePromises.push(
          fetchContentImagesBatch('announcement', anns.map((a: any) => a.id))
            .then(m => m.forEach((urls, id) => newImagesMap.set(id, urls)))
        );
      }
      if (events.length > 0) {
        imagePromises.push(
          fetchContentImagesBatch('upcoming_event', events.map((e: any) => e.id))
            .then(m => m.forEach((urls, id) => newImagesMap.set(id, urls)))
        );
      }
      if (features.length > 0) {
        imagePromises.push(
          fetchContentImagesBatch('special_feature', features.map((f: any) => f.id))
            .then(m => m.forEach((urls, id) => newImagesMap.set(id, urls)))
        );
      }

      await Promise.all(imagePromises);
      setContentImagesMap(newImagesMap);
    } catch (error) {
      console.error('Error loading content:', error);
    } finally {
      setLoadingSpecials(false);
      setLoadingAnnouncements(false);
      setLoadingEvents(false);
      setLoadingFeatures(false);
    }
  };

  useEffect(() => { loadAllContent(); }, [organizationId]);

  useEffect(() => { loadAllContent(); }, [language, organizationId]);

  useFocusEffect(React.useCallback(() => { loadAllContent(); }, [organizationId]));

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
              thumbnailShape: data.thumbnail_shape || undefined,
              imageUrls: allImgs,
              priority: data.priority || undefined,
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
              thumbnailShape: data.thumbnail_shape || undefined,
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
              thumbnailShape: data.thumbnail_shape || undefined,
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

  const buildImageUrls = (id: string, thumbnailUrl: string | null, updatedAt?: string): string[] | undefined => {
    const additionalImages = contentImagesMap.get(id);
    if (!additionalImages || additionalImages.length === 0) return undefined;
    const images: string[] = [];
    if (thumbnailUrl) images.push(getImageUrl(thumbnailUrl, updatedAt)!);
    images.push(...additionalImages.map(url => getImageUrl(url, updatedAt)!));
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

  // Compute filtered events for the Events section, scoped per-leaf so each
  // pager page renders its own consistent list during swipes.
  const computeEventsDisplay = (subTab: 'Event' | 'Entertainment') => {
    if (eventsSelectedDate !== null) {
      return upcomingEvents.filter(event =>
        eventFallsOnDate(event.start_date_time, event.end_date_time, eventsSelectedDate)
      );
    }
    return upcomingEvents.filter(event => event.category === subTab).slice(0, 6);
  };

  // Today's events + entertainment for the "Happening Today" section on the Today tab
  const todayHappeningList = upcomingEvents.filter(event =>
    eventFallsOnDate(event.start_date_time, event.end_date_time, new Date())
  );

  const renderEventCard = (event: UpcomingEvent, index: number) => {
    const additionalImages = contentImagesMap.get(event.id);
    let imageUrls: string[] | undefined;
    if (additionalImages && additionalImages.length > 0) {
      imageUrls = [];
      if (event.thumbnail_url) imageUrls.push(getImageUrl(event.thumbnail_url, event.updated_at)!);
      imageUrls.push(...additionalImages.map(url => getImageUrl(url, event.updated_at)!));
    }

    return (
      <TouchableOpacity
        key={event.id}
        style={[styles.card, { backgroundColor: colors.card, borderLeftColor: '#4CAF50' }]}
        onPress={() => {
          markEventViewed(event.id);
          openDetailModal({
            title: getLocalizedField(event, 'title', language),
            content: getLocalizedField(event, 'content', language) || event.content || event.message || '',
            thumbnailUrl: event.thumbnail_url,
            thumbnailShape: event.thumbnail_shape,
            imageUrls,
            startDateTime: event.start_date_time,
            endDateTime: event.end_date_time,
            link: event.link,
            guideFile: event.guide_file || null,
          });
        }}
        activeOpacity={0.7}
      >
        <View style={styles.cardRow}>
          {event.thumbnail_url && (
            <Image
              source={getImageUrl(event.thumbnail_url, event.updated_at)!}
              style={styles.cardImage}
              contentFit="cover"
            />
          )}
          <View style={styles.cardContent}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                {getLocalizedField(event, 'title', language)}
              </Text>
              {!viewedEventIds.has(event.id) &&
                (!lastViewedEvents || new Date(event.created_at) > new Date(lastViewedEvents)) && (
                  <View style={styles.newPill}>
                    <Text style={styles.newPillText}>NEW</Text>
                  </View>
                )}
            </View>
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

  // Handle section swipe across the flat pager (6 leaf pages).
  const handleSectionScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / SCREEN_WIDTH);

    // Phantom menu-bridge page hands off to the Menu tab.
    if (pageIndex === MENU_BRIDGE_INDEX) {
      router.navigate('/(portal)/employee/menus');
      setTimeout(() => {
        sectionListRef.current?.scrollToIndex({ index: SECTION_FIRST_LEAF.specials, animated: false });
        setActiveSection('specials');
        setCurrentPageIndex(SECTION_FIRST_LEAF.specials);
      }, 100);
      return;
    }

    setCurrentPageIndex(pageIndex);
    const newSection = pageIndexToSection(pageIndex) as ConnectBarTab;
    if (newSection !== lastMarkedSectionRef.current) {
      lastMarkedSectionRef.current = newSection;
      setActiveSection(newSection);
      markTabViewed(newSection);
    }
    // Sync sub-tab state from the leaf the user landed on (used for badge tracking).
    if (pageIndex === 0 && whatsHappeningTab !== 'Announcements') {
      setWhatsHappeningTab('Announcements');
      markWelcomeTabViewed('announcements');
    } else if (pageIndex === 1 && whatsHappeningTab !== 'Special Features') {
      setWhatsHappeningTab('Special Features');
      markWelcomeTabViewed('specialFeatures');
    } else if (pageIndex === 2) {
      if (eventsTab !== 'Event') setEventsTab('Event');
      markEventsTabVisited('Event');
    } else if (pageIndex === 3) {
      if (eventsTab !== 'Entertainment') setEventsTab('Entertainment');
      markEventsTabVisited('Entertainment');
    }
  }, [router, markTabViewed, whatsHappeningTab, eventsTab, markWelcomeTabViewed, markEventsTabVisited]);

  // Cross-section header swap mid-swipe: snap activeSection to whichever section
  // the user has crossed into so the static header doesn't lag the cards.
  const handleSectionScrollLive = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / SCREEN_WIDTH);
    const liveSection = pageIndexToSection(pageIndex);
    if (liveSection !== 'menu-bridge' && liveSection !== activeSection) {
      setActiveSection(liveSection as ConnectBarTab);
      setCurrentPageIndex(pageIndex);
    }
  }, [activeSection]);

  // Handle ConnectBar tab press — scroll to the first leaf of that section.
  const handleTabChange = useCallback((tab: ConnectBarTab) => {
    lastMarkedSectionRef.current = tab;
    setActiveSection(tab);
    setCurrentPageIndex(SECTION_FIRST_LEAF[tab]);
    markTabViewed(tab);
    if (tab === 'events') markEventsTabVisited('Event');
    sectionListRef.current?.scrollToIndex({ index: SECTION_FIRST_LEAF[tab], animated: true });
  }, [markTabViewed, markEventsTabVisited]);

  // Sub-tab tap handlers — scroll the pager to the matching leaf.
  const goToLeaf = useCallback((index: number) => {
    sectionListRef.current?.scrollToIndex({ index, animated: true });
    if (index === 2) markEventsTabVisited('Event');
    else if (index === 3) markEventsTabVisited('Entertainment');
  }, [markEventsTabVisited]);

  // Forward horizontal swipes on the static Today header to the FlatList pager.
  const advanceLeaf = useCallback((delta: 1 | -1) => {
    const target = Math.max(0, Math.min(FLATLIST_PAGES.length - 1, currentPageIndex + delta));
    if (target !== currentPageIndex) {
      sectionListRef.current?.scrollToIndex({ index: target, animated: true });
    }
  }, [currentPageIndex]);

  const todayHeaderSwipeGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-15, 15])
    .onEnd((event) => {
      const distanceThreshold = SCREEN_WIDTH * 0.25;
      const velocityThreshold = 500;
      if (event.translationX < -distanceThreshold || event.velocityX < -velocityThreshold) {
        runOnJS(advanceLeaf)(1);
      } else if (event.translationX > distanceThreshold || event.velocityX > velocityThreshold) {
        runOnJS(advanceLeaf)(-1);
      }
    });

  // ===== RENDER CARD COMPONENTS =====

  const renderAnnouncementCard = (announcement: Announcement, index: number) => (
    <TouchableOpacity
      key={announcement.id}
      style={[styles.card, { backgroundColor: colors.card, borderLeftColor: getPriorityColor(announcement.priority) }]}
      onPress={() => {
        markAnnouncementViewed(announcement.id);
        openDetailModal({
          title: getLocalizedField(announcement, 'title', language),
          content: getLocalizedField(announcement, 'content', language) || announcement.content || announcement.message || '',
          thumbnailUrl: announcement.thumbnail_url,
          thumbnailShape: announcement.thumbnail_shape,
          imageUrls: buildImageUrls(announcement.id, announcement.thumbnail_url, announcement.updated_at),
          priority: announcement.priority,
          link: announcement.link,
          guideFile: announcement.guide_file || null,
        });
      }}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        {announcement.thumbnail_url && (
          <Image
            source={getImageUrl(announcement.thumbnail_url, announcement.updated_at)!}
            style={styles.cardImage}
            contentFit="cover"
          />
        )}
        <View style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {getLocalizedField(announcement, 'title', language)}
            </Text>
            {!viewedAnnouncementIds.has(announcement.id) &&
              (!lastViewedAnnouncements || new Date(announcement.created_at) > new Date(lastViewedAnnouncements)) && (
                <View style={styles.newPill}>
                  <Text style={styles.newPillText}>NEW</Text>
                </View>
              )}
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
      onPress={() => {
        markSpecialFeatureViewed(feature.id);
        openDetailModal({
          title: getLocalizedField(feature, 'title', language),
          content: getLocalizedField(feature, 'content', language) || feature.content || feature.message || '',
          thumbnailUrl: feature.thumbnail_url,
          thumbnailShape: feature.thumbnail_shape,
          imageUrls: buildImageUrls(feature.id, feature.thumbnail_url, feature.updated_at),
          startDateTime: feature.start_date_time,
          endDateTime: feature.end_date_time,
          link: feature.link,
          guideFile: feature.guide_file || null,
        });
      }}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        {feature.thumbnail_url && (
          <Image
            source={getImageUrl(feature.thumbnail_url, feature.updated_at)!}
            style={styles.cardImage}
            contentFit="cover"
          />
        )}
        <View style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {getLocalizedField(feature, 'title', language)}
            </Text>
            {!viewedSpecialFeatureIds.has(feature.id) &&
              (!lastViewedSpecialFeatures || new Date(feature.created_at) > new Date(lastViewedSpecialFeatures)) && (
                <View style={styles.newPill}>
                  <Text style={styles.newPillText}>NEW</Text>
                </View>
              )}
          </View>
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
            source={getImageUrl(item.thumbnail_url, item.updated_at)!}
            style={styles.cardImage}
            contentFit="cover"
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
          {/* Meal Period + Dietary Tags */}
          <View style={styles.specialTagsRow}>
            {item.available_for_lunch && (
              <View style={[styles.specialMealTag, { backgroundColor: '#FF980018' }]}>
                <Text style={[styles.specialTagText, { color: '#FF9800' }]}>Lunch</Text>
              </View>
            )}
            {item.available_for_dinner && (
              <View style={[styles.specialMealTag, { backgroundColor: '#9C27B018' }]}>
                <Text style={[styles.specialTagText, { color: '#9C27B0' }]}>Dinner</Text>
              </View>
            )}
            {item.is_gluten_free && (
              <View style={[styles.specialDietTag, { backgroundColor: colors.highlight }]}>
                <Text style={[styles.specialTagText, { color: colors.text }]}>GF</Text>
              </View>
            )}
            {item.is_gluten_free_available && (
              <View style={[styles.specialDietTag, { backgroundColor: colors.highlight }]}>
                <Text style={[styles.specialTagText, { color: colors.text }]}>GFA</Text>
              </View>
            )}
            {item.is_vegetarian && (
              <View style={[styles.specialDietTag, { backgroundColor: colors.highlight }]}>
                <Text style={[styles.specialTagText, { color: colors.text }]}>V</Text>
              </View>
            )}
            {item.is_vegetarian_available && (
              <View style={[styles.specialDietTag, { backgroundColor: colors.highlight }]}>
                <Text style={[styles.specialTagText, { color: colors.text }]}>VA</Text>
              </View>
            )}
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {stripFormattingTags(getLocalizedField(item, 'description', language) || item.description || '')}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  // ===== SECTION RENDERERS =====

  // Static section header for the Today section — rendered ABOVE the FlatList so
  // it stays still while the user swipes between Today's sub-tab leaves.
  const renderTodayHeader = (activeSubTab: 'Announcements' | 'Special Features') => {
    const showGrabber = todayHappeningList.length > 0;
    const isCollapsed = todayHeaderCollapsed && showGrabber;
    return (
    <View style={styles.sectionHeaderWrap}>
      {!isCollapsed && (
        <>
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
          {todayHappeningList.length > 0 && (
            <View style={styles.happeningTodayWrap}>
              <View style={styles.happeningTodayHeader}>
                <IconSymbol
                  ios_icon_name="calendar"
                  android_material_icon_name="event"
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.happeningTodayTitle, { color: colors.text }]}>
                  {t('today_section.happening_today', 'Happening Today')}
                </Text>
                {todayHappeningList.length > 3 && (
                  <TouchableOpacity onPress={() => router.push('/view-all-upcoming-events')} activeOpacity={0.7} style={styles.happeningTodayMoreLink}>
                    <Text style={[styles.happeningTodayMoreText, { color: colors.primary }]}>
                      {todayHappeningList.length} total →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {todayHappeningList.slice(0, 3).map((event, index) => renderEventCard(event, index))}
              {todayHappeningList.length > 3 && (
                <TouchableOpacity
                  style={[styles.happeningTodayMoreButton, { borderColor: colors.primary + '30' }]}
                  onPress={() => router.push('/view-all-upcoming-events')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.happeningTodayMoreButtonText, { color: colors.primary }]}>
                    +{todayHappeningList.length - 3} {t('today_section.more_today', 'more today')} →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
      )}

      {showGrabber && (
        <TouchableOpacity
          style={[styles.collapseGrabber, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}
          onPress={() => setTodayHeaderCollapsed(prev => !prev)}
          activeOpacity={0.7}
        >
          <View style={[styles.collapseGrabberPill, { backgroundColor: colors.primary + '60' }]} />
          <Text style={[styles.collapseGrabberLabel, { color: colors.primary }]}>
            {isCollapsed ? 'Show Shifts & Today' : 'Hide Shifts & Today'}
          </Text>
          <IconSymbol
            ios_icon_name={isCollapsed ? 'chevron.down' : 'chevron.up'}
            android_material_icon_name={isCollapsed ? 'expand-more' : 'expand-less'}
            size={13}
            color={colors.primary}
          />
        </TouchableOpacity>
      )}

      <View style={[styles.todayTabsCard, { backgroundColor: colors.card }]}>
        <View style={[styles.subTabsContainer, { backgroundColor: colors.background, marginBottom: 0 }]}>
          <TouchableOpacity
            style={[styles.subTab, activeSubTab === 'Announcements' && { backgroundColor: colors.primary }]}
            onPress={() => goToLeaf(0)}
            activeOpacity={0.7}
          >
            <View style={styles.subTabLabelRow}>
              <Text style={[styles.subTabText, { color: colors.textSecondary }, activeSubTab === 'Announcements' && { color: '#FFFFFF' }]}>
                {t('manager_home.announcements')}
              </Text>
              {announcementsHasNew && activeSubTab !== 'Announcements' && (
                <View style={styles.subTabBadgeDot} />
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subTab, activeSubTab === 'Special Features' && { backgroundColor: colors.primary }]}
            onPress={() => goToLeaf(1)}
            activeOpacity={0.7}
          >
            <View style={styles.subTabLabelRow}>
              <Text style={[styles.subTabText, { color: colors.textSecondary }, activeSubTab === 'Special Features' && { color: '#FFFFFF' }]}>
                {t('manager_home.special_features')}
              </Text>
              {specialFeaturesHasNew && activeSubTab !== 'Special Features' && (
                <View style={styles.subTabBadgeDot} />
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
    );
  };

  // FlatList leaf for Today — only the cards content (announcements OR special features).
  const renderTodayLeaf = (subTab: 'Announcements' | 'Special Features') => (
    <View style={[styles.sectionPage, { width: SCREEN_WIDTH }]}>
      <ScrollView
        style={styles.sectionScroll}
        contentContainerStyle={styles.sectionContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {subTab === 'Announcements' ? (
          loadingAnnouncements ? (
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
          )
        ) : loadingFeatures ? (
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
      </ScrollView>
    </View>
  );

  // Static section header for the Events section.
  // No paddingHorizontal wrap here — WeeklyCalendarStrip has its own marginHorizontal: 16.
  const renderEventsHeader = (activeSubTab: 'Event' | 'Entertainment') => {
    const hasNewAdded = eventsSelectedDate === null && (['Event', 'Entertainment'] as const).some(cat => {
      const items = upcomingEvents.filter(e => e.category === cat);
      return items.slice(6).some(e =>
        !viewedEventIds.has(e.id) &&
        !!lastViewedEvents &&
        new Date(e.created_at) > new Date(lastViewedEvents)
      );
    });
    return (
    <View>
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
        onNewAdded={hasNewAdded ? async () => { await markAllEventsViewed(); router.push('/view-all-upcoming-events'); } : undefined}
      >
        <View style={[styles.subTabsContainer, { backgroundColor: colors.background, marginTop: 8 }]}>
          <TouchableOpacity
            style={[styles.subTab, activeSubTab === 'Event' && { backgroundColor: colors.primary }]}
            onPress={() => goToLeaf(2)}
            activeOpacity={0.7}
          >
            <View style={styles.subTabLabelRow}>
              <Text style={[styles.subTabText, { color: colors.textSecondary }, activeSubTab === 'Event' && { color: '#FFFFFF' }]}>
                {t('upcoming_events.events', 'Events')}
              </Text>
              {eventsEventHasNew && activeSubTab !== 'Event' && (
                <View style={styles.subTabBadgeDot} />
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subTab, activeSubTab === 'Entertainment' && { backgroundColor: colors.primary }]}
            onPress={() => goToLeaf(3)}
            activeOpacity={0.7}
          >
            <View style={styles.subTabLabelRow}>
              <Text style={[styles.subTabText, { color: colors.textSecondary }, activeSubTab === 'Entertainment' && { color: '#FFFFFF' }]}>
                {t('upcoming_events.entertainment', 'Entertainment')}
              </Text>
              {eventsEntertainmentHasNew && activeSubTab !== 'Entertainment' && (
                <View style={styles.subTabBadgeDot} />
              )}
            </View>
          </TouchableOpacity>
        </View>
      </WeeklyCalendarStrip>
    </View>
    );
  };

  // FlatList leaf for Events — only the cards.
  const renderEventsLeaf = (subTab: 'Event' | 'Entertainment') => {
    const displayList = computeEventsDisplay(subTab);

    return (
      <View style={[styles.sectionPage, { width: SCREEN_WIDTH }]}>
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
          ) : displayList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t('employee_home.no_events', 'No events')}
              </Text>
            </View>
          ) : (
            displayList.map((event, index) => renderEventCard(event, index))
          )}
        </ScrollView>
      </View>
    );
  };

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

  const renderSection = ({ item }: { item: string }) => {
    switch (item) {
      case 'today-announcements': return renderTodayLeaf('Announcements');
      case 'today-special-features': return renderTodayLeaf('Special Features');
      case 'events-event': return renderEventsLeaf('Event');
      case 'events-entertainment': return renderEventsLeaf('Entertainment');
      case 'specials': return renderSpecialsSection();
      case 'menu-bridge': return <View style={{ width: SCREEN_WIDTH }} />;
      default: return null;
    }
  };

  const todayActiveSubTab: 'Announcements' | 'Special Features' =
    currentPageIndex === 1 ? 'Special Features' : 'Announcements';
  const eventsActiveSubTab: 'Event' | 'Entertainment' =
    currentPageIndex === 3 ? 'Entertainment' : 'Event';

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerArea}>
        {/* Welcome Header */}
        <View style={styles.headerPadding}>
          <WelcomeHeader
            onWeatherPress={openWeatherDetail}
            onNotificationPress={() => setNotificationVisible(true)}
            newContentCount={newContentCount}
          />

          {/* Connect Bar */}
          <ConnectBar
            activeTab={activeSection}
            onTabChange={handleTabChange}
            badges={{ today: todayHasNew, events: eventsHasNew, specials: specialsHasNew }}
          />
        </View>
      </View>

      {/* Section static header — stays put while inner cards swipe */}
      {activeSection === 'today' && (
        <GestureDetector gesture={todayHeaderSwipeGesture}>
          <View collapsable={false}>{renderTodayHeader(todayActiveSubTab)}</View>
        </GestureDetector>
      )}
      {activeSection === 'events' && renderEventsHeader(eventsActiveSubTab)}

      {/* Horizontal Swipeable Sections — only the cards swipe */}
      <FlatList
        ref={sectionListRef}
        data={FLATLIST_PAGES as unknown as string[]}
        renderItem={renderSection}
        keyExtractor={(item) => item}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleSectionScrollLive}
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
  subTabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subTabBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  newPill: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  newPillText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
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
  specialTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  specialMealTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  specialDietTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  specialTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  eventsContainer: {
    padding: 12,
  },
  sectionHeaderWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  happeningTodayWrap: {
    marginBottom: 12,
  },
  happeningTodayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  happeningTodayTitle: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  happeningTodayMoreLink: {
    marginLeft: 'auto',
  },
  happeningTodayMoreText: {
    fontSize: 12,
    fontWeight: '600',
  },
  happeningTodayMoreButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 4,
  },
  happeningTodayMoreButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  collapseGrabber: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    gap: 7,
  },
  collapseGrabberPill: {
    width: 24,
    height: 3,
    borderRadius: 2,
  },
  collapseGrabberLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  todayTabsCard: {
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
