
import React, { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IS_MCLOONES } from '@/constants/buildVariant';
import { markDeviceReachedDashboard, shouldOfferPersonalize } from '@/utils/deviceFlags';

export default function PortalLayout() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const colors = useThemeColors();
  // The first-run gate below resolves in one AsyncStorage read; the Boathouse build skips it.
  const [gateOpen, setGateOpen] = useState(IS_MCLOONES);

  // First portal arrival on this device (s86):
  //  - MyResto, never personalized → hand over to /personalize once (it returns here).
  //  - otherwise record "this device has reached a dashboard" — from then on a cold,
  //    signed-out open goes to Login instead of Welcome (the flag used to flip at sign-in).
  // A forced password change outranks both: the root layout is about to redirect.
  useEffect(() => {
    if (isLoading || !user?.id || user.forcePasswordChange) return;
    let cancelled = false;
    (async () => {
      if (!IS_MCLOONES && (await shouldOfferPersonalize())) {
        if (!cancelled) router.replace('/personalize');
        return;
      }
      await markDeviceReachedDashboard();
      if (!cancelled) setGateOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, user?.id, user?.forcePasswordChange, router]);

  if (isLoading || !gateOpen) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  // The Stack will handle routing to employee or manager based on the URL
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="employee" />
      <Stack.Screen name="manager" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
