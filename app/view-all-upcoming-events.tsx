
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import ContentDetailModal from '@/components/ContentDetailModal';
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import MonthlyCalendar from '@/components/MonthlyCalendar';
import WeeklyCalendarStrip from '@/components/WeeklyCalendarStrip';
import { eventFallsOnDate } from '@/utils/dateUtils';
import { getLocalizedField } from '@/utils/translateContent';
import { useLanguage } from '@/contexts/LanguageContext';
import { useOrganization } from '../contexts/OrganizationContext';
import { fetchContentImagesBatch } from '@/utils/contentImages';
import { getImageUrl } from '@/utils/imageUrl';
import { stripFormattingTags } from '@/components/FormattedText';
import { useUnreadContent } from '@/hooks/useUnreadContent';
import { useOrganization } from '@/contexts/OrganizationContext';

interface GuideFile {
  id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_type: string;
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

export default function ViewAllUpcomingEventsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { organizationId } = useOrganization();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsTab, setEventsTab] = useState<'Event' | 'Entertainment'>('Event');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [contentImagesMap, setContentImagesMap] = useState<Map<string, string[]>>(new Map());
  const [monthOverlayVisible, setMonthOverlayVisible] = useState(false);

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<{
    title: string;
    content: string;
    thumbnailUrl?: string | null;
    thumbnailShape?: string;
    startDateTime?: string | null;
    endDateTime?: string | null;
    link?: string | null;
    guideFile?: GuideFile | null;
    imageUrls?: string[];
  } | null>(null);

  const colors = useThemeColors();
  const { organizationId } = useOrganization();
  const {
    viewedEventIds,
    lastViewedEvents,
    markEventViewed,
    markEventsTabVisited,
    eventsEventHasNew,
    eventsEntertainmentHasNew,
  } = useUnreadContent();

  useEffect(() => {
    loadEvents();
    markEventsTabVisited('Event');
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      try { await supabase.rpc('delete_expired_upcoming_events', { p_organization_id: organizationId }); } catch {}

      const { data, error } = await supabase
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

      if (error) throw error;

      setEvents(data || []);

      if (data && data.length > 0) {
        const ids = data.map((e: UpcomingEvent) => e.id);
        const imagesMap = await fetchContentImagesBatch('upcoming_event', ids);
        setContentImagesMap(imagesMap);
      }
    } catch (error) {
      console.error('Error loading upcoming events:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetailModal = (event: UpcomingEvent) => {
    markEventViewed(event.id);
    const additionalImages = contentImagesMap.get(event.id) || [];
    const imageUrls = [
      ...(event.thumbnail_url ? [getImageUrl(event.thumbnail_url, event.updated_at)!] : []),
      ...additionalImages.map(url => getImageUrl(url, event.updated_at)!),
    ];
    setSelectedEvent({
      title: getLocalizedField(event, 'title', language),
      content: getLocalizedField(event, 'content', language) || event.content || event.message || '',
      thumbnailUrl: event.thumbnail_url,
      thumbnailShape: event.thumbnail_shape,
      startDateTime: event.start_date_time,
      endDateTime: event.end_date_time,
      link: event.link,
      guideFile: event.guide_file || null,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    });
    setDetailModalVisible(true);
  };

  const closeDetailModal = () => {
    setDetailModalVisible(false);
    setSelectedEvent(null);
  };

  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return null;
    const date = new Date(dateTime);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const truncate = (text: string | null, max: number = 100) => {
    if (!text) return '';
    const stripped = stripFormattingTags(text);
    if (stripped.length <= max) return stripped;
    const cut = stripped.substring(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 60 ? cut.substring(0, lastSpace) : cut) + '...';
  };

  const dateFilteredEvents: UpcomingEvent[] | null = selectedDate !== null
    ? events.filter(event =>
        eventFallsOnDate(event.start_date_time, event.end_date_time, selectedDate)
      )
    : null;

  const eventsByCategory = (cat: 'Event' | 'Entertainment') =>
    events.filter(event => event.category === cat);

  const handleMonthDateSelect = (date: Date | null) => {
    setSelectedDate(date);
    setMonthOverlayVisible(false);
  };

  // Horizontal swipe between Event / Entertainment pages when no date is selected.
  const pagerRef = useRef<FlatList>(null);
  const PAGES = ['Event', 'Entertainment'] as const;

  const handlePagerScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const next = PAGES[idx];
    if (next && next !== eventsTab) {
      setEventsTab(next);
      markEventsTabVisited(next);
    }
  }, [eventsTab, markEventsTabVisited]);

  const goToTab = (tab: 'Event' | 'Entertainment') => {
    const idx = PAGES.indexOf(tab);
    pagerRef.current?.scrollToIndex({ index: idx, animated: true });
    markEventsTabVisited(tab);
  };

  const renderEventCard = (event: UpcomingEvent, index: number) => (
    <TouchableOpacity
      key={event.id || index}
      style={[styles.eventCard, { backgroundColor: colors.card, borderLeftColor: '#4CAF50' }]}
      onPress={() => openDetailModal(event)}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        {event.thumbnail_url && (
          <Image source={getImageUrl(event.thumbnail_url, event.updated_at)!} style={styles.cardImage} contentFit="cover" />
        )}
        <View style={styles.cardContent}>
          <View style={styles.titleRow}>
            <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>
              {getLocalizedField(event, 'title', language)}
            </Text>
            {!viewedEventIds.has(event.id) &&
              (!lastViewedEvents || new Date(event.created_at) > new Date(lastViewedEvents)) && (
                <View style={styles.newPill}>
                  <Text style={styles.newPillText}>NEW</Text>
                </View>
              )}
            {selectedDate !== null && (
              <View style={[styles.categoryBadge, { backgroundColor: colors.primary + '18' }]}>
                <Text style={[styles.categoryBadgeText, { color: colors.primary }]}>
                  {event.category === 'Event'
                    ? t('upcoming_events:events')
                    : t('upcoming_events:entertainment')}
                </Text>
              </View>
            )}
          </View>
          {(event.content || event.message) && (
            <Text style={[styles.eventMessage, { color: colors.textSecondary }]} numberOfLines={2}>
              {truncate(getLocalizedField(event, 'content', language) || event.content || event.message)}
            </Text>
          )}
          {event.start_date_time && (
            <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
              {formatDateTime(event.start_date_time)}
              {event.end_date_time ? ` – ${formatDateTime(event.end_date_time)}` : ''}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = (forTab: 'Event' | 'Entertainment' | 'date') => (
    <View style={styles.emptyContainer}>
      <IconSymbol
        ios_icon_name="calendar"
        android_material_icon_name="event"
        size={64}
        color={colors.textSecondary}
      />
      <Text style={[styles.emptyText, { color: colors.text }]}>
        {forTab === 'date'
          ? t('upcoming_events:no_events_on_date')
          : t('upcoming_events:no_events', { type: forTab.toLowerCase() })}
      </Text>
      {forTab !== 'date' && (
        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
          {t('upcoming_events:check_back', { type: forTab.toLowerCase() })}
        </Text>
      )}
    </View>
  );

  const renderCategoryPage = ({ item }: { item: 'Event' | 'Entertainment' }) => {
    const list = eventsByCategory(item);
    return (
      <ScrollView
        style={{ width: SCREEN_WIDTH }}
        contentContainerStyle={styles.contentContainer}
        nestedScrollEnabled
      >
        {list.length === 0 ? renderEmptyState(item) : list.map((e, i) => renderEventCard(e, i))}
      </ScrollView>
    );
  };

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="chevron-left"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('upcoming_events:title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Week strip with embedded sub-tabs (matches Welcome Events tab styling) */}
      <WeeklyCalendarStrip
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        colors={{
          primary: colors.primary,
          background: colors.background,
          text: colors.text,
          textSecondary: colors.darkSecondaryText,
          card: colors.card,
        }}
        events={events}
        onMonthExpand={() => setMonthOverlayVisible(true)}
      >
        {selectedDate === null && (
          <View style={[styles.subTabsContainer, { backgroundColor: colors.background, marginTop: 8 }]}>
            <TouchableOpacity
              style={[styles.subTab, eventsTab === 'Event' && { backgroundColor: colors.primary }]}
              onPress={() => goToTab('Event')}
              activeOpacity={0.7}
            >
              <View style={styles.subTabLabelRow}>
                <Text style={[styles.subTabText, { color: colors.textSecondary }, eventsTab === 'Event' && { color: '#FFFFFF' }]}>
                  {t('upcoming_events:events')}
                </Text>
                {eventsEventHasNew && eventsTab !== 'Event' && (
                  <View style={styles.subTabBadgeDot} />
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTab, eventsTab === 'Entertainment' && { backgroundColor: colors.primary }]}
              onPress={() => goToTab('Entertainment')}
              activeOpacity={0.7}
            >
              <View style={styles.subTabLabelRow}>
                <Text style={[styles.subTabText, { color: colors.textSecondary }, eventsTab === 'Entertainment' && { color: '#FFFFFF' }]}>
                  {t('upcoming_events:entertainment')}
                </Text>
                {eventsEntertainmentHasNew && eventsTab !== 'Entertainment' && (
                  <View style={styles.subTabBadgeDot} />
                )}
              </View>
            </TouchableOpacity>
          </View>
        )}
      </WeeklyCalendarStrip>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('upcoming_events:loading')}</Text>
        </View>
      ) : selectedDate !== null ? (
        // Date selected: single vertical scroll, all categories on that date.
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {dateFilteredEvents && dateFilteredEvents.length === 0
            ? renderEmptyState('date')
            : dateFilteredEvents?.map((e, i) => renderEventCard(e, i))}
        </ScrollView>
      ) : (
        // No date: horizontal pager between Event and Entertainment categories.
        <FlatList
          ref={pagerRef}
          data={PAGES as unknown as ('Event' | 'Entertainment')[]}
          renderItem={renderCategoryPage}
          keyExtractor={(item) => item}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handlePagerScroll}
          bounces={false}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
        />
      )}

      {/* Month overlay */}
      <Modal
        visible={monthOverlayVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMonthOverlayVisible(false)}
      >
        <TouchableOpacity
          style={styles.monthOverlay}
          activeOpacity={1}
          onPress={() => setMonthOverlayVisible(false)}
        >
          <View style={[styles.monthSheet, { backgroundColor: colors.card }]}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.monthSheetHeader}>
                <Text style={[styles.monthSheetTitle, { color: colors.text }]}>
                  {t('upcoming_events:title')}
                </Text>
                <TouchableOpacity
                  onPress={() => setMonthOverlayVisible(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol
                    ios_icon_name="xmark.circle.fill"
                    android_material_icon_name="cancel"
                    size={22}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              <MonthlyCalendar
                selectedDate={selectedDate}
                onSelectDate={handleMonthDateSelect}
                colors={{
                  primary: colors.primary,
                  background: colors.background,
                  text: colors.text,
                  textSecondary: colors.darkSecondaryText,
                  card: colors.card,
                }}
                events={events}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {selectedEvent && (
        <ContentDetailModal
          visible={detailModalVisible}
          onClose={closeDetailModal}
          title={selectedEvent.title}
          content={selectedEvent.content}
          thumbnailUrl={selectedEvent.thumbnailUrl}
          thumbnailShape={selectedEvent.thumbnailShape}
          startDateTime={selectedEvent.startDateTime}
          endDateTime={selectedEvent.endDateTime}
          link={selectedEvent.link}
          guideFile={selectedEvent.guideFile}
          imageUrls={selectedEvent.imageUrls}
          colors={{
            text: colors.text,
            textSecondary: colors.textSecondary,
            card: colors.card,
            primary: colors.primary,
          }}
        />
      )}
    </GestureHandlerRootView>
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
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  subTabsContainer: {
    flexDirection: 'row',
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
  subTabText: {
    fontSize: 14,
    fontWeight: '600',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  eventCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  eventTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  eventMessage: {
    fontSize: 13,
    lineHeight: 18,
  },
  eventDate: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  monthOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  monthSheet: {
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.2)',
    elevation: 8,
  },
  monthSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  monthSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
});
