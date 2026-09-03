
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { StorageExpoImage } from '@/components/StorageImage';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import ContentDetailModal from '@/components/ContentDetailModal';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import MonthlyCalendar from '@/components/MonthlyCalendar';
import WeeklyCalendarStrip from '@/components/WeeklyCalendarStrip';
import { eventFallsOnDate } from '@/utils/dateUtils';
import { getLocalizedField } from '@/utils/translateContent';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchContentImagesBatch } from '@/utils/contentImages';
import { fetchContentAttachmentsBatch, sweepExpiredContent, type ContentAttachment } from '@/utils/contentAttachments';
import { isManagerOrOwner } from '@/utils/roles';
import { getImageUrl } from '@/utils/imageUrl';
import { stripFormattingTags } from '@/components/FormattedText';
import { useUnreadContent } from '@/hooks/useUnreadContent';
import { useAuth } from '@/contexts/AuthContext';
import { fonts } from '@/constants/fonts';
import ContentBannerCard, { formatBannerWhen } from '@/components/content/ContentBannerCard';
import { categoryHue } from '@/components/content/contentVisuals';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';

// Status red for the NEW pill + unread dots. A status flag is the one place the
// glass language keeps saturation (no palette carries a danger/alert token).
const STATUS_RED = '#EF4444';
const STATUS_RED_TEXT = '#FFFFFF';

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

type EventsTab = 'Event' | 'Entertainment';

/** A one-time attachment renders through the modal's existing guideFile View/Download pair. */
const guideFileFromAttachment = (attachment: ContentAttachment | undefined): GuideFile | null =>
  attachment
    ? {
        id: 'attachment',
        title: attachment.file_name,
        file_url: attachment.file_url,
        file_name: attachment.file_name,
        file_type: attachment.file_type ?? 'application/octet-stream',
      }
    : null;

export default function ViewAllUpcomingEventsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { user } = useAuth();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsTab, setEventsTab] = useState<EventsTab>('Event');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [contentImagesMap, setContentImagesMap] = useState<Map<string, string[]>>(new Map());
  const [attachmentsMap, setAttachmentsMap] = useState<Map<string, ContentAttachment>>(new Map());
  const [monthOverlayVisible, setMonthOverlayVisible] = useState(false);
  const [visibleWeek, setVisibleWeek] = useState<{ start: Date; end: Date } | null>(null);

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
    category?: string | null;
    kind?: 'upcoming_event';
  } | null>(null);

  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  }, [user?.id]);

  const loadEvents = async () => {
    // Logout race: an empty actor would reach the uuid RPC params as '' (22P02).
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      // s80: the expiry sweep replaces delete_expired_upcoming_events — it also
      // hands back the retired files, which only a manager/owner may broker-delete.
      await sweepExpiredContent(user.id, isManagerOrOwner(user));

      // Member-gated RPC: org derived server-side; guide_file jsonb matches the
      // retired PostgREST embed shape.
      const { data, error } = await supabase.rpc('get_upcoming_events', {
        p_actor_id: user.id,
      });

      if (error) throw error;

      setEvents((data || []) as UpcomingEvent[]);

      if (data && data.length > 0) {
        const ids = data.map((e) => e.id);
        const [imagesMap, attachments] = await Promise.all([
          fetchContentImagesBatch(user.id, 'upcoming_event', ids),
          fetchContentAttachmentsBatch(user.id, 'upcoming_event', ids),
        ]);
        setContentImagesMap(imagesMap);
        setAttachmentsMap(attachments);
      } else {
        setContentImagesMap(new Map());
        setAttachmentsMap(new Map());
      }
    } catch (error) {
      console.error('Error loading upcoming events:', error);
    } finally {
      setLoading(false);
    }
  };

  const isDark = useIsDarkTheme();

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
      guideFile: event.guide_file || guideFileFromAttachment(attachmentsMap.get(event.id)),
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      category: event.category,
      kind: 'upcoming_event',
    });
    setDetailModalVisible(true);
  };

  const closeDetailModal = () => {
    setDetailModalVisible(false);
    setSelectedEvent(null);
  };

  const dateLocale = language === 'es' ? 'es' : 'en-US';
  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return null;
    const date = new Date(dateTime);
    return date.toLocaleString(dateLocale, {
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

  // Search — title/content in the reader's language, case-insensitive. Applies
  // to the active tab's list AND the selected-day list.
  const query = search.trim().toLowerCase();
  const matchesSearch = (event: UpcomingEvent): boolean => {
    if (!query) return true;
    const title = getLocalizedField(event, 'title', language) || event.title || '';
    const body = stripFormattingTags(
      getLocalizedField(event, 'content', language) || event.content || event.message || ''
    );
    return title.toLowerCase().includes(query) || body.toLowerCase().includes(query);
  };

  const dateFilteredEvents: UpcomingEvent[] | null = selectedDate !== null
    ? events.filter(event =>
        eventFallsOnDate(event.start_date_time, event.end_date_time, selectedDate) && matchesSearch(event)
      )
    : null;

  const eventsByCategory = (cat: EventsTab) =>
    events.filter(event => event.category === cat && matchesSearch(event));

  // Header eyebrow: how many events land in the week the strip is showing.
  const weekCount = useMemo(() => {
    if (!visibleWeek) return 0;
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(visibleWeek.start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return events.filter(e => days.some(day => eventFallsOnDate(e.start_date_time, e.end_date_time, day))).length;
  }, [events, visibleWeek]);

  const handleWeekChange = useCallback((start: Date, end: Date) => {
    setVisibleWeek({ start, end });
  }, []);

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

  const goToTab = (tab: EventsTab) => {
    const idx = PAGES.indexOf(tab);
    pagerRef.current?.scrollToIndex({ index: idx, animated: true });
    markEventsTabVisited(tab);
  };

  const renderEventCard = (event: UpcomingEvent, index: number) => {
    const eventIsNew =
      !viewedEventIds.has(event.id) &&
      (!lastViewedEvents || new Date(event.created_at) > new Date(lastViewedEvents));
    const categoryLabel = event.category === 'Event' ? t('upcoming_events:events') : t('upcoming_events:entertainment');

    // Banner posts wear ContentBannerCard (s81 — the Welcome tab's card, same
    // component). The category badge shows only on the date-filtered list,
    // mirroring the row card below.
    if (event.thumbnail_shape === 'banner' && event.thumbnail_url) {
      return (
        <ContentBannerCard
          key={event.id || index}
          imageUrl={getImageUrl(event.thumbnail_url, event.updated_at)!}
          title={getLocalizedField(event, 'title', language)}
          description={truncate(getLocalizedField(event, 'content', language) || event.content || event.message)}
          eyebrow={formatBannerWhen(event.start_date_time, language)}
          badge={selectedDate !== null ? { label: categoryLabel, color: categoryHue(event.category, isDark) } : null}
          newLabel={eventIsNew ? t('content_editor.new_badge') : null}
          onPress={() => openDetailModal(event)}
        />
      );
    }

    return (
    <TouchableOpacity
      key={event.id || index}
      style={styles.eventCard}
      onPress={() => openDetailModal(event)}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        {event.thumbnail_url && (
          <StorageExpoImage source={getImageUrl(event.thumbnail_url, event.updated_at)!} style={styles.cardImage} contentFit="cover" />
        )}
        <View style={styles.cardContent}>
          <View style={styles.titleRow}>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {getLocalizedField(event, 'title', language)}
            </Text>
            {eventIsNew && (
              <View style={styles.newPill}>
                <Text style={styles.newPillText}>{t('content_editor.new_badge')}</Text>
              </View>
            )}
            {selectedDate !== null && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>
                  {event.category === 'Event'
                    ? t('upcoming_events:events')
                    : t('upcoming_events:entertainment')}
                </Text>
              </View>
            )}
          </View>
          {(event.content || event.message) && (
            <Text style={styles.eventMessage} numberOfLines={2}>
              {truncate(getLocalizedField(event, 'content', language) || event.content || event.message)}
            </Text>
          )}
          {event.start_date_time && (
            <Text style={styles.eventDate}>
              {formatDateTime(event.start_date_time)}
              {event.end_date_time ? ` – ${formatDateTime(event.end_date_time)}` : ''}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
    );
  };

  const renderEmptyState = (forTab: EventsTab | 'date') => (
    <View style={styles.emptyContainer}>
      <IconSymbol
        ios_icon_name="calendar"
        android_material_icon_name="event"
        size={64}
        color={colors.textSecondary}
      />
      <Text style={styles.emptyText}>
        {forTab === 'date'
          ? t('upcoming_events:no_events_on_date')
          : forTab === 'Event'
            ? t('upcoming_events:no_events_event')
            : t('upcoming_events:no_events_entertainment')}
      </Text>
      {forTab !== 'date' && (
        <Text style={styles.emptySubtext}>
          {forTab === 'Event'
            ? t('upcoming_events:check_back_event')
            : t('upcoming_events:check_back_entertainment')}
        </Text>
      )}
    </View>
  );

  const renderCategoryPage = ({ item }: { item: EventsTab }) => {
    const list = eventsByCategory(item);
    return (
      <ScrollView
        style={{ width: SCREEN_WIDTH }}
        contentContainerStyle={styles.contentContainer}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {list.length === 0 ? renderEmptyState(item) : list.map((e, i) => renderEventCard(e, i))}
      </ScrollView>
    );
  };

  const renderSegment = (tab: EventsTab, label: string, hasNew: boolean) => {
    const active = eventsTab === tab;
    return (
      <TouchableOpacity
        style={[styles.segment, active && styles.segmentActive]}
        onPress={() => goToTab(tab)}
        activeOpacity={0.7}
      >
        <View style={styles.segmentLabelRow}>
          <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
          {hasNew && !active && <View style={styles.segmentBadgeDot} />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('upcoming_events:title')}
        eyebrow={t('upcoming_events:eyebrow_this_week', { count: weekCount })}
        onBack={() => router.back()}
      />

      {/* ONE section card: week strip → search → Events | Entertainment capsule.
          The strip renders its children inside its own box, so the search field
          and the capsule ride as its children to stay inside this card. */}
      <GlassCard variant="surface" radius={17} style={styles.sectionCard}>
        <WeeklyCalendarStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          colors={{
            primary: colors.primary,
            fireText: colors.fireText,
            background: colors.background,
            text: colors.text,
            textSecondary: colors.darkSecondaryText,
            // Transparent: the GlassCard around it is the surface.
            card: 'transparent',
          }}
          events={events}
          onMonthExpand={() => setMonthOverlayVisible(true)}
          onWeekChange={handleWeekChange}
          edgeToEdge
        >
          <View style={styles.stripChildren}>
          <View style={styles.searchField}>
            <View style={styles.searchIconSlot}>
              <IconSymbol
                ios_icon_name="magnifyingglass"
                android_material_icon_name="search"
                size={20}
                color={colors.textSecondary}
              />
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder={t('upcoming_events:search_placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>

          {selectedDate === null && (
            <View style={styles.segmentCapsule}>
              {renderSegment('Event', t('upcoming_events:events'), eventsEventHasNew)}
              {renderSegment('Entertainment', t('upcoming_events:entertainment'), eventsEntertainmentHasNew)}
            </View>
          )}
          </View>
        </WeeklyCalendarStrip>
      </GlassCard>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t('upcoming_events:loading')}</Text>
        </View>
      ) : selectedDate !== null ? (
        // Date selected: single vertical scroll, all categories on that date.
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {dateFilteredEvents && dateFilteredEvents.length === 0
            ? renderEmptyState('date')
            : dateFilteredEvents?.map((e, i) => renderEventCard(e, i))}
        </ScrollView>
      ) : (
        // No date: horizontal pager between Event and Entertainment categories.
        <FlatList
          ref={pagerRef}
          data={PAGES as unknown as EventsTab[]}
          renderItem={renderCategoryPage}
          keyExtractor={(item) => item}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handlePagerScroll}
          bounces={false}
          keyboardShouldPersistTaps="handled"
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
          <View style={styles.monthSheet}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.monthSheetHeader}>
                <Text style={styles.monthSheetTitle}>
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
                  fireText: colors.fireText,
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
          category={selectedEvent.category}
          kind={selectedEvent.kind}
          colors={{
            text: colors.text,
            textSecondary: colors.textSecondary,
            card: colors.card,
            primary: colors.primary,
            fireText: colors.fireText,
          }}
        />
      )}
    </GestureHandlerRootView>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    // No horizontal padding around the strip: WeeklyCalendarStrip carries its
    // own 8pt, so the seven day tiles land at exactly the Welcome tab's width
    // (16 margin + 8 inner on both screens — s81 "one geometry" carry). The
    // search field + capsule restore the 12pt inset via `stripChildren`.
    sectionCard: {
      marginHorizontal: 16,
      marginBottom: 4,
      paddingVertical: 12,
      paddingHorizontal: 0,
    },
    stripChildren: {
      paddingHorizontal: 12,
    },
    // MenuSearchRow geometry: 46pt, r13, glass fill + glassBorder hairline+0.5.
    searchField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 46,
      borderRadius: 13,
      paddingHorizontal: 13,
      marginTop: 10,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    searchIconSlot: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.body.regular,
      fontSize: 15,
      color: colors.text,
      padding: 0,
    },
    // Events | Entertainment segmented capsule.
    segmentCapsule: {
      flexDirection: 'row',
      marginTop: 10,
      borderRadius: 12,
      padding: 3,
      gap: 3,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    segment: {
      flex: 1,
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentActive: {
      backgroundColor: colors.primary,
    },
    segmentLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    segmentText: {
      fontFamily: fonts.body.semibold,
      fontSize: 13.5,
      color: colors.textSecondary,
    },
    segmentTextActive: {
      color: colors.fireText,
    },
    segmentBadgeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: STATUS_RED,
    },
    newPill: {
      backgroundColor: STATUS_RED,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    newPillText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9,
      color: STATUS_RED_TEXT,
      letterSpacing: 0.5,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      fontFamily: fonts.body.regular,
      fontSize: 14,
      marginTop: 12,
      color: colors.textSecondary,
    },
    scrollView: {
      flex: 1,
    },
    contentContainer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      paddingBottom: 40,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyText: {
      fontFamily: fonts.display.semibold,
      fontSize: 18,
      marginTop: 16,
      color: colors.text,
    },
    emptySubtext: {
      fontFamily: fonts.body.regular,
      fontSize: 14,
      marginTop: 8,
      textAlign: 'center',
      color: colors.textSecondary,
    },
    // Glass card grammar: surface fill, surfaceBorder hairline+0.5, r16, p11.
    eventCard: {
      borderRadius: 16,
      padding: 11,
      marginBottom: 11,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      backgroundColor: colors.surface,
      borderColor: colors.surfaceBorder,
    },
    cardRow: {
      flexDirection: 'row',
      gap: 12,
    },
    cardImage: {
      width: 80,
      height: 80,
      borderRadius: 10,
      backgroundColor: colors.thumbPlaceholder,
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
      fontFamily: fonts.display.semibold,
      fontSize: 14.5,
      color: colors.text,
    },
    eventMessage: {
      fontFamily: fonts.body.regular,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
    },
    eventDate: {
      fontFamily: fonts.mono.medium,
      fontSize: 9.5,
      letterSpacing: 0.3,
      marginTop: 5,
      color: colors.primary,
    },
    categoryBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: colors.primary + '18',
    },
    categoryBadgeText: {
      fontFamily: fonts.mono.medium,
      fontSize: 9,
      letterSpacing: 0.4,
      color: colors.primary,
    },
    monthOverlay: {
      flex: 1,
      // Theme-derived scrim (background at ~65%) rather than a fixed black.
      backgroundColor: colors.background + 'A6',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    monthSheet: {
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
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
      borderBottomColor: colors.hairline,
    },
    monthSheetTitle: {
      fontFamily: fonts.display.bold,
      fontSize: 16,
      color: colors.text,
    },
  });
