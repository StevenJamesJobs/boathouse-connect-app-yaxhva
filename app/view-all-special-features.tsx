
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
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
import { getLocalizedField } from '@/utils/translateContent';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchContentImagesBatch } from '@/utils/contentImages';
import { fetchContentAttachmentsBatch, sweepExpiredContent, type ContentAttachment } from '@/utils/contentAttachments';
import { isManagerOrOwner } from '@/utils/roles';
import { getImageUrl } from '@/utils/imageUrl';
import FormattedText, { stripFormattingTags } from '@/components/FormattedText';
import { useAuth } from '@/contexts/AuthContext';
import { fonts } from '@/constants/fonts';
import ContentBannerCard, { formatBannerWhen } from '@/components/content/ContentBannerCard';

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
}

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

export default function ViewAllSpecialFeaturesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const [features, setFeatures] = useState<SpecialFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [contentImagesMap, setContentImagesMap] = useState<Map<string, string[]>>(new Map());
  const [attachmentsMap, setAttachmentsMap] = useState<Map<string, ContentAttachment>>(new Map());

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
    imageUrls?: string[];
    kind?: 'special_feature';
  } | null>(null);

  useEffect(() => {
    loadFeatures();
  }, [user?.id]);

  const loadFeatures = async () => {
    // Logout race: an empty actor would reach the uuid RPC param as '' (22P02).
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      // s80: expiry sweep first — expired specials go server-side, and their
      // files are handed back for a manager/owner to broker-delete.
      await sweepExpiredContent(user.id, isManagerOrOwner(user));

      // Member-gated RPC: org derived server-side; rows carry the same shape as
      // the old select('*') plus a guide_file jsonb matching the retired embed.
      const { data, error } = await supabase.rpc('get_special_features', {
        p_actor_id: user.id,
      });

      if (error) {
        console.error('Error loading special features:', error);
        throw error;
      }

      setFeatures((data || []) as SpecialFeature[]);

      // Batch fetch additional content images + one-time attachments
      if (data && data.length > 0) {
        const ids = data.map((f) => f.id);
        const [imagesMap, attachments] = await Promise.all([
          fetchContentImagesBatch(user.id, 'special_feature', ids),
          fetchContentAttachmentsBatch(user.id, 'special_feature', ids),
        ]);
        setContentImagesMap(imagesMap);
        setAttachmentsMap(attachments);
      } else {
        setContentImagesMap(new Map());
        setAttachmentsMap(new Map());
      }
    } catch (error) {
      console.error('Error loading special features:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetailModal = (feature: SpecialFeature) => {
    const additionalImages = contentImagesMap.get(feature.id) || [];
    const imageUrls = [
      ...(feature.thumbnail_url ? [getImageUrl(feature.thumbnail_url, feature.updated_at)!] : []),
      ...additionalImages.map(url => getImageUrl(url, feature.updated_at)!),
    ];
    setSelectedFeature({
      title: getLocalizedField(feature, 'title', language),
      content: getLocalizedField(feature, 'content', language) || feature.content || feature.message || '',
      thumbnailUrl: feature.thumbnail_url,
      thumbnailShape: feature.thumbnail_shape,
      startDateTime: feature.start_date_time,
      endDateTime: feature.end_date_time,
      link: feature.link,
      guideFile: feature.guide_file || guideFileFromAttachment(attachmentsMap.get(feature.id)),
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      kind: 'special_feature',
    });
    setDetailModalVisible(true);
  };

  const closeDetailModal = () => {
    setDetailModalVisible(false);
    setSelectedFeature(null);
  };

  const dateLocale = language === 'es' ? 'es' : 'en-US';
  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return null;
    const date = new Date(dateTime);
    return date.toLocaleString(dateLocale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Search — title/content in the reader's language, case-insensitive.
  const query = search.trim().toLowerCase();
  const visibleFeatures = query
    ? features.filter((feature) => {
        const title = getLocalizedField(feature, 'title', language) || feature.title || '';
        const body = stripFormattingTags(
          getLocalizedField(feature, 'content', language) || feature.content || feature.message || ''
        );
        return title.toLowerCase().includes(query) || body.toLowerCase().includes(query);
      })
    : features;

  const handleBackPress = () => {
    router.back();
  };

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={t('special_features.title')} onBack={handleBackPress} />

      {/* ONE section card holding the search field. */}
      <GlassCard variant="surface" radius={17} style={styles.sectionCard}>
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
            placeholder={t('special_features.search_placeholder')}
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
      </GlassCard>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t('special_features.loading')}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {visibleFeatures.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="star.fill"
                android_material_icon_name="star"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={styles.emptyText}>{t('special_features.no_features')}</Text>
              {!query && (
                <Text style={styles.emptySubtext}>
                  {t('special_features.check_back')}
                </Text>
              )}
            </View>
          ) : (
            visibleFeatures.map((feature) => {
              // Banner posts wear ContentBannerCard (s81 — the Welcome tab's
              // card, same component). Square posts keep the row card below.
              if (feature.thumbnail_shape === 'banner' && feature.thumbnail_url) {
                const body = getLocalizedField(feature, 'content', language) || feature.content || feature.message;
                return (
                  <ContentBannerCard
                    key={feature.id}
                    imageUrl={getImageUrl(feature.thumbnail_url, feature.updated_at)!}
                    title={getLocalizedField(feature, 'title', language)}
                    description={body ? stripFormattingTags(body) : null}
                    eyebrow={formatBannerWhen(feature.start_date_time, language)}
                    onPress={() => openDetailModal(feature)}
                  />
                );
              }
              return (
              <TouchableOpacity
                key={feature.id}
                style={styles.featureCard}
                onPress={() => openDetailModal(feature)}
                activeOpacity={0.7}
              >
                <View style={styles.squareLayout}>
                  {feature.thumbnail_url && (
                    <StorageExpoImage
                      source={getImageUrl(feature.thumbnail_url, feature.updated_at)!}
                      style={styles.squareImage}
                      contentFit="cover"
                    />
                  )}
                  <View style={styles.squareContent}>
                    <Text style={styles.featureTitle}>{getLocalizedField(feature, 'title', language)}</Text>
                    {(feature.content || feature.message) && (
                      <FormattedText style={styles.featureMessage} numberOfLines={2}>
                        {getLocalizedField(feature, 'content', language) || feature.content || feature.message}
                      </FormattedText>
                    )}
                    {feature.start_date_time && (
                      <View style={styles.featureMeta}>
                        <View style={styles.metaItem}>
                          <IconSymbol
                            ios_icon_name="calendar"
                            android_material_icon_name="event"
                            size={12}
                            color={colors.primary}
                          />
                          <Text style={styles.metaText}>
                            {formatDateTime(feature.start_date_time)}
                          </Text>
                        </View>
                        {feature.end_date_time && (
                          <View style={styles.metaItem}>
                            <IconSymbol
                              ios_icon_name="clock"
                              android_material_icon_name="schedule"
                              size={12}
                              color={colors.primary}
                            />
                            <Text style={styles.metaText}>
                              {t('special_features.ends', { datetime: formatDateTime(feature.end_date_time) })}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                    <View style={styles.actionIndicator}>
                      <Text style={styles.actionText}>
                        {t('special_features.tap_for_info')}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
              );
            })
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
          imageUrls={selectedFeature.imageUrls}
          kind={selectedFeature.kind}
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
    sectionCard: {
      marginHorizontal: 16,
      marginBottom: 4,
      padding: 12,
    },
    // MenuSearchRow geometry: 46pt, r13, glass fill + glassBorder hairline+0.5.
    searchField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 46,
      borderRadius: 13,
      paddingHorizontal: 13,
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
    featureCard: {
      borderRadius: 16,
      padding: 11,
      marginBottom: 11,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      backgroundColor: colors.surface,
      borderColor: colors.surfaceBorder,
    },
    squareLayout: {
      flexDirection: 'row',
      gap: 12,
    },
    squareImage: {
      width: 80,
      height: 80,
      borderRadius: 10,
      backgroundColor: colors.thumbPlaceholder,
    },
    squareContent: {
      flex: 1,
    },
    featureTitle: {
      fontFamily: fonts.display.semibold,
      fontSize: 14.5,
      marginBottom: 4,
      color: colors.text,
    },
    featureMessage: {
      fontFamily: fonts.body.regular,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
    },
    featureMeta: {
      gap: 4,
      marginTop: 6,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    metaText: {
      fontFamily: fonts.mono.medium,
      fontSize: 9.5,
      letterSpacing: 0.3,
      color: colors.primary,
    },
    actionIndicator: {
      marginTop: 6,
    },
    actionText: {
      fontFamily: fonts.body.semibold,
      fontSize: 11.5,
      color: colors.primary,
    },
  });
