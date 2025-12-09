
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
  Linking,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { managerColors, employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

interface GuideItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  thumbnail_url: string | null;
  file_url: string;
  file_type: string;
  file_name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ['Employee HandBooks', 'Full Menus', 'Cheat Sheets', 'Events Flyers'];

export default function GuidesAndTrainingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [guides, setGuides] = useState<GuideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Employee HandBooks');
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<string | null>(null);

  const colors = user?.role === 'manager' ? managerColors : employeeColors;

  useEffect(() => {
    loadGuides();
  }, []);

  const loadGuides = async () => {
    try {
      setLoading(true);
      console.log('Loading guides and training items...');
      
      const { data, error } = await supabase
        .from('guides_and_training')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error loading guides:', error);
        throw error;
      }
      
      console.log('Guides loaded:', data?.length || 0, 'items');
      setGuides(data || []);
    } catch (error) {
      console.error('Error loading guides:', error);
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleViewFile = async (guide: GuideItem) => {
    try {
      setViewingFile(guide.id);
      console.log('Opening file:', guide.file_name);

      // Simply open the file URL in the browser/viewer
      const canOpen = await Linking.canOpenURL(guide.file_url);
      if (canOpen) {
        await Linking.openURL(guide.file_url);
      } else {
        Alert.alert('Error', 'Cannot open this file type');
      }
    } catch (error) {
      console.error('Error viewing file:', error);
      Alert.alert('Error', 'Failed to open file');
    } finally {
      setViewingFile(null);
    }
  };

  const handleDownloadFile = async (guide: GuideItem) => {
    try {
      setDownloadingFile(guide.id);
      console.log('Downloading file:', guide.file_name);

      // For web, just open the file URL in a new tab to trigger download
      if (Platform.OS === 'web') {
        // Create a temporary link element to trigger download
        const link = document.createElement('a');
        link.href = guide.file_url;
        link.download = guide.file_name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert('Success', 'File download started');
        setDownloadingFile(null);
        return;
      }

      // For mobile, use the new Expo 54 FileSystem API
      console.log('Downloading from:', guide.file_url);
      
      // Create a downloads directory in cache
      const downloadsDir = new Directory(Paths.cache, 'downloads');
      
      // Create the directory if it doesn't exist
      if (!downloadsDir.exists) {
        console.log('Creating downloads directory...');
        downloadsDir.create({ intermediates: true });
      }

      console.log('Downloading to directory:', downloadsDir.uri);
      
      // Check if file already exists and delete it if it does
      const targetFile = new File(downloadsDir, guide.file_name);
      if (targetFile.exists) {
        console.log('File already exists, deleting old version...');
        try {
          await targetFile.delete();
          console.log('Old file deleted successfully');
        } catch (deleteError) {
          console.error('Error deleting old file:', deleteError);
          // Continue anyway, the download might still work
        }
      }

      // Download the file using the new API
      const downloadedFile = await File.downloadFileAsync(
        guide.file_url,
        downloadsDir
      );

      console.log('File downloaded successfully to:', downloadedFile.uri);
      console.log('File exists:', downloadedFile.exists);

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        console.log('Sharing file...');
        await Sharing.shareAsync(downloadedFile.uri, {
          mimeType: guide.file_type,
          dialogTitle: `Download ${guide.file_name}`,
          UTI: guide.file_type,
        });
        Alert.alert('Success', 'File ready to save');
      } else {
        Alert.alert('Success', `File downloaded to: ${downloadedFile.uri}`);
      }
    } catch (error: any) {
      console.error('Error downloading file:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      // Provide more specific error messages
      let errorMessage = 'Failed to download file';
      if (error.code === 'ERR_DESTINATION_ALREADY_EXISTS') {
        errorMessage = 'File already exists. Please try again.';
      } else if (error.message) {
        errorMessage = `Failed to download file: ${error.message}`;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleBackPress = () => {
    router.back();
  };

  const filteredGuides = guides.filter(g => g.category === selectedCategory);

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
          <Text style={styles.backTabText}>Back to Tools</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <IconSymbol
          ios_icon_name="book.fill"
          android_material_icon_name="menu_book"
          size={32}
          color={colors.accent || colors.primary}
        />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Guides and Training</Text>
      </View>

      {/* Category Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryScrollContent}
      >
        {CATEGORIES.map((category, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.categoryTab,
              { backgroundColor: colors.card },
              selectedCategory === category && { backgroundColor: colors.accent || colors.primary },
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text
              style={[
                styles.categoryTabText,
                { color: colors.textSecondary },
                selectedCategory === category && { color: colors.text },
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading guides...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {filteredGuides.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="book.fill"
                android_material_icon_name="menu_book"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>No guides in this category</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Check back later for new materials
              </Text>
            </View>
          ) : (
            filteredGuides.map((guide, index) => (
              <View key={index} style={[styles.guideCard, { backgroundColor: colors.card }]}>
                <View style={styles.guideLayout}>
                  {guide.thumbnail_url && (
                    <TouchableOpacity onPress={() => openImageModal(guide.thumbnail_url!)}>
                      <Image
                        source={{ uri: getImageUrl(guide.thumbnail_url) }}
                        style={styles.guideThumbnail}
                      />
                    </TouchableOpacity>
                  )}
                  <View style={styles.guideContent}>
                    <Text style={[styles.guideTitle, { color: colors.text }]}>{guide.title}</Text>
                    {guide.description && (
                      <Text style={[styles.guideDescription, { color: colors.textSecondary }]}>
                        {guide.description}
                      </Text>
                    )}
                    <View style={styles.guideMeta}>
                      <View style={styles.metaItem}>
                        <IconSymbol
                          ios_icon_name="doc.fill"
                          android_material_icon_name="description"
                          size={14}
                          color={colors.textSecondary}
                        />
                        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                          {guide.file_name}
                        </Text>
                      </View>
                      <View style={styles.metaItem}>
                        <IconSymbol
                          ios_icon_name="clock"
                          android_material_icon_name="schedule"
                          size={14}
                          color={colors.textSecondary}
                        />
                        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                          Updated: {formatDate(guide.updated_at)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                
                {/* Action Buttons */}
                <View style={styles.actionButtonsContainer}>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.accent || colors.primary }]}
                    onPress={() => handleViewFile(guide)}
                    disabled={viewingFile === guide.id}
                  >
                    {viewingFile === guide.id ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <>
                        <IconSymbol
                          ios_icon_name="eye.fill"
                          android_material_icon_name="visibility"
                          size={20}
                          color={colors.text}
                        />
                        <Text style={[styles.actionButtonText, { color: colors.text }]}>
                          View File
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.downloadButton, { backgroundColor: colors.card, borderColor: colors.accent || colors.primary }]}
                    onPress={() => handleDownloadFile(guide)}
                    disabled={downloadingFile === guide.id}
                  >
                    {downloadingFile === guide.id ? (
                      <ActivityIndicator size="small" color={colors.accent || colors.primary} />
                    ) : (
                      <>
                        <IconSymbol
                          ios_icon_name="arrow.down.circle.fill"
                          android_material_icon_name="download"
                          size={20}
                          color={colors.accent || colors.primary}
                        />
                        <Text style={[styles.actionButtonText, { color: colors.accent || colors.primary }]}>
                          Download
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
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
  categoryScroll: {
    marginTop: 16,
    maxHeight: 50,
  },
  categoryScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '600',
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
  guideCard: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.2)',
    elevation: 3,
  },
  guideLayout: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  guideThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  guideContent: {
    flex: 1,
  },
  guideTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  guideDescription: {
    fontSize: 14,
    marginBottom: 8,
    lineHeight: 20,
  },
  guideMeta: {
    gap: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    flex: 1,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
    borderRadius: 8,
  },
  downloadButton: {
    borderWidth: 2,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
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
