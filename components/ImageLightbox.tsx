import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { StorageExpoImage } from '@/components/StorageImage';
import { IconSymbol } from '@/components/IconSymbol';
import { fonts } from '@/constants/fonts';

/**
 * ImageLightbox — a full-screen photo viewer (s91 device round, Steve's ask
 * #2): any recipe photo opens here so a 2×2 crop or a tall cover can be seen
 * whole. Black ground, the photo CONTAINED, swipe between photos, pinch to
 * zoom (iOS — the ScrollView's native zoom; Android pans), a glass ✕, a
 * "2 / 4" counter. A tap on the photo closes it. Works in either orientation
 * (the Book reader is landscape).
 *
 * `images` are stored URLs or legacy bucket paths — StorageExpoImage resolves
 * them like everywhere else.
 */
export interface ImageLightboxProps {
  visible: boolean;
  images: string[];
  /** Which photo opens first. */
  index?: number;
  onClose: () => void;
}

const INK = 'rgba(255,255,255,0.92)';
const GLASS = 'rgba(255,255,255,0.14)';
const GLASS_BORDER = 'rgba(255,255,255,0.26)';

export default function ImageLightbox({ visible, images, index = 0, onClose }: ImageLightboxProps) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const count = images.length;
  const start = Math.max(0, Math.min(index, count - 1));
  const [page, setPage] = useState(start);
  useEffect(() => {
    if (visible) setPage(start);
  }, [visible, start]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPage(Math.max(0, Math.min(count - 1, Math.round(e.nativeEvent.contentOffset.x / width))));
    },
    [width, count],
  );

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <ScrollView
        style={{ width, height }}
        contentContainerStyle={{ width, height }}
        maximumZoomScale={3}
        minimumZoomScale={1}
        bouncesZoom
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onClose} style={{ width, height }} accessibilityRole="imagebutton" accessibilityLabel={t('common.close')}>
          <StorageExpoImage source={item} style={{ width, height }} contentFit="contain" transition={120} />
        </Pressable>
      </ScrollView>
    ),
    [width, height, onClose, t],
  );

  if (count === 0) return null;
  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <View style={styles.root}>
        <FlatList
          // Remount on a size change (rotation) so the paging offsets realign.
          key={`${width}x${height}`}
          data={images}
          renderItem={renderItem}
          keyExtractor={(u, i) => `${i}-${u}`}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          initialScrollIndex={start}
          initialNumToRender={2}
          windowSize={3}
        />
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={[styles.close, { top: Math.max(insets.top, 12) + 6, right: Math.max(insets.right, 12) + 6 }]}
        >
          <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={16} color={INK} />
        </Pressable>
        {count > 1 && (
          <View style={[styles.counter, { bottom: Math.max(insets.bottom, 12) + 8 }]} pointerEvents="none">
            <Text style={styles.counterText}>{page + 1} / {count}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  close: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GLASS,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: GLASS_BORDER,
  },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: GLASS,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: GLASS_BORDER,
  },
  counterText: { fontFamily: fonts.mono.semibold, fontSize: 11, letterSpacing: 0.6, color: INK },
});
