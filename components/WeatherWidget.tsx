
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';

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

  const generateDetailedForecast = (data: any): string => {
    const day = data.forecast.forecastday[0].day;
    const astro = data.forecast.forecastday[0].astro;
    const hour = data.forecast.forecastday[0].hour;
    
    // Get current hour
    const currentHour = new Date().getHours();
    
    // Find the forecast for the next few hours
    const upcomingHours = hour.slice(currentHour, currentHour + 6);
    
    // Build a detailed description
    let description = `Today's forecast: ${day.condition.text}. `;
    description += `High of ${Math.round(day.maxtemp_f)}°F and low of ${Math.round(day.mintemp_f)}°F. `;
    
    // Add precipitation info if applicable
    if (day.daily_chance_of_rain > 30) {
      description += `${day.daily_chance_of_rain}% chance of rain. `;
    }
    
    if (day.daily_chance_of_snow > 30) {
      description += `${day.daily_chance_of_snow}% chance of snow. `;
    }
    
    // Add wind information
    if (day.maxwind_mph > 15) {
      description += `Winds up to ${Math.round(day.maxwind_mph)} mph. `;
    }
    
    // Add humidity info
    description += `Humidity around ${day.avghumidity}%. `;
    
    // Add UV index warning if high
    if (day.uv >= 6) {
      description += `High UV index of ${day.uv} - sun protection recommended. `;
    }
    
    // Add visibility info if poor
    if (day.avgvis_miles < 5) {
      description += `Reduced visibility of ${day.avgvis_miles} miles. `;
    }
    
    // Add sunrise/sunset info
    description += `Sunrise at ${astro.sunrise}, sunset at ${astro.sunset}.`;
    
    return description;
  };

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

      <View style={styles.forecastContainer}>
        <Text style={[styles.forecastTitle, { color: textColor }]}>
          Today&apos;s Forecast
        </Text>
        <Text style={[styles.detailedForecast, { color: secondaryTextColor }]}>
          {weather.detailedForecast}
        </Text>
      </View>
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
    marginBottom: 16,
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
  forecastContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    width: '100%',
  },
  forecastTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  detailedForecast: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'left',
  },
});
