
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
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { managerColors, employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';

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

export default function ViewAllSpecialFeaturesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [features, setFeatures] = useState<SpecialFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);

  const colors = user?.role === 'manager' ? managerColors : employeeColors;

  useEffect(() => {
    loadFeatures();
  }, []);

  const loadFeatures = async () => {
    try {
      setLoading(true);
      console.log('Loading all special features...');
      
      const { data, error } = await supabase
        .from('special_features')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading special features:', error);
        throw error;
      }
      
      console.log('Special features loaded:', data?.length || 0, 'items');
      setFeatures(data || []);
    } catch (error) {
      console.error('Error loading special features:', error);
    } finally {
      setLoading(false);
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

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.backNavigationTab, { backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backTabButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color="#FFFFFF"
          />
          <Text style={styles.backTabText}>Back to Welcome</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <IconSymbol
          ios_icon_name="star.fill"
          android_material_icon_name="star"
          size={32}
          color={colors.accent || colors.primary}
        />
        <Text style={[styles.headerTitle, { color: colors.text }]}>All Special Features</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading features...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {features.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="star.fill"
                android_material_icon_name="star"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>No special features</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Check back later for new features
              </Text>
            </View>
          ) : (
            features.map((feature, index) => (
              <View key={index} style={[styles.featureCard, { backgroundColor: colors.card }]}>
                {feature.thumbnail_shape === 'square' && feature.thumbnail_url ? (
                  <View style={styles.squareLayout}>
                    <TouchableOpacity onPress={() => openImageModal(feature.thumbnail_url!)}>
                      <Image
                        source={{ uri: getImageUrl(feature.thumbnail_url) }}
                        style={styles.squareImage}
                      />
                    </TouchableOpacity>
                    <View style={styles.squareContent}>
                      <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
                      {(feature.content || feature.message) && (
                        <Text style={[styles.featureMessage, { color: colors.textSecondary }]}>
                          {feature.content || feature.message}
                        </Text>
                      )}
                      {feature.start_date_time && (
                        <View style={styles.featureMeta}>
                          <View style={styles.metaItem}>
                            <IconSymbol
                              ios_icon_name="calendar"
                              android_material_icon_name="event"
                              size={14}
                              color={colors.textSecondary}
                            />
                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                              {formatDateTime(feature.start_date_time)}
                            </Text>
                          </View>
                          {feature.end_date_time && (
                            <View style={styles.metaItem}>
                              <IconSymbol
                                ios_icon_name="clock"
                                android_material_icon_name="schedule"
                                size={14}
                                color={colors.textSecondary}
                              />
                              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                Ends: {formatDateTime(feature.end_date_time)}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                ) : (
                  <>
                    {feature.thumbnail_url && (
                      <TouchableOpacity onPress={() => openImageModal(feature.thumbnail_url!)}>
                        <Image
                          source={{ uri: getImageUrl(feature.thumbnail_url) }}
                          style={styles.bannerImage}
                        />
                      </TouchableOpacity>
                    )}
                    <View style={styles.featureContent}>
                      <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
                      {(feature.content || feature.message) && (
                        <Text style={[styles.featureMessage, { color: colors.textSecondary }]}>
                          {feature.content || feature.message}
                        </Text>
                      )}
                      {feature.start_date_time && (
                        <View style={styles.featureMeta}>
                          <View style={styles.metaItem}>
                            <IconSymbol
                              ios_icon_name="calendar"
                              android_material_icon_name="event"
                              size={14}
                              color={colors.textSecondary}
                            />
                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                              {formatDateTime(feature.start_date_time)}
                            </Text>
                          </View>
                          {feature.end_date_time && (
                            <View style={styles.metaItem}>
                              <IconSymbol
                                ios_icon_name="clock"
                                android_material_icon_name="schedule"
                                size={14}
                                color={colors.textSecondary}
                              />
                              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                Ends: {formatDateTime(feature.end_date_time)}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

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
  },
  backNavigationTab: {
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
    paddingHorizontal: 16,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.4)',
    elevation: 8,
  },
  backTabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
  },
  backTabText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
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
  featureCard: {
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
  featureContent: {
    padding: 16,
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  featureMessage: {
    fontSize: 15,
    marginBottom: 12,
    lineHeight: 22,
  },
  featureMeta: {
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
