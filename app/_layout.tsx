
import "react-native-reanimated";
import React, { useEffect } from "react";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme, Alert, Platform } from "react-native";
import { useNetworkState } from "expo-network";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { WidgetProvider } from "@/contexts/WidgetContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "index",
};

function RootLayoutNav() {
  console.log('[RootLayout] Component rendering, Platform:', Platform.OS);
  
  const colorScheme = useColorScheme();
  const networkState = useNetworkState();
  const segments = useSegments();
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      console.log('[RootLayout] Fonts loaded, hiding splash screen');
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    if (
      !networkState.isConnected &&
      networkState.isInternetReachable === false
    ) {
      console.log('[RootLayout] Network offline detected');
      Alert.alert(
        "🔌 You are offline",
        "You can keep using the app! Your changes will be saved locally and synced when you are back online."
      );
    }
  }, [networkState.isConnected, networkState.isInternetReachable]);

  // Handle navigation based on auth state
  useEffect(() => {
    if (isLoading || !loaded) {
      console.log('[RootLayout] Waiting for auth/fonts to load...');
      return;
    }

    const inPortal = segments[0] === '(portal)';
    const onLogin = segments[0] === 'login';
    const onIndex = segments.length === 0 || segments[0] === 'index';

    console.log('[RootLayout] Navigation check:', { 
      isAuthenticated, 
      segments, 
      user: user?.role,
      inPortal,
      onLogin,
      onIndex
    });

    if (!isAuthenticated && inPortal) {
      // Redirect to login if not authenticated and trying to access portal
      console.log('[RootLayout] Redirecting to login - not authenticated');
      router.replace('/login');
    } else if (isAuthenticated && (onLogin || onIndex)) {
      // Redirect to appropriate portal based on role when on login or index
      console.log('[RootLayout] Redirecting to portal - authenticated as', user?.role);
      if (user?.role === 'manager') {
        router.replace('/(portal)/manager');
      } else {
        router.replace('/(portal)/employee');
      }
    }
  }, [isAuthenticated, isLoading, segments, loaded, user?.role, router]);

  if (!loaded || isLoading) {
    console.log('[RootLayout] Still loading, returning null');
    return null;
  }

  const CustomDefaultTheme: Theme = {
    ...DefaultTheme,
    dark: false,
    colors: {
      primary: "rgb(0, 122, 255)",
      background: "rgb(242, 242, 247)",
      card: "rgb(255, 255, 255)",
      text: "rgb(0, 0, 0)",
      border: "rgb(216, 216, 220)",
      notification: "rgb(255, 59, 48)",
    },
  };

  const CustomDarkTheme: Theme = {
    ...DarkTheme,
    colors: {
      primary: "rgb(10, 132, 255)",
      background: "rgb(1, 1, 1)",
      card: "rgb(28, 28, 30)",
      text: "rgb(255, 255, 255)",
      border: "rgb(44, 44, 46)",
      notification: "rgb(255, 69, 58)",
    },
  };

  console.log('[RootLayout] Rendering main navigation');

  return (
    <>
      <StatusBar style="auto" />
      <ThemeProvider
        value={colorScheme === "dark" ? CustomDarkTheme : CustomDefaultTheme}
      >
        <WidgetProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="(portal)" />
            </Stack>
            <SystemBars style="auto" />
          </GestureHandlerRootView>
        </WidgetProvider>
      </ThemeProvider>
    </>
  );
}

export default function RootLayout() {
  console.log('[RootLayout] Root component mounting');
  
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
