import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';

export default function OrganizationSettingsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId, organization, refreshOrganization } = useOrganization();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [saving, setSaving] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Form state — initialized from organization context
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [weatherLocation, setWeatherLocation] = useState('');
  const [googleMapsQuery, setGoogleMapsQuery] = useState('');
  const [rewardCurrencyName, setRewardCurrencyName] = useState('');
  const [allowSelfSignup, setAllowSelfSignup] = useState(true);
  const [menuCount, setMenuCount] = useState<1 | 2>(2);
  const [menu1Name, setMenu1Name] = useState('');
  const [menu2Name, setMenu2Name] = useState('');
  const [defaultPassword, setDefaultPassword] = useState('');

  useEffect(() => {
    setName(organization.name);
    setAddress(organization.address || '');
    setCity(organization.city || '');
    setState(organization.state || '');
    setZip(organization.zip || '');
    setWeatherLocation(organization.weather_location || '');
    setGoogleMapsQuery(organization.google_maps_query || '');
    setRewardCurrencyName(organization.reward_currency_name);
    setAllowSelfSignup(organization.allow_self_signup);
    setMenuCount(organization.menu_count);
    setMenu1Name(organization.menu_1_name);
    setMenu2Name(organization.menu_2_name);
    setDefaultPassword(organization.default_password);
    setLogoPreview(organization.logo_url);
  }, [organization]);

  const handlePickLogo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access to upload a logo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadLogo(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const uploadLogo = async (uri: string) => {
    if (!organizationId) return;
    setUploadingLogo(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${organizationId}/logo_${Date.now()}.${fileExt}`;

      let contentType = 'image/jpeg';
      if (fileExt === 'png') contentType = 'image/png';
      else if (fileExt === 'webp') contentType = 'image/webp';

      const { error: uploadError } = await supabase.storage
        .from('organization-logos')
        .upload(fileName, byteArray, { contentType, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('organization-logos')
        .getPublicUrl(fileName);

      await (supabase
        .from('organizations' as any)
        .update({ logo_url: urlData.publicUrl, updated_at: new Date().toISOString() })
        .eq('id', organizationId) as any);

      setLogoPreview(urlData.publicUrl);
      await refreshOrganization();
      Alert.alert('Done', 'Logo updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to upload logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    Alert.alert('Remove Logo', 'This will remove your restaurant logo. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await (supabase
              .from('organizations' as any)
              .update({ logo_url: null, updated_at: new Date().toISOString() })
              .eq('id', organizationId) as any);
            setLogoPreview(null);
            await refreshOrganization();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to remove logo.');
          }
        },
      },
    ]);
  };

  if (user?.role !== 'owner') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>
          Only the restaurant owner can access this screen.
        </Text>
        <TouchableOpacity style={[styles.saveButton, { marginTop: 20 }]} onPress={() => router.back()}>
          <Text style={styles.saveButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Restaurant name is required.');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await (supabase.rpc as any)('update_organization_settings', {
        p_organization_id: organizationId,
        p_user_id: user.id,
        p_name: name.trim(),
        p_address: address.trim() || null,
        p_city: city.trim() || null,
        p_state: state.trim() || null,
        p_zip: zip.trim() || null,
        p_weather_location: weatherLocation.trim() || null,
        p_google_maps_query: googleMapsQuery.trim() || null,
        p_reward_currency_name: rewardCurrencyName.trim() || 'Bucks',
        p_allow_self_signup: allowSelfSignup,
        p_menu_count: menuCount,
        p_menu_1_name: menu1Name.trim() || 'Menu 1',
        p_menu_2_name: menu2Name.trim() || 'Menu 2',
        p_default_password: defaultPassword.trim() || 'welcome123',
      });

      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to save settings.');
        return;
      }

      await refreshOrganization();
      Alert.alert('Saved', 'Organization settings updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateJoinCode = () => {
    Alert.alert(
      'Regenerate Join Code',
      'This will invalidate the current code. Employees who haven\'t joined yet will need the new code. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', style: 'destructive', onPress: doRegenerateCode },
      ]
    );
  };

  const doRegenerateCode = async () => {
    setRegeneratingCode(true);
    try {
      const { data, error } = await (supabase.rpc as any)('regenerate_join_code', {
        p_organization_id: organizationId,
        p_user_id: user!.id,
      });

      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to regenerate code.');
        return;
      }

      await refreshOrganization();
      Alert.alert('Done', `New join code: ${result.join_code}`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to regenerate join code.');
    } finally {
      setRegeneratingCode(false);
    }
  };

  const copyJoinCode = async () => {
    if (organization.join_code) {
      await Clipboard.setStringAsync(organization.join_code);
      Alert.alert('Copied', 'Join code copied to clipboard.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Organization Settings</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerSaveButton}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.headerSaveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Branding Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Branding</Text>

          {/* Logo Upload */}
          <View style={[styles.fieldContainer, { alignItems: 'center' }]}>
            <TouchableOpacity
              style={styles.logoUploadArea}
              onPress={handlePickLogo}
              disabled={uploadingLogo}
              activeOpacity={0.7}
            >
              {uploadingLogo ? (
                <ActivityIndicator size="large" color={colors.primary} />
              ) : logoPreview ? (
                <Image
                  source={{ uri: logoPreview }}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <IconSymbol
                    ios_icon_name="camera.fill"
                    android_material_icon_name="photo-camera"
                    size={32}
                    color={colors.textSecondary}
                  />
                  <Text style={[styles.logoPlaceholderText, { color: colors.textSecondary }]}>
                    Add Logo
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.logoActions}>
              <TouchableOpacity onPress={handlePickLogo} disabled={uploadingLogo}>
                <Text style={[styles.logoActionText, { color: colors.primary }]}>
                  {logoPreview ? 'Change Logo' : 'Upload Logo'}
                </Text>
              </TouchableOpacity>
              {logoPreview && (
                <TouchableOpacity onPress={handleRemoveLogo}>
                  <Text style={[styles.logoActionText, { color: '#E53935' }]}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.fieldHint}>Displayed on the login screen and app header</Text>
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Restaurant Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your restaurant name"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Reward Currency Name</Text>
            <TextInput
              style={styles.input}
              value={rewardCurrencyName}
              onChangeText={setRewardCurrencyName}
              placeholder="e.g. Bucks, Points, Stars"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        {/* Location Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Address</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Street address"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.row}>
            <View style={[styles.fieldContainer, { flex: 2 }]}>
              <Text style={styles.fieldLabel}>City</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholder="City"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={[styles.fieldContainer, { flex: 1, marginLeft: 12 }]}>
              <Text style={styles.fieldLabel}>State</Text>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                placeholder="NJ"
                placeholderTextColor={colors.textSecondary}
                maxLength={2}
                autoCapitalize="characters"
              />
            </View>
            <View style={[styles.fieldContainer, { flex: 1, marginLeft: 12 }]}>
              <Text style={styles.fieldLabel}>ZIP</Text>
              <TextInput
                style={styles.input}
                value={zip}
                onChangeText={setZip}
                placeholder="07052"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
          </View>
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Weather Location</Text>
            <TextInput
              style={styles.input}
              value={weatherLocation}
              onChangeText={setWeatherLocation}
              placeholder="e.g. Long Branch, NJ"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={styles.fieldHint}>Used for the weather widget on the home screen</Text>
          </View>
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Google Maps Search</Text>
            <TextInput
              style={styles.input}
              value={googleMapsQuery}
              onChangeText={setGoogleMapsQuery}
              placeholder="e.g. McLoone's Boathouse West Orange NJ"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={styles.fieldHint}>Used to find your restaurant for Google Reviews</Text>
          </View>
        </View>

        {/* Menu Configuration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Menu Configuration</Text>
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Number of Menus</Text>
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[styles.segment, menuCount === 1 && styles.segmentActive]}
                onPress={() => setMenuCount(1)}
              >
                <Text style={[styles.segmentText, menuCount === 1 && styles.segmentTextActive]}>
                  1 Menu
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segment, menuCount === 2 && styles.segmentActive]}
                onPress={() => setMenuCount(2)}
              >
                <Text style={[styles.segmentText, menuCount === 2 && styles.segmentTextActive]}>
                  2 Menus
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Menu 1 Name</Text>
            <TextInput
              style={styles.input}
              value={menu1Name}
              onChangeText={setMenu1Name}
              placeholder="e.g. Winter, Lunch, Main"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          {menuCount === 2 && (
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Menu 2 Name</Text>
              <TextInput
                style={styles.input}
                value={menu2Name}
                onChangeText={setMenu2Name}
                placeholder="e.g. Summer, Dinner, Seasonal"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          )}
        </View>

        {/* Employee Access Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Employee Access</Text>

          {/* Join Code */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Join Code</Text>
            <View style={styles.joinCodeRow}>
              <View style={styles.joinCodeDisplay}>
                <Text style={styles.joinCodeText}>{organization.join_code || '—'}</Text>
              </View>
              <TouchableOpacity style={styles.joinCodeAction} onPress={copyJoinCode}>
                <IconSymbol
                  ios_icon_name="doc.on.doc"
                  android_material_icon_name="content-copy"
                  size={20}
                  color={colors.primary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.joinCodeAction}
                onPress={handleRegenerateJoinCode}
                disabled={regeneratingCode}
              >
                {regeneratingCode ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <IconSymbol
                    ios_icon_name="arrow.clockwise"
                    android_material_icon_name="refresh"
                    size={20}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldHint}>Share this code with employees so they can join your restaurant</Text>
          </View>

          {/* Self Signup Toggle */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Allow Self-Signup</Text>
              <Text style={styles.fieldHint}>Employees can create their own accounts using the join code</Text>
            </View>
            <Switch
              value={allowSelfSignup}
              onValueChange={setAllowSelfSignup}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={allowSelfSignup ? colors.primary : colors.textSecondary}
            />
          </View>

          {/* Default Password */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Default Password</Text>
            <TextInput
              style={styles.input}
              value={defaultPassword}
              onChangeText={setDefaultPassword}
              placeholder="Default password for new accounts"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={styles.fieldHint}>Used when managers create accounts for employees</Text>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 60 : 16,
      paddingBottom: 12,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    headerSaveButton: {
      padding: 8,
    },
    headerSaveText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
    },
    scrollContent: {
      padding: 16,
    },
    section: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 16,
    },
    fieldContainer: {
      marginBottom: 16,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    fieldHint: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    row: {
      flexDirection: 'row',
      marginBottom: 0,
    },
    segmentedControl: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segment: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 8,
    },
    segmentActive: {
      backgroundColor: colors.primary,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    segmentTextActive: {
      color: '#fff',
    },
    joinCodeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    joinCodeDisplay: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    joinCodeText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: 1,
    },
    joinCodeAction: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    logoUploadArea: {
      width: 120,
      height: 120,
      borderRadius: 20,
      backgroundColor: colors.background,
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: 8,
    },
    logoImage: {
      width: 120,
      height: 120,
      borderRadius: 18,
    },
    logoPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoPlaceholderText: {
      fontSize: 12,
      fontWeight: '600',
      marginTop: 6,
    },
    logoActions: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 4,
    },
    logoActionText: {
      fontSize: 14,
      fontWeight: '600',
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    saveButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
