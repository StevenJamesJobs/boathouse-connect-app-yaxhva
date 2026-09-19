
import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IS_MCLOONES } from '@/constants/buildVariant';
import { deviceHasReachedDashboard } from '@/utils/deviceFlags';

export default function Index() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const colors = useThemeColors();
  // null = still reading the device flag
  const [hasAccount, setHasAccount] = useState<boolean | null>(IS_MCLOONES ? true : null);

  useEffect(() => {
    if (IS_MCLOONES) return;
    deviceHasReachedDashboard().then(setHasAccount);
  }, []);

  if (isLoading || hasAccount === null) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (isAuthenticated && user) {
    if (user.role === 'manager' || user.role === 'owner') {
      return <Redirect href="/(portal)/manager" />;
    }
    return <Redirect href="/(portal)/employee" />;
  }

  // Signed out: a device that has never reached a dashboard opens on Welcome (MyResto
  // only — the Boathouse build has no join codes or owner setup); everyone else, Login.
  return <Redirect href={hasAccount ? '/login' : '/welcome'} />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
