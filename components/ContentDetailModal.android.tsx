
import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
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
  console.log('ContentDetailModal (Android) rendering with:', {
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

  // Helper function to get image URL with cache busting (same as cocktails-az.tsx)
  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  };

  const startDateTimeFormatted = formatDateTime(startDateTime || null);
  const endDateTimeFormatted = formatDateTime(endDateTime || null);
  const priorityColor = priority ? getPriorityColor(priority) : colors.textSecondary;
  const priorityUpperCase = priority ? priority.toUpperCase() : '';
  const imageUrl = getImageUrl(thumbnailUrl || null);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={28}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={true}
          >
            {imageUrl && (
              <Image
                source={{ uri: imageUrl }}
                style={
                  thumbnailShape === 'square'
                    ? styles.squareImage
                    : styles.bannerImage
                }
                resizeMode="cover"
              />
            )}

            {priority && (
              <View style={styles.detailSection}>
                <View style={[styles.priorityBadge, { backgroundColor: priorityColor }]}>
                  <Text style={styles.priorityText}>{priorityUpperCase}</Text>
                </View>
              </View>
            )}

            {(startDateTime || endDateTime) && (
              <View style={styles.detailSection}>
                {startDateTime && (
                  <View style={styles.dateTimeRow}>
                    <IconSymbol
                      ios_icon_name="calendar"
                      android_material_icon_name="event"
                      size={16}
                      color={colors.primary}
                    />
                    <Text style={[styles.dateTimeLabel, { color: colors.textSecondary }]}>Start:</Text>
                    <Text style={[styles.dateTimeText, { color: colors.text }]}>
                      {startDateTimeFormatted}
                    </Text>
                  </View>
                )}
                {endDateTime && (
                  <View style={styles.dateTimeRow}>
                    <IconSymbol
                      ios_icon_name="clock"
                      android_material_icon_name="schedule"
                      size={16}
                      color={colors.primary}
                    />
                    <Text style={[styles.dateTimeLabel, { color: colors.textSecondary }]}>End:</Text>
                    <Text style={[styles.dateTimeText, { color: colors.text }]}>
                      {endDateTimeFormatted}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.detailSection}>
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>{content}</Text>
            </View>

            {link && (
              <View style={styles.detailSection}>
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
              </View>
            )}

            {guideFile && (
              <View style={styles.detailSection}>
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
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    marginTop: 'auto',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  squareImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    marginBottom: 24,
  },
  bannerImage: {
    width: '100%',
    height: 250,
    borderRadius: 16,
    marginBottom: 24,
  },
  detailSection: {
    marginBottom: 24,
  },
  priorityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  priorityText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dateTimeLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  dateTimeText: {
    fontSize: 14,
    flex: 1,
  },
  detailText: {
    fontSize: 15,
    lineHeight: 24,
    whiteSpace: 'pre-line',
  },
  fileLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  fileButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
