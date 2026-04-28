
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
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
import { fetchContentImagesBatch } from '@/utils/contentImages';
import { stripFormattingTags } from '@/components/FormattedText';

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
  link: string | null;
  guide_file_id: string | null;
  guide_file?: GuideFile | null;
  category: string;
}

export default function ViewAllUpcomingEventsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language } = useLanguage();
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

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      try { await supabase.rpc('delete_expired_upcoming_events' as any); } catch {}

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
    const additionalImages = contentImagesMap.get(event.id) || [];
    const imageUrls = [
      ...(event.thumbnail_url ? [event.thumbnail_url] : []),
      ...additionalImages,
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

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
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

  let filteredEvents: UpcomingEvent[];
  if (selectedDate !== null) {
    filteredEvents = events.filter(event =>
      eventFallsOnDate(event.start_date_time, event.end_date_time, selectedDate)
    );
  } else {
    filteredEvents = events.filter(event => event.category === eventsTab);
  }

  const handleMonthDateSelect = (date: Date | null) => {
    setSelectedDate(date);
    setMonthOverlayVisible(false);
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
        <TouchableOpacity
          onPress={() => setMonthOverlayVisible(true)}
          style={styles.monthButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol
            ios_icon_name="calendar"
            android_material_icon_name="calendar-month"
            size={22}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Week strip */}
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
      />

      {/* Tabs (only when no date selected) */}
      {selectedDate === null && (
        <View style={[styles.tabsContainer, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.tab, eventsTab === 'Event' && [styles.activeTab, { backgroundColor: colors.primary }]]}
            onPress={() => setEventsTab('Event')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, eventsTab === 'Event' && styles.activeTabText]}>
              {t('upcoming_events:events')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, eventsTab === 'Entertainment' && [styles.activeTab, { backgroundColor: colors.primary }]]}
            onPress={() => setEventsTab('Entertainment')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, eventsTab === 'Entertainment' && styles.activeTabText]}>
              {t('upcoming_events:entertainment')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('upcoming_events:loading')}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {filteredEvents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="calendar"
                android_material_icon_name="event"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                {selectedDate !== null
                  ? t('upcoming_events:no_events_on_date')
                  : t('upcoming_events:no_events', { type: eventsTab.toLowerCase() })}
              </Text>
              {selectedDate === null && (
                <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                  {t('upcoming_events:check_back', { type: eventsTab.toLowerCase() })}
                </Text>
              )}
            </View>
          ) : (
            filteredEvents.map((event, index) => (
              <TouchableOpacity
                key={event.id || index}
                style={[styles.eventCard, { backgroundColor: colors.card, borderLeftColor: '#4CAF50' }]}
                onPress={() => openDetailModal(event)}
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
                    <View style={styles.titleRow}>
                      <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>
                        {getLocalizedField(event, 'title', language)}
                      </Text>
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
            ))
          )}
        </ScrollView>
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
  monthButton: {
    padding: 8,
    marginRight: -8,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.2)',
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFFFF',
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
    resizeMode: 'cover',
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
