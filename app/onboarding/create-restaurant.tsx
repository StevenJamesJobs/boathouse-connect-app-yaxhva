import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { splashColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { generateJoinCode } from '@/utils/joinCode';

export default function CreateRestaurantScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const [restaurantName, setRestaurantName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [rewardCurrencyName, setRewardCurrencyName] = useState('Bucks');
  const [defaultPassword, setDefaultPassword] = useState('welcome123');
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!restaurantName.trim()) {
      Alert.alert('Validation Error', 'Restaurant name is required.');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'You must be signed in to create a restaurant.');
      return;
    }

    setIsLoading(true);

    try {
      const joinCode = generateJoinCode(restaurantName.trim());
      const slug = restaurantName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      const weatherLocation =
        city.trim() && state.trim()
          ? `${city.trim()}, ${state.trim()}`
          : '';

      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: restaurantName.trim(),
          slug,
          address: address.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          zip: zip.trim() || null,
          weather_location: weatherLocation || null,
          reward_currency_name: rewardCurrencyName.trim() || 'Bucks',
          join_code: joinCode,
          default_password: defaultPassword.trim() || 'welcome123',
          owner_id: user.id,
        })
        .select('id')
        .single();

      if (orgError) {
        console.error('[CreateRestaurant] Insert org error:', orgError);
        Alert.alert('Error', orgError.message || 'Failed to create restaurant.');
        setIsLoading(false);
        return;
      }

      // Link user to the new organization
      const { error: updateError } = await supabase
        .from('users')
        .update({ organization_id: orgData.id })
        .eq('id', user.id);

      if (updateError) {
        console.error('[CreateRestaurant] Update user org error:', updateError);
        Alert.alert('Error', 'Restaurant created but failed to link your account.');
        setIsLoading(false);
        return;
      }

      // Refresh auth so OrganizationContext picks up the new org
      await refreshUser();

      router.push({
        pathname: '/onboarding/setup-wizard',
        params: { organizationId: orgData.id },
      });
    } catch (err: any) {
      console.error('[CreateRestaurant] Unexpected error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Create Your Restaurant</Text>
          <Text style={styles.subtitle}>
            Tell us about your restaurant to get set up.
          </Text>
        </View>

        {/* Form */}
        <View style={styles.formContainer}>
          {/* Restaurant Name */}
          <Text style={styles.label}>Restaurant Name *</Text>
          <View style={styles.inputContainer}>
            <IconSymbol
              ios_icon_name="building.2.fill"
              android_material_icon_name="store"
              size={20}
              color={splashColors.textSecondary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="e.g. Joe's Bistro"
              placeholderTextColor={splashColors.textSecondary}
              value={restaurantName}
              onChangeText={setRestaurantName}
              autoCapitalize="words"
              editable={!isLoading}
            />
          </View>

          {/* Address */}
          <Text style={styles.label}>Address</Text>
          <View style={styles.inputContainer}>
            <IconSymbol
              ios_icon_name="mappin.circle.fill"
              android_material_icon_name="place"
              size={20}
              color={splashColors.textSecondary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Street address"
              placeholderTextColor={splashColors.textSecondary}
              value={address}
              onChangeText={setAddress}
              autoCapitalize="words"
              editable={!isLoading}
            />
          </View>

          {/* City / State / Zip row */}
          <View style={styles.row}>
            <View style={styles.rowFieldLarge}>
              <Text style={styles.label}>City</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="City"
                  placeholderTextColor={splashColors.textSecondary}
                  value={city}
                  onChangeText={setCity}
                  autoCapitalize="words"
                  editable={!isLoading}
                />
              </View>
            </View>
            <View style={styles.rowFieldSmall}>
              <Text style={styles.label}>State</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="ST"
                  placeholderTextColor={splashColors.textSecondary}
                  value={state}
                  onChangeText={setState}
                  autoCapitalize="characters"
                  maxLength={2}
                  editable={!isLoading}
                />
              </View>
            </View>
            <View style={styles.rowFieldSmall}>
              <Text style={styles.label}>Zip</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="00000"
                  placeholderTextColor={splashColors.textSecondary}
                  value={zip}
                  onChangeText={setZip}
                  keyboardType="number-pad"
                  maxLength={5}
                  editable={!isLoading}
                />
              </View>
            </View>
          </View>

          {/* Reward Currency */}
          <Text style={styles.label}>Reward Currency Name</Text>
          <View style={styles.inputContainer}>
            <IconSymbol
              ios_icon_name="star.fill"
              android_material_icon_name="star"
              size={20}
              color={splashColors.textSecondary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="e.g. Joe's Bucks"
              placeholderTextColor={splashColors.textSecondary}
              value={rewardCurrencyName}
              onChangeText={setRewardCurrencyName}
              autoCapitalize="words"
              editable={!isLoading}
            />
          </View>

          {/* Default Employee Password */}
          <Text style={styles.label}>Default Employee Password</Text>
          <View style={styles.inputContainer}>
            <IconSymbol
              ios_icon_name="key.fill"
              android_material_icon_name="vpn-key"
              size={20}
              color={splashColors.textSecondary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="welcome123"
              placeholderTextColor={splashColors.textSecondary}
              value={defaultPassword}
              onChangeText={setDefaultPassword}
              autoCapitalize="none"
              editable={!isLoading}
            />
          </View>

          {/* Create Button */}
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Create Restaurant</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: splashColors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  headerContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: splashColors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: splashColors.textSecondary,
    lineHeight: 22,
  },
  formContainer: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: splashColors.text,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: splashColors.text,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rowFieldLarge: {
    flex: 2,
  },
  rowFieldSmall: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: splashColors.primary,
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    boxShadow: '0px 4px 8px rgba(44, 95, 141, 0.2)',
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
