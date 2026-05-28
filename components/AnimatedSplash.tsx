import React, { useEffect, useCallback } from "react";
import {
  StyleSheet,
  Dimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { IS_MCLOONES } from "@/constants/buildVariant";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ─── McLoone's Boathouse splash assets ───
const boathouseSailboat = require("../assets/images/BoathouseSailboat.svg");
const boathouseWave = require("../assets/images/BoathouseWave.svg");

// ─── MyResto Connect logo assets (SVG via expo-image) ───
const charcoalLogo = require("../assets/images/MyRestoAppClipCharcoalPlate.svg");

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

// ─── McLoone's Boathouse timing + colors ───
const BH_TIMING = {
  initialDelay: 200,
  wavesFadeIn: 600,
  sailFadeIn: 700,
  sailOffset: 300,
  birdsOffset: 800,
  birdsDuration: 5500,
  splashAt: 3200,
  splashDuration: 800,
  textAfterSplash: 100,
  textStagger: 80,
  holdDuration: 1400,
  fadeOut: 700,
};

const BH_COLORS = {
  sailBlue: "#A9CEF4",
  navyBlue: "#153664",
  textDark: "#010205",
  white: "#FFFFFF",
};

const SAIL_SIZE = SCREEN_W * 0.45;

// ═══════════════════════════════════════════════════════════
// McLoone's variant — animated sailboat splash
// ═══════════════════════════════════════════════════════════

function McLoonesSplash({ onFinish }: AnimatedSplashProps) {
  const wavesOpacity = useSharedValue(0);
  const waveOffset1 = useSharedValue(0);
  const waveOffset2 = useSharedValue(0);

  const sailOpacity = useSharedValue(0);
  const sailRotation = useSharedValue(0);
  const sailBobY = useSharedValue(0);

  const birdsOpacity = useSharedValue(0);
  const birdsX = useSharedValue(-SCREEN_W * 0.3);
  const wingFlap1 = useSharedValue(1);
  const wingFlap2 = useSharedValue(1);
  const wingFlap3 = useSharedValue(1);
  const wingFlap4 = useSharedValue(1);

  const splashOpacity = useSharedValue(0);

  const mcloonesScale = useSharedValue(0.3);
  const mcloonesOpacity = useSharedValue(0);
  const mcloonesTranslateY = useSharedValue(60);

  const boathouseScale = useSharedValue(0.3);
  const boathouseOpacity = useSharedValue(0);
  const boathouseTranslateY = useSharedValue(50);

  const bhConnectScale = useSharedValue(0.3);
  const bhConnectOpacity = useSharedValue(0);
  const bhConnectTranslateY = useSharedValue(40);

  const whiteOverlay = useSharedValue(0);

  const handleFinish = useCallback(() => {
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    const T = BH_TIMING;
    const d = T.initialDelay;

    // Waves
    wavesOpacity.value = withDelay(d,
      withTiming(0.9, { duration: T.wavesFadeIn, easing: Easing.out(Easing.cubic) })
    );
    waveOffset1.value = withDelay(d, withRepeat(
      withSequence(
        withTiming(15, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        withTiming(-15, { duration: 2400, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    ));
    waveOffset2.value = withDelay(d + 200, withRepeat(
      withSequence(
        withTiming(-12, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        withTiming(12, { duration: 2800, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    ));

    // Sail fade in
    const sailStart = d + T.sailOffset;
    sailOpacity.value = withDelay(sailStart,
      withTiming(1, { duration: T.sailFadeIn, easing: Easing.out(Easing.cubic) })
    );

    // Continuous rocking
    sailRotation.value = withDelay(sailStart, withRepeat(
      withSequence(
        withTiming(6, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(-6, { duration: 1100, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    ));
    sailBobY.value = withDelay(sailStart, withRepeat(
      withSequence(
        withTiming(4, { duration: 1750, easing: Easing.inOut(Easing.sin) }),
        withTiming(-4, { duration: 1750, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    ));

    // Birds
    const birdsStart = d + T.birdsOffset;
    birdsOpacity.value = withDelay(birdsStart,
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(1, { duration: T.birdsDuration - 1200 }),
        withTiming(0, { duration: 800 })
      )
    );
    birdsX.value = withDelay(birdsStart,
      withTiming(SCREEN_W * 1.3, { duration: T.birdsDuration, easing: Easing.linear })
    );
    wingFlap1.value = withDelay(birdsStart, withRepeat(
      withSequence(
        withTiming(0.3, { duration: 280, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.3, { duration: 280, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    ));
    wingFlap2.value = withDelay(birdsStart + 120, withRepeat(
      withSequence(
        withTiming(0.3, { duration: 310, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.3, { duration: 310, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    ));
    wingFlap3.value = withDelay(birdsStart + 60, withRepeat(
      withSequence(
        withTiming(0.3, { duration: 250, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.3, { duration: 250, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    ));
    wingFlap4.value = withDelay(birdsStart + 200, withRepeat(
      withSequence(
        withTiming(0.3, { duration: 340, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.3, { duration: 340, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    ));

    // Bow splash
    const splashStart = d + T.splashAt;
    splashOpacity.value = withDelay(splashStart,
      withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(0, { duration: T.splashDuration - 100, easing: Easing.out(Easing.cubic) })
      )
    );

    // Text pops up
    const textStart = splashStart + T.textAfterSplash;

    mcloonesOpacity.value = withDelay(textStart, withTiming(1, { duration: 200 }));
    mcloonesScale.value = withDelay(textStart, withSpring(1, { damping: 6, stiffness: 120, mass: 0.8 }));
    mcloonesTranslateY.value = withDelay(textStart, withSpring(0, { damping: 8, stiffness: 100 }));

    const bStart = textStart + T.textStagger;
    boathouseOpacity.value = withDelay(bStart, withTiming(1, { duration: 200 }));
    boathouseScale.value = withDelay(bStart, withSpring(1, { damping: 6, stiffness: 120, mass: 0.8 }));
    boathouseTranslateY.value = withDelay(bStart, withSpring(0, { damping: 8, stiffness: 100 }));

    const cStart = bStart + T.textStagger;
    bhConnectOpacity.value = withDelay(cStart, withTiming(1, { duration: 200 }));
    bhConnectScale.value = withDelay(cStart, withSpring(1, { damping: 6, stiffness: 120, mass: 0.8 }));
    bhConnectTranslateY.value = withDelay(cStart, withSpring(0, { damping: 8, stiffness: 100 }));

    // Fade to white
    const fadeStart = cStart + 500 + T.holdDuration;
    whiteOverlay.value = withDelay(fadeStart,
      withTiming(1, { duration: T.fadeOut, easing: Easing.inOut(Easing.cubic) })
    );

    const totalDuration = fadeStart + T.fadeOut + 100;
    const timer = setTimeout(handleFinish, totalDuration);

    return () => {
      clearTimeout(timer);
      cancelAnimation(waveOffset1);
      cancelAnimation(waveOffset2);
      cancelAnimation(sailRotation);
      cancelAnimation(sailBobY);
      cancelAnimation(wingFlap1);
      cancelAnimation(wingFlap2);
      cancelAnimation(wingFlap3);
      cancelAnimation(wingFlap4);
    };
  }, []);

  const wavesStyle = useAnimatedStyle(() => ({ opacity: wavesOpacity.value }));
  const wave1Style = useAnimatedStyle(() => ({ transform: [{ translateX: waveOffset1.value }] }));
  const wave2Style = useAnimatedStyle(() => ({ transform: [{ translateX: waveOffset2.value }] }));

  const sailStyle = useAnimatedStyle(() => ({
    opacity: sailOpacity.value,
    transform: [
      { translateY: sailBobY.value },
      { rotate: `${sailRotation.value}deg` },
    ],
  }));

  const birdsStyle = useAnimatedStyle(() => ({
    opacity: birdsOpacity.value,
    transform: [{ translateX: birdsX.value }],
  }));

  const flapStyle1 = useAnimatedStyle(() => ({
    transform: [{ scaleY: wingFlap1.value }],
  }));
  const flapStyle2 = useAnimatedStyle(() => ({
    transform: [{ scaleY: wingFlap2.value }],
  }));
  const flapStyle3 = useAnimatedStyle(() => ({
    transform: [{ scaleY: wingFlap3.value }],
  }));
  const flapStyle4 = useAnimatedStyle(() => ({
    transform: [{ scaleY: wingFlap4.value }],
  }));

  const splashStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
  }));

  const bhMcloonesStyle = useAnimatedStyle(() => ({
    opacity: mcloonesOpacity.value,
    transform: [{ translateY: mcloonesTranslateY.value }, { scale: mcloonesScale.value }],
  }));
  const bhBoathouseStyle = useAnimatedStyle(() => ({
    opacity: boathouseOpacity.value,
    transform: [{ translateY: boathouseTranslateY.value }, { scale: boathouseScale.value }],
  }));
  const bhConnectStyle = useAnimatedStyle(() => ({
    opacity: bhConnectOpacity.value,
    transform: [{ translateY: bhConnectTranslateY.value }, { scale: bhConnectScale.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({ opacity: whiteOverlay.value }));

  return (
    <View style={[styles.container, styles.bhContainer]} pointerEvents="none">
      {/* Text — upper portion */}
      <View style={styles.bhTextContainer}>
        <ReAnimated.Text style={[styles.bhMcloonesText, bhMcloonesStyle]}>McLoone's</ReAnimated.Text>
        <ReAnimated.Text style={[styles.bhBoathouseText, bhBoathouseStyle]}>Boathouse</ReAnimated.Text>
        <ReAnimated.Text style={[styles.bhConnectText, bhConnectStyle]}>CONNECT</ReAnimated.Text>
      </View>

      {/* Birds — V formation with per-row flapping */}
      <ReAnimated.View style={[styles.bhBirdsContainer, birdsStyle]}>
        <View style={styles.bhBirdFormation}>
          <ReAnimated.View style={flapStyle1}>
            <View style={styles.bhBirdUnit}>
              <View style={[styles.bhWingL, { width: 12 }]} />
              <View style={[styles.bhWingR, { width: 12 }]} />
            </View>
          </ReAnimated.View>
          <ReAnimated.View style={[{ flexDirection: "row", gap: 24, marginTop: 6 }, flapStyle2]}>
            <View style={styles.bhBirdUnit}>
              <View style={[styles.bhWingL, { width: 10 }]} />
              <View style={[styles.bhWingR, { width: 10 }]} />
            </View>
            <View style={styles.bhBirdUnit}>
              <View style={[styles.bhWingL, { width: 10 }]} />
              <View style={[styles.bhWingR, { width: 10 }]} />
            </View>
          </ReAnimated.View>
          <ReAnimated.View style={[{ flexDirection: "row", gap: 44, marginTop: 5 }, flapStyle3]}>
            <View style={styles.bhBirdUnit}>
              <View style={[styles.bhWingL, { width: 9 }]} />
              <View style={[styles.bhWingR, { width: 9 }]} />
            </View>
            <View style={styles.bhBirdUnit}>
              <View style={[styles.bhWingL, { width: 9 }]} />
              <View style={[styles.bhWingR, { width: 9 }]} />
            </View>
          </ReAnimated.View>
          <ReAnimated.View style={[{ flexDirection: "row", gap: 64, marginTop: 4, opacity: 0.4 }, flapStyle4]}>
            <View style={styles.bhBirdUnit}>
              <View style={[styles.bhWingL, { width: 7 }]} />
              <View style={[styles.bhWingR, { width: 7 }]} />
            </View>
            <View style={styles.bhBirdUnit}>
              <View style={[styles.bhWingL, { width: 7 }]} />
              <View style={[styles.bhWingR, { width: 7 }]} />
            </View>
          </ReAnimated.View>
        </View>
      </ReAnimated.View>

      {/* Wave lines */}
      <ReAnimated.View style={[styles.bhWavesContainer, wavesStyle]}>
        <ReAnimated.View style={[styles.bhWaveLine, wave1Style]}>
          <Image source={boathouseWave} style={styles.bhWaveImg} contentFit="fill" />
        </ReAnimated.View>
        <ReAnimated.View style={[styles.bhWaveLine, { marginTop: 4 }, wave2Style]}>
          <Image source={boathouseWave} style={[styles.bhWaveImg, { opacity: 0.5 }]} contentFit="fill" />
        </ReAnimated.View>
        <ReAnimated.View style={[styles.bhWaveLine, { marginTop: 3 }, wave1Style]}>
          <Image source={boathouseWave} style={[styles.bhWaveImg, { opacity: 0.3 }]} contentFit="fill" />
        </ReAnimated.View>
      </ReAnimated.View>

      {/* Sailboat */}
      <ReAnimated.View style={[styles.bhSailContainer, sailStyle]}>
        <Image
          source={boathouseSailboat}
          style={{ width: SAIL_SIZE, height: SAIL_SIZE }}
          contentFit="contain"
        />
      </ReAnimated.View>

      {/* Bow splash spray */}
      <ReAnimated.View style={[styles.bhSplashContainer, splashStyle]}>
        <View style={[styles.bhSprayArc, { width: 70, height: 70, top: -50, left: -15 }]} />
        <View style={[styles.bhSprayArc, { width: 55, height: 55, top: -30, left: 5, transform: [{ rotate: "10deg" }] }]} />
        <View style={[styles.bhSprayArc, { width: 40, height: 40, top: -10, left: 18, transform: [{ rotate: "25deg" }] }]} />
        <View style={[styles.bhDroplet, { width: 10, height: 10, top: -70, left: 30 }]} />
        <View style={[styles.bhDroplet, { width: 8, height: 8, top: -95, left: 18 }]} />
        <View style={[styles.bhDroplet, { width: 7, height: 7, top: -55, left: 50 }]} />
        <View style={[styles.bhDroplet, { width: 6, height: 6, top: -85, left: 42 }]} />
        <View style={[styles.bhDroplet, { width: 5, height: 5, top: -40, left: 60 }]} />
        <View style={[styles.bhDroplet, { width: 4, height: 4, top: -100, left: 8 }]} />
        <View style={[styles.bhDroplet, { width: 3, height: 3, top: -75, left: 55 }]} />
        <View style={[styles.bhDroplet, { width: 14, height: 14, top: -50, left: 15, opacity: 0.15 }]} />
        <View style={[styles.bhDroplet, { width: 10, height: 10, top: -70, left: 40, opacity: 0.12 }]} />
      </ReAnimated.View>

      {/* White fade overlay */}
      <ReAnimated.View style={[styles.whiteOverlay, overlayStyle]} pointerEvents="none" />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// MyResto Connect variant — animated text + logo wheel-in
// ═══════════════════════════════════════════════════════════

function MyRestoSplash({ onFinish }: AnimatedSplashProps) {
  const LOGO_SIZE = SCREEN_W * 0.35;
  const LOGO_END_X = 0;
  const LOGO_START_X = -(SCREEN_W * 0.5 + LOGO_SIZE);
  const LOGO_END_Y = -(SCREEN_H * 0.008);
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

    // Phase 3: Logo wheels in from left, settles above text
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
      { translateY: LOGO_END_Y },
      { rotate: `${logoRotation.value}deg` },
    ],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: whiteOverlay.value,
  }));

  return (
    <View style={[styles.container, styles.myrestoContainer]} pointerEvents="none">
      <View style={styles.stackedContent}>
        <ReAnimated.View style={[styles.logoWrap, logoStyle]}>
          <Image
            source={charcoalLogo}
            style={{ width: LOGO_SIZE, height: LOGO_SIZE }}
            contentFit="contain"
          />
        </ReAnimated.View>

        <View style={styles.stackedTextBlock}>
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
  bhContainer: {
    backgroundColor: BH_COLORS.white,
  },
  myrestoContainer: {
    backgroundColor: "#FFFFFF",
  },
  bhTextContainer: {
    position: "absolute",
    top: "18%",
    alignItems: "center",
  },
  bhMcloonesText: {
    fontSize: 32,
    fontWeight: "700",
    color: BH_COLORS.navyBlue,
    letterSpacing: 1,
  },
  bhBoathouseText: {
    fontSize: 24,
    fontWeight: "700",
    color: BH_COLORS.textDark,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  bhConnectText: {
    fontSize: 13,
    fontWeight: "400",
    color: BH_COLORS.navyBlue,
    letterSpacing: 5,
    marginTop: 6,
  },
  bhBirdsContainer: {
    position: "absolute",
    top: "20%",
  },
  bhBirdFormation: {
    alignItems: "center",
  },
  bhBirdRow: {
    flexDirection: "row",
  },
  bhBirdUnit: {
    flexDirection: "row",
  },
  bhWingL: {
    height: 0,
    borderTopWidth: 2,
    borderTopColor: BH_COLORS.navyBlue,
    opacity: 0.6,
    transform: [{ rotate: "28deg" }],
    marginRight: -2,
  },
  bhWingR: {
    height: 0,
    borderTopWidth: 2,
    borderTopColor: BH_COLORS.navyBlue,
    opacity: 0.6,
    transform: [{ rotate: "-28deg" }],
    marginLeft: -2,
  },
  bhWavesContainer: {
    position: "absolute",
    top: "57%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  bhWaveLine: {
    width: "160%",
    alignItems: "center",
  },
  bhWaveImg: {
    width: SCREEN_W * 1.6,
    height: 20,
  },
  bhSailContainer: {
    position: "absolute",
    top: "38%",
  },
  bhSplashContainer: {
    position: "absolute",
    top: "55%",
    left: "57%",
  },
  bhSprayArc: {
    position: "absolute",
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: BH_COLORS.navyBlue,
    borderTopRightRadius: 50,
    borderTopLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    opacity: 0.45,
    transform: [{ rotate: "-20deg" }],
  },
  bhDroplet: {
    position: "absolute",
    backgroundColor: BH_COLORS.navyBlue,
    borderRadius: 50,
    opacity: 0.65,
  },
  stackedContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  stackedTextBlock: {
    alignItems: "center",
    marginTop: 6,
  },
  myrestoText: {
    fontSize: 42,
    fontWeight: "800",
    color: "#1F2233",
  },
  connectText: {
    fontSize: 20,
    fontWeight: "400",
    color: "#1F2233",
    letterSpacing: 6,
    marginLeft: 6,
  },
  logoWrap: {},
  whiteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
  },
});
