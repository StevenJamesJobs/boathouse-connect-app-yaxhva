
import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet, Platform, Text } from 'react-native';
import React from 'react';

export default function PortalIndex() {
  const { user, isLoading, isAuthenticated } = useAuth();

  console.log('[Portal Index] Rendering, Platform:', Platform.OS, 'Auth state:', {
    isAuthenticated,
    isLoading,
    role: user?.role
  });

  if (isLoading) {
    console.log('[Portal Index] Still loading...');
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3498DB" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!isAuthenticated || !user) {
    console.log('[Portal Index] Not authenticated, redirecting to login');
    return <Redirect href="/login" />;
  }

  // Redirect to appropriate portal based on role
  console.log('[Portal Index] Redirecting to portal for role:', user.role);
  if (user.role === 'manager') {
    return <Redirect href="/(portal)/manager" />;
  } else {
    return <Redirect href="/(portal)/employee" />;
  }
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },
});
