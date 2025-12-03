
import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export default function Index() {
  const { isAuthenticated, isLoading, user } = useAuth();

  console.log('Index screen - Auth state:', { isAuthenticated, isLoading, role: user?.role });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3498DB" />
      </View>
    );
  }

  if (isAuthenticated && user) {
    // Redirect to appropriate portal based on role
    console.log('Redirecting to portal for role:', user.role);
    if (user.role === 'manager') {
      return <Redirect href="/(portal)/manager" />;
    } else {
      return <Redirect href="/(portal)/employee" />;
    }
  }

  // Not authenticated, redirect to login
  console.log('Not authenticated, redirecting to login');
  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
