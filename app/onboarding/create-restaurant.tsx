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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { splashColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface CreatedAccount {
  orgId: string;
  username: string;
  joinCode: string;
}

export default function CreateRestaurantScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const params = useLocalSearchParams<{
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }>();

  const [restaurantName, setRestaurantName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [rewardCurrencyName, setRewardCurrencyName] = useState('Bucks');
  const [defaultPassword, setDefaultPassword] = useState('welcome123');
  const [isLoading, setIsLoading] = useState(false);
  const [created, setCreated] = useState<CreatedAccount | null>(null);

  // Guard against landing here without owner details (e.g. deep link / reload).
  const hasOwnerDetails =
    !!params.firstName && !!params.lastName && !!params.password;

  const handleCreate = async () => {
    if (!restaurantName.trim()) {
      Alert.alert('Validation Error', 'Restaurant name is required.');
      return;
    }

    if (!hasOwnerDetails) {
      Alert.alert('Error', 'Your account details are missing. Please start over.', [
        { text: 'OK', onPress: () => router.replace('/onboarding/signup') },
      ]);
      return;
    }

    setIsLoading(true);

    try {
      const weatherLocation =
        city.trim() && state.trim() ? `${city.trim()}, ${state.trim()}` : '';

      // Atomic: creates the organization, the owner account, and the 14-day
      // trial in one transaction, returning the resolved username + join code.
      const { data, error } = await (supabase.rpc as any)('signup_owner_with_org', {
        p_first_name: params.firstName,
        p_last_name: params.lastName,
        p_email: params.email ?? '',
        p_password: params.password,
        p_restaurant_name: restaurantName.trim(),
        p_reward_currency_name: rewardCurrencyName.trim() || 'Bucks',
        p_default_password: defaultPassword.trim() || 'welcome123',
        p_address: address.trim() || null,
        p_city: city.trim() || null,
        p_state: state.trim() || null,
        p_zip: zip.trim() || null,
        p_weather_location: weatherLocation || null,
      });

      if (error) {
        console.error('[CreateRestaurant] signup_owner_with_org error:', error);
        Alert.alert('Error', error.message || 'Failed to create restaurant.');
        setIsLoading(false);
        return;
      }

      const result = data as {
        user_id: string;
        org_id: string;
        username: string;
        join_code: string;
      };

      // Auto-login with the freshly created owner credentials.
      const loginSuccess = await login(result.username, params.password as string, true);
      if (!loginSuccess) {
        console.warn('[CreateRestaurant] Auto-login failed after signup');
        Alert.alert(
          'Account Created',
          `Your restaurant is ready. Sign in with username "${result.username}".`,
          [{ text: 'OK', onPress: () => router.replace('/login') }],
        );
        setIsLoading(false);
        return;
      }

      // Show the assigned username before moving into setup.
      setCreated({
        orgId: result.org_id,
        username: result.username,
        joinCode: result.join_code,
      });
    } catch (err: any) {
      console.error('[CreateRestaurant] Unexpected error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (created) {
    return (
      <View style={[styles.container, styles.successContainer]}>
        <View style={styles.successIcon}>
          <IconSymbol
            ios_icon_name="checkmark.circle.fill"
            android_material_icon_name="check-circle"
            size={72}
            color="#4CAF50"
          />
        </View>
        <Text style={styles.successTitle}>You&apos;re all set!</Text>
        <Text style={styles.successSubtitle}>
          Your restaurant and owner account have been created.
        </Text>

        <View style={styles.credCard}>
          <Text style={styles.credLabel}>Your username</Text>
          <Text style={styles.credValue}>{created.username}</Text>
          <Text style={styles.credHint}>Use this to sign in next time.</Text>
        </View>

        <View style={styles.credCard}>
          <Text style={styles.credLabel}>Your team&apos;s join code</Text>
          <Text style={styles.credValue}>{created.joinCode}</Text>
          <Text style={styles.credHint}>Share it so staff can join your restaurant.</Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() =>
            router.replace({
              pathname: '/onboarding/setup-wizard',
              params: { organizationId: created.orgId },
            })
          }
        >
          <Text style={styles.primaryButtonText}>Continue to Setup</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
  // Success screen
  successContainer: {
    paddingHorizontal: 24,
    paddingTop: 100,
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: splashColors.text,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: splashColors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  credCard: {
    width: '100%',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  credLabel: {
    fontSize: 13,
    color: splashColors.textSecondary,
    marginBottom: 4,
  },
  credValue: {
    fontSize: 24,
    fontWeight: '700',
    color: splashColors.primary,
    letterSpacing: 1,
  },
  credHint: {
    fontSize: 12,
    color: splashColors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
});
