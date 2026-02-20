
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import ContentDetailModal from '@/components/ContentDetailModal';
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import MonthlyCalendar from '@/components/MonthlyCalendar';
import { eventFallsOnDate } from '@/utils/dateUtils';

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
  content: string;
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
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsTab, setEventsTab] = useState<'Event' | 'Entertainment'>('Event');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Detail modal state
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
  } | null>(null);

  const colors = useThemeColors();

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      console.log('Loading all upcoming events...');

      const { data, error } = await supabase
        .from('upcoming_events')
        .select(`
          *,
          guide_file:guides_and_training!upcoming_events_guide_file_id_fkey(
            id,
            title,
            file_url,
            file_name,
            file_type
          )
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading upcoming events:', error);
        throw error;
      }

      console.log('Upcoming events loaded:', data?.length || 0, 'items');
      setEvents(data || []);
    } catch (error) {
      console.error('Error loading upcoming events:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetailModal = (event: UpcomingEvent) => {
    setSelectedEvent({
      title: event.title,
      content: event.content || event.message || '',
      thumbnailUrl: event.thumbnail_url,
      thumbnailShape: event.thumbnail_shape,
      startDateTime: event.start_date_time,
      endDateTime: event.end_date_time,
      link: event.link,
      guideFile: event.guide_file || null,
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
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleBackPress = () => {
    router.back();
  };

  // Filter events based on date selection or category tab
  let filteredEvents: UpcomingEvent[];
  if (selectedDate !== null) {
    filteredEvents = events.filter(event =>
      eventFallsOnDate(event.start_date_time, event.end_date_time, selectedDate)
    );
  } else {
    filteredEvents = events.filter(event => event.category === eventsTab);
  }

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
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

      {/* Monthly Calendar */}
      <MonthlyCalendar
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
                style={[styles.eventCard, { backgroundColor: colors.card }]}
                onPress={() => openDetailModal(event)}
                activeOpacity={0.7}
              >
                {event.thumbnail_shape === 'square' && event.thumbnail_url ? (
                  <View style={styles.squareLayout}>
                    <Image
                      source={{ uri: getImageUrl(event.thumbnail_url)! }}
                      style={styles.squareImage}
                    />
                    <View style={styles.squareContent}>
                      <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                      {(event.content || event.message) && (
                        <Text style={[styles.eventMessage, { color: colors.textSecondary }]} numberOfLines={2}>
                          {event.content || event.message}
                        </Text>
                      )}
                      {event.start_date_time && (
                        <View style={styles.eventMeta}>
                          <View style={styles.metaItem}>
                            <IconSymbol
                              ios_icon_name="calendar"
                              android_material_icon_name="event"
                              size={14}
                              color={colors.textSecondary}
                            />
                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                              {formatDateTime(event.start_date_time)}
                            </Text>
                          </View>
                          {event.end_date_time && (
                            <View style={styles.metaItem}>
                              <IconSymbol
                                ios_icon_name="clock"
                                android_material_icon_name="schedule"
                                size={14}
                                color={colors.textSecondary}
                              />
                              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                {t('upcoming_events:ends', { datetime: formatDateTime(event.end_date_time) })}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                      {(event.link || event.guide_file) && (
                        <View style={styles.actionIndicator}>
                          <IconSymbol
                            ios_icon_name="chevron.right"
                            android_material_icon_name="chevron-right"
                            size={16}
                            color={colors.primary}
                          />
                          <Text style={[styles.actionText, { color: colors.primary }]}>
                            {t('upcoming_events:tap_for_details')}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ) : (
                  <>
                    {event.thumbnail_url && (
                      <Image
                        source={{ uri: getImageUrl(event.thumbnail_url)! }}
                        style={styles.bannerImage}
                      />
                    )}
                    <View style={styles.eventContent}>
                      <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                      {(event.content || event.message) && (
                        <Text style={[styles.eventMessage, { color: colors.textSecondary }]}>
                          {event.content || event.message}
                        </Text>
                      )}
                      {event.start_date_time && (
                        <View style={styles.eventMeta}>
                          <View style={styles.metaItem}>
                            <IconSymbol
                              ios_icon_name="calendar"
                              android_material_icon_name="event"
                              size={14}
                              color={colors.textSecondary}
                            />
                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                              {formatDateTime(event.start_date_time)}
                            </Text>
                          </View>
                          {event.end_date_time && (
                            <View style={styles.metaItem}>
                              <IconSymbol
                                ios_icon_name="clock"
                                android_material_icon_name="schedule"
                                size={14}
                                color={colors.textSecondary}
                              />
                              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                {t('upcoming_events:ends', { datetime: formatDateTime(event.end_date_time) })}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                      {(event.link || event.guide_file) && (
                        <View style={styles.actionIndicator}>
                          <IconSymbol
                            ios_icon_name="chevron.right"
                            android_material_icon_name="chevron-right"
                            size={16}
                            color={colors.primary}
                          />
                          <Text style={[styles.actionText, { color: colors.primary }]}>
                            {t('upcoming_events:tap_for_details')}
                          </Text>
                        </View>
                      )}
                    </View>
                  </>
                )}
                {/* Category badge in date-filtered view */}
                {selectedDate !== null && (
                  <View style={[styles.categoryBadge, { backgroundColor: colors.primary + '18' }]}>
                    <Text style={[styles.categoryBadgeText, { color: colors.primary }]}>
                      {event.category === 'Event'
                        ? t('upcoming_events:events')
                        : t('upcoming_events:entertainment')}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

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
    paddingVertical: 16,
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
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.2)',
    elevation: 3,
  },
  squareLayout: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  squareImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  squareContent: {
    flex: 1,
  },
  bannerImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  eventContent: {
    padding: 16,
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  eventMessage: {
    fontSize: 15,
    marginBottom: 12,
    lineHeight: 22,
  },
  eventMeta: {
    gap: 8,
    marginTop: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
  },
  actionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 16,
    marginBottom: 12,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
