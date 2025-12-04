
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { employeeColors } from '@/styles/commonStyles';
import MenuDisplay from '@/components/MenuDisplay';

export default function EmployeeMenusScreen() {
  return (
    <View style={styles.container}>
      <MenuDisplay colors={employeeColors} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: employeeColors.background,
  },
});
