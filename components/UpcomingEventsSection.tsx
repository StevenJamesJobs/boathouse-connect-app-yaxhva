import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import WeeklyCalendarStrip from '@/components/WeeklyCalendarStrip';
import { eventFallsOnDate } from '@/utils/dateUtils';

export interface GuideFile {
  id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_type: string;
}

export interface UpcomingEvent {
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

interface EventColors {
  primary: string;
  background: string;
  text: string;
  textSecondary: string;
  card: string;
  highlight: string;
}

interface UpcomingEventsSectionProps {
  events: UpcomingEvent[];
  loadingEvents: boolean;
  colors: EventColors;
  onEventPress: (event: {
    title: string;
    content: string;
    thumbnailUrl?: string | null;
    thumbnailShape?: string;
    startDateTime?: string | null;
    endDateTime?: string | null;
    link?: string | null;
    guideFile?: GuideFile | null;
  }) => void;
  maxItems?: number;
}

export default function UpcomingEventsSection({
  events,
  loadingEvents,
  colors,
  onEventPress,
  maxItems,
}: UpcomingEventsSectionProps) {
  const { t } = useTranslation();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [eventsTab, setEventsTab] = useState<'Event' | 'Entertainment'>('Event');

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

  const truncateText = (text: string | null, maxLength: number = 125): string => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 100) {
      return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
  };

  const handleEventPress = (event: UpcomingEvent) => {
    onEventPress({
      title: event.title,
      content: event.content || event.message || '',
      thumbnailUrl: event.thumbnail_url,
      thumbnailShape: event.thumbnail_shape,
      startDateTime: event.start_date_time,
      endDateTime: event.end_date_time,
      link: event.link,
      guideFile: event.guide_file || null,
    });
  };

  // Determine which events to display
  let displayEvents: UpcomingEvent[];
  if (selectedDate !== null) {
    // Date-filtered: show all categories for that day
    displayEvents = events.filter(event =>
      eventFallsOnDate(event.start_date_time, event.end_date_time, selectedDate)
    );
  } else {
    // Default: filter by tab category and limit
    displayEvents = events.filter(event => event.category === eventsTab);
    if (maxItems) {
      displayEvents = displayEvents.slice(0, maxItems);
    }
  }

  const renderEventCard = (event: UpcomingEvent, index: number) => (
    <TouchableOpacity
      key={event.id || index}
      style={[styles.eventItem, { borderBottomColor: colors.highlight }]}
      onPress={() => handleEventPress(event)}
      activeOpacity={0.7}
    >
      {event.thumbnail_shape === 'square' && event.thumbnail_url ? (
        <View style={styles.eventSquareLayout}>
          <Image
            source={{ uri: getImageUrl(event.thumbnail_url)! }}
            style={styles.eventSquareImage}
          />
          <View style={styles.eventSquareContent}>
            <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
            {(event.content || event.message) && (
              <Text style={[styles.eventDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                {event.content || event.message}
              </Text>
            )}
            {event.start_date_time && (
              <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                {formatDateTime(event.start_date_time)}
              </Text>
            )}
          </View>
        </View>
      ) : (
        <>
          {event.thumbnail_url && (
            <Image
              source={{ uri: getImageUrl(event.thumbnail_url)! }}
              style={styles.eventBannerImage}
            />
          )}
          <View style={styles.eventContent}>
            <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
            {(event.content || event.message) && (
              <Text style={[styles.eventDescription, { color: colors.textSecondary }]}>
                {truncateText(event.content || event.message, 125)}
              </Text>
            )}
            {event.start_date_time && (
              <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                {formatDateTime(event.start_date_time)}
              </Text>
            )}
          </View>
        </>
      )}
      {/* Show category badge in date-filtered view */}
      {selectedDate !== null && (
        <View style={[styles.categoryBadge, { backgroundColor: colors.primary + '18' }]}>
          <Text style={[styles.categoryBadgeText, { color: colors.primary }]}>
            {event.category === 'Event'
              ? t('upcoming_events.events')
              : t('upcoming_events.entertainment')}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View>
      {/* Weekly Calendar Strip */}
      <WeeklyCalendarStrip
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        colors={colors}
        events={events}
      />

      {/* Tabs (only in default view) */}
      {selectedDate === null && (
        <View style={[styles.tabsContainer, { backgroundColor: colors.background }]}>
          <TouchableOpacity
            style={[styles.tab, eventsTab === 'Event' && [styles.activeTab, { backgroundColor: colors.primary }]]}
            onPress={() => setEventsTab('Event')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, eventsTab === 'Event' && styles.activeTabText]}>
              {t('upcoming_events.events')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, eventsTab === 'Entertainment' && [styles.activeTab, { backgroundColor: colors.primary }]]}
            onPress={() => setEventsTab('Entertainment')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, eventsTab === 'Entertainment' && styles.activeTabText]}>
              {t('upcoming_events.entertainment')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Event list */}
      {loadingEvents ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {t('employee_home.loading')}
          </Text>
        </View>
      ) : displayEvents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {selectedDate !== null
              ? t('upcoming_events.no_events_on_date')
              : t('employee_home.no_events')}
          </Text>
        </View>
      ) : (
        <>
          {displayEvents.map((event, index) => renderEventCard(event, index))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    // backgroundColor applied dynamically via colors.primary
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    marginTop: 8,
  },
  emptyContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  eventItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  eventSquareLayout: {
    flexDirection: 'row',
    gap: 12,
  },
  eventSquareImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  eventSquareContent: {
    flex: 1,
  },
  eventBannerImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    resizeMode: 'cover',
    marginBottom: 8,
  },
  eventContent: {
    marginTop: 8,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  eventDescription: {
    fontSize: 14,
    marginBottom: 4,
    lineHeight: 20,
  },
  eventTime: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 6,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
