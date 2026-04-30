import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const DEFAULT_COLORS = ['#F8C8DC', '#F4A6C5', '#FCD9E8', '#E89BB7', '#FBE0EC'];
const DEFAULT_COUNT = 22;
const TOTAL_DURATION_MS = 5000;

interface PetalProps {
  startX: number;
  delay: number;
  fallDuration: number;
  swayMagnitude: number;
  size: number;
  color: string;
  rotationStart: number;
  rotationEnd: number;
}

function Petal({
  startX,
  delay,
  fallDuration,
  swayMagnitude,
  size,
  color,
  rotationStart,
  rotationEnd,
}: PetalProps) {
  const fall = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fall, {
      toValue: 1,
      duration: fallDuration,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);

  const translateY = fall.interpolate({
    inputRange: [0, 1],
    outputRange: [-size * 2, SCREEN_HEIGHT + size],
  });

  const translateX = fall.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, swayMagnitude, 0, -swayMagnitude, 0],
  });

  const rotate = fall.interpolate({
    inputRange: [0, 1],
    outputRange: [`${rotationStart}deg`, `${rotationEnd}deg`],
  });

  const opacity = fall.interpolate({
    inputRange: [0, 0.1, 0.8, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      style={[
        styles.petal,
        {
          left: startX,
          width: size,
          height: size * 1.4,
          backgroundColor: color,
          borderTopLeftRadius: size * 0.8,
          borderTopRightRadius: size * 0.2,
          borderBottomLeftRadius: size * 0.2,
          borderBottomRightRadius: size * 0.8,
          opacity,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    />
  );
}

interface FallingPetalsProps {
  colors?: string[];
  count?: number;
  onComplete?: () => void;
}

export default function FallingPetals({
  colors = DEFAULT_COLORS,
  count = DEFAULT_COUNT,
  onComplete,
}: FallingPetalsProps) {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setActive(false);
      onComplete?.();
    }, TOTAL_DURATION_MS + 800);
    return () => clearTimeout(timer);
  }, []);

  const petals = useRef(
    Array.from({ length: count }).map((_, i) => ({
      startX: Math.random() * (SCREEN_WIDTH - 24),
      delay: Math.random() * 1500,
      fallDuration: 4000 + Math.random() * 3000,
      swayMagnitude: 20 + Math.random() * 40,
      size: 10 + Math.random() * 8,
      color: colors[i % colors.length],
      rotationStart: Math.random() * 360,
      rotationEnd: Math.random() * 720 - 360,
    }))
  ).current;

  if (!active) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {petals.map((p, i) => (
        <Petal key={i} {...p} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  petal: {
    position: 'absolute',
    top: 0,
  },
});
