
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
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';

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

export default function EmployeePortalScreen() {
  const { user } = useAuth();
  const [weeklySpecials, setWeeklySpecials] = useState<MenuItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingSpecials, setLoadingSpecials] = useState(true);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);

  // Darker header color for sections
  const headerColor = '#B8D4E0'; // Slightly darker than highlight

  useEffect(() => {
    loadWeeklySpecials();
    loadAnnouncements();
  }, []);

  // Refresh data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('Employee portal screen focused, refreshing data...');
      loadWeeklySpecials();
      loadAnnouncements();
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
        .select('*')
        .eq('is_active', true)
        .in('visibility', ['everyone', 'employees'])
        .order('display_order', { ascending: true })
        .limit(10);

      if (error) {
        console.error('Error loading announcements:', error);
        throw error;
      }
      
      console.log('Announcements loaded for employee:', data?.length || 0, 'items');
      console.log('Announcement data:', JSON.stringify(data, null, 2));
      setAnnouncements(data || []);
    } catch (error) {
      console.error('Error loading announcements:', error);
    } finally {
      setLoadingAnnouncements(false);
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

  return (
    <GestureHandlerRootView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Welcome, {user?.name}!</Text>
          <Text style={styles.jobTitle}>{user?.jobTitle}</Text>
          <Text style={styles.tagline}>Let&apos;s see what we have going on today!</Text>
        </View>

        {/* Weather Section - Collapsible */}
        <CollapsibleSection
          title="Weather"
          iconIos="cloud.sun.fill"
          iconAndroid="wb_sunny"
          iconColor={employeeColors.primary}
          headerBackgroundColor={headerColor}
          headerTextColor={employeeColors.text}
          defaultExpanded={true}
        >
          <WeatherWidget
            textColor={employeeColors.text}
            secondaryTextColor={employeeColors.textSecondary}
          />
        </CollapsibleSection>

        {/* Announcements Section - Collapsible */}
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
          iconColor={employeeColors.primary}
          headerBackgroundColor={headerColor}
          headerTextColor={employeeColors.text}
          defaultExpanded={true}
        >
          <View style={styles.eventItem}>
            <View style={styles.eventDate}>
              <Text style={styles.eventDay}>15</Text>
              <Text style={styles.eventMonth}>JUN</Text>
            </View>
            <View style={styles.eventDetails}>
              <Text style={styles.eventTitle}>Summer Kickoff Party</Text>
              <Text style={styles.eventTime}>6:00 PM - 10:00 PM</Text>
            </View>
          </View>
          <View style={styles.eventItem}>
            <View style={styles.eventDate}>
              <Text style={styles.eventDay}>22</Text>
              <Text style={styles.eventMonth}>JUN</Text>
            </View>
            <View style={styles.eventDetails}>
              <Text style={styles.eventTitle}>Live Music Night</Text>
              <Text style={styles.eventTime}>7:00 PM - 11:00 PM</Text>
            </View>
          </View>
        </CollapsibleSection>

        {/* Special Features Section - Collapsible */}
        <CollapsibleSection
          title="Special Features"
          iconIos="star.fill"
          iconAndroid="star"
          iconColor={employeeColors.primary}
          headerBackgroundColor={headerColor}
          headerTextColor={employeeColors.text}
          defaultExpanded={true}
        >
          <View style={styles.featureGrid}>
            <TouchableOpacity style={styles.featureButton}>
              <IconSymbol
                ios_icon_name="clock.fill"
                android_material_icon_name="schedule"
                size={32}
                color={employeeColors.primary}
              />
              <Text style={styles.featureText}>My Schedule</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.featureButton}>
              <IconSymbol
                ios_icon_name="dollarsign.circle.fill"
                android_material_icon_name="attach_money"
                size={32}
                color={employeeColors.primary}
              />
              <Text style={styles.featureText}>Tips</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.featureButton}>
              <IconSymbol
                ios_icon_name="person.2.fill"
                android_material_icon_name="people"
                size={32}
                color={employeeColors.primary}
              />
              <Text style={styles.featureText}>Team</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.featureButton}>
              <IconSymbol
                ios_icon_name="doc.text.fill"
                android_material_icon_name="description"
                size={32}
                color={employeeColors.primary}
              />
              <Text style={styles.featureText}>Resources</Text>
            </TouchableOpacity>
          </View>
        </CollapsibleSection>

        {/* Weekly Specials Section - Collapsible */}
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
    marginBottom: 12,
  },
  tagline: {
    fontSize: 16,
    color: employeeColors.textSecondary,
    fontStyle: 'italic',
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.highlight,
  },
  eventDate: {
    width: 60,
    height: 60,
    backgroundColor: employeeColors.highlight,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  eventDay: {
    fontSize: 24,
    fontWeight: 'bold',
    color: employeeColors.text,
  },
  eventMonth: {
    fontSize: 12,
    fontWeight: '600',
    color: employeeColors.textSecondary,
  },
  eventDetails: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: employeeColors.text,
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 14,
    color: employeeColors.textSecondary,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  featureButton: {
    width: '48%',
    backgroundColor: employeeColors.highlight,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    fontWeight: '600',
    color: employeeColors.text,
    marginTop: 8,
    textAlign: 'center',
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
