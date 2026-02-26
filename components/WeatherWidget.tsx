
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';

interface WeatherData {
  currentTemp: number;
  conditionIcon: string;
  highTemp: number;
  lowTemp: number;
  forecastDescription: string;
  conditionText: string;
  detailedForecast: string;
}

interface WeatherWidgetProps {
  textColor: string;
  secondaryTextColor: string;
  language?: string;
  onPress?: () => void;
}

const WEATHER_API_KEY = '6e3db8832cf34a5bbc5182329251711';
const LOCATION = 'West Orange, NJ'; // McLoone's Boathouse location - zip code 07003

export default function WeatherWidget({ textColor, secondaryTextColor, language = 'en', onPress }: WeatherWidgetProps) {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generateDetailedForecast = (data: any): string => {
    const day = data.forecast.forecastday[0].day;
    const astro = data.forecast.forecastday[0].astro;

    // Build a detailed description using i18n translations
    let parts: string[] = [];

    parts.push(t('weather.forecast_condition', { condition: day.condition.text }));
    parts.push(t('weather.forecast_high_low', { high: Math.round(day.maxtemp_f), low: Math.round(day.mintemp_f) }));

    // Add precipitation info if applicable
    if (day.daily_chance_of_rain > 30) {
      parts.push(t('weather.forecast_rain', { percent: day.daily_chance_of_rain }));
    }

    if (day.daily_chance_of_snow > 30) {
      parts.push(t('weather.forecast_snow', { percent: day.daily_chance_of_snow }));
    }

    // Add wind information
    if (day.maxwind_mph > 15) {
      parts.push(t('weather.forecast_wind', { speed: Math.round(day.maxwind_mph) }));
    }

    // Add humidity info
    parts.push(t('weather.forecast_humidity', { humidity: day.avghumidity }));

    // Add UV index warning if high
    if (day.uv >= 6) {
      parts.push(t('weather.forecast_uv', { uv: day.uv }));
    }

    // Add visibility info if poor
    if (day.avgvis_miles < 5) {
      parts.push(t('weather.forecast_visibility', { vis: day.avgvis_miles }));
    }

    // Add sunrise/sunset info
    parts.push(t('weather.forecast_sun_times', { sunrise: astro.sunrise, sunset: astro.sunset }));

    return parts.join(' ');
  };

  const fetchWeather = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const langParam = language === 'es' ? 'es' : 'en';
      const response = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(LOCATION)}&days=1&aqi=no&alerts=no&lang=${langParam}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch weather data');
      }

      const data = await response.json();

      const detailedForecast = generateDetailedForecast(data);

      const weatherData: WeatherData = {
        currentTemp: Math.round(data.current.temp_f),
        conditionIcon: `https:${data.current.condition.icon}`,
        conditionText: data.current.condition.text,
        highTemp: Math.round(data.forecast.forecastday[0].day.maxtemp_f),
        lowTemp: Math.round(data.forecast.forecastday[0].day.mintemp_f),
        forecastDescription: data.forecast.forecastday[0].day.condition.text,
        detailedForecast: detailedForecast,
      };

      setWeather(weatherData);
    } catch (err) {
      console.error('Error fetching weather:', err);
      setError(t('weather.error'));
    } finally {
      setLoading(false);
    }
  }, [language, t]);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={textColor} />
        <Text style={[styles.loadingText, { color: secondaryTextColor }]}>
          {t('weather.loading')}
        </Text>
      </View>
    );
  }

  if (error || !weather) {
    return (
      <View style={styles.errorContainer}>
        <Text style={[styles.errorText, { color: secondaryTextColor }]}>
          {error || t('weather.unavailable')}
        </Text>
      </View>
    );
  }

  const content = (
    <View style={styles.weatherContainer}>
      {/* Compact Layout: Left side with icon and temps, Right side with forecast */}
      <View style={styles.compactLayout}>
        {/* Left Side: Icon, Temps, and Short Description */}
        <View style={styles.leftSection}>
          <Image
            source={{ uri: weather.conditionIcon }}
            style={styles.weatherIcon}
            resizeMode="contain"
          />
          <View style={styles.tempInfo}>
            <View style={styles.tempRow}>
              <Text style={[styles.tempLabel, { color: secondaryTextColor }]}>{t('weather.high')}</Text>
              <Text style={[styles.tempValue, { color: textColor }]}>{weather.highTemp}°F</Text>
            </View>
            <View style={styles.tempRow}>
              <Text style={[styles.tempLabel, { color: secondaryTextColor }]}>{t('weather.low')}</Text>
              <Text style={[styles.tempValue, { color: textColor }]}>{weather.lowTemp}°F</Text>
            </View>
            <Text style={[styles.conditionText, { color: secondaryTextColor }]}>
              {weather.conditionText}
            </Text>
          </View>
        </View>

        {/* Right Side: Detailed Forecast */}
        <View style={styles.rightSection}>
          <Text style={[styles.forecastTitle, { color: textColor }]}>
            {t('weather.todays_forecast')}
          </Text>
          <Text style={[styles.detailedForecast, { color: secondaryTextColor }]} numberOfLines={6}>
            {weather.detailedForecast}
          </Text>
          {onPress && (
            <Text style={[styles.tapHint, { color: secondaryTextColor }]}>
              {t('weather.tap_for_details')}
            </Text>
          )}
        </View>
      </View>
    </View>
  );

  // If onPress is provided, wrap in TouchableOpacity
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  weatherContainer: {
    width: '100%',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  compactLayout: {
    flexDirection: 'row',
    gap: 16,
  },
  leftSection: {
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: 120,
  },
  weatherIcon: {
    width: 64,
    height: 64,
    marginBottom: 8,
  },
  tempInfo: {
    alignItems: 'center',
    gap: 4,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tempLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  tempValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  conditionText: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  rightSection: {
    flex: 1,
    paddingLeft: 16,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0, 0, 0, 0.1)',
  },
  forecastTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  detailedForecast: {
    fontSize: 13,
    lineHeight: 19,
  },
  tapHint: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 8,
    opacity: 0.7,
  },
});
