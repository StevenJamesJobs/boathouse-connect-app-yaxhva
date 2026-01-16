
import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { IconSymbol } from '@/components/IconSymbol';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';

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
  console.log('ContentDetailModal (Android - Simplified) rendering with:', {
    visible,
    title,
    hasThumbnail: !!thumbnailUrl,
    thumbnailShape,
  });

  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return null;
    try {
      const date = new Date(dateTime);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateTime;
    }
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
      
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Not Available', 'Sharing is not available on this device. Please use the View button to open the file.');
        return;
      }

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

  // Simple swipe gesture handler - same as WeatherDetailModal
  const handleSwipeGesture = (event: any) => {
    try {
      if (event.nativeEvent.state === State.END) {
        const { translationY } = event.nativeEvent;
        if (translationY > 100) {
          console.log('Swipe down detected, closing modal');
          onClose();
        }
      }
    } catch (error) {
      console.error('Error handling swipe gesture:', error);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <GestureHandlerRootView style={styles.modalOverlay}>
        <TouchableOpacity 
          style={styles.modalBackdrop} 
          activeOpacity={1} 
          onPress={onClose}
        />
        <PanGestureHandler onHandlerStateChange={handleSwipeGesture}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {/* Swipe Indicator */}
            <View style={styles.swipeIndicatorContainer}>
              <View style={[styles.swipeIndicator, { backgroundColor: colors.border || colors.textSecondary }]} />
            </View>

            {/* Close Button */}
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={onClose}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={32}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {/* Content - Simple ScrollView without parallax */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Compact Header with Thumbnail and Title */}
              <View style={styles.headerSection}>
                {/* Small Thumbnail in Corner */}
                {thumbnailUrl && (
                  <View style={styles.thumbnailContainer}>
                    <Image
                      source={{ uri: thumbnailUrl }}
                      style={styles.thumbnailImage}
                      contentFit="cover"
                      transition={200}
                      cachePolicy="memory-disk"
                      placeholder={require('@/assets/images/natively-dark.png')}
                      placeholderContentFit="cover"
                    />
                  </View>
                )}

                {/* Title and Meta Info */}
                <View style={styles.headerInfo}>
                  <View style={styles.titleContainer}>
                    <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                      {title}
                    </Text>
                    {priority && (
                      <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(priority) }]}>
                        <Text style={styles.priorityText}>{priority.toUpperCase()}</Text>
                      </View>
                    )}
                  </View>

                  {/* Date/Time Information - Compact */}
                  {(startDateTime || endDateTime) && (
                    <View style={styles.dateTimeContainer}>
                      {startDateTime && (
                        <View style={styles.dateTimeItem}>
                          <IconSymbol
                            ios_icon_name="calendar"
                            android_material_icon_name="event"
                            size={14}
                            color={colors.primary}
                          />
                          <Text style={[styles.dateTimeText, { color: colors.textSecondary }]} numberOfLines={1}>
                            {formatDateTime(startDateTime)}
                          </Text>
                        </View>
                      )}
                      {endDateTime && (
                        <View style={styles.dateTimeItem}>
                          <IconSymbol
                            ios_icon_name="clock"
                            android_material_icon_name="schedule"
                            size={14}
                            color={colors.primary}
                          />
                          <Text style={[styles.dateTimeText, { color: colors.textSecondary }]} numberOfLines={1}>
                            {formatDateTime(endDateTime)}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>

              {/* Separator */}
              <View style={[styles.separator, { backgroundColor: colors.border || '#E8EAED' }]} />

              {/* Action Buttons - Compact */}
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
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.actionButtonText}>View More</Text>
                    </TouchableOpacity>
                  )}
                  
                  {guideFile && (
                    <>
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: colors.primary }]}
                        onPress={handleViewFile}
                        activeOpacity={0.8}
                      >
                        <IconSymbol
                          ios_icon_name="eye.fill"
                          android_material_icon_name="visibility"
                          size={18}
                          color="#FFFFFF"
                        />
                        <Text style={styles.actionButtonText}>View</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: colors.primary }]}
                        onPress={handleDownloadFile}
                        activeOpacity={0.8}
                      >
                        <IconSymbol
                          ios_icon_name="arrow.down.circle.fill"
                          android_material_icon_name="download"
                          size={18}
                          color="#FFFFFF"
                        />
                        <Text style={styles.actionButtonText}>Download</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}

              {/* Separator */}
              {(link || guideFile) && (
                <View style={[styles.separator, { backgroundColor: colors.border || '#E8EAED' }]} />
              )}

              {/* Content - Full Description */}
              <View style={styles.contentSection}>
                <Text style={[styles.content, { color: colors.textSecondary }]}>
                  {content}
                </Text>
              </View>

              {/* Bottom Padding */}
              <View style={styles.bottomPadding} />
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
    height: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
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
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headerSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  thumbnailContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F0F0F0',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  headerInfo: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 26,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  dateTimeContainer: {
    gap: 6,
  },
  dateTimeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateTimeText: {
    fontSize: 12,
    flex: 1,
  },
  separator: {
    height: 1,
    marginVertical: 16,
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 6,
    elevation: 2,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  contentSection: {
    marginTop: 8,
  },
  content: {
    fontSize: 15,
    lineHeight: 24,
  },
  bottomPadding: {
    height: 60,
  },
});
