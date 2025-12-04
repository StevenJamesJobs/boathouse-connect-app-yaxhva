
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { managerColors } from '@/styles/commonStyles';
import MenuDisplay from '@/components/MenuDisplay';

export default function ManagerMenusScreen() {
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
