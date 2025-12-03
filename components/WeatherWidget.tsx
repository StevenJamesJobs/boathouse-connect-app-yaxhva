
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';

interface WeatherData {
  currentTemp: number;
  conditionIcon: string;
  highTemp: number;
  lowTemp: number;
  forecastDescription: string;
  conditionText: string;
}

interface WeatherWidgetProps {
  textColor: string;
  secondaryTextColor: string;
}

const WEATHER_API_KEY = '6e3db8832cf34a5bbc5182329251711';
const LOCATION = 'Perth Amboy, NJ'; // McLoone's Boathouse location

export default function WeatherWidget({ textColor, secondaryTextColor }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWeather();
  }, []);

  const fetchWeather = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(LOCATION)}&days=1&aqi=no&alerts=no`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch weather data');
      }

      const data = await response.json();
      console.log('Weather API Response:', data);

      const weatherData: WeatherData = {
        currentTemp: Math.round(data.current.temp_f),
        conditionIcon: `https:${data.current.condition.icon}`,
        conditionText: data.current.condition.text,
        highTemp: Math.round(data.forecast.forecastday[0].day.maxtemp_f),
        lowTemp: Math.round(data.forecast.forecastday[0].day.mintemp_f),
        forecastDescription: data.forecast.forecastday[0].day.condition.text,
      };

      setWeather(weatherData);
    } catch (err) {
      console.error('Error fetching weather:', err);
      setError('Unable to load weather data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={textColor} />
        <Text style={[styles.loadingText, { color: secondaryTextColor }]}>
          Loading weather...
        </Text>
      </View>
    );
  }

  if (error || !weather) {
    return (
      <View style={styles.errorContainer}>
        <Text style={[styles.errorText, { color: secondaryTextColor }]}>
          {error || 'Weather data unavailable'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.weatherContainer}>
      <View style={styles.currentWeather}>
        <Image
          source={{ uri: weather.conditionIcon }}
          style={styles.weatherIcon}
          resizeMode="contain"
        />
        <View style={styles.tempContainer}>
          <Text style={[styles.temperature, { color: textColor }]}>
            {weather.currentTemp}°F
          </Text>
          <Text style={[styles.conditionText, { color: secondaryTextColor }]}>
            {weather.conditionText}
          </Text>
        </View>
      </View>
      
      <View style={styles.tempRange}>
        <View style={styles.tempItem}>
          <Text style={[styles.tempLabel, { color: secondaryTextColor }]}>High</Text>
          <Text style={[styles.tempValue, { color: textColor }]}>{weather.highTemp}°F</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.tempItem}>
          <Text style={[styles.tempLabel, { color: secondaryTextColor }]}>Low</Text>
          <Text style={[styles.tempValue, { color: textColor }]}>{weather.lowTemp}°F</Text>
        </View>
      </View>

      <Text style={[styles.forecastDescription, { color: secondaryTextColor }]}>
        {weather.forecastDescription}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  weatherContainer: {
    alignItems: 'center',
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
  currentWeather: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  weatherIcon: {
    width: 80,
    height: 80,
  },
  tempContainer: {
    marginLeft: 12,
    alignItems: 'flex-start',
  },
  temperature: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  conditionText: {
    fontSize: 18,
    marginTop: 4,
  },
  tempRange: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  tempItem: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  tempLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  tempValue: {
    fontSize: 20,
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: '#E0E0E0',
  },
  forecastDescription: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 20,
  },
});
