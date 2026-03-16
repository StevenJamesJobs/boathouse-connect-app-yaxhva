import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Image,
  FlatList,
  Dimensions,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewStyle,
  Text,
} from 'react-native';

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

  const imageStyle = thumbnailShape === 'square'
    ? { width: itemWidth, aspectRatio: 1, borderRadius: 16 }
    : { width: itemWidth, height: 250, borderRadius: 16 };

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <Image
        source={{ uri: item }}
        style={imageStyle as any}
        resizeMode="cover"
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
        <Image
          source={{ uri: images[0] }}
          style={
            thumbnailShape === 'square'
              ? styles.squareImage
              : styles.bannerImage
          }
          resizeMode="cover"
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
              index === activeIndex ? styles.dotActive : styles.dotInactive,
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
    borderRadius: 16,
  },
  bannerImage: {
    width: '100%',
    height: 250,
    borderRadius: 16,
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
    backgroundColor: '#D4A843',
    width: 24,
    borderRadius: 4,
  },
  dotInactive: {
    backgroundColor: 'rgba(150, 150, 150, 0.4)',
  },
  counterBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
