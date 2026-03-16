import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Dimensions, Image } from "react-native";

const splashImage = require("../assets/images/MarchMadnessSplashScreen.jpg");
const { width, height } = Dimensions.get("screen");

interface AnimatedSplashProps {
  onFinish: () => void;
}

export default function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFinish();
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={[styles.container, { opacity: fadeAnim }]}
      pointerEvents="none"
    >
      <Image source={splashImage} style={styles.image} resizeMode="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
    backgroundColor: "#1a3a5c",
  },
  image: {
    width,
    height,
  },
});
