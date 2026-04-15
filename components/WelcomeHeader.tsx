import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useTranslation } from 'react-i18next';

interface WeatherInfo {
  temp: number;
  conditionIcon: string;
}

interface WelcomeHeaderProps {
  onWeatherPress: () => void;
  onNotificationPress: () => void;
  notificationCount?: number;
  newContentCount?: number;
  weather?: WeatherInfo | null;
}

const WEATHER_API_KEY = '6e3db8832cf34a5bbc5182329251711';

export default function WelcomeHeader({
  onWeatherPress,
  onNotificationPress,
  notificationCount = 0,
  newContentCount = 0,
  weather: externalWeather,
}: WelcomeHeaderProps) {
  const colors = useThemeColors();
  const { user } = useAuth();
  const { unreadCount } = useUnreadMessages();
  const router = useRouter();
  const { t } = useTranslation();

  const [weather, setWeather] = useState<WeatherInfo | null>(externalWeather || null);

  const fetchWeather = useCallback(async () => {
    try {
      const res = await fetch(
        `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=07003&aqi=no`
      );
      const data = await res.json();
      if (data?.current) {
        setWeather({
          temp: Math.round(data.current.temp_f),
          conditionIcon: `https:${data.current.condition.icon}`,
        });
      }
    } catch (e) {
      console.error('Weather fetch error:', e);
    }
  }, []);

  useEffect(() => {
    if (!externalWeather) {
      fetchWeather();
    }
  }, [externalWeather, fetchWeather]);

  useEffect(() => {
    if (externalWeather) setWeather(externalWeather);
  }, [externalWeather]);

  const getProfilePictureUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `https://xvbajqukbakcvdrkcioi.supabase.co/storage/v1/object/public/profile-pictures/${url}`;
  };

  const profilePictureUrl = getProfilePictureUrl(user?.profilePictureUrl);

  const handleProfilePress = () => {
    if (user?.role === 'manager') {
      router.push('/(portal)/manager/profile' as any);
    } else {
      router.push('/(portal)/employee/profile' as any);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {/* Profile Photo */}
      <TouchableOpacity onPress={handleProfilePress} style={[styles.profilePicContainer, { borderColor: colors.highlight }]}>
        {profilePictureUrl ? (
          <Image source={{ uri: profilePictureUrl }} style={styles.profilePic} />
        ) : (
          <View style={[styles.profilePicPlaceholder, { backgroundColor: colors.background }]}>
            <IconSymbol
              ios_icon_name="person.fill"
              android_material_icon_name="person"
              size={22}
              color={colors.textSecondary}
            />
          </View>
        )}
      </TouchableOpacity>

      {/* Name + Job Title */}
      <View style={styles.nameContainer}>
        <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
          {user?.name}
        </Text>
        <View style={[styles.jobTitleBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.jobTitleText} numberOfLines={1}>
            {user?.jobTitle}
          </Text>
        </View>
      </View>

      {/* Right side: Weather + Messages + Notifications */}
      <View style={styles.rightSection}>
        {/* Weather Chip */}
        {weather && (
          <TouchableOpacity
            style={[styles.weatherChip, { backgroundColor: colors.background }]}
            onPress={onWeatherPress}
            activeOpacity={0.7}
          >
            <Image
              source={{ uri: weather.conditionIcon }}
              style={styles.weatherIcon}
            />
            <Text style={[styles.weatherTemp, { color: colors.text }]}>
              {weather.temp}°
            </Text>
          </TouchableOpacity>
        )}

        {/* Messages Button */}
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: colors.primary + '18' }]}
          onPress={() => router.push('/messages')}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="envelope.fill"
            android_material_icon_name="mail"
            size={20}
            color={colors.primary}
          />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Notification Bell */}
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: colors.primary + '18' }]}
          onPress={onNotificationPress}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="bell.fill"
            android_material_icon_name="notifications"
            size={20}
            color={colors.primary}
          />
          {(notificationCount > 0 || newContentCount > 0) && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {(() => {
                  const total = notificationCount + newContentCount;
                  return total > 99 ? '99+' : total;
                })()}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 12,
    gap: 10,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  profilePicContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
  },
  profilePic: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  profilePicPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
  },
  jobTitleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  jobTitleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weatherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    gap: 2,
  },
  weatherIcon: {
    width: 24,
    height: 24,
  },
  weatherTemp: {
    fontSize: 14,
    fontWeight: '700',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#E74C3C',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
