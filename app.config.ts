import { ExpoConfig } from "expo/config";

const variant = process.env.APP_VARIANT ?? "public";
const isMcloones = variant === "mcloones";

const appName = isMcloones ? "Boathouse Connect" : "MyResto Connect";
const permissionPrefix = isMcloones ? "Boathouse Connect" : "MyResto Connect";

const config: ExpoConfig = {
  name: appName,
  slug: isMcloones ? "BoathouseConnect" : "MyRestoConnect",
  owner: "stevenjamesjobs",
  version: isMcloones ? "2.2.0" : "1.0.0",
  orientation: "portrait",
  icon: isMcloones
    ? "./assets/images/MayMothersDayAppClip.png"
    : "./assets/images/MyRestoAppClipCharcoalAppClip.png",
  scheme: isMcloones ? "boathouseconnect" : "myrestoconnect",
  userInterfaceStyle: "automatic",
  // Native splash shown before JS loads. Kept intentionally blank (pure white)
  // for both variants so it blends into the white background of the animated
  // splash (components/AnimatedSplash.tsx) — no stale branded image flashes.
  splash: {
    image: "./assets/images/splash-white.png",
    resizeMode: "contain",
    backgroundColor: "#FFFFFF",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: isMcloones
      ? "com.stevenjamesjobs.mcloonesboathouseconnect"
      : "com.myrestoconnect.app",
    buildNumber: isMcloones ? "3" : "1",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ["remote-notification"],
      NSPhotoLibraryUsageDescription: `${permissionPrefix} needs access to your photo library so you can upload a profile picture, as well as images for menu items, announcements, special features, upcoming events, recipes, and messages.`,
      NSCameraUsageDescription: `${permissionPrefix} needs camera access so you can take photos for your profile picture, menu items, announcements, and other content.`,
    },
    ...(isMcloones && {
      googleServicesFile: "./GoogleService-Info.plist",
    }),
  },
  android: {
    adaptiveIcon: {
      foregroundImage: isMcloones
        ? "./assets/images/MayMothersDayAppClip.png"
        : "./assets/images/MyRestoAppClipCharcoalAppClip.png",
      backgroundColor: "#ffffff",
    },
    package: isMcloones
      ? "com.mcloonesboathouse.GPboathouseconnect"
      : "com.myrestoconnect.app",
    versionCode: isMcloones ? 175 : 1,
    ...(isMcloones && {
      googleServicesFile: "./google-services.json",
    }),
    permissions: [
      "INTERNET",
      "ACCESS_NETWORK_STATE",
      "POST_NOTIFICATIONS",
      "RECEIVE_BOOT_COMPLETED",
      "VIBRATE",
    ],
    softwareKeyboardLayoutMode: "pan",
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/57b2b2e5-dd37-4d86-a5d4-03c600dda0ca.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-image-picker",
      {
        photosPermission: `${permissionPrefix} needs access to your photo library so you can upload a profile picture, as well as images for menu items, announcements, special features, upcoming events, recipes, and messages.`,
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#FFFFFF",
        image: "./assets/images/splash-white.png",
        imageResizeMode: "contain",
        dark: {
          backgroundColor: "#FFFFFF",
          image: "./assets/images/splash-white.png",
          imageResizeMode: "contain",
        },
      },
    ],
    [
      "expo-notifications",
      {
        icon: isMcloones
          ? "./assets/images/MayMothersDayAppClip.png"
          : "./assets/images/MyRestoAppClipCharcoalAppClip.png",
        color: "#ffffff",
        sounds: [],
        mode: "production",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    APP_VARIANT: variant,
    eas: {
      projectId: isMcloones
        ? "1ab6bb51-f4ea-445b-8c25-cd0c5d0d4fea" // BoathouseConnect
        : "a202f52f-a6b0-4eba-a5c1-081c2b134d9e", // MyRestoConnect
    },
  },
};

export default config;
