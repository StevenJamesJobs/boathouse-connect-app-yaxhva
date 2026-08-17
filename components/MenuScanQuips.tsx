import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, TextStyle, StyleProp } from 'react-native';
import { useTranslation } from 'react-i18next';

/**
 * ScanQuip — the rotating one-liner shown while the AI reads a menu (s72,
 * Steve's list). Shared by the AI Menu Upload page's scanning banner and
 * MenuUploadSheet's processing row, so the joke timing stays identical.
 *
 * Starts on a RANDOM line (repeat uploads shouldn't always open on burritos),
 * advances every 5.5s (Steve's 5–6s spec) with a soft cross-fade. The keys are
 * spelled out literally so the i18n harvester sees every reference.
 */
const ROTATE_MS = 5500;
const FADE_MS = 250;

export default function ScanQuip({ style }: { style?: StyleProp<TextStyle> }) {
  const { t } = useTranslation();
  const quips = useMemo(
    () => [
      t('menu_upload.quip_burrito', 'Teaching AI what a burrito looks like...'),
      t('menu_upload.quip_download', 'Downloading culinary intelligence...'),
      t('menu_upload.quip_matrix', 'Matrixing your mozzarella...'),
      t('menu_upload.quip_carbs', 'Resolving conflicts between carbs and proteins...'),
      t('menu_upload.quip_handwriting', "Translating chef's handwriting into English..."),
      t('menu_upload.quip_tastebuds', 'Calibrating the digital tastebuds...'),
      t('menu_upload.quip_pretending', 'Pretending to work very hard...'),
      t('menu_upload.quip_judging', 'Reading your menu (and judging your prices)...'),
      t('menu_upload.quip_bytes', 'Adding extra bytes of flavor...'),
      t('menu_upload.quip_typos', "Finding the typos so you don't have to..."),
      t('menu_upload.quip_staring', 'Staring intensely at your appetizers...'),
      t('menu_upload.quip_chopping', 'Chopping data into bite-sized pieces...'),
      t('menu_upload.quip_preheating', 'Preheating the neural network...'),
      t('menu_upload.quip_whisking', 'Whisking pixels into data...'),
      t('menu_upload.quip_marinating', 'Marinating the text for better flavor...'),
      t('menu_upload.quip_shuffling', 'Shuffling the ingredients...'),
      t('menu_upload.quip_drool', 'Trying not to drool on the motherboard...'),
      t('menu_upload.quip_spicy', 'Calculating the exact definition of "spicy"...'),
      t('menu_upload.quip_arguing', 'Arguing with the server about calorie counts...'),
      t('menu_upload.quip_panic', "Don't panic, the AI is just hungry..."),
      t('menu_upload.quip_sauce', 'Locating the secret sauce...'),
      t('menu_upload.quip_sweating', 'Sweating over your dessert section...'),
    ],
    [t]
  );

  const [idx, setIdx] = useState(() => Math.floor(Math.random() * 22));
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
        setIdx((i) => (i + 1) % quips.length);
        Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      });
    }, ROTATE_MS);
    return () => clearInterval(interval);
  }, [opacity, quips.length]);

  return (
    <Animated.Text style={[style, { opacity }]} numberOfLines={2}>
      {quips[idx % quips.length]}
    </Animated.Text>
  );
}
