
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { employeeColors } from '@/styles/commonStyles';
import MenuDisplay from '@/components/MenuDisplay';

export default function EmployeeMenusScreen() {
  const { t } = useTranslation();
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
