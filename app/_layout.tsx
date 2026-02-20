
import "react-native-reanimated";
import "@/i18n";
import React, { useEffect, Component, ErrorInfo, ReactNode } from "react";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Alert, Platform, View, Text, StyleSheet } from "react-native";
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
import { NotificationProvider } from "@/contexts/NotificationContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider as AppThemeProvider, useAppTheme } from "@/contexts/ThemeContext";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "index",
};

// Error Boundary Component
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    console.error('[ErrorBoundary] Caught error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Error details:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <Text style={errorStyles.instruction}>
            Please restart the app
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 8,
  },
  instruction: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
  },
});

function RootLayoutNav() {
  console.log('[RootLayout] Component rendering, Platform:', Platform.OS);

  const { mode, colors: themeColors } = useAppTheme();
  const networkState = useNetworkState();
  const segments = useSegments();
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const [splashReady, setSplashReady] = React.useState(false);

  // Track when the app started loading
  useEffect(() => {
    const splashMinDelay = setTimeout(() => {
      setSplashReady(true);
    }, 1500); // Minimum 1.5 seconds splash display
    return () => clearTimeout(splashMinDelay);
  }, []);

  useEffect(() => {
    if (loaded && splashReady) {
      console.log('[RootLayout] Fonts loaded & splash delay complete, hiding splash screen');
      SplashScreen.hideAsync().catch((error) => {
        console.log('[RootLayout] Error hiding splash screen:', error);
      });
    }
  }, [loaded, splashReady]);

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

    // Use setTimeout to avoid navigation during render
    const navigationTimeout = setTimeout(() => {
      try {
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
      } catch (navError) {
        console.error('[RootLayout] Navigation error:', navError);
      }
    }, 100);

    return () => clearTimeout(navigationTimeout);
  }, [isAuthenticated, isLoading, segments, loaded, user?.role, router]);

  if (!loaded || isLoading || !splashReady) {
    console.log('[RootLayout] Still loading, returning null');
    return null;
  }

  const navigationTheme: Theme = {
    ...(mode === 'dark' ? DarkTheme : DefaultTheme),
    dark: mode === 'dark',
    colors: {
      primary: themeColors.primary,
      background: themeColors.background,
      card: themeColors.card,
      text: themeColors.text,
      border: themeColors.border,
      notification: themeColors.accent,
    },
  };

  console.log('[RootLayout] Rendering main navigation');

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <ThemeProvider value={navigationTheme}>
        <WidgetProvider>
          <NotificationProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="(portal)" />
              </Stack>
              <SystemBars style="auto" />
            </GestureHandlerRootView>
          </NotificationProvider>
        </WidgetProvider>
      </ThemeProvider>
    </>
  );
}

export default function RootLayout() {
  console.log('[RootLayout] Root component mounting, Platform:', Platform.OS);
  
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AppThemeProvider>
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </AppThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
