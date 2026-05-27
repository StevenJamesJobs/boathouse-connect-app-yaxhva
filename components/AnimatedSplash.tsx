import React, { useEffect, useRef, useCallback } from "react";
import {
  Animated as RNAnimated,
  StyleSheet,
  Dimensions,
  View,
  Text,
} from "react-native";
import { Image } from "expo-image";
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { IS_MCLOONES } from "@/constants/buildVariant";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ─── McLoone's seasonal splash assets ───
const mcloonesImage = require("../assets/images/MayMotherDaySplashScreen.png");

// ─── MyResto Connect logo assets (SVG via expo-image) ───
const charcoalLogo = require("../assets/images/MyRestoCharcoalLogo.svg");

interface AnimatedSplashProps {
  onFinish: () => void;
}

// ─── TIMING CONFIG for MyResto animated splash ───
const TIMING = {
  initialDelay: 200,
  textFlyIn: 700,
  connectFlyIn: 700,
  connectOffset: 350,
  logoDelay: 200,
  logoWheelIn: 1100,
  holdDuration: 600,
  fadeOut: 700,
};

const LOGO_ROTATIONS = 2;

// ═══════════════════════════════════════════════════════════
// McLoone's variant — simple seasonal image with fade
// ═══════════════════════════════════════════════════════════

function McLoonesSplash({ onFinish }: AnimatedSplashProps) {
  const fadeAnim = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      RNAnimated.timing(fadeAnim, {
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
    <RNAnimated.View
      style={[styles.container, styles.mcloonesContainer, { opacity: fadeAnim }]}
      pointerEvents="none"
    >
      <Image
        source={mcloonesImage}
        style={styles.mcloonesImage}
        contentFit="cover"
      />
    </RNAnimated.View>
  );
}

// ═══════════════════════════════════════════════════════════
// MyResto Connect variant — animated text + logo wheel-in
// ═══════════════════════════════════════════════════════════

function MyRestoSplash({ onFinish }: AnimatedSplashProps) {
  const LOGO_SIZE = SCREEN_W * 0.22;
  const LOGO_END_X = -(SCREEN_W * 0.18);
  const LOGO_START_X = -(SCREEN_W * 0.5 + LOGO_SIZE);
  const TEXT_FLY_DISTANCE = SCREEN_H * 0.4;

  const myrestoY = useSharedValue(-TEXT_FLY_DISTANCE);
  const myrestoOpacity = useSharedValue(0);
  const connectY = useSharedValue(TEXT_FLY_DISTANCE);
  const connectOpacity = useSharedValue(0);
  const logoX = useSharedValue(LOGO_START_X);
  const logoOpacity = useSharedValue(0);
  const logoRotation = useSharedValue(0);
  const whiteOverlay = useSharedValue(0);

  const handleFinish = useCallback(() => {
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    const T = TIMING;
    const d = T.initialDelay;

    // Phase 1: MyResto flies in from top
    myrestoOpacity.value = withDelay(
      d,
      withTiming(1, { duration: T.textFlyIn, easing: Easing.out(Easing.cubic) })
    );
    myrestoY.value = withDelay(
      d,
      withTiming(0, { duration: T.textFlyIn, easing: Easing.out(Easing.cubic) })
    );

    // Phase 2: CONNECT flies in from bottom (overlaps)
    const connectStart = d + T.connectOffset;
    connectOpacity.value = withDelay(
      connectStart,
      withTiming(1, {
        duration: T.connectFlyIn,
        easing: Easing.out(Easing.cubic),
      })
    );
    connectY.value = withDelay(
      connectStart,
      withTiming(0, {
        duration: T.connectFlyIn,
        easing: Easing.out(Easing.cubic),
      })
    );

    // Phase 3: Logo wheels in from left
    const textDoneAt =
      d + Math.max(T.textFlyIn, T.connectOffset + T.connectFlyIn);
    const logoStart = textDoneAt + T.logoDelay;

    logoOpacity.value = withDelay(
      logoStart,
      withTiming(1, { duration: T.logoWheelIn * 0.4 })
    );
    logoX.value = withDelay(
      logoStart,
      withSpring(LOGO_END_X, {
        damping: 14,
        stiffness: 70,
        mass: 1,
        overshootClamping: false,
      })
    );
    logoRotation.value = withDelay(
      logoStart,
      withTiming(LOGO_ROTATIONS * 360, {
        duration: T.logoWheelIn,
        easing: Easing.out(Easing.cubic),
      })
    );

    // Phase 4: Hold, then fade to white
    const logoSettled = logoStart + T.logoWheelIn;
    const fadeStart = logoSettled + T.holdDuration;
    whiteOverlay.value = withDelay(
      fadeStart,
      withTiming(1, {
        duration: T.fadeOut,
        easing: Easing.inOut(Easing.cubic),
      })
    );

    // Phase 5: Callback when done
    const totalDuration = fadeStart + T.fadeOut + 100;
    const timer = setTimeout(() => {
      handleFinish();
    }, totalDuration);

    return () => clearTimeout(timer);
  }, []);

  const myrestoStyle = useAnimatedStyle(() => ({
    opacity: myrestoOpacity.value,
    transform: [{ translateY: myrestoY.value }],
  }));

  const connectStyle = useAnimatedStyle(() => ({
    opacity: connectOpacity.value,
    transform: [{ translateY: connectY.value }],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [
      { translateX: logoX.value },
      { rotate: `${logoRotation.value}deg` },
    ],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: whiteOverlay.value,
  }));

  return (
    <View style={[styles.container, styles.myrestoContainer]} pointerEvents="none">
      <View style={styles.horizontalContent}>
        <ReAnimated.View style={[styles.logoWrap, logoStyle]}>
          <Image
            source={charcoalLogo}
            style={{ width: LOGO_SIZE, height: LOGO_SIZE }}
            contentFit="contain"
          />
        </ReAnimated.View>

        <View style={styles.horizontalTextBlock}>
          <ReAnimated.Text style={[styles.myrestoText, myrestoStyle]}>
            MyResto
          </ReAnimated.Text>
          <ReAnimated.Text style={[styles.connectText, connectStyle]}>
            CONNECT
          </ReAnimated.Text>
        </View>
      </View>

      <ReAnimated.View
        style={[styles.whiteOverlay, overlayStyle]}
        pointerEvents="none"
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// Export — picks variant at build time
// ═══════════════════════════════════════════════════════════

export default function AnimatedSplash(props: AnimatedSplashProps) {
  if (IS_MCLOONES) {
    return <McLoonesSplash {...props} />;
  }
  return <MyRestoSplash {...props} />;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  mcloonesContainer: {
    backgroundColor: "#87CEEB",
  },
  myrestoContainer: {
    backgroundColor: "#FFFFFF",
  },
  mcloonesImage: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  horizontalContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  horizontalTextBlock: {
    marginLeft: 12,
  },
  myrestoText: {
    fontSize: 34,
    fontWeight: "800",
    color: "#1F2233",
  },
  connectText: {
    fontSize: 16,
    fontWeight: "400",
    color: "#1F2233",
    letterSpacing: 4,
  },
  logoWrap: {},
  whiteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
  },
});
