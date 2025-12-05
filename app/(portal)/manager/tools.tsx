
import React, { useState } from 'react';
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

export default function ManagerToolsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'employee' | 'management'>('management');

  return (
    <View style={styles.container}>
      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'employee' && styles.activeTab]}
          onPress={() => setActiveTab('employee')}
        >
          <Text style={[styles.tabText, activeTab === 'employee' && styles.activeTabText]}>
            Employee Tools
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'management' && styles.activeTab]}
          onPress={() => setActiveTab('management')}
        >
          <Text style={[styles.tabText, activeTab === 'management' && styles.activeTabText]}>
            Management Tools
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {activeTab === 'employee' ? (
          <>
            <Text style={styles.pageTitle}>Employee Tools</Text>
            
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
                  <Text style={styles.cardTitle}>Announcements Editor</Text>
                  <Text style={styles.cardDescription}>
                    Create and manage announcements for staff
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.cardButton}
                onPress={() => router.push('/announcement-editor')}
              >
                <Text style={styles.cardButtonText}>Open Announcements Editor</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron_right"
                  size={20}
                  color={managerColors.text}
                />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.pageTitle}>Management Tools</Text>

            {/* Employee Management - MOVED HERE */}
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
              <TouchableOpacity 
                style={styles.cardButton}
                onPress={() => router.push('/employee-editor')}
              >
                <Text style={styles.cardButtonText}>Open Employee Editor</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron_right"
                  size={20}
                  color={managerColors.text}
                />
              </TouchableOpacity>
            </View>

            {/* Menu Editor - MOVED HERE */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <IconSymbol
                  ios_icon_name="fork.knife"
                  android_material_icon_name="restaurant_menu"
                  size={32}
                  color={managerColors.highlight}
                />
                <View style={styles.cardHeaderText}>
                  <Text style={styles.cardTitle}>Menu Editor</Text>
                  <Text style={styles.cardDescription}>
                    Create, edit, and manage menu items
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.cardButton}
                onPress={() => router.push('/menu-editor')}
              >
                <Text style={styles.cardButtonText}>Open Menu Editor</Text>
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
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: managerColors.card,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: managerColors.highlight,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  activeTabText: {
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
