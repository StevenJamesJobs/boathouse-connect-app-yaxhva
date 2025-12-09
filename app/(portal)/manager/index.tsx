
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
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import CollapsibleSection from '@/components/CollapsibleSection';
import WeatherWidget from '@/components/WeatherWidget';
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
}

export default function ManagerPortalScreen() {
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

  // Darker header color for sections
  const headerColor = '#34495E'; // Slightly darker than card
  const contentColor = managerColors.card; // Use card color for content

  useEffect(() => {
    loadWeeklySpecials();
    loadAnnouncements();
    loadUpcomingEvents();
    loadSpecialFeatures();
  }, []);

  // Refresh data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('Manager portal screen focused, refreshing data...');
      loadWeeklySpecials();
      loadAnnouncements();
      loadUpcomingEvents();
      loadSpecialFeatures();
    }, [])
  );

  const loadWeeklySpecials = async () => {
    try {
      setLoadingSpecials(true);
      console.log('Loading weekly specials for manager portal...');
      
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
      console.log('Loading announcements for manager portal...');
      
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .in('visibility', ['everyone', 'managers'])
        .order('display_order', { ascending: true })
        .limit(10);

      if (error) {
        console.error('Error loading announcements:', error);
        throw error;
      }
      
      console.log('Announcements loaded for manager:', data?.length || 0, 'items');
      console.log('Announcement data:', JSON.stringify(data, null, 2));
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
      console.log('Loading upcoming events for manager portal...');
      
      const { data, error } = await supabase
        .from('upcoming_events')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) {
        console.error('Error loading upcoming events:', error);
        throw error;
      }
      
      console.log('Upcoming events loaded for manager:', data?.length || 0, 'items');
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
      console.log('Loading special features for manager portal...');
      
      const { data, error } = await supabase
        .from('special_features')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) {
        console.error('Error loading special features:', error);
        throw error;
      }
      
      console.log('Special features loaded for manager:', data?.length || 0, 'items');
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
        return managerColors.textSecondary;
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

  return (
    <GestureHandlerRootView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <View style={styles.welcomeHeader}>
            <View style={styles.welcomeTextContainer}>
              <Text style={styles.welcomeTitle}>Welcome, {user?.name}!</Text>
              <Text style={styles.jobTitle}>{user?.jobTitle}</Text>
            </View>
            <TouchableOpacity
              style={styles.messageButton}
              onPress={() => router.push('/messages')}
            >
              <View style={styles.messageIconContainer}>
                <IconSymbol
                  ios_icon_name="envelope.fill"
                  android_material_icon_name="mail"
                  size={28}
                  color={managerColors.highlight}
                />
                {unreadCount > 0 && (
                  <View style={styles.messageBadgePosition}>
                    <MessageBadge count={unreadCount} size="small" />
                  </View>
                )}
              </View>
              <Text style={styles.messageButtonText}>
                {unreadCount > 0 ? `${unreadCount} New` : 'No New Messages'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.tagline}>Let&apos;s see what we have going on today!</Text>
        </View>

        {/* Weather Section - Collapsible */}
        <CollapsibleSection
          title="Weather"
          iconIos="cloud.sun.fill"
          iconAndroid="wb_sunny"
          iconColor={managerColors.accent}
          headerBackgroundColor={headerColor}
          headerTextColor={managerColors.text}
          contentBackgroundColor={contentColor}
          defaultExpanded={true}
        >
          <WeatherWidget
            textColor={managerColors.text}
            secondaryTextColor={managerColors.textSecondary}
          />
        </CollapsibleSection>

        {/* Announcements Section - Collapsible */}
        <CollapsibleSection
          title="Announcements"
          iconIos="megaphone.fill"
          iconAndroid="campaign"
          iconColor={managerColors.accent}
          headerBackgroundColor={headerColor}
          headerTextColor={managerColors.text}
          contentBackgroundColor={contentColor}
          defaultExpanded={true}
        >
          {loadingAnnouncements ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={managerColors.highlight} />
              <Text style={styles.loadingText}>Loading announcements...</Text>
            </View>
          ) : announcements.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No announcements available</Text>
              <Text style={styles.emptySubtext}>Create announcements in the Announcement Editor</Text>
            </View>
          ) : (
            <>
              {announcements.map((announcement, index) => (
                <View key={index} style={styles.announcementItem}>
                  {announcement.thumbnail_shape === 'square' && announcement.thumbnail_url ? (
                    <View style={styles.announcementSquareLayout}>
                      <TouchableOpacity onPress={() => openImageModal(announcement.thumbnail_url!)}>
                        <Image
                          source={{ uri: getImageUrl(announcement.thumbnail_url) }}
                          style={styles.announcementSquareImage}
                        />
                      </TouchableOpacity>
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
                        <TouchableOpacity onPress={() => openImageModal(announcement.thumbnail_url!)}>
                          <Image
                            source={{ uri: getImageUrl(announcement.thumbnail_url) }}
                            style={styles.announcementBannerImage}
                          />
                        </TouchableOpacity>
                      )}
                      <View style={styles.announcementHeader}>
                        <Text style={styles.announcementTitle}>{announcement.title}</Text>
                        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(announcement.priority) }]}>
                          <Text style={styles.priorityText}>{announcement.priority.toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={styles.announcementText}>
                        {announcement.content || announcement.message}
                      </Text>
                      <Text style={styles.announcementDate}>{getTimeAgo(announcement.created_at)}</Text>
                    </>
                  )}
                </View>
              ))}
            </>
          )}
        </CollapsibleSection>

        {/* Upcoming Events Section - Collapsible */}
        <CollapsibleSection
          title="Upcoming Events"
          iconIos="calendar"
          iconAndroid="event"
          iconColor={managerColors.accent}
          headerBackgroundColor={headerColor}
          headerTextColor={managerColors.text}
          contentBackgroundColor={contentColor}
          defaultExpanded={true}
          onViewAll={() => router.push('/view-all-upcoming-events')}
        >
          {loadingEvents ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={managerColors.highlight} />
              <Text style={styles.loadingText}>Loading events...</Text>
            </View>
          ) : upcomingEvents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No upcoming events</Text>
              <Text style={styles.emptySubtext}>Create events in the Upcoming Events Editor</Text>
            </View>
          ) : (
            <>
              {upcomingEvents.map((event, index) => (
                <View key={index} style={styles.eventItem}>
                  {event.thumbnail_shape === 'square' && event.thumbnail_url ? (
                    <View style={styles.eventSquareLayout}>
                      <TouchableOpacity onPress={() => openImageModal(event.thumbnail_url!)}>
                        <Image
                          source={{ uri: getImageUrl(event.thumbnail_url) }}
                          style={styles.eventSquareImage}
                        />
                      </TouchableOpacity>
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
                        <TouchableOpacity onPress={() => openImageModal(event.thumbnail_url!)}>
                          <Image
                            source={{ uri: getImageUrl(event.thumbnail_url) }}
                            style={styles.eventBannerImage}
                          />
                        </TouchableOpacity>
                      )}
                      <View style={styles.eventContent}>
                        <Text style={styles.eventTitle}>{event.title}</Text>
                        {(event.content || event.message) && (
                          <Text style={styles.eventDescription}>
                            {event.content || event.message}
                          </Text>
                        )}
                        {event.start_date_time && (
                          <Text style={styles.eventTime}>{formatDateTime(event.start_date_time)}</Text>
                        )}
                      </View>
                    </>
                  )}
                </View>
              ))}
            </>
          )}
        </CollapsibleSection>

        {/* Special Features Section - Collapsible */}
        <CollapsibleSection
          title="Special Features"
          iconIos="star.fill"
          iconAndroid="star"
          iconColor={managerColors.accent}
          headerBackgroundColor={headerColor}
          headerTextColor={managerColors.text}
          contentBackgroundColor={contentColor}
          defaultExpanded={true}
          onViewAll={() => router.push('/view-all-special-features')}
        >
          {loadingFeatures ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={managerColors.highlight} />
              <Text style={styles.loadingText}>Loading features...</Text>
            </View>
          ) : specialFeatures.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No special features</Text>
              <Text style={styles.emptySubtext}>Create features in the Special Features Editor</Text>
            </View>
          ) : (
            <>
              {specialFeatures.map((feature, index) => (
                <View key={index} style={styles.featureItem}>
                  {feature.thumbnail_shape === 'square' && feature.thumbnail_url ? (
                    <View style={styles.featureSquareLayout}>
                      <TouchableOpacity onPress={() => openImageModal(feature.thumbnail_url!)}>
                        <Image
                          source={{ uri: getImageUrl(feature.thumbnail_url) }}
                          style={styles.featureSquareImage}
                        />
                      </TouchableOpacity>
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
                        <TouchableOpacity onPress={() => openImageModal(feature.thumbnail_url!)}>
                          <Image
                            source={{ uri: getImageUrl(feature.thumbnail_url) }}
                            style={styles.featureBannerImage}
                          />
                        </TouchableOpacity>
                      )}
                      <View style={styles.featureContent}>
                        <Text style={styles.featureTitle}>{feature.title}</Text>
                        {(feature.content || feature.message) && (
                          <Text style={styles.featureDescription}>
                            {feature.content || feature.message}
                          </Text>
                        )}
                        {feature.start_date_time && (
                          <Text style={styles.featureTime}>{formatDateTime(feature.start_date_time)}</Text>
                        )}
                      </View>
                    </>
                  )}
                </View>
              ))}
            </>
          )}
        </CollapsibleSection>

        {/* Weekly Specials Section - Collapsible */}
        <CollapsibleSection
          title="Weekly Specials"
          iconIos="fork.knife"
          iconAndroid="restaurant"
          iconColor={managerColors.accent}
          headerBackgroundColor={headerColor}
          headerTextColor={managerColors.text}
          contentBackgroundColor={contentColor}
          defaultExpanded={true}
        >
          {loadingSpecials ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={managerColors.highlight} />
              <Text style={styles.loadingText}>Loading specials...</Text>
            </View>
          ) : weeklySpecials.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No weekly specials available</Text>
              <Text style={styles.emptySubtext}>Add items in the Menu Editor</Text>
            </View>
          ) : (
            <>
              {weeklySpecials.map((item, index) => (
                <View key={index} style={styles.specialCard}>
                  {item.thumbnail_shape === 'square' && item.thumbnail_url ? (
                    <View style={styles.specialSquareLayout}>
                      <TouchableOpacity onPress={() => openImageModal(item.thumbnail_url!)}>
                        <Image
                          source={{ uri: getImageUrl(item.thumbnail_url) }}
                          style={styles.specialSquareImage}
                        />
                      </TouchableOpacity>
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
                        <TouchableOpacity onPress={() => openImageModal(item.thumbnail_url!)}>
                          <Image
                            source={{ uri: getImageUrl(item.thumbnail_url) }}
                            style={styles.specialBannerImage}
                          />
                        </TouchableOpacity>
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
                </View>
              ))}
            </>
          )}
        </CollapsibleSection>
      </ScrollView>

      {/* Image Modal */}
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
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
    backgroundColor: managerColors.card,
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  welcomeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  welcomeTextContainer: {
    flex: 1,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 4,
  },
  jobTitle: {
    fontSize: 18,
    color: managerColors.highlight,
    fontWeight: '600',
  },
  messageButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.highlight,
    borderRadius: 12,
    padding: 12,
    minWidth: 100,
  },
  messageIconContainer: {
    position: 'relative',
    marginBottom: 4,
  },
  messageBadgePosition: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  messageButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: managerColors.text,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    color: managerColors.textSecondary,
    fontStyle: 'italic',
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: managerColors.textSecondary,
    marginTop: 8,
  },
  emptyContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: managerColors.textSecondary,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 12,
    color: managerColors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  announcementItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
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
    color: managerColors.text,
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
    color: managerColors.textSecondary,
    marginBottom: 4,
    lineHeight: 20,
  },
  announcementDate: {
    fontSize: 12,
    color: managerColors.textSecondary,
    fontStyle: 'italic',
  },
  eventItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
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
    color: managerColors.text,
    marginBottom: 4,
  },
  eventDescription: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 4,
    lineHeight: 20,
  },
  eventTime: {
    fontSize: 12,
    color: managerColors.textSecondary,
    fontStyle: 'italic',
  },
  featureItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
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
    color: managerColors.text,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 4,
    lineHeight: 20,
  },
  featureTime: {
    fontSize: 12,
    color: managerColors.textSecondary,
    fontStyle: 'italic',
  },
  specialCard: {
    backgroundColor: managerColors.background,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.2)',
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
    color: managerColors.text,
    marginRight: 8,
  },
  specialPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.highlight,
  },
  specialDescription: {
    fontSize: 13,
    color: managerColors.textSecondary,
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
    backgroundColor: managerColors.highlight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
    color: managerColors.text,
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
