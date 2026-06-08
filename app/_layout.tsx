
import "react-native-reanimated";
import "@/i18n";
import React, { useEffect, Component, ErrorInfo, ReactNode } from "react";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Alert, Platform, View, Text, StyleSheet } from "react-native";
import AnimatedSplash from "@/components/AnimatedSplash";
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
import { OrganizationProvider, useOrganization } from "@/contexts/OrganizationContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider as AppThemeProvider, useAppTheme } from "@/contexts/ThemeContext";
import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { REVENUECAT_ENABLED, REVENUECAT_API_KEY } from "@/config/revenueCat";

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

  const { resolvedMode, colors: themeColors } = useAppTheme();
  const networkState = useNetworkState();
  const segments = useSegments();
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { organizationId } = useOrganization();
  const { tier: subscriptionTier, isLoading: subLoading } = useSubscription();

  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const [showSplash, setShowSplash] = React.useState(true);

  // Hide native splash as soon as fonts are loaded (AnimatedSplash takes over visually)
  useEffect(() => {
    if (loaded) {
      // Small delay to ensure AnimatedSplash is rendered before native splash hides
      requestAnimationFrame(() => {
        SplashScreen.hideAsync().catch((error) => {
          console.log('[RootLayout] Error hiding splash screen:', error);
        });
      });
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

  // Initialize RevenueCat SDK
  useEffect(() => {
    if (!REVENUECAT_ENABLED || Platform.OS === 'web') return;

    async function initRC() {
      try {
        const Purchases = (await import('react-native-purchases')).default;
        Purchases.configure({ apiKey: REVENUECAT_API_KEY });

        if (organizationId) {
          await Purchases.logIn(organizationId);
        }
      } catch (err) {
        console.warn('[RootLayout] RevenueCat init skipped:', err);
      }
    }

    initRC();
  }, [organizationId]);

  // Handle navigation based on auth state
  useEffect(() => {
    // Wait for auth, fonts, and subscription. Also wait for an authenticated
    // owner's organizationId to resolve before evaluating any redirect —
    // otherwise the subscription gate can run while tier is still 'none'
    // (org not yet loaded on cold start) and wrongly bounce the owner to the
    // paywall even though their trial is active.
    if (isLoading || !loaded || subLoading ||
        (isAuthenticated && user?.role === 'owner' && !organizationId)) {
      console.log('[RootLayout] Waiting for auth/fonts/subscription/org to load...');
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
        // Force password change redirect — takes priority over portal redirect
        if (isAuthenticated && user?.forcePasswordChange) {
          const inChangePassword = segments[0] === 'change-password';
          if (!inChangePassword) {
            console.log('[RootLayout] Redirecting to change-password — force password change');
            router.replace('/change-password');
            return; // don't fall through to portal redirect
          }
        }

        // Paywall redirect — owner whose trial has actually ended.
        // Gate ONLY on 'expired'. 'none' means "subscription not yet known"
        // (org/RevenueCat still resolving on cold start), never "trial over":
        // a real org always settles on trial/base/premium/expired because
        // loadSubscription initializes a trial when none exists. Treating
        // 'none' as expired caused the cold-start paywall flap.
        // Onboarding/join routes are exempt so a brand-new owner finishing
        // signup is never bounced before their org + trial exist.
        if (isAuthenticated && user?.role === 'owner' &&
            subscriptionTier === 'expired') {
          const onPaywall = segments[0] === 'paywall';
          const inOnboarding = segments[0] === 'onboarding' || segments[0] === 'join';
          if (!onPaywall && !onLogin && !onIndex && !inOnboarding) {
            console.log('[RootLayout] Redirecting to paywall — subscription expired');
            router.replace('/paywall' as any);
            return;
          }
        }

        if (!isAuthenticated && inPortal) {
          // Redirect to login if not authenticated and trying to access portal
          console.log('[RootLayout] Redirecting to login - not authenticated');
          router.replace('/login');
        } else if (isAuthenticated && (onLogin || onIndex)) {
          // Redirect to appropriate portal based on role when on login or index
          // Note: onboarding, join, and change-password routes are not matched
          // by onLogin/onIndex so authenticated users on those routes stay put.
          console.log('[RootLayout] Redirecting to portal - authenticated as', user?.role);
          if (user?.role === 'manager' || user?.role === 'owner') {
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
  }, [isAuthenticated, isLoading, segments, loaded, user?.role, user?.forcePasswordChange, router, subscriptionTier, subLoading, organizationId]);

  if (!loaded || isLoading) {
    console.log('[RootLayout] Still loading, returning null');
    return null;
  }

  const navigationTheme: Theme = {
    ...(resolvedMode === 'dark' ? DarkTheme : DefaultTheme),
    dark: resolvedMode === 'dark',
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
    <View style={{ flex: 1 }}>
      <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
      <ThemeProvider value={navigationTheme}>
        <WidgetProvider>
          <NotificationProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="join" />
                <Stack.Screen name="change-password" options={{ gestureEnabled: false }} />
                <Stack.Screen name="(portal)" />
                <Stack.Screen name="exam-play" options={{ gestureEnabled: false }} />
                <Stack.Screen name="picture-this-play" options={{ gestureEnabled: false }} />
                <Stack.Screen name="word-search-play" options={{ gestureEnabled: false }} />
                <Stack.Screen name="memory-game-play" options={{ gestureEnabled: false }} />
                <Stack.Screen name="subscription-management" />
                <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
              </Stack>
              <SystemBars style="auto" />
            </GestureHandlerRootView>
          </NotificationProvider>
        </WidgetProvider>
      </ThemeProvider>
      {showSplash && (
        <AnimatedSplash onFinish={() => setShowSplash(false)} />
      )}
    </View>
  );
}

export default function RootLayout() {
  console.log('[RootLayout] Root component mounting, Platform:', Platform.OS);
  
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AppThemeProvider>
          <AuthProvider>
            <OrganizationProvider>
              <SubscriptionProvider>
                <RootLayoutNav />
              </SubscriptionProvider>
            </OrganizationProvider>
          </AuthProvider>
        </AppThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
