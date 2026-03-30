
import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRouter } from 'expo-router';
import MenuDisplay from '@/components/MenuDisplay';

export default function EmployeeMenusScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();

  const handleSwipeToWelcome = useCallback(() => {
    router.navigate('/(portal)/employee');
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MenuDisplay colors={colors} onSwipeToWelcome={handleSwipeToWelcome} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
