import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Dimensions, Image } from "react-native";
import { IS_MCLOONES } from "@/constants/buildVariant";

const mcloonesImage = require("../assets/images/MayMotherDaySplashScreen.png");
// TODO: Replace with MyResto Connect charcoal splash when asset is ready
const publicImage = require("../assets/images/MayMotherDaySplashScreen.png");

const splashImage = IS_MCLOONES ? mcloonesImage : publicImage;
const splashBgColor = IS_MCLOONES ? "#87CEEB" : "#2E3B4E";
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
    }, 1250);

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
    backgroundColor: splashBgColor,
  },
  image: {
    width,
    height,
  },
});
