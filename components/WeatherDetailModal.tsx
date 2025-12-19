
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Image,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';

interface DayForecast {
  date: string;
  dayOfWeek: string;
  conditionIcon: string;
  conditionText: string;
  highTemp: number;
  lowTemp: number;
}

interface WeatherDetailData {
  currentTemp: number;
  conditionIcon: string;
  conditionText: string;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  pressure: number;
  visibility: number;
  uvIndex: number;
  detailedForecast: string;
  sunrise: string;
  sunset: string;
  next4Days: DayForecast[];
  radarImageUrl: string;
}

interface WeatherDetailModalProps {
  visible: boolean;
  onClose: () => void;
  colors: {
    text: string;
    textSecondary: string;
    primary: string;
    card: string;
    border?: string;
  };
}

const WEATHER_API_KEY = '6e3db8832cf34a5bbc5182329251711';
const LOCATION = 'West Orange, NJ'; // Zip code 07003

export default function WeatherDetailModal({
  visible,
  onClose,
  colors,
}: WeatherDetailModalProps) {
  const [weatherData, setWeatherData] = useState<WeatherDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [radarExpanded, setRadarExpanded] = useState(false);

  useEffect(() => {
    if (visible) {
      console.log('Weather detail modal opened, fetching fresh data...');
      fetchDetailedWeather();
    }
  }, [visible]);

  const fetchDetailedWeather = async () => {
    try {
      setLoading(true);
      setError(null);

      // Request 7 days to ensure we get enough data for the next 4 days
      const response = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(LOCATION)}&days=7&aqi=no&alerts=no`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch weather data');
      }

      const data = await response.json();
      console.log('Detailed Weather API Response:', data);
      console.log('Total forecast days received:', data.forecast.forecastday.length);

      // Generate detailed forecast for today
      const today = data.forecast.forecastday[0];
      const todayDay = today.day;
      const todayAstro = today.astro;

      let detailedForecast = `Today's forecast: ${todayDay.condition.text}. `;
      detailedForecast += `High of ${Math.round(todayDay.maxtemp_f)}°F and low of ${Math.round(todayDay.mintemp_f)}°F. `;

      if (todayDay.daily_chance_of_rain > 30) {
        detailedForecast += `${todayDay.daily_chance_of_rain}% chance of rain. `;
      }

      if (todayDay.daily_chance_of_snow > 30) {
        detailedForecast += `${todayDay.daily_chance_of_snow}% chance of snow. `;
      }

      if (todayDay.maxwind_mph > 15) {
        detailedForecast += `Winds up to ${Math.round(todayDay.maxwind_mph)} mph. `;
      }

      detailedForecast += `Humidity around ${todayDay.avghumidity}%. `;

      if (todayDay.uv >= 6) {
        detailedForecast += `High UV index of ${todayDay.uv} - sun protection recommended. `;
      }

      if (todayDay.avgvis_miles < 5) {
        detailedForecast += `Reduced visibility of ${todayDay.avgvis_miles} miles. `;
      }

      detailedForecast += `Sunrise at ${todayAstro.sunrise}, sunset at ${todayAstro.sunset}.`;

      // Get today's date for comparison
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      console.log('Today\'s date (for filtering):', todayDate.toISOString());

      // Filter and get the next 4 days (excluding today)
      const next4Days: DayForecast[] = data.forecast.forecastday
        .filter((day: any, index: number) => {
          // Skip the first day (today)
          if (index === 0) {
            console.log(`Skipping day ${index} (today): ${day.date}`);
            return false;
          }
          
          const dayDate = new Date(day.date + 'T00:00:00');
          const isAfterToday = dayDate > todayDate;
          console.log(`Day ${index}: ${day.date} - After today: ${isAfterToday}`);
          return isAfterToday;
        })
        .slice(0, 4) // Take only the first 4 days after filtering
        .map((day: any, index: number) => {
          const date = new Date(day.date + 'T00:00:00');
          const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
          
          console.log(`Processing future day ${index + 1}: ${dayOfWeek} ${day.date} - High: ${Math.round(day.day.maxtemp_f)}°F, Low: ${Math.round(day.day.mintemp_f)}°F`);

          return {
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            dayOfWeek,
            conditionIcon: `https:${day.day.condition.icon}`,
            conditionText: day.day.condition.text,
            highTemp: Math.round(day.day.maxtemp_f),
            lowTemp: Math.round(day.day.mintemp_f),
          };
        });

      console.log('Next 4 days processed:', next4Days.length, 'days');
      next4Days.forEach((day, i) => {
        console.log(`  Day ${i + 1}: ${day.dayOfWeek} ${day.date} - High: ${day.highTemp}°F, Low: ${day.lowTemp}°F`);
      });

      // Use Northeast regional radar from NOAA with timestamp to force refresh
      const timestamp = Date.now();
      const radarImageUrl = `https://radar.weather.gov/ridge/standard/NORTHEAST_loop.gif?t=${timestamp}`;
      console.log('Radar URL with timestamp:', radarImageUrl);

      const weatherDetail: WeatherDetailData = {
        currentTemp: Math.round(data.current.temp_f),
        conditionIcon: `https:${data.current.condition.icon}`,
        conditionText: data.current.condition.text,
        feelsLike: Math.round(data.current.feelslike_f),
        humidity: data.current.humidity,
        windSpeed: Math.round(data.current.wind_mph),
        windDirection: data.current.wind_dir,
        pressure: Math.round(data.current.pressure_mb),
        visibility: Math.round(data.current.vis_miles),
        uvIndex: data.current.uv,
        detailedForecast,
        sunrise: todayAstro.sunrise,
        sunset: todayAstro.sunset,
        next4Days,
        radarImageUrl,
      };

      setWeatherData(weatherDetail);
    } catch (err) {
      console.error('Error fetching detailed weather:', err);
      setError('Unable to load weather data');
    } finally {
      setLoading(false);
    }
  };

  const handleSwipeGesture = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const { translationY } = event.nativeEvent;
      if (translationY > 100) {
        onClose();
      }
    }
  };

  const handleRadarSwipeGesture = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const { translationY } = event.nativeEvent;
      if (translationY > 100) {
        setRadarExpanded(false);
      }
    }
  };

  const openRadarExpanded = () => {
    console.log('Opening expanded radar view');
    setRadarExpanded(true);
  };

  const closeRadarExpanded = () => {
    console.log('Closing expanded radar view');
    setRadarExpanded(false);
  };

  const screenHeight = Dimensions.get('window').height;
  const screenWidth = Dimensions.get('window').width;

  return (
    <>
      <Modal
        visible={visible}
        transparent={true}
        animationType="slide"
        onRequestClose={onClose}
      >
        <GestureHandlerRootView style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={onClose}
          />
          <PanGestureHandler onHandlerStateChange={handleSwipeGesture}>
            <View style={[styles.modalContent, { backgroundColor: colors.card, height: screenHeight * 0.85 }]}>
              {/* Swipe Indicator */}
              <View style={styles.swipeIndicatorContainer}>
                <View style={[styles.swipeIndicator, { backgroundColor: colors.border || colors.textSecondary }]} />
              </View>

              {/* Close Button */}
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={32}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              {/* Content */}
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                      Loading detailed weather...
                    </Text>
                  </View>
                ) : error || !weatherData ? (
                  <View style={styles.errorContainer}>
                    <Text style={[styles.errorText, { color: colors.textSecondary }]}>
                      {error || 'Weather data unavailable'}
                    </Text>
                  </View>
                ) : (
                  <>
                    {/* Title */}
                    <Text style={[styles.title, { color: colors.text }]}>Weather Details</Text>
                    <Text style={[styles.location, { color: colors.textSecondary }]}>West Orange, NJ</Text>

                    {/* Current Weather Section */}
                    <View style={[styles.currentWeatherSection, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
                      <View style={styles.currentWeatherHeader}>
                        <Image
                          source={{ uri: weatherData.conditionIcon }}
                          style={styles.currentWeatherIcon}
                          resizeMode="contain"
                        />
                        <View style={styles.currentWeatherInfo}>
                          <Text style={[styles.currentTemp, { color: colors.text }]}>
                            {weatherData.currentTemp}°F
                          </Text>
                          <Text style={[styles.currentCondition, { color: colors.textSecondary }]}>
                            {weatherData.conditionText}
                          </Text>
                          <Text style={[styles.feelsLike, { color: colors.textSecondary }]}>
                            Feels like {weatherData.feelsLike}°F
                          </Text>
                        </View>
                      </View>

                      {/* Today's Detailed Forecast */}
                      <View style={styles.detailedForecastContainer}>
                        <Text style={[styles.detailedForecastTitle, { color: colors.text }]}>
                          Today&apos;s Detailed Forecast
                        </Text>
                        <Text style={[styles.detailedForecastText, { color: colors.textSecondary }]}>
                          {weatherData.detailedForecast}
                        </Text>
                      </View>

                      {/* Radar Image - Northeast Region - Clickable */}
                      <View style={styles.radarContainer}>
                        <Text style={[styles.radarTitle, { color: colors.text }]}>
                          Northeast Regional Radar
                        </Text>
                        <Text style={[styles.radarSubtitle, { color: colors.textSecondary }]}>
                          Tri-State Area (NY, NJ, CT)
                        </Text>
                        <TouchableOpacity
                          style={[styles.radarImageWrapper, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '20' }]}
                          onPress={openRadarExpanded}
                          activeOpacity={0.8}
                        >
                          <Image
                            source={{ uri: weatherData.radarImageUrl }}
                            style={styles.radarImage}
                            resizeMode="cover"
                          />
                          <View style={styles.radarOverlay}>
                            <IconSymbol
                              ios_icon_name="arrow.up.left.and.arrow.down.right"
                              android_material_icon_name="open_in_full"
                              size={24}
                              color="#FFFFFF"
                            />
                            <Text style={styles.radarOverlayText}>Tap to expand</Text>
                          </View>
                        </TouchableOpacity>
                      </View>

                      {/* Weather Details Grid - 2 rows of 3 items */}
                      <View style={styles.detailsGrid}>
                        {/* Row 1: Humidity, Wind, Visibility */}
                        <View style={styles.detailRow}>
                          <View style={styles.detailItem}>
                            <IconSymbol
                              ios_icon_name="drop.fill"
                              android_material_icon_name="water_drop"
                              size={18}
                              color={colors.primary}
                            />
                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Humidity</Text>
                            <Text style={[styles.detailValue, { color: colors.text }]}>{weatherData.humidity}%</Text>
                          </View>

                          <View style={styles.detailItem}>
                            <IconSymbol
                              ios_icon_name="wind"
                              android_material_icon_name="air"
                              size={18}
                              color={colors.primary}
                            />
                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Wind</Text>
                            <Text style={[styles.detailValue, { color: colors.text }]}>
                              {weatherData.windSpeed} mph
                            </Text>
                          </View>

                          <View style={styles.detailItem}>
                            <IconSymbol
                              ios_icon_name="eye.fill"
                              android_material_icon_name="visibility"
                              size={18}
                              color={colors.primary}
                            />
                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Visibility</Text>
                            <Text style={[styles.detailValue, { color: colors.text }]}>{weatherData.visibility} mi</Text>
                          </View>
                        </View>

                        {/* Row 2: UV Index, Sunrise, Sunset */}
                        <View style={styles.detailRow}>
                          <View style={styles.detailItem}>
                            <IconSymbol
                              ios_icon_name="sun.max.fill"
                              android_material_icon_name="wb_sunny"
                              size={18}
                              color={colors.primary}
                            />
                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>UV Index</Text>
                            <Text style={[styles.detailValue, { color: colors.text }]}>{weatherData.uvIndex}</Text>
                          </View>

                          <View style={styles.detailItem}>
                            <IconSymbol
                              ios_icon_name="sunrise.fill"
                              android_material_icon_name="wb_twilight"
                              size={18}
                              color={colors.primary}
                            />
                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Sunrise</Text>
                            <Text style={[styles.detailValue, { color: colors.text }]}>{weatherData.sunrise}</Text>
                          </View>

                          <View style={styles.detailItem}>
                            <IconSymbol
                              ios_icon_name="sunset.fill"
                              android_material_icon_name="wb_twilight"
                              size={18}
                              color={colors.primary}
                            />
                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Sunset</Text>
                            <Text style={[styles.detailValue, { color: colors.text }]}>{weatherData.sunset}</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Extended Forecast - 4 Days */}
                    <View style={styles.forecastSection}>
                      <Text style={[styles.forecastTitle, { color: colors.text }]}>Extended Forecast</Text>

                      {weatherData.next4Days.length === 0 ? (
                        <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
                          No forecast data available for the extended forecast.
                        </Text>
                      ) : (
                        <View style={styles.horizontalForecastContainer}>
                          {weatherData.next4Days.map((day, index) => (
                            <View
                              key={index}
                              style={[
                                styles.horizontalDayCard,
                                { backgroundColor: colors.primary + '10', borderColor: colors.primary + '20' }
                              ]}
                            >
                              {/* Day Name */}
                              <Text style={[styles.horizontalDayName, { color: colors.text }]}>
                                {day.dayOfWeek}
                              </Text>

                              {/* Weather Icon */}
                              <Image
                                source={{ uri: day.conditionIcon }}
                                style={styles.horizontalIcon}
                                resizeMode="contain"
                              />

                              {/* High Temperature */}
                              <View style={styles.horizontalTempRow}>
                                <IconSymbol
                                  ios_icon_name="arrow.up"
                                  android_material_icon_name="arrow_upward"
                                  size={14}
                                  color="#E74C3C"
                                />
                                <Text style={[styles.horizontalTempText, { color: colors.text }]}>
                                  {day.highTemp}°
                                </Text>
                              </View>

                              {/* Low Temperature */}
                              <View style={styles.horizontalTempRow}>
                                <IconSymbol
                                  ios_icon_name="arrow.down"
                                  android_material_icon_name="arrow_downward"
                                  size={14}
                                  color="#3498DB"
                                />
                                <Text style={[styles.horizontalTempText, { color: colors.textSecondary }]}>
                                  {day.lowTemp}°
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </PanGestureHandler>
        </GestureHandlerRootView>
      </Modal>

      {/* Expanded Radar Modal */}
      {radarExpanded && weatherData && (
        <Modal
          visible={radarExpanded}
          transparent={true}
          animationType="fade"
          onRequestClose={closeRadarExpanded}
        >
          <View style={styles.expandedRadarOverlay}>
            <TouchableOpacity
              style={styles.expandedRadarBackdrop}
              activeOpacity={1}
              onPress={closeRadarExpanded}
            />
            <GestureHandlerRootView style={styles.expandedRadarGestureContainer}>
              <PanGestureHandler onHandlerStateChange={handleRadarSwipeGesture}>
                <View style={styles.expandedRadarContainer}>
                  {/* Close Button */}
                  <TouchableOpacity style={styles.expandedRadarCloseButton} onPress={closeRadarExpanded}>
                    <IconSymbol
                      ios_icon_name="xmark.circle.fill"
                      android_material_icon_name="cancel"
                      size={36}
                      color="#FFFFFF"
                    />
                  </TouchableOpacity>

                  {/* Radar Image */}
                  <View style={styles.expandedRadarContent}>
                    <Text style={styles.expandedRadarTitle}>Northeast Regional Radar</Text>
                    <Text style={styles.expandedRadarSubtitle}>Tri-State Area (NY, NJ, CT)</Text>
                    <Image
                      source={{ uri: weatherData.radarImageUrl }}
                      style={styles.expandedRadarImage}
                      resizeMode="contain"
                    />
                  </View>

                  {/* Swipe Hint */}
                  <Text style={styles.expandedRadarSwipeHint}>Swipe down or tap X to close</Text>
                </View>
              </PanGestureHandler>
            </GestureHandlerRootView>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20,
    boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.3)',
    elevation: 10,
  },
  swipeIndicatorContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  swipeIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  location: {
    fontSize: 16,
    marginBottom: 20,
  },
  currentWeatherSection: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
  },
  currentWeatherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 16,
  },
  currentWeatherIcon: {
    width: 80,
    height: 80,
  },
  currentWeatherInfo: {
    flex: 1,
  },
  currentTemp: {
    fontSize: 48,
    fontWeight: 'bold',
    lineHeight: 56,
  },
  currentCondition: {
    fontSize: 18,
    marginTop: 4,
  },
  feelsLike: {
    fontSize: 14,
    marginTop: 2,
  },
  detailedForecastContainer: {
    marginBottom: 20,
  },
  detailedForecastTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  detailedForecastText: {
    fontSize: 14,
    lineHeight: 20,
  },
  radarContainer: {
    marginBottom: 20,
  },
  radarTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  radarSubtitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  radarImageWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    height: 200,
    position: 'relative',
  },
  radarImage: {
    width: '100%',
    height: '100%',
  },
  radarOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  radarOverlayText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  detailsGrid: {
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    gap: 4,
  },
  detailLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  forecastSection: {
    marginTop: 8,
  },
  forecastTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  noDataText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  horizontalForecastContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  horizontalDayCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    gap: 6,
  },
  horizontalDayName: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  horizontalIcon: {
    width: 48,
    height: 48,
    marginVertical: 2,
  },
  horizontalTempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  horizontalTempText: {
    fontSize: 14,
    fontWeight: '600',
  },
  expandedRadarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedRadarBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  expandedRadarGestureContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  expandedRadarContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  expandedRadarCloseButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
  },
  expandedRadarContent: {
    alignItems: 'center',
    width: '100%',
  },
  expandedRadarTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  expandedRadarSubtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 20,
    textAlign: 'center',
  },
  expandedRadarImage: {
    width: Dimensions.get('window').width - 40,
    height: Dimensions.get('window').height * 0.6,
    borderRadius: 12,
  },
  expandedRadarSwipeHint: {
    position: 'absolute',
    bottom: 40,
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.7,
    textAlign: 'center',
  },
});
