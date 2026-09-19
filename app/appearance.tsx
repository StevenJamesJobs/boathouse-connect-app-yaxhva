import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import AppearanceBody from '@/components/appearance/AppearanceBody';
import { useThemeColors } from '@/hooks/useThemeColors';

/** Profile › Settings › Appearance — hosts the shared theme picker (components/appearance/AppearanceBody). */
export default function AppearanceScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={t('appearance.title')} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppearanceBody />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1, zIndex: 2 },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
});
