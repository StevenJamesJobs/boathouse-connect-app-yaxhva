
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { managerColors } from '@/styles/commonStyles';
import MenuDisplay from '@/components/MenuDisplay';

export default function ManagerMenusScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <MenuDisplay colors={managerColors} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
});
