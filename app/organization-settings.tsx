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
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import MenuIconPicker from '@/components/MenuIconPicker';
import JobTitlesManager from '@/components/JobTitlesManager';
import AssistantsManager from '@/components/AssistantsManager';
import { supabase } from '@/app/integrations/supabase/client';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

type SettingsTab = 'branding' | 'menu' | 'jobs-tools' | 'access';

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'branding', label: 'Branding' },
  { key: 'menu', label: 'Menu' },
  { key: 'jobs-tools', label: 'Jobs & Tools' },
  { key: 'access', label: 'Access' },
];

export default function OrganizationSettingsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId, organization, refreshOrganization } = useOrganization();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<SettingsTab>('branding');
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
  const [menu1Icon, setMenu1Icon] = useState('snowflake');
  const [menu2Icon, setMenu2Icon] = useState('sun.max.fill');
  const [headerIcon, setHeaderIcon] = useState('fork.knife');
  const [defaultPassword, setDefaultPassword] = useState('');
  const [menuScope, setMenuScope] = useState<'shared' | 'per_menu'>('shared');
  const [scopeSaving, setScopeSaving] = useState(false);

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
    setMenuScope(organization.menu_category_scope);
    setMenu1Name(organization.menu_1_name);
    setMenu2Name(organization.menu_2_name);
    setMenu1Icon(organization.menu_1_icon);
    setMenu2Icon(organization.menu_2_icon);
    setHeaderIcon(organization.header_icon);
    setDefaultPassword(organization.default_password);
    setLogoPreview(organization.logo_url);
  }, [organization]);

  // Pull the latest org from the server when this screen opens, so the form
  // initializes from real DB values rather than a possibly-stale context
  // snapshot (e.g. right after onboarding). This makes the saved Google Maps
  // query and menu config show up correctly, and — critically — prevents a
  // Save from writing stale defaults back over good data.
  useEffect(() => {
    refreshOrganization();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Menu category scope toggle. Applies immediately via its own RPC (it
  // materializes the per-menu trees as a side-effect), separate from the Save
  // button. Switching is lossless: the shared tree is always preserved.
  const handleScopeChange = (next: 'shared' | 'per_menu') => {
    if (next === menuScope || scopeSaving) return;
    const apply = async () => {
      if (!organizationId || !user?.id) return;
      setScopeSaving(true);
      try {
        const { data, error } = await (supabase.rpc as any)('set_org_menu_category_scope', {
          p_organization_id: organizationId,
          p_user_id: user.id,
          p_scope: next,
        });
        if (error || (data && data.success === false)) {
          Alert.alert('Error', (data && data.error) || error?.message || 'Failed to change menu mode');
          return;
        }
        setMenuScope(next);
        await refreshOrganization();
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to change menu mode');
      } finally {
        setScopeSaving(false);
      }
    };
    if (next === 'per_menu') {
      Alert.alert(
        'Switch to Per-Menu categories?',
        'Each menu gets its own independent category list you can edit separately. New items will belong to a single menu (the "Both" option goes away). Items currently set to both menus stay visible on both until you re-tag them. You can switch back anytime.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Switch', onPress: apply },
        ],
      );
    } else {
      Alert.alert(
        'Switch to Shared categories?',
        'Both menus will share one category list again. Items can appear on Menu 1, Menu 2, or both. Your per-menu edits are kept and reappear if you switch back.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Switch', onPress: apply },
        ],
      );
    }
  };

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

    // Detect a newly added / changed Google Maps query so we can auto-import
    // reviews after saving (only when it actually changed — avoids a needless
    // Outscraper call on unrelated saves).
    const newQuery = googleMapsQuery.trim();
    const queryChanged = !!newQuery && newQuery !== (organization.google_maps_query || '').trim();

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
        p_menu_1_icon: menu1Icon,
        p_menu_2_icon: menu2Icon,
        p_header_icon: headerIcon,
      });

      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to save settings.');
        return;
      }

      await refreshOrganization();

      // If the Google Maps query was just added or changed, import reviews now
      // so the owner sees them right away (mirrors the onboarding auto-import).
      let reviewMsg = '';
      if (queryChanged) {
        try {
          const { data: imp, error: impErr } = await supabase.functions.invoke('import-google-reviews', {
            body: { source: 'manual', user_id: user?.id, organization_id: organizationId, backfill: true },
          });
          if (impErr) throw impErr;
          if (!imp?.success) throw new Error(imp?.error || 'Import failed');
          const n = imp.reviews_upserted ?? 0;
          reviewMsg = n > 0
            ? `\n\nImported ${n} Google review${n === 1 ? '' : 's'} for this location.`
            : '\n\nNo Google reviews found for that location yet — they\'ll appear automatically once customers post them.';
        } catch (e: any) {
          console.error('[OrgSettings] Review import on save failed:', e);
          reviewMsg = '\n\nWe couldn\'t import reviews from that location right now, but it\'s saved and we\'ll keep trying automatically.';
        }
      }

      Alert.alert('Saved', 'Organization settings updated successfully.' + reviewMsg);
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

  const showSaveButton = activeTab === 'branding' || activeTab === 'menu' || activeTab === 'access';

  // Swipe left/right to move between tabs (mirrors the home-screen gesture).
  const goToTabByDelta = (dir: 1 | -1) => {
    const idx = TABS.findIndex(t => t.key === activeTab);
    const next = idx + dir;
    if (next >= 0 && next < TABS.length) setActiveTab(TABS[next].key);
  };

  const tabSwipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-20, 20])
    .onEnd((e) => {
      if (e.translationX < -50 || e.velocityX < -500) {
        runOnJS(goToTabByDelta)(1);
      } else if (e.translationX > 50 || e.velocityX > 500) {
        runOnJS(goToTabByDelta)(-1);
      }
    });

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

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <GestureDetector gesture={tabSwipe}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* ─── Branding Tab ──────────────────────────────────────────── */}
        {activeTab === 'branding' && (
          <>
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
              </View>

              {/* Header Icon — paired with the logo since both appear in the app header */}
              <View style={styles.fieldContainer}>
                <MenuIconPicker label="Header Icon (shown next to your restaurant name)" value={headerIcon} onChange={setHeaderIcon} />
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
                  placeholder="e.g. McLoone's Boathouse, 9 Cherry Lane, West Orange NJ"
                  placeholderTextColor={colors.textSecondary}
                />
                <Text style={styles.fieldHint}>
                  Enter your restaurant's name and address exactly as it appears on Google Maps. We'll import
                  your Google Reviews from this location — saving a new or changed entry imports them right away.
                </Text>
              </View>
            </View>

          </>
        )}

        {/* ─── Menu Tab ───────────────────────────────────────────────── */}
        {activeTab === 'menu' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Menu Configuration</Text>

            {/* Number of menus */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Number of Menus</Text>
              <View style={styles.segmentedControl}>
                <TouchableOpacity
                  style={[styles.segment, menuCount === 1 && styles.segmentActive]}
                  onPress={() => setMenuCount(1)}
                >
                  <Text style={[styles.segmentText, menuCount === 1 && styles.segmentTextActive]}>1 Menu</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segment, menuCount === 2 && styles.segmentActive]}
                  onPress={() => setMenuCount(2)}
                >
                  <Text style={[styles.segmentText, menuCount === 2 && styles.segmentTextActive]}>2 Menus</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Category mode (2 menus only) — both options described up front */}
            {menuCount === 2 && (
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Category Mode</Text>
                <View style={styles.segmentedControl}>
                  <TouchableOpacity
                    style={[styles.segment, menuScope === 'shared' && styles.segmentActive]}
                    onPress={() => handleScopeChange('shared')}
                    disabled={scopeSaving}
                  >
                    <Text style={[styles.segmentText, menuScope === 'shared' && styles.segmentTextActive]}>Shared</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segment, menuScope === 'per_menu' && styles.segmentActive]}
                    onPress={() => handleScopeChange('per_menu')}
                    disabled={scopeSaving}
                  >
                    <Text style={[styles.segmentText, menuScope === 'per_menu' && styles.segmentTextActive]}>Per-Menu</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.scopeBullets}>
                  <View style={styles.scopeBulletRow}>
                    <Text style={styles.scopeBulletDot}>•</Text>
                    <Text style={styles.scopeBulletText}>
                      <Text style={styles.scopeBulletLead}>Shared — </Text>
                      both menus use one set of categories; an item can appear on {menu1Name || 'Menu 1'},{' '}
                      {menu2Name || 'Menu 2'}, or both.
                    </Text>
                  </View>
                  <View style={styles.scopeBulletRow}>
                    <Text style={styles.scopeBulletDot}>•</Text>
                    <Text style={styles.scopeBulletText}>
                      <Text style={styles.scopeBulletLead}>Per-Menu — </Text>
                      each menu has its own independent categories; every item belongs to a single menu.
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Menu 1 name + icon */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Menu 1 Name</Text>
              <View style={styles.nameIconRow}>
                <MenuIconPicker compact label={`${menu1Name || 'Menu 1'} Icon`} value={menu1Icon} onChange={setMenu1Icon} />
                <TextInput
                  style={[styles.input, styles.nameIconInput]}
                  value={menu1Name}
                  onChangeText={setMenu1Name}
                  placeholder="e.g. Winter, Lunch, Main"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            {/* Menu 2 name + icon (2 menus only) */}
            {menuCount === 2 && (
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Menu 2 Name</Text>
                <View style={styles.nameIconRow}>
                  <MenuIconPicker compact label={`${menu2Name || 'Menu 2'} Icon`} value={menu2Icon} onChange={setMenu2Icon} />
                  <TextInput
                    style={[styles.input, styles.nameIconInput]}
                    value={menu2Name}
                    onChangeText={setMenu2Name}
                    placeholder="e.g. Summer, Dinner, Seasonal"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {/* ─── Jobs & Tools Tab ───────────────────────────────────────── */}
        {activeTab === 'jobs-tools' && (
          <>
            <JobTitlesManager colors={colors} />
            <AssistantsManager colors={colors} />
          </>
        )}

        {/* ─── Access Tab ─────────────────────────────────────────────── */}
        {activeTab === 'access' && (
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
        )}

        {/* Save Button — only on tabs with form fields */}
        {showSaveButton && (
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
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
      </GestureDetector>
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
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 4,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
    },
    tabActive: {
      backgroundColor: colors.primary,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: '#fff',
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
    nameIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    nameIconInput: {
      flex: 1,
    },
    scopeBullets: {
      marginTop: 10,
      gap: 6,
    },
    scopeBulletRow: {
      flexDirection: 'row',
      gap: 6,
    },
    scopeBulletDot: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },
    scopeBulletText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },
    scopeBulletLead: {
      fontWeight: '700',
      color: colors.text,
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
