
import React from 'react';
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
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';

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
  colors,
}: ContentDetailModalProps) {
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
  },
  linkButtonText: {
    fontSize: 16,
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
