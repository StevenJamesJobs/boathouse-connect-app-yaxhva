
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
  const { t } = useTranslation();
  const colors = useThemeColors();
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
            android_material_icon_name="chevron-left"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('special_features.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('special_features.loading')}</Text>
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
              <Text style={[styles.emptyText, { color: colors.text }]}>{t('special_features.no_features')}</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                {t('special_features.check_back')}
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
                <View style={styles.squareLayout}>
                {feature.thumbnail_url && (
                  <Image
                    source={{ uri: getImageUrl(feature.thumbnail_url) }}
                    style={styles.squareImage}
                  />
                )}
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
                            {t('special_features.ends', { datetime: formatDateTime(feature.end_date_time) })}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                  <View style={styles.actionIndicator}>
                    <Text style={[styles.actionText, { color: colors.primary }]}>
                      {t('special_features.tap_for_info')}
                    </Text>
                  </View>
                </View>
              </View>
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
    padding: 12,
    gap: 12,
  },
  squareImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  squareContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  featureMessage: {
    fontSize: 13,
    marginBottom: 8,
    lineHeight: 18,
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
    fontSize: 11,
  },
  actionIndicator: {
    marginTop: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
