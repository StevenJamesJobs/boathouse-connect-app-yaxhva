
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';

const OPENTABLE_ACADEMY_URL = 'https://opentable.docebosaas.com/academy/learn/signin';

export default function OpenTableAcademyScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colors = useThemeColors();

  const handleOpenCourse = async () => {
    console.log('User tapped OpenTable Academy course link');
    try {
      const supported = await Linking.canOpenURL(OPENTABLE_ACADEMY_URL);
      if (supported) {
        await Linking.openURL(OPENTABLE_ACADEMY_URL);
      } else {
        console.error('Cannot open URL:', OPENTABLE_ACADEMY_URL);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  const userName = user?.name || 'there';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>OpenTable Academy</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Welcome Blurb */}
        <View style={[styles.blurbCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.welcomeText, { color: colors.text }]}>Hello {userName}!</Text>
          
          <View style={styles.bulletContainer}>
            <View style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
              <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                Please select a course below, and login into your OpenTable Academy Account to complete each course.
              </Text>
            </View>
            
            <View style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
              <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                If you do not have an account, please register and login to start the courses.
              </Text>
            </View>
            
            <View style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
              <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                Courses range from 30 - 60 minutes, but are not timed and can be completed at your own pace.
              </Text>
            </View>
            
            <View style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
              <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                When completed forward the email of completion and certificate to cmacula@mcloones.com
              </Text>
            </View>
          </View>
        </View>

        {/* Course Banners */}
        <View style={styles.coursesContainer}>
          {/* Beginner Course */}
          <TouchableOpacity 
            style={styles.courseBanner}
            onPress={handleOpenCourse}
            activeOpacity={0.8}
          >
            <Image
              source={require('@/assets/images/3fa03e2f-c4a8-41ca-95f3-e6a6692717a5.png')}
              style={styles.bannerImage}
              resizeMode="cover"
            />
          </TouchableOpacity>

          {/* Intermediate Course */}
          <TouchableOpacity 
            style={styles.courseBanner}
            onPress={handleOpenCourse}
            activeOpacity={0.8}
          >
            <Image
              source={require('@/assets/images/8dc10702-2661-4729-958f-49df486b683a.png')}
              style={styles.bannerImage}
              resizeMode="cover"
            />
          </TouchableOpacity>

          {/* Advanced Course */}
          <TouchableOpacity 
            style={styles.courseBanner}
            onPress={handleOpenCourse}
            activeOpacity={0.8}
          >
            <Image
              source={require('@/assets/images/397f7fca-5dec-495b-a06f-16f020c5873c.png')}
              style={styles.bannerImage}
              resizeMode="cover"
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  blurbCard: {
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  bulletContainer: {
    gap: 16,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bullet: {
    fontSize: 20,
    fontWeight: 'bold',
    marginRight: 12,
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  coursesContainer: {
    gap: 20,
  },
  courseBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 5,
  },
  bannerImage: {
    width: '100%',
    height: 200,
  },
});
