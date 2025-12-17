
import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { IconSymbol } from '@/components/IconSymbol';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';

interface ContentDetailModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  content: string;
  thumbnailUrl?: string | null;
  thumbnailShape?: string;
  colors: {
    background: string;
    text: string;
    textSecondary: string;
    primary: string;
    card: string;
    highlight: string;
    border: string;
  };
}

export default function ContentDetailModal({
  visible,
  onClose,
  title,
  content,
  thumbnailUrl,
  thumbnailShape,
  colors,
}: ContentDetailModalProps) {
  const handleSwipeGesture = (event: any) => {
    const { translationY } = event.nativeEvent;
    if (translationY > 100) {
      onClose();
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
        <PanGestureHandler onGestureEvent={handleSwipeGesture}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {/* Swipe Indicator */}
            <View style={styles.swipeIndicatorContainer}>
              <View style={[styles.swipeIndicator, { backgroundColor: colors.border }]} />
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

            {/* Content */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
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

              {/* Title */}
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

              {/* Content */}
              <Text style={[styles.content, { color: colors.textSecondary }]}>
                {content}
              </Text>
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
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: Dimensions.get('window').height * 0.85,
    paddingBottom: 20,
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
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    lineHeight: 32,
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
  },
});
