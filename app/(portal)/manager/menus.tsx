
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function ManagerMenusScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.placeholderContainer}>
        <IconSymbol
          ios_icon_name="fork.knife"
          android_material_icon_name="restaurant_menu"
          size={64}
          color={managerColors.highlight}
        />
        <Text style={styles.placeholderTitle}>Menu Management</Text>
        <Text style={styles.placeholderText}>
          Create, edit, and manage menu items here.
        </Text>
        <Text style={styles.placeholderSubtext}>
          Menu editor will be implemented to manage all menu items across different categories.
        </Text>
        
        <TouchableOpacity style={styles.actionButton}>
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add_circle"
            size={24}
            color={managerColors.text}
          />
          <Text style={styles.actionButtonText}>Add Menu Item</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
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
    color: managerColors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 16,
    color: managerColors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: managerColors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
    marginLeft: 8,
  },
});
