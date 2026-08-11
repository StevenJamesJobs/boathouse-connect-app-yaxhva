
import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRouter } from 'expo-router';
import MenuDisplay from '@/components/MenuDisplay';

export default function ManagerMenusScreen() {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const router = useRouter();

  const handleSwipeToWelcome = useCallback(() => {
    router.navigate('/(portal)/manager');
  }, [router]);

  return (
    // Transparent: the layout-level AmbientGlow must read through (s68 glass wave).
    <View style={styles.container}>
      <MenuDisplay colors={colors} onSwipeToWelcome={handleSwipeToWelcome} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
