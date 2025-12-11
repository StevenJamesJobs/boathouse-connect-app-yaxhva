
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Linking,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

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
  guideFile?: {
    id: string;
    title: string;
    file_url: string;
    file_name: string;
    file_type: string;
  } | null;
  colors: {
    text: string;
    textSecondary: string;
    card: string;
    primary: string;
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
  const [downloadingFile, setDownloadingFile] = useState(false);
  const [viewingFile, setViewingFile] = useState(false);

  const handleSwipeGesture = (event: any) => {
    const { translationY } = event.nativeEvent;
    if (translationY > 100) {
      onClose();
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

  const getPriorityColor = (priorityLevel: string) => {
    switch (priorityLevel) {
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

  const handleLinkPress = async () => {
    if (!link) return;
    
    try {
      const canOpen = await Linking.canOpenURL(link);
      if (canOpen) {
        await Linking.openURL(link);
      } else {
        Alert.alert('Error', 'Cannot open this link');
      }
    } catch (error) {
      console.error('Error opening link:', error);
      Alert.alert('Error', 'Failed to open link');
    }
  };

  const handleViewFile = async () => {
    if (!guideFile) return;

    try {
      setViewingFile(true);
      console.log('Opening file:', guideFile.file_name);

      const canOpen = await Linking.canOpenURL(guideFile.file_url);
      if (canOpen) {
        await Linking.openURL(guideFile.file_url);
      } else {
        Alert.alert('Error', 'Cannot open this file type');
      }
    } catch (error) {
      console.error('Error viewing file:', error);
      Alert.alert('Error', 'Failed to open file');
    } finally {
      setViewingFile(false);
    }
  };

  const handleDownloadFile = async () => {
    if (!guideFile) return;

    try {
      setDownloadingFile(true);
      console.log('Starting download for:', guideFile.file_name);

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = guideFile.file_url;
        link.download = guideFile.file_name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert('Success', 'File download started');
        setDownloadingFile(false);
        return;
      }

      console.log('Downloading from URL:', guideFile.file_url);
      
      const downloadsDir = new Directory(Paths.cache, 'downloads');
      console.log('Downloads directory path:', downloadsDir.uri);
      
      if (!downloadsDir.exists) {
        console.log('Creating downloads directory...');
        try {
          downloadsDir.create({ intermediates: true });
          console.log('Downloads directory created successfully');
        } catch (createError: any) {
          console.error('Error creating downloads directory:', createError);
          throw new Error(`Failed to create downloads directory: ${createError.message}`);
        }
      }

      const fileExtension = guideFile.file_name.includes('.') 
        ? guideFile.file_name.substring(guideFile.file_name.lastIndexOf('.'))
        : '';
      const fileNameWithoutExt = guideFile.file_name.includes('.')
        ? guideFile.file_name.substring(0, guideFile.file_name.lastIndexOf('.'))
        : guideFile.file_name;
      
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const uniqueFileName = `${fileNameWithoutExt}_${timestamp}_${randomString}${fileExtension}`;
      
      console.log('Generated unique filename:', uniqueFileName);

      const destinationFile = new File(downloadsDir, uniqueFileName);
      console.log('Destination file path:', destinationFile.uri);

      if (destinationFile.exists) {
        console.log('Destination file already exists, deleting...');
        try {
          destinationFile.delete();
          console.log('Existing file deleted successfully');
        } catch (deleteError: any) {
          console.error('Error deleting existing file:', deleteError);
        }
      }

      console.log('Starting file download...');
      let downloadedFile: File;
      try {
        downloadedFile = await File.downloadFileAsync(
          guideFile.file_url,
          destinationFile
        );
        console.log('File downloaded successfully to:', downloadedFile.uri);
      } catch (downloadError: any) {
        console.error('Download error:', downloadError);
        console.error('Download error code:', downloadError.code);
        console.error('Download error message:', downloadError.message);
        
        if (downloadError.message?.includes('already exists')) {
          throw new Error('File already exists. Please try again.');
        } else if (downloadError.message?.includes('network')) {
          throw new Error('Network error. Please check your connection and try again.');
        } else if (downloadError.message?.includes('permission')) {
          throw new Error('Permission denied. Please check app permissions.');
        } else {
          throw new Error(`Download failed: ${downloadError.message || 'Unknown error'}`);
        }
      }

      console.log('Verifying downloaded file...');
      if (!downloadedFile.exists) {
        throw new Error('Downloaded file does not exist after download');
      }

      const fileSize = downloadedFile.size;
      console.log('Downloaded file size:', fileSize, 'bytes');
      
      if (fileSize === 0) {
        throw new Error('Downloaded file is empty');
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        console.log('Opening share dialog...');
        await Sharing.shareAsync(downloadedFile.uri, {
          mimeType: guideFile.file_type || 'application/octet-stream',
          dialogTitle: `Save ${guideFile.file_name}`,
          UTI: guideFile.file_type || 'public.data',
        });
        Alert.alert(
          'Success', 
          `File "${guideFile.file_name}" is ready to save. Choose where to save it from the share menu.`
        );
      } else {
        Alert.alert(
          'Success', 
          `File downloaded successfully to:\n${downloadedFile.uri}\n\nFile size: ${(fileSize / 1024).toFixed(2)} KB`
        );
      }
    } catch (error: any) {
      console.error('ERROR Failed to download file:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack,
      });
      
      let errorMessage = 'Failed to download file. Please try again.';
      if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Download Error', errorMessage);
    } finally {
      setDownloadingFile(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.container}>
        <PanGestureHandler onGestureEvent={handleSwipeGesture}>
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.backdrop}
              activeOpacity={1}
              onPress={onClose}
            />
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              {/* Drag Handle */}
              <View style={styles.dragHandle} />

              {/* Close Button */}
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={32}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={true}
              >
                {/* Thumbnail Image */}
                {thumbnailUrl && (
                  <Image
                    source={{ uri: getImageUrl(thumbnailUrl) }}
                    style={[
                      thumbnailShape === 'square' ? styles.squareImage : styles.bannerImage,
                    ]}
                  />
                )}

                {/* Title with Priority Badge */}
                <View style={styles.titleContainer}>
                  <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                  {priority && (
                    <View
                      style={[
                        styles.priorityBadge,
                        { backgroundColor: getPriorityColor(priority) },
                      ]}
                    >
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
                          color={colors.textSecondary}
                        />
                        <Text style={[styles.dateTimeText, { color: colors.textSecondary }]}>
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
                          color={colors.textSecondary}
                        />
                        <Text style={[styles.dateTimeText, { color: colors.textSecondary }]}>
                          Ends: {formatDateTime(endDateTime)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Content */}
                <Text style={[styles.content, { color: colors.textSecondary }]}>{content}</Text>

                {/* Link Button */}
                {link && (
                  <TouchableOpacity 
                    style={[styles.linkButton, { borderColor: colors.primary }]} 
                    onPress={handleLinkPress}
                  >
                    <IconSymbol
                      ios_icon_name="link"
                      android_material_icon_name="link"
                      size={20}
                      color={colors.primary}
                    />
                    <Text style={[styles.linkButtonText, { color: colors.primary }]}>
                      View More Information
                    </Text>
                    <IconSymbol
                      ios_icon_name="arrow.up.right"
                      android_material_icon_name="open_in_new"
                      size={16}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                )}

                {/* Attached File Buttons */}
                {guideFile && (
                  <View style={styles.fileActionsContainer}>
                    <View style={styles.fileInfoContainer}>
                      <IconSymbol
                        ios_icon_name="doc.fill"
                        android_material_icon_name="description"
                        size={24}
                        color={colors.primary}
                      />
                      <View style={styles.fileInfoText}>
                        <Text style={[styles.fileInfoTitle, { color: colors.text }]}>
                          Attached File
                        </Text>
                        <Text style={[styles.fileInfoName, { color: colors.textSecondary }]}>
                          {guideFile.title}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.fileButtonsContainer}>
                      <TouchableOpacity
                        style={[styles.fileActionButton, { backgroundColor: colors.primary }]}
                        onPress={handleViewFile}
                        disabled={viewingFile}
                      >
                        {viewingFile ? (
                          <ActivityIndicator size="small" color={colors.text} />
                        ) : (
                          <>
                            <IconSymbol
                              ios_icon_name="eye.fill"
                              android_material_icon_name="visibility"
                              size={18}
                              color={colors.text}
                            />
                            <Text style={[styles.fileActionButtonText, { color: colors.text }]}>
                              View
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.fileActionButton,
                          styles.downloadButton,
                          { backgroundColor: colors.card, borderColor: colors.primary }
                        ]}
                        onPress={handleDownloadFile}
                        disabled={downloadingFile}
                      >
                        {downloadingFile ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <IconSymbol
                              ios_icon_name="arrow.down.circle.fill"
                              android_material_icon_name="download"
                              size={18}
                              color={colors.primary}
                            />
                            <Text style={[styles.fileActionButtonText, { color: colors.primary }]}>
                              Download
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Swipe Hint */}
              <View style={styles.swipeHintContainer}>
                <Text style={[styles.swipeHint, { color: colors.textSecondary }]}>
                  Swipe down to close
                </Text>
              </View>
            </View>
          </View>
        </PanGestureHandler>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    width: '100%',
    height: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    boxShadow: '0px -4px 30px rgba(0, 0, 0, 0.5)',
    elevation: 10,
    overflow: 'hidden',
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 56,
    paddingBottom: 80,
  },
  squareImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    marginBottom: 20,
    resizeMode: 'cover',
  },
  bannerImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    marginBottom: 20,
    resizeMode: 'cover',
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  dateTimeContainer: {
    gap: 8,
    marginBottom: 16,
  },
  dateTimeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateTimeText: {
    fontSize: 14,
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  linkButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  fileActionsContainer: {
    backgroundColor: 'rgba(52, 152, 219, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(52, 152, 219, 0.2)',
  },
  fileInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  fileInfoText: {
    flex: 1,
  },
  fileInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  fileInfoName: {
    fontSize: 13,
  },
  fileButtonsContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  fileActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
    borderRadius: 10,
  },
  downloadButton: {
    borderWidth: 2,
  },
  fileActionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  swipeHintContainer: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  swipeHint: {
    textAlign: 'center',
    fontSize: 12,
    opacity: 0.7,
  },
});
