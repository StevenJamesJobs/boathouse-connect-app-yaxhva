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
import { useOrganization } from '@/contexts/OrganizationContext';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/GlassCard';
import { fonts } from '@/constants/fonts';

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
  const { organization } = useOrganization();
  const { unreadCount } = useUnreadMessages();
  const router = useRouter();
  const { t } = useTranslation();

  // Time-aware greeting headline (first name only — adds warmth on the
  // post-onboarding "wow" screen without truncation risk).
  const hour = new Date().getHours();
  const greetingKey =
    hour < 12 ? 'welcome.good_morning' : hour < 17 ? 'welcome.good_afternoon' : 'welcome.good_evening';
  const greetingFallback =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.name || '').trim().split(/\s+/)[0] || '';

  // Follow the org's own weather location (auto-derived from their address at
  // onboarding). No hardcoded fallback — a null location simply hides the chip.
  const weatherLocation = organization?.weather_location || null;

  const [weather, setWeather] = useState<WeatherInfo | null>(externalWeather || null);

  const fetchWeather = useCallback(async () => {
    if (!weatherLocation) {
      setWeather(null);
      return;
    }
    try {
      const res = await fetch(
        `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(
          weatherLocation
        )}&aqi=no`
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
  }, [weatherLocation]);

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
    if (user?.role === 'manager' || user?.role === 'owner') {
      router.push('/(portal)/manager/profile' as any);
    } else {
      router.push('/(portal)/employee/profile' as any);
    }
  };

  const messageBadge = unreadCount > 99 ? '99+' : unreadCount;
  const notifTotal = notificationCount + newContentCount;
  const notifBadge = notifTotal > 99 ? '99+' : notifTotal;

  return (
    <GlassCard variant="glass" radius={20} style={styles.container}>
      {/* Greeting headline */}
      <Text style={[styles.greet, { color: colors.text }]} numberOfLines={1}>
        {t(greetingKey, greetingFallback)}
        {firstName ? (
          <>
            {', '}
            <Text style={{ color: colors.primary }}>{firstName}</Text>
          </>
        ) : null}
      </Text>

      {/* Row: avatar | name+title | weather | messages | notifications */}
      <View style={styles.hrow}>
        <TouchableOpacity
          onPress={handleProfilePress}
          activeOpacity={0.7}
          style={[styles.av, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
        >
          {profilePictureUrl ? (
            <Image source={{ uri: profilePictureUrl }} style={styles.avImg} />
          ) : (
            <IconSymbol
              ios_icon_name="person.fill"
              android_material_icon_name="person"
              size={20}
              color={colors.textSecondary}
            />
          )}
        </TouchableOpacity>

        <View style={styles.who}>
          <Text style={[styles.nm, { color: colors.text }]} numberOfLines={1}>
            {user?.name}
          </Text>
          {!!user?.jobTitle && (
            <Text style={[styles.jt, { color: colors.textSecondary }]} numberOfLines={1}>
              {user.jobTitle}
            </Text>
          )}
        </View>

        {weather && (
          <TouchableOpacity
            style={[styles.gl, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
            onPress={onWeatherPress}
            activeOpacity={0.7}
          >
            <Image source={{ uri: weather.conditionIcon }} style={styles.glWeatherIcon} />
            <Text style={[styles.glTemp, { color: colors.text }]}>{weather.temp}°</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.glIcon, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          onPress={() => router.push('/messages')}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="envelope.fill"
            android_material_icon_name="mail"
            size={18}
            color={colors.text}
          />
          {unreadCount > 0 && (
            <View style={[styles.dot, { backgroundColor: colors.blue, borderColor: colors.background }]}>
              <Text style={styles.dotText}>{messageBadge}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.glIcon, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          onPress={onNotificationPress}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="bell.fill"
            android_material_icon_name="notifications"
            size={18}
            color={colors.text}
          />
          {notifTotal > 0 && (
            <View style={[styles.dot, { backgroundColor: colors.blue, borderColor: colors.background }]}>
              <Text style={styles.dotText}>{notifBadge}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  greet: {
    fontFamily: fonts.display.bold,
    fontSize: 19,
    letterSpacing: -0.4,
    marginBottom: 11,
    paddingLeft: 2,
  },
  hrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  av: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  who: {
    flex: 1,
    minWidth: 0,
  },
  nm: {
    fontFamily: fonts.display.bold,
    fontSize: 14,
  },
  jt: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  gl: {
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 4,
  },
  glWeatherIcon: {
    width: 22,
    height: 22,
  },
  glTemp: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
  },
  glIcon: {
    minWidth: 40,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
  },
  dotText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    fontWeight: '700',
    color: '#06222B',
  },
});
