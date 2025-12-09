
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
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

export default function ManagerToolsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      {/* User's Name Header */}
      <View style={styles.nameHeader}>
        <Text style={styles.nameHeaderText}>{user?.name}&apos;s Tools</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Check Out Calculator Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconSymbol
              ios_icon_name="calculator.fill"
              android_material_icon_name="calculate"
              size={32}
              color={managerColors.highlight}
            />
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Check Out Calculator</Text>
              <Text style={styles.cardDescription}>
                Calculate your shift check out totals and tip outs
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.cardButton}
            onPress={() => router.push('/check-out-calculator')}
          >
            <Text style={styles.cardButtonText}>Open Calculator</Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron_right"
              size={20}
              color={managerColors.text}
            />
          </TouchableOpacity>
        </View>

        {/* Guides and Training Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconSymbol
              ios_icon_name="book.fill"
              android_material_icon_name="menu_book"
              size={32}
              color={managerColors.highlight}
            />
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Employee Guides and Training</Text>
              <Text style={styles.cardDescription}>
                View training materials and guides
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.cardButton}
            onPress={() => router.push('/guides-and-training')}
          >
            <Text style={styles.cardButtonText}>View Guides</Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron_right"
              size={20}
              color={managerColors.text}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  nameHeader: {
    backgroundColor: managerColors.card,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  nameHeaderText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: managerColors.textSecondary,
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
  },
});
