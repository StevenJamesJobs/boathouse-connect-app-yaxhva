
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function EmployeeMenusScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.placeholderContainer}>
        <IconSymbol
          ios_icon_name="fork.knife"
          android_material_icon_name="restaurant_menu"
          size={64}
          color={employeeColors.primary}
        />
        <Text style={styles.placeholderTitle}>Menus</Text>
        <Text style={styles.placeholderText}>
          Menu items will be displayed here.
        </Text>
        <Text style={styles.placeholderSubtext}>
          Managers will be able to create, edit, and manage menu items that will appear here.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: employeeColors.background,
  },
  contentContainer: {
    flexGrow: 1,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    minHeight: 400,
  },
  placeholderTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 16,
    color: employeeColors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
