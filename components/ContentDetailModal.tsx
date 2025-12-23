
import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { IconSymbol } from '@/components/IconSymbol';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';

interface GuideFile {
  id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_type: string;
}

interface ContentDetailModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  content: string;
  thumbnailUrl?: string | null;
  thumbnailShape?: string;
  startDateTime?: string | null;
  endDateTime?: string | null;
  priority?: string;
  link?: string | null;
  guideFile?: GuideFile | null;
  colors: {
    background?: string;
    text: string;
    textSecondary: string;
    primary: string;
    card: string;
    highlight?: string;
    border?: string;
  };
}

export default function ContentDetailModal({
  visible,
  onClose,
  title,
  content,
  thumbnailUrl,
  thumbnailShape,
  startDateTime,
  endDateTime,
  priority,
  link,
  guideFile,
  colors,
}: ContentDetailModalProps) {
  const handleSwipeGesture = (event: any) => {
    const { translationY } = event.nativeEvent;
    if (translationY > 100) {
      onClose();
    }
  };

  const screenHeight = Dimensions.get('window').height;

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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return '#E74C3C';
      case 'medium':
        return '#F39C12';
      case 'low':
        return '#3498DB';
      default:
        return colors.textSecondary;
    }
  };

  const handleOpenLink = async () => {
    if (!link) return;
    
    try {
      console.log('Opening link:', link);
      await WebBrowser.openBrowserAsync(link);
    } catch (error) {
      console.error('Error opening link:', error);
      Alert.alert('Error', 'Could not open the link');
    }
  };

  const handleViewFile = async () => {
    if (!guideFile) return;
    
    try {
      console.log('Opening file:', guideFile.file_url);
      await WebBrowser.openBrowserAsync(guideFile.file_url);
    } catch (error) {
      console.error('Error opening file:', error);
      Alert.alert('Error', 'Could not open the file');
    }
  };

  const handleDownloadFile = async () => {
    if (!guideFile) return;
    
    try {
      console.log('Downloading file:', guideFile.file_url);
      
      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Not Available', 'Sharing is not available on this device. Please use the View button to open the file.');
        return;
      }

      // Open the file URL in browser which will trigger download
      await WebBrowser.openBrowserAsync(guideFile.file_url);
      
      Alert.alert(
        'Download',
        'The file will be downloaded by your browser. You can find it in your downloads folder.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error downloading file:', error);
      Alert.alert('Error', 'Could not download the file');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.modalOverlay}>
        <TouchableOpacity 
          style={styles.modalBackdrop} 
          activeOpacity={1} 
          onPress={onClose}
        />
        <PanGestureHandler onGestureEvent={handleSwipeGesture}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, maxHeight: screenHeight * 0.9 }]}>
            {/* Swipe Indicator */}
            <View style={styles.swipeIndicatorContainer}>
              <View style={[styles.swipeIndicator, { backgroundColor: colors.border || colors.textSecondary }]} />
            </View>

            {/* Close Button */}
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={32}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {/* Scrollable Content */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
              bounces={true}
              nestedScrollEnabled={true}
            >
              {/* Thumbnail Image */}
              {thumbnailUrl && (
                <View style={styles.imageContainer}>
                  <Image
                    source={{ uri: thumbnailUrl }}
                    style={
                      thumbnailShape === 'square'
                        ? styles.squareImage
                        : styles.bannerImage
                    }
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                    placeholder={require('@/assets/images/natively-dark.png')}
                    placeholderContentFit="cover"
                  />
                </View>
              )}

              {/* Title with Priority Badge */}
              <View style={styles.titleContainer}>
                <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                {priority && (
                  <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(priority) }]}>
                    <Text style={styles.priorityText}>{priority.toUpperCase()}</Text>
                  </View>
                )}
              </View>

              {/* Date/Time Information */}
              {(startDateTime || endDateTime) && (
                <View style={styles.dateTimeContainer}>
                  {startDateTime && (
                    <View style={styles.dateTimeItem}>
                      <IconSymbol
                        ios_icon_name="calendar"
                        android_material_icon_name="event"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={[styles.dateTimeLabel, { color: colors.textSecondary }]}>Start:</Text>
                      <Text style={[styles.dateTimeText, { color: colors.text }]}>
                        {formatDateTime(startDateTime)}
                      </Text>
                    </View>
                  )}
                  {endDateTime && (
                    <View style={styles.dateTimeItem}>
                      <IconSymbol
                        ios_icon_name="clock"
                        android_material_icon_name="schedule"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={[styles.dateTimeLabel, { color: colors.textSecondary }]}>End:</Text>
                      <Text style={[styles.dateTimeText, { color: colors.text }]}>
                        {formatDateTime(endDateTime)}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Content */}
              <Text style={[styles.content, { color: colors.textSecondary }]}>
                {content}
              </Text>

              {/* Action Buttons */}
              {(link || guideFile) && (
                <View style={styles.actionsContainer}>
                  {link && (
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: colors.primary }]}
                      onPress={handleOpenLink}
                      activeOpacity={0.8}
                    >
                      <IconSymbol
                        ios_icon_name="link"
                        android_material_icon_name="link"
                        size={20}
                        color="#FFFFFF"
                      />
                      <Text style={styles.actionButtonText}>View More Information</Text>
                    </TouchableOpacity>
                  )}
                  
                  {guideFile && (
                    <View style={styles.fileActionsContainer}>
                      <Text style={[styles.fileLabel, { color: colors.text }]}>
                        Attached File: {guideFile.file_name}
                      </Text>
                      <View style={styles.fileButtons}>
                        <TouchableOpacity
                          style={[styles.fileButton, { backgroundColor: colors.primary }]}
                          onPress={handleViewFile}
                          activeOpacity={0.8}
                        >
                          <IconSymbol
                            ios_icon_name="eye.fill"
                            android_material_icon_name="visibility"
                            size={20}
                            color="#FFFFFF"
                          />
                          <Text style={styles.fileButtonText}>View</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          style={[styles.fileButton, { backgroundColor: colors.primary }]}
                          onPress={handleDownloadFile}
                          activeOpacity={0.8}
                        >
                          <IconSymbol
                            ios_icon_name="arrow.down.circle.fill"
                            android_material_icon_name="download"
                            size={20}
                            color="#FFFFFF"
                          />
                          <Text style={styles.fileButtonText}>Download</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Extra padding at bottom to ensure content is fully scrollable */}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </PanGestureHandler>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'android' ? 20 : 0,
    boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.3)',
    elevation: 10,
  },
  swipeIndicatorContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  swipeIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  scrollView: {
    maxHeight: Dimensions.get('window').height * 0.8,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  imageContainer: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  squareImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
  },
  bannerImage: {
    width: '100%',
    height: 250,
    borderRadius: 16,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  dateTimeContainer: {
    marginBottom: 16,
    gap: 8,
  },
  dateTimeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateTimeLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  dateTimeText: {
    fontSize: 14,
    flex: 1,
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  actionsContainer: {
    gap: 16,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 10,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.2)',
    elevation: 3,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  fileActionsContainer: {
    gap: 12,
  },
  fileLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  fileButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  fileButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.2)',
    elevation: 3,
  },
  fileButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
