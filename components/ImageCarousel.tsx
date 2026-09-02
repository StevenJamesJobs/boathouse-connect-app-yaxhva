import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  Dimensions,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewStyle,
  Text,
} from 'react-native';
import { StorageExpoImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

// A fixed-dark scrim over a photo (not themed on purpose — it sits on the image,
// never on the page ground), with white text on it.
const COUNTER_SCRIM = 'rgba(8,10,14,0.55)';
const COUNTER_TEXT = '#FFFFFF';

interface ImageCarouselProps {
  images: string[];
  thumbnailShape?: string;
  style?: ViewStyle;
  width?: number;
}

export default function ImageCarousel({
  images,
  thumbnailShape,
  style,
  width: propWidth,
}: ImageCarouselProps) {
  const colors = useThemeColors();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  // Use provided width or calculate from window minus modal padding (20px each side)
  const itemWidth = propWidth || Dimensions.get('window').width - 40;

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / itemWidth);
      setActiveIndex(index);
    },
    [itemWidth]
  );

  const imageStyle = useMemo(
    () =>
      thumbnailShape === 'square'
        ? { width: itemWidth, aspectRatio: 1, borderRadius: 13, backgroundColor: colors.thumbPlaceholder }
        : { width: itemWidth, height: 250, borderRadius: 13, backgroundColor: colors.thumbPlaceholder },
    [thumbnailShape, itemWidth, colors.thumbPlaceholder]
  );

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <StorageExpoImage
        source={item}
        style={imageStyle as any}
        contentFit="cover"
      />
    ),
    [imageStyle]
  );

  const keyExtractor = useCallback(
    (item: string, index: number) => `carousel-${index}-${item}`,
    []
  );

  if (images.length === 0) return null;

  // Single image - just render it directly (no carousel overhead)
  if (images.length === 1) {
    return (
      <View style={[styles.container, style]}>
        <StorageExpoImage
          source={images[0]}
          style={[
            thumbnailShape === 'square' ? styles.squareImage : styles.bannerImage,
            { backgroundColor: colors.thumbPlaceholder },
          ]}
          contentFit="cover"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <FlatList
        ref={flatListRef}
        data={images}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        snapToInterval={itemWidth}
        decelerationRate="fast"
        bounces={false}
        nestedScrollEnabled
        getItemLayout={(_, index) => ({
          length: itemWidth,
          offset: itemWidth * index,
          index,
        })}
      />
      {/* Pagination dots */}
      <View style={styles.paginationContainer}>
        {images.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index === activeIndex
                ? [styles.dotActive, { backgroundColor: colors.primary }]
                : { backgroundColor: colors.glassBorder },
            ]}
          />
        ))}
      </View>
      {/* Image counter badge */}
      <View style={styles.counterBadge}>
        <Text style={styles.counterText}>
          {activeIndex + 1} / {images.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  squareImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 13,
  },
  bannerImage: {
    width: '100%',
    height: 250,
    borderRadius: 13,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    borderRadius: 4,
  },
  counterBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: COUNTER_SCRIM,
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  counterText: {
    fontFamily: fonts.mono.semibold,
    color: COUNTER_TEXT,
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
