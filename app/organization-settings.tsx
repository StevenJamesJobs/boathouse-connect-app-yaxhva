import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Dimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useManagerPermissions } from '@/hooks/useManagerPermissions';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import MenuIconPicker from '@/components/MenuIconPicker';
import JobTitlesManager from '@/components/JobTitlesManager';
import AssistantsManager from '@/components/AssistantsManager';
import { supabase } from '@/app/integrations/supabase/client';
import { brokerUploadImage } from '@/utils/storageBroker';
import { translateServerError } from '@/utils/serverErrors';

type SettingsTab = 'branding' | 'menu' | 'jobs-tools' | 'access';

const TABS: { key: SettingsTab; labelKey: string }[] = [
  { key: 'branding', labelKey: 'org_settings.tab_branding' },
  { key: 'menu', labelKey: 'org_settings.tab_menu' },
  { key: 'jobs-tools', labelKey: 'org_settings.tab_jobs_tools' },
  { key: 'access', labelKey: 'org_settings.tab_access' },
];

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function OrganizationSettingsScreen() {
  const router = useRouter();
  const { tab, scoped } = useLocalSearchParams<{ tab?: string; scoped?: string }>();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId, organization, refreshOrganization } = useOrganization();
  const { perms, loading: permsLoading } = useManagerPermissions();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Scoped entry (?tab=menu&scoped=1): a granted manager deep-links here from
  // the Menu sheet and sees ONLY the Menu page — no tab bar, no sibling pages,
  // and Save writes just the menu fields. Plain ?tab=menu (owner deep-link)
  // keeps the full screen and merely preselects the Menu tab.
  const scopedMenu = tab === 'menu' && scoped === '1';

  const [activeTab, setActiveTab] = useState<SettingsTab>(scopedMenu ? 'menu' : tab === 'menu' ? 'menu' : 'branding');
  const [saving, setSaving] = useState(false);
  const [savingGmaps, setSavingGmaps] = useState(false);
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
  const [staffCanViewRoster, setStaffCanViewRoster] = useState(true);
  const [menuCount, setMenuCount] = useState<1 | 2>(2);
  const [menu1Name, setMenu1Name] = useState('');
  const [menu2Name, setMenu2Name] = useState('');
  const [menu1Icon, setMenu1Icon] = useState('snowflake');
  const [menu2Icon, setMenu2Icon] = useState('sun.max.fill');
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
    setStaffCanViewRoster(organization.staff_can_view_roster);
    setMenuCount(organization.menu_count);
    setMenuScope(organization.menu_category_scope);
    setMenu1Name(organization.menu_1_name);
    setMenu2Name(organization.menu_2_name);
    setMenu1Icon(organization.menu_1_icon);
    setMenu2Icon(organization.menu_2_icon);
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

  // Paged horizontal tabs (content follows the finger, like the home screen).
  // Declared above the access gate: the scoped-entry spinner below returns
  // early while permissions load, so every hook must run before that return
  // to keep the hook order stable across renders.
  const pagerRef = useRef<ScrollView>(null);

  // Owner deep-link (?tab=menu without scoped=1): activeTab already starts on
  // Menu, so just land the pager there too. Deferred a frame so the pager has
  // laid out before the jump. Scoped mode renders the Menu page as the only
  // child, so no jump is needed.
  useEffect(() => {
    if (scopedMenu || tab !== 'menu') return;
    requestAnimationFrame(() => {
      const idx = TABS.findIndex(tb => tb.key === 'menu');
      pagerRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: false });
    });
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
        const { data, error } = await supabase.rpc('set_org_menu_category_scope', {
          p_organization_id: organizationId,
          p_user_id: user.id,
          p_scope: next,
        });
        const res = data as { success?: boolean; error?: string } | null;
        if (error || (res && res.success === false)) {
          Alert.alert(
            t('common:error'),
            translateServerError(
              { message: (res && res.error) || error?.message || null },
              t('org_settings.scope_change_failed', 'Failed to change menu mode'),
            ),
          );
          return;
        }
        setMenuScope(next);
        await refreshOrganization();
      } catch (e: any) {
        Alert.alert(t('common:error'), translateServerError(e, t('org_settings.scope_change_failed', 'Failed to change menu mode')));
      } finally {
        setScopeSaving(false);
      }
    };
    if (next === 'per_menu') {
      Alert.alert(
        t('org_settings.switch_per_menu_title', 'Switch to Per-Menu categories?'),
        t('org_settings.switch_per_menu_msg', 'Each menu gets its own independent category list you can edit separately. New items will belong to a single menu (the "Both" option goes away). Items currently set to both menus stay visible on both until you re-tag them. You can switch back anytime.'),
        [
          { text: t('common:cancel'), style: 'cancel' },
          { text: t('org_settings.switch_btn', 'Switch'), onPress: apply },
        ],
      );
    } else {
      Alert.alert(
        t('org_settings.switch_shared_title', 'Switch to Shared categories?'),
        t('org_settings.switch_shared_msg', 'Both menus will share one category list again. Items can appear on Menu 1, Menu 2, or both. Your per-menu edits are kept and reappear if you switch back.'),
        [
          { text: t('common:cancel'), style: 'cancel' },
          { text: t('org_settings.switch_btn', 'Switch'), onPress: apply },
        ],
      );
    }
  };

  const handlePickLogo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('org_settings.permission_required', 'Permission Required'),
          t('org_settings.photo_permission_msg', 'Please grant photo library access to upload a logo.'),
        );
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
      Alert.alert(t('common:error'), t('org_settings.pick_image_failed', 'Failed to pick image.'));
    }
  };

  const uploadLogo = async (uri: string) => {
    if (!organizationId || !user?.id) return;
    setUploadingLogo(true);
    try {
      const publicUrl = await brokerUploadImage('org_logo', uri, user.id);
      // Early return (not a throw): translateServerError echoes any non-empty
      // message verbatim, so throwing the English literal would make the
      // translated fallback in the catch unreachable.
      if (!publicUrl) {
        Alert.alert(t('common:error'), t('org_settings.logo_upload_failed', 'Failed to upload logo.'));
        return;
      }

      const { data: logoRes, error: logoError } = await supabase.rpc('set_org_logo', {
        p_actor_id: user.id,
        p_logo_url: publicUrl,
      });
      if (logoError) throw logoError;
      const logoResult: any = typeof logoRes === 'string' ? JSON.parse(logoRes) : logoRes;
      if (logoResult && logoResult.success === false) throw new Error(logoResult.error);

      setLogoPreview(publicUrl);
      await refreshOrganization();
      Alert.alert(t('org_settings.done', 'Done'), t('org_settings.logo_updated', 'Logo updated successfully.'));
    } catch (err: any) {
      Alert.alert(t('common:error'), translateServerError(err, t('org_settings.logo_upload_failed', 'Failed to upload logo.')));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    Alert.alert(t('org_settings.remove_logo_title', 'Remove Logo'), t('org_settings.remove_logo_msg', 'This will remove your restaurant logo. Continue?'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('org_settings.remove', 'Remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            if (!user?.id) return;
            // p_logo_url omitted → the RPC clears the logo (sets NULL).
            const { data: remRes, error: remError } = await supabase.rpc('set_org_logo', {
              p_actor_id: user.id,
            });
            if (remError) throw remError;
            const remResult: any = typeof remRes === 'string' ? JSON.parse(remRes) : remRes;
            if (remResult && remResult.success === false) throw new Error(remResult.error);
            setLogoPreview(null);
            await refreshOrganization();
          } catch (err: any) {
            Alert.alert(t('common:error'), translateServerError(err, t('org_settings.logo_remove_failed', 'Failed to remove logo.')));
          }
        },
      },
    ]);
  };

  // Owners always pass. A manager passes ONLY into the scoped Menu entry, and
  // only with the menuConfig grant; while the grant check is in flight, show a
  // plain spinner rather than flashing the access-denied bounce.
  if (user?.role !== 'owner') {
    const scopedManager = scopedMenu && user?.role === 'manager';
    if (scopedManager && permsLoading) {
      return (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    if (!scopedManager || !perms.menuConfig) {
      return (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>
            {t('org_settings.access_denied', 'Only the restaurant owner can access this screen.')}
          </Text>
          <TouchableOpacity style={[styles.saveButton, { marginTop: 20 }]} onPress={() => router.back()}>
            <Text style={styles.saveButtonText}>{t('manage_categories:go_back', 'Go Back')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
  }

  const handleSave = async () => {
    // Scoped mode doesn't send the name, so don't validate a field the manager
    // can neither see nor save.
    if (!scopedMenu && !name.trim()) {
      Alert.alert(t('common:error'), t('onboarding:restaurant_name_required', 'Restaurant name is required.'));
      return;
    }
    if (!organizationId || !user?.id) return;

    // Detect a newly added / changed Google Maps query so we can auto-import
    // reviews after saving (only when it actually changed — avoids a needless
    // Outscraper call on unrelated saves). Never in scoped mode: the query
    // isn't part of a scoped save.
    const newQuery = googleMapsQuery.trim();
    const queryChanged = !scopedMenu && !!newQuery && newQuery !== (organization.google_maps_query || '').trim();

    setSaving(true);
    try {
      // Scoped managers may write ONLY the menu fields — the server rejects any
      // non-NULL non-menu param from a manager, so nothing else is sent.
      const { data, error } = await supabase.rpc('update_organization_settings', scopedMenu
        ? {
            p_organization_id: organizationId,
            p_user_id: user.id,
            p_menu_count: menuCount,
            p_menu_1_name: menu1Name.trim() || 'Menu 1',
            p_menu_2_name: menu2Name.trim() || 'Menu 2',
            p_menu_1_icon: menu1Icon,
            p_menu_2_icon: menu2Icon,
          }
        : {
            p_organization_id: organizationId,
            p_user_id: user.id,
            p_name: name.trim(),
            p_address: address.trim() || undefined,
            p_city: city.trim() || undefined,
            p_state: state.trim() || undefined,
            p_zip: zip.trim() || undefined,
            p_weather_location: weatherLocation.trim() || undefined,
            p_google_maps_query: googleMapsQuery.trim() || undefined,
            p_reward_currency_name: rewardCurrencyName.trim() || 'Bucks',
            p_allow_self_signup: allowSelfSignup,
            p_staff_can_view_roster: staffCanViewRoster,
            p_menu_count: menuCount,
            p_menu_1_name: menu1Name.trim() || 'Menu 1',
            p_menu_2_name: menu2Name.trim() || 'Menu 2',
            p_default_password: defaultPassword.trim() || 'welcome123',
            p_menu_1_icon: menu1Icon,
            p_menu_2_icon: menu2Icon,
          });

      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result.success) {
        Alert.alert(t('common:error'), translateServerError({ message: result.error }, t('org_settings.save_failed', 'Failed to save settings.')));
        return;
      }

      await refreshOrganization();

      // If the Google Maps query was just added or changed, import reviews — but
      // DON'T block the Save spinner on it. The Outscraper scrape can be slow (or
      // time out server-side), so kick it off in the background and refresh the
      // org when it lands. (The Mon/Thu auto-refresh + the Update button retry it.)
      if (queryChanged) {
        Alert.alert(
          t('org_settings.saved_title', 'Saved'),
          t('org_settings.saved_importing_msg', 'Organization settings updated.\n\nWe\'re importing Google reviews for this location now — they\'ll appear shortly. You can re-import anytime with the Update button next to the Google Maps field.'),
        );
        supabase.functions
          .invoke('import-google-reviews', { body: { source: 'manual', user_id: user?.id, organization_id: organizationId, backfill: true } })
          .then(() => refreshOrganization())
          .catch((e: any) => console.error('[OrgSettings] background review import failed:', e));
      } else {
        Alert.alert(t('org_settings.saved_title', 'Saved'), t('org_settings.saved_msg', 'Organization settings updated successfully.'));
      }
    } catch (err: any) {
      Alert.alert(t('common:error'), translateServerError(err, t('org_settings.save_failed', 'Failed to save settings.')));
    } finally {
      setSaving(false);
    }
  };

  // Save ONLY the Google Maps location + re-import reviews, without a full
  // settings save. Lets the owner re-try a changed/failed location quickly.
  const handleUpdateGoogleMaps = async () => {
    const q = googleMapsQuery.trim();
    if (!q) {
      Alert.alert(t('common:error'), t('org_settings.gmaps_required', 'Enter a Google Maps location first.'));
      return;
    }
    if (!organizationId || !user?.id) return;
    setSavingGmaps(true);
    try {
      const { data, error } = await supabase.rpc('update_organization_settings', {
        p_organization_id: organizationId,
        p_user_id: user.id,
        p_google_maps_query: q,
      });
      if (error) throw error;
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      // Empty (not an English literal) so the translated fallback in the catch
      // wins — translateServerError echoes any non-empty message verbatim.
      if (!result?.success) throw new Error(result?.error || '');
      await refreshOrganization();
      setSavingGmaps(false);
      Alert.alert(
        t('org_settings.location_saved_title', 'Location saved'),
        t('org_settings.location_saved_msg', "Saved! We're importing Google reviews for this location — they'll appear shortly."),
      );
      supabase.functions
        .invoke('import-google-reviews', { body: { source: 'manual', user_id: user?.id, organization_id: organizationId, backfill: true } })
        .then(() => refreshOrganization())
        .catch((e: any) => console.error('[OrgSettings] background review import failed:', e));
    } catch (e: any) {
      setSavingGmaps(false);
      Alert.alert(t('common:error'), translateServerError(e, t('org_settings.location_save_failed', 'Failed to save location.')));
    }
  };

  const handleRegenerateJoinCode = () => {
    Alert.alert(
      t('org_settings.regen_title', 'Regenerate Join Code'),
      t('org_settings.regen_msg', 'This will invalidate the current code. Employees who haven\'t joined yet will need the new code. Continue?'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        { text: t('org_settings.regen_btn', 'Regenerate'), style: 'destructive', onPress: doRegenerateCode },
      ]
    );
  };

  const doRegenerateCode = async () => {
    if (!organizationId || !user?.id) return;
    setRegeneratingCode(true);
    try {
      const { data, error } = await supabase.rpc('regenerate_join_code', {
        p_organization_id: organizationId,
        p_user_id: user.id,
      });

      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result.success) {
        Alert.alert(t('common:error'), translateServerError({ message: result.error }, t('org_settings.regen_failed', 'Failed to regenerate join code.')));
        return;
      }

      await refreshOrganization();
      Alert.alert(
        t('org_settings.done', 'Done'),
        t('org_settings.new_join_code', { code: result.join_code, defaultValue: 'New join code: {{code}}' }),
      );
    } catch (err: any) {
      Alert.alert(t('common:error'), translateServerError(err, t('org_settings.regen_failed', 'Failed to regenerate join code.')));
    } finally {
      setRegeneratingCode(false);
    }
  };

  const copyJoinCode = async () => {
    if (organization.join_code) {
      await Clipboard.setStringAsync(organization.join_code);
      Alert.alert(t('org_settings.copied_title', 'Copied'), t('org_settings.join_code_copied', 'Join code copied to clipboard.'));
    }
  };

  const goToTab = (key: SettingsTab) => {
    if (scopedMenu) return; // single-page pager — no tab bar, nowhere to go
    const idx = TABS.findIndex(tab => tab.key === key);
    setActiveTab(key);
    pagerRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
  };

  const handlePagerScroll = (e: any) => {
    // In scoped mode the pager holds ONE page, so the index math would resolve
    // any stray momentum to TABS[0] and flip activeTab to branding. Never let it.
    if (scopedMenu) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const next = TABS[idx];
    if (next && next.key !== activeTab) setActiveTab(next.key);
  };

  const saveButtonNode = (
    <TouchableOpacity
      style={[styles.saveButton, saving && { opacity: 0.6 }]}
      onPress={handleSave}
      disabled={saving}
    >
      {saving ? (
        <ActivityIndicator color={colors.fireText} />
      ) : (
        <Text style={styles.saveButtonText}>{t('org_settings.save_changes', 'Save Changes')}</Text>
      )}
    </TouchableOpacity>
  );

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
        <Text style={styles.headerTitle}>{t('manager_manage:open_org_settings', 'Organization Settings')}</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerSaveButton}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.headerSaveText}>{t('common:save')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Tab Bar (hidden in scoped mode — the Menu page is the whole screen) */}
      {!scopedMenu && (
        <View style={styles.tabBar}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => goToTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]} numberOfLines={1}>
                {t(tab.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handlePagerScroll}
        scrollEventThrottle={16}
      >
        {/* ─── Branding Tab (hidden in scoped mode) ──────────────────── */}
        {!scopedMenu && (
        <View style={{ width: SCREEN_WIDTH }}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <>
            {/* Branding Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('org_settings.tab_branding', 'Branding')}</Text>

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
                    <StorageImage
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
                        {t('org_settings.add_logo', 'Add Logo')}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={styles.logoActions}>
                  <TouchableOpacity onPress={handlePickLogo} disabled={uploadingLogo}>
                    <Text style={[styles.logoActionText, { color: colors.primary }]}>
                      {logoPreview ? t('org_settings.change_logo', 'Change Logo') : t('org_settings.upload_logo', 'Upload Logo')}
                    </Text>
                  </TouchableOpacity>
                  {logoPreview && (
                    <TouchableOpacity onPress={handleRemoveLogo}>
                      <Text style={[styles.logoActionText, { color: '#E53935' }]}>{t('org_settings.remove', 'Remove')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('org_settings.restaurant_name', 'Restaurant Name')}</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('org_settings.restaurant_name_ph', 'Your restaurant name')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('onboarding:reward_currency', 'Reward Currency Name')}</Text>
                <TextInput
                  style={styles.input}
                  value={rewardCurrencyName}
                  onChangeText={setRewardCurrencyName}
                  placeholder={t('org_settings.reward_currency_ph', 'e.g. Bucks, Points, Stars')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            {/* Location Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('onboarding:gs_location', 'Location')}</Text>
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('onboarding:address', 'Address')}</Text>
                <TextInput
                  style={styles.input}
                  value={address}
                  onChangeText={setAddress}
                  placeholder={t('onboarding:street_address_ph', 'Street address')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={styles.row}>
                <View style={[styles.fieldContainer, { flex: 2 }]}>
                  <Text style={styles.fieldLabel}>{t('onboarding:city', 'City')}</Text>
                  <TextInput
                    style={styles.input}
                    value={city}
                    onChangeText={setCity}
                    placeholder={t('onboarding:city', 'City')}
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={[styles.fieldContainer, { flex: 1, marginLeft: 12 }]}>
                  <Text style={styles.fieldLabel}>{t('onboarding:state', 'State')}</Text>
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
                  <Text style={styles.fieldLabel}>{t('onboarding:zip', 'Zip')}</Text>
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
                <Text style={styles.fieldLabel}>{t('org_settings.weather_location', 'Weather Location')}</Text>
                <TextInput
                  style={styles.input}
                  value={weatherLocation}
                  onChangeText={setWeatherLocation}
                  placeholder={t('org_settings.weather_location_ph', 'e.g. Long Branch, NJ')}
                  placeholderTextColor={colors.textSecondary}
                />
                <Text style={styles.fieldHint}>{t('org_settings.weather_location_hint', 'Used for the weather widget on the home screen')}</Text>
              </View>
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('org_settings.gmaps_label', 'Google Maps Search')}</Text>
                <TextInput
                  style={styles.input}
                  value={googleMapsQuery}
                  onChangeText={setGoogleMapsQuery}
                  placeholder={t('org_settings.gmaps_ph', "e.g. McLoone's Boathouse, 9 Cherry Lane, West Orange NJ")}
                  placeholderTextColor={colors.textSecondary}
                />
                <TouchableOpacity
                  onPress={handleUpdateGoogleMaps}
                  disabled={savingGmaps}
                  activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.primary }}
                >
                  {savingGmaps ? (
                    <ActivityIndicator size="small" color={colors.fireText} />
                  ) : (
                    <>
                      <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={15} color={colors.fireText} />
                      <Text style={{ color: colors.fireText, fontWeight: '700', fontSize: 13 }}>{t('org_settings.gmaps_update_btn', 'Update & Import Reviews')}</Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.fieldHint}>
                  {t('org_settings.gmaps_hint', "Enter your restaurant's name and address exactly as it appears on Google Maps. We'll import your Google Reviews from this location — tap Update & Import (or save settings) to fetch them.")}
                </Text>
              </View>
            </View>

          </>
          {saveButtonNode}
          <View style={{ height: 60 }} />
          </ScrollView>
        </View>
        )}

        {/* ─── Menu Tab ───────────────────────────────────────────────── */}
        <View style={{ width: SCREEN_WIDTH }}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('onboarding:step2_title', 'Menu Configuration')}</Text>

            {/* Number of menus */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('org_settings.number_of_menus', 'Number of Menus')}</Text>
              <View style={styles.segmentedControl}>
                <TouchableOpacity
                  style={[styles.segment, menuCount === 1 && styles.segmentActive]}
                  onPress={() => setMenuCount(1)}
                >
                  <Text style={[styles.segmentText, menuCount === 1 && styles.segmentTextActive]}>{t('org_settings.one_menu', '1 Menu')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segment, menuCount === 2 && styles.segmentActive]}
                  onPress={() => setMenuCount(2)}
                >
                  <Text style={[styles.segmentText, menuCount === 2 && styles.segmentTextActive]}>{t('org_settings.two_menus', '2 Menus')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Category mode (2 menus only) — both options described up front */}
            {menuCount === 2 && (
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('org_settings.category_mode', 'Category Mode')}</Text>
                <View style={styles.segmentedControl}>
                  <TouchableOpacity
                    style={[styles.segment, menuScope === 'shared' && styles.segmentActive]}
                    onPress={() => handleScopeChange('shared')}
                    disabled={scopeSaving}
                  >
                    <Text style={[styles.segmentText, menuScope === 'shared' && styles.segmentTextActive]}>{t('org_settings.scope_shared', 'Shared')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segment, menuScope === 'per_menu' && styles.segmentActive]}
                    onPress={() => handleScopeChange('per_menu')}
                    disabled={scopeSaving}
                  >
                    <Text style={[styles.segmentText, menuScope === 'per_menu' && styles.segmentTextActive]}>{t('org_settings.scope_per_menu', 'Per-Menu')}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.scopeBullets}>
                  <View style={styles.scopeBulletRow}>
                    <Text style={styles.scopeBulletDot}>•</Text>
                    <Text style={styles.scopeBulletText}>
                      <Text style={styles.scopeBulletLead}>{t('org_settings.scope_shared_lead', 'Shared — ')}</Text>
                      {t('org_settings.scope_shared_body', {
                        menu1: menu1Name || t('onboarding:default_menu_1', 'Menu 1'),
                        menu2: menu2Name || t('onboarding:default_menu_2', 'Menu 2'),
                        defaultValue: 'both menus use one set of categories; an item can appear on {{menu1}}, {{menu2}}, or both.',
                      })}
                    </Text>
                  </View>
                  <View style={styles.scopeBulletRow}>
                    <Text style={styles.scopeBulletDot}>•</Text>
                    <Text style={styles.scopeBulletText}>
                      <Text style={styles.scopeBulletLead}>{t('org_settings.scope_per_menu_lead', 'Per-Menu — ')}</Text>
                      {t('org_settings.scope_per_menu_body', 'each menu has its own independent categories; every item belongs to a single menu.')}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Menu 1 name + icon */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('onboarding:menu1_label', 'Menu 1 Name')}</Text>
              <View style={styles.nameIconRow}>
                <MenuIconPicker
                  compact
                  label={t('onboarding:menu_icon_label', {
                    menuName: menu1Name || t('onboarding:default_menu_1', 'Menu 1'),
                    defaultValue: '{{menuName}} Icon',
                  })}
                  value={menu1Icon}
                  onChange={setMenu1Icon}
                />
                <TextInput
                  style={[styles.input, styles.nameIconInput]}
                  value={menu1Name}
                  onChangeText={setMenu1Name}
                  placeholder={t('org_settings.menu1_ph', 'e.g. Winter, Lunch, Main')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            {/* Menu 2 name + icon (2 menus only) */}
            {menuCount === 2 && (
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('onboarding:menu2_label', 'Menu 2 Name')}</Text>
                <View style={styles.nameIconRow}>
                  <MenuIconPicker
                    compact
                    label={t('onboarding:menu_icon_label', {
                      menuName: menu2Name || t('onboarding:default_menu_2', 'Menu 2'),
                      defaultValue: '{{menuName}} Icon',
                    })}
                    value={menu2Icon}
                    onChange={setMenu2Icon}
                  />
                  <TextInput
                    style={[styles.input, styles.nameIconInput]}
                    value={menu2Name}
                    onChangeText={setMenu2Name}
                    placeholder={t('org_settings.menu2_ph', 'e.g. Summer, Dinner, Seasonal')}
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
            )}
          </View>
          {saveButtonNode}
          <View style={{ height: 60 }} />
          </ScrollView>
        </View>

        {/* ─── Jobs & Tools Tab (hidden in scoped mode) ───────────────── */}
        {!scopedMenu && (
        <View style={{ width: SCREEN_WIDTH }}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <>
            <JobTitlesManager colors={colors} />
            <AssistantsManager colors={colors} />
          </>
          <View style={{ height: 60 }} />
          </ScrollView>
        </View>
        )}

        {/* ─── Access Tab (hidden in scoped mode) ─────────────────────── */}
        {!scopedMenu && (
        <View style={{ width: SCREEN_WIDTH }}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('org_settings.employee_access', 'Employee Access')}</Text>

            {/* Join Code */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('org_settings.join_code', 'Join Code')}</Text>
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
              <Text style={styles.fieldHint}>{t('org_settings.join_code_hint', 'Share this code with employees so they can join your restaurant')}</Text>
            </View>

            {/* Self Signup Toggle */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('org_settings.allow_self_signup', 'Allow Self-Signup')}</Text>
                <Text style={styles.fieldHint}>{t('org_settings.allow_self_signup_hint', 'Employees can create their own accounts using the join code')}</Text>
              </View>
              <Switch
                value={allowSelfSignup}
                onValueChange={setAllowSelfSignup}
                trackColor={{ false: colors.border, true: colors.primary + '80' }}
                thumbColor={allowSelfSignup ? colors.primary : colors.textSecondary}
              />
            </View>

            {/* Staff Roster Visibility Toggle */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('org_settings.staff_can_view_roster', 'Staff Can View Roster')}</Text>
                <Text style={styles.fieldHint}>{t('org_settings.staff_can_view_roster_hint', "Employees can browse the day roster to see coworkers' shifts. Managers always can.")}</Text>
              </View>
              <Switch
                value={staffCanViewRoster}
                onValueChange={setStaffCanViewRoster}
                trackColor={{ false: colors.border, true: colors.primary + '80' }}
                thumbColor={staffCanViewRoster ? colors.primary : colors.textSecondary}
              />
            </View>

            {/* Default Password */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('org_settings.default_password', 'Default Password')}</Text>
              <TextInput
                style={styles.input}
                value={defaultPassword}
                onChangeText={setDefaultPassword}
                placeholder={t('org_settings.default_password_ph', 'Default password for new accounts')}
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={styles.fieldHint}>{t('org_settings.default_password_hint', 'Used when managers create accounts for employees')}</Text>
            </View>
          </View>
          {saveButtonNode}
          <View style={{ height: 60 }} />
          </ScrollView>
        </View>
        )}
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
      color: colors.fireText,
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
      color: colors.fireText,
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
      color: colors.fireText,
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
