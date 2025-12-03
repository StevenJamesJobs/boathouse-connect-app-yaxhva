
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import CollapsibleSection from '@/components/CollapsibleSection';
import WeatherWidget from '@/components/WeatherWidget';

export default function ManagerPortalScreen() {
  const { user } = useAuth();

  // Darker header color for sections
  const headerColor = '#34495E'; // Slightly darker than card
  const contentColor = managerColors.card; // Use card color for content

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Welcome Section */}
      <View style={styles.welcomeSection}>
        <Text style={styles.welcomeTitle}>Welcome, {user?.name}!</Text>
        <Text style={styles.jobTitle}>{user?.jobTitle}</Text>
        <Text style={styles.tagline}>Let&apos;s see what we have going on today!</Text>
      </View>

      {/* Weather Section - Collapsible */}
      <CollapsibleSection
        title="Weather"
        iconIos="cloud.sun.fill"
        iconAndroid="wb_sunny"
        iconColor={managerColors.accent}
        headerBackgroundColor={headerColor}
        headerTextColor={managerColors.text}
        contentBackgroundColor={contentColor}
        defaultExpanded={true}
      >
        <WeatherWidget
          textColor={managerColors.text}
          secondaryTextColor={managerColors.textSecondary}
        />
      </CollapsibleSection>

      {/* Announcements Section - Collapsible */}
      <CollapsibleSection
        title="Announcements"
        iconIos="megaphone.fill"
        iconAndroid="campaign"
        iconColor={managerColors.accent}
        headerBackgroundColor={headerColor}
        headerTextColor={managerColors.text}
        contentBackgroundColor={contentColor}
        defaultExpanded={true}
      >
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
      </CollapsibleSection>

      {/* Upcoming Events Section - Collapsible */}
      <CollapsibleSection
        title="Upcoming Events"
        iconIos="calendar"
        iconAndroid="event"
        iconColor={managerColors.accent}
        headerBackgroundColor={headerColor}
        headerTextColor={managerColors.text}
        contentBackgroundColor={contentColor}
        defaultExpanded={true}
      >
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
      </CollapsibleSection>

      {/* Special Features Section - Collapsible */}
      <CollapsibleSection
        title="Special Features"
        iconIos="star.fill"
        iconAndroid="star"
        iconColor={managerColors.accent}
        headerBackgroundColor={headerColor}
        headerTextColor={managerColors.text}
        contentBackgroundColor={contentColor}
        defaultExpanded={true}
      >
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
      </CollapsibleSection>

      {/* Weekly Specials Section - Collapsible */}
      <CollapsibleSection
        title="Weekly Specials"
        iconIos="fork.knife"
        iconAndroid="restaurant"
        iconColor={managerColors.accent}
        headerBackgroundColor={headerColor}
        headerTextColor={managerColors.text}
        contentBackgroundColor={contentColor}
        defaultExpanded={true}
      >
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
      </CollapsibleSection>
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
    paddingBottom: 120,
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
  announcementItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
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
    borderBottomColor: managerColors.border,
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
    color: managerColors.background,
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
    borderBottomColor: managerColors.border,
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
