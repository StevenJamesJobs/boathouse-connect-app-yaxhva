
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
import { useAuth } from '@/contexts/AuthContext';
import { managerColors, employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import ContentDetailModal from '@/components/ContentDetailModal';
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

interface GuideFile {
  id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_type: string;
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

export default function ViewAllSpecialFeaturesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [features, setFeatures] = useState<SpecialFeature[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Detail modal state
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<{
    title: string;
    content: string;
    thumbnailUrl?: string | null;
    thumbnailShape?: string;
    startDateTime?: string | null;
    endDateTime?: string | null;
    link?: string | null;
    guideFile?: GuideFile | null;
  } | null>(null);

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

  const openDetailModal = (feature: SpecialFeature) => {
    setSelectedFeature({
      title: feature.title,
      content: feature.content || feature.message || '',
      thumbnailUrl: feature.thumbnail_url,
      thumbnailShape: feature.thumbnail_shape,
      startDateTime: feature.start_date_time,
      endDateTime: feature.end_date_time,
      link: feature.link,
      guideFile: feature.guide_file || null,
    });
    setDetailModalVisible(true);
  };

  const closeDetailModal = () => {
    setDetailModalVisible(false);
    setSelectedFeature(null);
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
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>All Special Features</Text>
        <View style={styles.headerSpacer} />
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
              <TouchableOpacity
                key={index}
                style={[styles.featureCard, { backgroundColor: colors.card }]}
                onPress={() => openDetailModal(feature)}
                activeOpacity={0.7}
              >
                {feature.thumbnail_shape === 'square' && feature.thumbnail_url ? (
                  <View style={styles.squareLayout}>
                    <Image
                      source={{ uri: getImageUrl(feature.thumbnail_url) }}
                      style={styles.squareImage}
                    />
                    <View style={styles.squareContent}>
                      <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
                      {(feature.content || feature.message) && (
                        <Text style={[styles.featureMessage, { color: colors.textSecondary }]} numberOfLines={2}>
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
                      {(feature.link || feature.guide_file) && (
                        <View style={styles.actionIndicator}>
                          <IconSymbol
                            ios_icon_name="chevron.right"
                            android_material_icon_name="chevron_right"
                            size={16}
                            color={colors.primary}
                          />
                          <Text style={[styles.actionText, { color: colors.primary }]}>
                            Tap for more details
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ) : (
                  <>
                    {feature.thumbnail_url && (
                      <Image
                        source={{ uri: getImageUrl(feature.thumbnail_url) }}
                        style={styles.bannerImage}
                      />
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
                      {(feature.link || feature.guide_file) && (
                        <View style={styles.actionIndicator}>
                          <IconSymbol
                            ios_icon_name="chevron.right"
                            android_material_icon_name="chevron_right"
                            size={16}
                            color={colors.primary}
                          />
                          <Text style={[styles.actionText, { color: colors.primary }]}>
                            Tap for more details
                          </Text>
                        </View>
                      )}
                    </View>
                  </>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {selectedFeature && (
        <ContentDetailModal
          visible={detailModalVisible}
          onClose={closeDetailModal}
          title={selectedFeature.title}
          content={selectedFeature.content}
          thumbnailUrl={selectedFeature.thumbnailUrl}
          thumbnailShape={selectedFeature.thumbnailShape}
          startDateTime={selectedFeature.startDateTime}
          endDateTime={selectedFeature.endDateTime}
          link={selectedFeature.link}
          guideFile={selectedFeature.guideFile}
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
});
