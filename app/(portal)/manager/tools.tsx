
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

export default function ManagerToolsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.pageTitle}>Manager Tools</Text>
      
      {/* Employee Management */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol
            ios_icon_name="person.2.fill"
            android_material_icon_name="people"
            size={32}
            color={managerColors.highlight}
          />
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Employee Management</Text>
            <Text style={styles.cardDescription}>
              Add, edit, and manage employee accounts
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.cardButton}>
          <Text style={styles.cardButtonText}>Open Employee Editor</Text>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron_right"
            size={20}
            color={managerColors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Announcements Editor */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol
            ios_icon_name="megaphone.fill"
            android_material_icon_name="campaign"
            size={32}
            color={managerColors.highlight}
          />
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Announcements</Text>
            <Text style={styles.cardDescription}>
              Create and manage announcements
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.cardButton}>
          <Text style={styles.cardButtonText}>Manage Announcements</Text>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron_right"
            size={20}
            color={managerColors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Events Editor */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol
            ios_icon_name="calendar"
            android_material_icon_name="event"
            size={32}
            color={managerColors.highlight}
          />
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Events</Text>
            <Text style={styles.cardDescription}>
              Schedule and manage events
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.cardButton}>
          <Text style={styles.cardButtonText}>Manage Events</Text>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron_right"
            size={20}
            color={managerColors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Weekly Specials Editor */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol
            ios_icon_name="fork.knife"
            android_material_icon_name="restaurant"
            size={32}
            color={managerColors.highlight}
          />
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Weekly Specials</Text>
            <Text style={styles.cardDescription}>
              Update weekly specials
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.cardButton}>
          <Text style={styles.cardButtonText}>Manage Specials</Text>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron_right"
            size={20}
            color={managerColors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Reports */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol
            ios_icon_name="chart.bar.fill"
            android_material_icon_name="bar_chart"
            size={32}
            color={managerColors.highlight}
          />
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Reports</Text>
            <Text style={styles.cardDescription}>
              View analytics and reports
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.cardButton}>
          <Text style={styles.cardButtonText}>View Reports</Text>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron_right"
            size={20}
            color={managerColors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Settings */}
      <View style={[styles.card, styles.lastCard]}>
        <View style={styles.cardHeader}>
          <IconSymbol
            ios_icon_name="gearshape.fill"
            android_material_icon_name="settings"
            size={32}
            color={managerColors.highlight}
          />
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Settings</Text>
            <Text style={styles.cardDescription}>
              Configure app settings
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.cardButton}>
          <Text style={styles.cardButtonText}>Open Settings</Text>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron_right"
            size={20}
            color={managerColors.text}
          />
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
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  lastCard: {
    marginBottom: 0,
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
