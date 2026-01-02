
import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import CollapsibleSection from '@/components/CollapsibleSection';
import WeatherWidget from '@/components/WeatherWidget';
import WeatherDetailModal from '@/components/WeatherDetailModal';
import ContentDetailModal from '@/components/ContentDetailModal';
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { MessageBadge } from '@/components/MessageBadge';

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
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
  content: string;
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
}

interface SpecialFeature {
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
}

export default function EmployeePortalScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { unreadCount } = useUnreadMessages();
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
  
  // Weather detail modal state
  const [weatherDetailVisible, setWeatherDetailVisible] = useState(false);
  
  // Detail modal state
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{
    title: string;
    content: string;
    thumbnailUrl?: string | null;
    thumbnailShape?: string;
    startDateTime?: string | null;
    endDateTime?: string | null;
    priority?: string;
    link?: string | null;
    guideFile?: GuideFile | null;
  } | null>(null);

  const headerColor = '#B8D4E0';

  useEffect(() => {
    loadWeeklySpecials();
    loadAnnouncements();
    loadUpcomingEvents();
    loadSpecialFeatures();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      console.log('Employee portal screen focused, refreshing data...');
      loadWeeklySpecials();
      loadAnnouncements();
      loadUpcomingEvents();
      loadSpecialFeatures();
    }, [])
  );

  const loadWeeklySpecials = async () => {
    try {
      setLoadingSpecials(true);
      console.log('Loading weekly specials for employee portal...');
      
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('category', 'Weekly Specials')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error loading weekly specials:', error);
        throw error;
      }
      
      console.log('Weekly specials loaded:', data?.length || 0, 'items');
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
      console.log('Loading announcements for employee portal...');
      
      const { data, error } = await supabase
        .from('announcements')
        .select(`
          *,
          guide_file:guides_and_training!announcements_guide_file_id_fkey(
            id,
            title,
            file_url,
            file_name,
            file_type
          )
        `)
        .eq('is_active', true)
        .in('visibility', ['everyone', 'employees'])
        .order('display_order', { ascending: true })
        .limit(10);

      if (error) {
        console.error('Error loading announcements:', error);
        throw error;
      }
      
      console.log('Announcements loaded for employee:', data?.length || 0, 'items');
      setAnnouncements(data || []);
    } catch (error) {
      console.error('Error loading announcements:', error);
    } finally {
      setLoadingAnnouncements(false);
    }
  };

  const loadUpcomingEvents = async () => {
    try {
      setLoadingEvents(true);
      console.log('Loading upcoming events for employee portal...');
      
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
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) {
        console.error('Error loading upcoming events:', error);
        throw error;
      }
      
      console.log('Upcoming events loaded for employee:', data?.length || 0, 'items');
      setUpcomingEvents(data || []);
    } catch (error) {
      console.error('Error loading upcoming events:', error);
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadSpecialFeatures = async () => {
    try {
      setLoadingFeatures(true);
      console.log('Loading special features for employee portal...');
      
      const { data, error } = await supabase
        .from('special_features')
        .select(`
          *,
          guide_file:guides_and_training!special_features_guide_file_id_fkey(
            id,
            title,
            file_url,
            file_name,
            file_type
          )
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) {
        console.error('Error loading special features:', error);
        throw error;
      }
      
      console.log('Special features loaded for employee:', data?.length || 0, 'items');
      setSpecialFeatures(data || []);
    } catch (error) {
      console.error('Error loading special features:', error);
    } finally {
      setLoadingFeatures(false);
    }
  };

  const openImageModal = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setImageModalVisible(true);
  };

  const closeImageModal = () => {
    setImageModalVisible(false);
    setSelectedImage(null);
  };

  const handleSwipeGesture = (event: any) => {
    const { translationY } = event.nativeEvent;
    if (translationY > 100) {
      closeImageModal();
    }
  };

  const openDetailModal = (item: {
    title: string;
    content: string;
    thumbnailUrl?: string | null;
    thumbnailShape?: string;
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

  const openWeatherDetail = () => {
    setWeatherDetailVisible(true);
  };

  const closeWeatherDetail = () => {
    setWeatherDetailVisible(false);
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  };

  const formatPrice = (price: string) => {
    if (price.includes('$')) {
      return price;
    }
    return `$${price}`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return '#E74C3C';
      case 'medium':
        return '#F39C12';
      case 'low':
        return '#3498DB';
      default:
        return employeeColors.textSecondary;
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
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

  // Helper function to truncate text to 100-125 characters
  const truncateText = (text: string | null, maxLength: number = 125): string => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    
    // Find the last space before maxLength to avoid cutting words
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > 100) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <View style={styles.welcomeSection}>
          <View style={styles.welcomeTextContainer}>
            <Text style={styles.welcomeTitle}>Welcome, {user?.name}!</Text>
            <Text style={styles.jobTitle}>{user?.jobTitle}</Text>
            <Text style={styles.tagline}>Let&apos;s see what we have going on today!</Text>
          </View>
          
          <TouchableOpacity
            style={styles.messageButton}
            onPress={() => router.push('/messages')}
            activeOpacity={0.7}
          >
            <View style={styles.messageButtonContent}>
              <View style={styles.messageIconWrapper}>
                <IconSymbol
                  ios_icon_name="envelope.fill"
                  android_material_icon_name="mail"
                  size={24}
                  color="#FFFFFF"
                />
                {unreadCount > 0 && (
                  <View style={styles.messageBadgePosition}>
                    <MessageBadge count={unreadCount} size="small" />
                  </View>
                )}
              </View>
              <View style={styles.messageTextContainer}>
                <Text style={styles.messageButtonLabel}>Messages</Text>
                <Text style={styles.messageButtonCount}>
                  {unreadCount > 0 ? `${unreadCount} unread` : 'No new messages'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <CollapsibleSection
          title="Weather"
          iconIos="cloud.sun.fill"
          iconAndroid="wb-cloudy"
          iconColor={employeeColors.primary}
          headerBackgroundColor={headerColor}
          headerTextColor={employeeColors.text}
          defaultExpanded={true}
        >
          <WeatherWidget
            textColor={employeeColors.text}
            secondaryTextColor={employeeColors.textSecondary}
            onPress={openWeatherDetail}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Announcements"
          iconIos="megaphone.fill"
          iconAndroid="campaign"
          iconColor={employeeColors.primary}
          headerBackgroundColor={headerColor}
          headerTextColor={employeeColors.text}
          defaultExpanded={true}
        >
          {loadingAnnouncements ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={employeeColors.primary} />
              <Text style={styles.loadingText}>Loading announcements...</Text>
            </View>
          ) : announcements.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No announcements available</Text>
            </View>
          ) : (
            <>
              {announcements.map((announcement, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.announcementItem}
                  onPress={() => openDetailModal({
                    title: announcement.title,
                    content: announcement.content || announcement.message || '',
                    thumbnailUrl: announcement.thumbnail_url,
                    thumbnailShape: announcement.thumbnail_shape,
                    priority: announcement.priority,
                    link: announcement.link,
                    guideFile: announcement.guide_file || null,
                  })}
                  activeOpacity={0.7}
                >
                  {announcement.thumbnail_shape === 'square' && announcement.thumbnail_url ? (
                    <View style={styles.announcementSquareLayout}>
                      <Image
                        source={{ uri: getImageUrl(announcement.thumbnail_url) }}
                        style={styles.announcementSquareImage}
                      />
                      <View style={styles.announcementSquareContent}>
                        <View style={styles.announcementHeader}>
                          <Text style={styles.announcementTitle}>{announcement.title}</Text>
                          <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(announcement.priority) }]}>
                            <Text style={styles.priorityText}>{announcement.priority.toUpperCase()}</Text>
                          </View>
                        </View>
                        <Text style={styles.announcementText} numberOfLines={2}>
                          {announcement.content || announcement.message}
                        </Text>
                        <Text style={styles.announcementDate}>{getTimeAgo(announcement.created_at)}</Text>
                      </View>
                    </View>
                  ) : (
                    <>
                      {announcement.thumbnail_url && (
                        <Image
                          source={{ uri: getImageUrl(announcement.thumbnail_url) }}
                          style={styles.announcementBannerImage}
                        />
                      )}
                      <View style={styles.announcementHeader}>
                        <Text style={styles.announcementTitle}>{announcement.title}</Text>
                        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(announcement.priority) }]}>
                          <Text style={styles.priorityText}>{announcement.priority.toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={styles.announcementText}>
                        {truncateText(announcement.content || announcement.message, 125)}
                      </Text>
                      <Text style={styles.announcementDate}>{getTimeAgo(announcement.created_at)}</Text>
                    </>
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Upcoming Events"
          iconIos="calendar"
          iconAndroid="event"
          iconColor={employeeColors.primary}
          headerBackgroundColor={headerColor}
          headerTextColor={employeeColors.text}
          defaultExpanded={true}
          onViewAll={() => router.push('/view-all-upcoming-events')}
        >
          {loadingEvents ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={employeeColors.primary} />
              <Text style={styles.loadingText}>Loading events...</Text>
            </View>
          ) : upcomingEvents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No upcoming events</Text>
            </View>
          ) : (
            <>
              {upcomingEvents.map((event, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.eventItem}
                  onPress={() => openDetailModal({
                    title: event.title,
                    content: event.content || event.message || '',
                    thumbnailUrl: event.thumbnail_url,
                    thumbnailShape: event.thumbnail_shape,
                    startDateTime: event.start_date_time,
                    endDateTime: event.end_date_time,
                    link: event.link,
                    guideFile: event.guide_file || null,
                  })}
                  activeOpacity={0.7}
                >
                  {event.thumbnail_shape === 'square' && event.thumbnail_url ? (
                    <View style={styles.eventSquareLayout}>
                      <Image
                        source={{ uri: getImageUrl(event.thumbnail_url) }}
                        style={styles.eventSquareImage}
                      />
                      <View style={styles.eventSquareContent}>
                        <Text style={styles.eventTitle}>{event.title}</Text>
                        {(event.content || event.message) && (
                          <Text style={styles.eventDescription} numberOfLines={2}>
                            {event.content || event.message}
                          </Text>
                        )}
                        {event.start_date_time && (
                          <Text style={styles.eventTime}>{formatDateTime(event.start_date_time)}</Text>
                        )}
                      </View>
                    </View>
                  ) : (
                    <>
                      {event.thumbnail_url && (
                        <Image
                          source={{ uri: getImageUrl(event.thumbnail_url) }}
                          style={styles.eventBannerImage}
                        />
                      )}
                      <View style={styles.eventContent}>
                        <Text style={styles.eventTitle}>{event.title}</Text>
                        {(event.content || event.message) && (
                          <Text style={styles.eventDescription}>
                            {truncateText(event.content || event.message, 125)}
                          </Text>
                        )}
                        {event.start_date_time && (
                          <Text style={styles.eventTime}>{formatDateTime(event.start_date_time)}</Text>
                        )}
                      </View>
                    </>
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Special Features"
          iconIos="star.fill"
          iconAndroid="star"
          iconColor={employeeColors.primary}
          headerBackgroundColor={headerColor}
          headerTextColor={employeeColors.text}
          defaultExpanded={true}
          onViewAll={() => router.push('/view-all-special-features')}
        >
          {loadingFeatures ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={employeeColors.primary} />
              <Text style={styles.loadingText}>Loading features...</Text>
            </View>
          ) : specialFeatures.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No special features</Text>
            </View>
          ) : (
            <>
              {specialFeatures.map((feature, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.featureItem}
                  onPress={() => openDetailModal({
                    title: feature.title,
                    content: feature.content || feature.message || '',
                    thumbnailUrl: feature.thumbnail_url,
                    thumbnailShape: feature.thumbnail_shape,
                    startDateTime: feature.start_date_time,
                    endDateTime: feature.end_date_time,
                    link: feature.link,
                    guideFile: feature.guide_file || null,
                  })}
                  activeOpacity={0.7}
                >
                  {feature.thumbnail_shape === 'square' && feature.thumbnail_url ? (
                    <View style={styles.featureSquareLayout}>
                      <Image
                        source={{ uri: getImageUrl(feature.thumbnail_url) }}
                        style={styles.featureSquareImage}
                      />
                      <View style={styles.featureSquareContent}>
                        <Text style={styles.featureTitle}>{feature.title}</Text>
                        {(feature.content || feature.message) && (
                          <Text style={styles.featureDescription} numberOfLines={2}>
                            {feature.content || feature.message}
                          </Text>
                        )}
                        {feature.start_date_time && (
                          <Text style={styles.featureTime}>{formatDateTime(feature.start_date_time)}</Text>
                        )}
                      </View>
                    </View>
                  ) : (
                    <>
                      {feature.thumbnail_url && (
                        <Image
                          source={{ uri: getImageUrl(feature.thumbnail_url) }}
                          style={styles.featureBannerImage}
                        />
                      )}
                      <View style={styles.featureContent}>
                        <Text style={styles.featureTitle}>{feature.title}</Text>
                        {(feature.content || feature.message) && (
                          <Text style={styles.featureDescription}>
                            {truncateText(feature.content || feature.message, 125)}
                          </Text>
                        )}
                        {feature.start_date_time && (
                          <Text style={styles.featureTime}>{formatDateTime(feature.start_date_time)}</Text>
                        )}
                      </View>
                    </>
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Weekly Specials"
          iconIos="fork.knife"
          iconAndroid="restaurant"
          iconColor={employeeColors.primary}
          headerBackgroundColor={headerColor}
          headerTextColor={employeeColors.text}
          defaultExpanded={true}
        >
          {loadingSpecials ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={employeeColors.primary} />
              <Text style={styles.loadingText}>Loading specials...</Text>
            </View>
          ) : weeklySpecials.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No weekly specials available</Text>
            </View>
          ) : (
            <>
              {weeklySpecials.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.specialCard}
                  onPress={() => openDetailModal({
                    title: item.name,
                    content: `${item.description || ''}\n\nPrice: ${formatPrice(item.price)}${item.is_gluten_free ? '\n• Gluten Free' : ''}${item.is_gluten_free_available ? '\n• Gluten Free Available' : ''}${item.is_vegetarian ? '\n• Vegetarian' : ''}${item.is_vegetarian_available ? '\n• Vegetarian Available' : ''}`,
                    thumbnailUrl: item.thumbnail_url,
                    thumbnailShape: item.thumbnail_shape,
                  })}
                  activeOpacity={0.7}
                >
                  {item.thumbnail_shape === 'square' && item.thumbnail_url ? (
                    <View style={styles.specialSquareLayout}>
                      <Image
                        source={{ uri: getImageUrl(item.thumbnail_url) }}
                        style={styles.specialSquareImage}
                      />
                      <View style={styles.specialSquareContent}>
                        <View style={styles.specialHeader}>
                          <Text style={styles.specialName}>{item.name}</Text>
                          <Text style={styles.specialPrice}>{formatPrice(item.price)}</Text>
                        </View>
                        {(item.is_gluten_free || item.is_gluten_free_available || item.is_vegetarian || item.is_vegetarian_available) && (
                          <View style={styles.specialTags}>
                            {item.is_gluten_free && (
                              <View style={styles.tag}>
                                <Text style={styles.tagText}>GF</Text>
                              </View>
                            )}
                            {item.is_gluten_free_available && (
                              <View style={styles.tag}>
                                <Text style={styles.tagText}>GFA</Text>
                              </View>
                            )}
                            {item.is_vegetarian && (
                              <View style={styles.tag}>
                                <Text style={styles.tagText}>V</Text>
                              </View>
                            )}
                            {item.is_vegetarian_available && (
                              <View style={styles.tag}>
                                <Text style={styles.tagText}>VA</Text>
                              </View>
                            )}
                          </View>
                        )}
                        {item.description && (
                          <Text style={styles.specialDescription} numberOfLines={2}>
                            {item.description}
                          </Text>
                        )}
                      </View>
                    </View>
                  ) : (
                    <>
                      {item.thumbnail_url && (
                        <Image
                          source={{ uri: getImageUrl(item.thumbnail_url) }}
                          style={styles.specialBannerImage}
                        />
                      )}
                      <View style={styles.specialContent}>
                        <View style={styles.specialHeader}>
                          <Text style={styles.specialName}>{item.name}</Text>
                          <Text style={styles.specialPrice}>{formatPrice(item.price)}</Text>
                        </View>
                        {item.description && (
                          <Text style={styles.specialDescription}>
                            {item.description}
                          </Text>
                        )}
                        {(item.is_gluten_free || item.is_gluten_free_available || item.is_vegetarian || item.is_vegetarian_available) && (
                          <View style={styles.specialTags}>
                            {item.is_gluten_free && (
                              <View style={styles.tag}>
                                <Text style={styles.tagText}>GF</Text>
                              </View>
                            )}
                            {item.is_gluten_free_available && (
                              <View style={styles.tag}>
                                <Text style={styles.tagText}>GFA</Text>
                              </View>
                            )}
                            {item.is_vegetarian && (
                              <View style={styles.tag}>
                                <Text style={styles.tagText}>V</Text>
                              </View>
                            )}
                            {item.is_vegetarian_available && (
                              <View style={styles.tag}>
                                <Text style={styles.tagText}>VA</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    </>
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}
        </CollapsibleSection>
      </ScrollView>

      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <PanGestureHandler onGestureEvent={handleSwipeGesture}>
          <View style={styles.imageModalOverlay}>
            <TouchableOpacity
              style={styles.imageModalCloseButton}
              onPress={closeImageModal}
            >
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={36}
                color="#FFFFFF"
              />
            </TouchableOpacity>
            {selectedImage && (
              <Image
                source={{ uri: getImageUrl(selectedImage) }}
                style={styles.fullImage}
                resizeMode="contain"
              />
            )}
            <Text style={styles.swipeHint}>Swipe down to close</Text>
          </View>
        </PanGestureHandler>
      </Modal>

      {selectedItem && (
        <ContentDetailModal
          visible={detailModalVisible}
          onClose={closeDetailModal}
          title={selectedItem.title}
          content={selectedItem.content}
          thumbnailUrl={selectedItem.thumbnailUrl}
          thumbnailShape={selectedItem.thumbnailShape}
          startDateTime={selectedItem.startDateTime}
          endDateTime={selectedItem.endDateTime}
          priority={selectedItem.priority}
          link={selectedItem.link}
          guideFile={selectedItem.guideFile}
          colors={{
            text: employeeColors.text,
            textSecondary: employeeColors.textSecondary,
            card: employeeColors.card,
            primary: employeeColors.primary,
          }}
        />
      )}

      <WeatherDetailModal
        visible={weatherDetailVisible}
        onClose={closeWeatherDetail}
        colors={{
          text: employeeColors.text,
          textSecondary: employeeColors.textSecondary,
          card: employeeColors.card,
          primary: employeeColors.primary,
          border: employeeColors.highlight,
        }}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: employeeColors.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  welcomeSection: {
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  welcomeTextContainer: {
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginBottom: 4,
  },
  jobTitle: {
    fontSize: 18,
    color: employeeColors.primary,
    fontWeight: '600',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: employeeColors.textSecondary,
    fontStyle: 'italic',
  },
  messageButton: {
    backgroundColor: 'rgba(52, 152, 219, 0.15)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#3498DB',
    overflow: 'hidden',
  },
  messageButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  messageIconWrapper: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3498DB',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 2px 6px rgba(52, 152, 219, 0.4)',
    elevation: 3,
  },
  messageBadgePosition: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
  messageTextContainer: {
    flex: 1,
  },
  messageButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: employeeColors.text,
    marginBottom: 2,
  },
  messageButtonCount: {
    fontSize: 13,
    fontWeight: '500',
    color: employeeColors.textSecondary,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: employeeColors.textSecondary,
    marginTop: 8,
  },
  emptyContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    textAlign: 'center',
  },
  announcementItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.highlight,
  },
  announcementSquareLayout: {
    flexDirection: 'row',
    gap: 12,
  },
  announcementSquareImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  announcementSquareContent: {
    flex: 1,
  },
  announcementBannerImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    resizeMode: 'cover',
    marginBottom: 8,
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  announcementTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: employeeColors.text,
    marginRight: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  announcementText: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    marginBottom: 4,
    lineHeight: 20,
  },
  announcementDate: {
    fontSize: 12,
    color: employeeColors.textSecondary,
    fontStyle: 'italic',
  },
  eventItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.highlight,
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
    color: employeeColors.text,
    marginBottom: 4,
  },
  eventDescription: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    marginBottom: 4,
    lineHeight: 20,
  },
  eventTime: {
    fontSize: 12,
    color: employeeColors.textSecondary,
    fontStyle: 'italic',
  },
  featureItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.highlight,
  },
  featureSquareLayout: {
    flexDirection: 'row',
    gap: 12,
  },
  featureSquareImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  featureSquareContent: {
    flex: 1,
  },
  featureBannerImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    resizeMode: 'cover',
    marginBottom: 8,
  },
  featureContent: {
    marginTop: 8,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: employeeColors.text,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    marginBottom: 4,
    lineHeight: 20,
  },
  featureTime: {
    fontSize: 12,
    color: employeeColors.textSecondary,
    fontStyle: 'italic',
  },
  specialCard: {
    backgroundColor: employeeColors.card,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  specialSquareLayout: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  specialSquareImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  specialSquareContent: {
    flex: 1,
  },
  specialBannerImage: {
    width: '100%',
    height: 140,
    resizeMode: 'cover',
  },
  specialContent: {
    padding: 12,
  },
  specialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  specialName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: employeeColors.text,
    marginRight: 8,
  },
  specialPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: employeeColors.primary,
  },
  specialDescription: {
    fontSize: 13,
    color: employeeColors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  specialTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  tag: {
    backgroundColor: employeeColors.highlight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
    color: employeeColors.text,
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalCloseButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
  },
  fullImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.8,
  },
  swipeHint: {
    position: 'absolute',
    bottom: 40,
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.7,
  },
});
