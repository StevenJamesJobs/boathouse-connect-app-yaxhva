
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function ManagerPortalScreen() {
  const { user } = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Welcome Section */}
      <View style={styles.welcomeSection}>
        <Text style={styles.welcomeTitle}>Welcome, {user?.name}!</Text>
        <Text style={styles.jobTitle}>{user?.jobTitle}</Text>
        <Text style={styles.tagline}>Let&apos;s see what we have going on today!</Text>
      </View>

      {/* Weather Section */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol
            ios_icon_name="cloud.sun.fill"
            android_material_icon_name="wb_sunny"
            size={24}
            color={managerColors.highlight}
          />
          <Text style={styles.cardTitle}>Weather</Text>
        </View>
        <View style={styles.weatherContent}>
          <Text style={styles.temperature}>72°F</Text>
          <Text style={styles.weatherDescription}>Partly Cloudy</Text>
          <Text style={styles.weatherDetail}>Perfect day at the boathouse!</Text>
        </View>
      </View>

      {/* Announcements Section */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol
            ios_icon_name="megaphone.fill"
            android_material_icon_name="campaign"
            size={24}
            color={managerColors.highlight}
          />
          <Text style={styles.cardTitle}>Announcements</Text>
        </View>
        <View style={styles.announcementItem}>
          <Text style={styles.announcementTitle}>Team Meeting Tomorrow</Text>
          <Text style={styles.announcementText}>
            All staff meeting at 2 PM in the main dining room.
          </Text>
          <Text style={styles.announcementDate}>Posted 2 hours ago</Text>
        </View>
        <View style={styles.announcementItem}>
          <Text style={styles.announcementTitle}>New Menu Items</Text>
          <Text style={styles.announcementText}>
            Check out our new summer specials starting this weekend!
          </Text>
          <Text style={styles.announcementDate}>Posted yesterday</Text>
        </View>
        <TouchableOpacity style={styles.editButton}>
          <IconSymbol
            ios_icon_name="pencil"
            android_material_icon_name="edit"
            size={16}
            color={managerColors.text}
          />
          <Text style={styles.editButtonText}>Edit Announcements</Text>
        </TouchableOpacity>
      </View>

      {/* Upcoming Events Section */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol
            ios_icon_name="calendar"
            android_material_icon_name="event"
            size={24}
            color={managerColors.highlight}
          />
          <Text style={styles.cardTitle}>Upcoming Events</Text>
        </View>
        <View style={styles.eventItem}>
          <View style={styles.eventDate}>
            <Text style={styles.eventDay}>15</Text>
            <Text style={styles.eventMonth}>JUN</Text>
          </View>
          <View style={styles.eventDetails}>
            <Text style={styles.eventTitle}>Summer Kickoff Party</Text>
            <Text style={styles.eventTime}>6:00 PM - 10:00 PM</Text>
          </View>
        </View>
        <View style={styles.eventItem}>
          <View style={styles.eventDate}>
            <Text style={styles.eventDay}>22</Text>
            <Text style={styles.eventMonth}>JUN</Text>
          </View>
          <View style={styles.eventDetails}>
            <Text style={styles.eventTitle}>Live Music Night</Text>
            <Text style={styles.eventTime}>7:00 PM - 11:00 PM</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.editButton}>
          <IconSymbol
            ios_icon_name="pencil"
            android_material_icon_name="edit"
            size={16}
            color={managerColors.text}
          />
          <Text style={styles.editButtonText}>Edit Events</Text>
        </TouchableOpacity>
      </View>

      {/* Special Features Section */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <IconSymbol
            ios_icon_name="star.fill"
            android_material_icon_name="star"
            size={24}
            color={managerColors.highlight}
          />
          <Text style={styles.cardTitle}>Special Features</Text>
        </View>
        <View style={styles.featureGrid}>
          <TouchableOpacity style={styles.featureButton}>
            <IconSymbol
              ios_icon_name="person.2.fill"
              android_material_icon_name="people"
              size={32}
              color={managerColors.text}
            />
            <Text style={styles.featureText}>Employees</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.featureButton}>
            <IconSymbol
              ios_icon_name="calendar.badge.clock"
              android_material_icon_name="schedule"
              size={32}
              color={managerColors.text}
            />
            <Text style={styles.featureText}>Scheduling</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.featureButton}>
            <IconSymbol
              ios_icon_name="chart.bar.fill"
              android_material_icon_name="bar_chart"
              size={32}
              color={managerColors.text}
            />
            <Text style={styles.featureText}>Reports</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.featureButton}>
            <IconSymbol
              ios_icon_name="gearshape.fill"
              android_material_icon_name="settings"
              size={32}
              color={managerColors.text}
            />
            <Text style={styles.featureText}>Settings</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Weekly Specials Section */}
      <View style={[styles.card, styles.lastCard]}>
        <View style={styles.cardHeader}>
          <IconSymbol
            ios_icon_name="fork.knife"
            android_material_icon_name="restaurant"
            size={24}
            color={managerColors.highlight}
          />
          <Text style={styles.cardTitle}>Weekly Specials</Text>
        </View>
        <View style={styles.specialItem}>
          <Text style={styles.specialDay}>Monday</Text>
          <Text style={styles.specialName}>Lobster Roll Special</Text>
          <Text style={styles.specialPrice}>$18.99</Text>
        </View>
        <View style={styles.specialItem}>
          <Text style={styles.specialDay}>Wednesday</Text>
          <Text style={styles.specialName}>Taco Night</Text>
          <Text style={styles.specialPrice}>$12.99</Text>
        </View>
        <View style={styles.specialItem}>
          <Text style={styles.specialDay}>Friday</Text>
          <Text style={styles.specialName}>Fresh Catch of the Day</Text>
          <Text style={styles.specialPrice}>Market Price</Text>
        </View>
        <TouchableOpacity style={styles.editButton}>
          <IconSymbol
            ios_icon_name="pencil"
            android_material_icon_name="edit"
            size={16}
            color={managerColors.text}
          />
          <Text style={styles.editButtonText}>Edit Specials</Text>
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
    paddingBottom: 40,
  },
  welcomeSection: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 4,
  },
  jobTitle: {
    fontSize: 18,
    color: managerColors.highlight,
    fontWeight: '600',
    marginBottom: 12,
  },
  tagline: {
    fontSize: 16,
    color: managerColors.textSecondary,
    fontStyle: 'italic',
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
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
    marginLeft: 12,
  },
  weatherContent: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  temperature: {
    fontSize: 48,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  weatherDescription: {
    fontSize: 18,
    color: managerColors.textSecondary,
    marginTop: 4,
  },
  weatherDetail: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginTop: 8,
  },
  announcementItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.highlight,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 4,
  },
  announcementText: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 4,
    lineHeight: 20,
  },
  announcementDate: {
    fontSize: 12,
    color: managerColors.textSecondary,
    fontStyle: 'italic',
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.highlight,
  },
  eventDate: {
    width: 60,
    height: 60,
    backgroundColor: managerColors.highlight,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  eventDay: {
    fontSize: 24,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  eventMonth: {
    fontSize: 12,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  eventDetails: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 14,
    color: managerColors.textSecondary,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  featureButton: {
    width: '48%',
    backgroundColor: managerColors.highlight,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginTop: 8,
    textAlign: 'center',
  },
  specialItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.highlight,
  },
  specialDay: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.highlight,
    marginBottom: 4,
  },
  specialName: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 2,
  },
  specialPrice: {
    fontSize: 14,
    color: managerColors.textSecondary,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginLeft: 8,
  },
});
