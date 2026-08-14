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
  LayoutAnimation,
  UIManager,
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
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavButton from '@/components/HeaderNavButton';
import GlassCard from '@/components/GlassCard';
import { NestableScrollContainer } from 'react-native-draggable-flatlist';
import MenuIconPicker from '@/components/MenuIconPicker';
import JobTitlesManager from '@/components/JobTitlesManager';
import AssistantsManager from '@/components/AssistantsManager';
import { supabase } from '@/app/integrations/supabase/client';
import { brokerUploadImage } from '@/utils/storageBroker';
import { translateServerError } from '@/utils/serverErrors';
import { fonts } from '@/constants/fonts';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type SettingsTab = 'branding' | 'menu' | 'jobs-tools' | 'access';

const TABS: { key: SettingsTab; labelKey: string }[] = [
  { key: 'branding', labelKey: 'org_settings.tab_branding' },
  { key: 'menu', labelKey: 'org_settings.tab_menu' },
  { key: 'jobs-tools', labelKey: 'org_settings.tab_jobs_tools' },
  { key: 'access', labelKey: 'org_settings.tab_access' },
];

const SCREEN_WIDTH = Dimensions.get('window').width;

// The eight keyed grants, exactly the set_manager_permission whitelist. Seven
// are live (s68 wired the menu trio, s70b the org-settings tabs + review
// refresh); AI Schedule Uploads stays LATER until its design wave. `premium`
// rows carry a ⭐ marker — the section footnote explains it spends credits.
// Section order is Steve's (smoke round 1): Menu Access first, because those
// three live together in the Menu ⚙ sheet (Menu Configuration included, even
// though its grant key lives under org_settings.*).
interface PermRowDef {
  key: string;
  live: boolean;
  premium?: boolean;
  labelKey: string;
  labelFallback: string;
  subKey?: string;
  subFallback?: string;
}
interface PermSectionDef {
  headerKey: string;
  headerFallback: string;
  rows: PermRowDef[];
}
const PERM_SECTIONS: PermSectionDef[] = [
  {
    headerKey: 'org_settings.perm_section_menu',
    headerFallback: 'Menu Access',
    rows: [
      { key: 'menu.edit_categories', live: true, labelKey: 'menu_sheet.edit_categories', labelFallback: 'Edit Categories', subKey: 'menu_sheet.edit_categories_sub', subFallback: 'Rename, hide, reorder, set colours' },
      { key: 'premium.ai_menu_upload', live: true, premium: true, labelKey: 'org_settings.perm_ai_uploads', labelFallback: 'AI Menu Uploads' },
      { key: 'org_settings.menu', live: true, labelKey: 'menu_sheet.menu_configuration', labelFallback: 'Menu Configuration', subKey: 'menu_sheet.menu_configuration_sub', subFallback: 'Menu names, icons, one menu or two' },
    ],
  },
  {
    headerKey: 'org_settings.perm_section_org',
    headerFallback: 'Organization settings',
    rows: [
      { key: 'org_settings.branding', live: true, labelKey: 'org_settings.tab_branding', labelFallback: 'Branding' },
      { key: 'org_settings.jobs_tools', live: true, labelKey: 'org_settings.tab_jobs_tools', labelFallback: 'Jobs & Tools' },
      { key: 'org_settings.access', live: true, labelKey: 'org_settings.tab_access', labelFallback: 'Access' },
    ],
  },
  {
    headerKey: 'org_settings.perm_section_premium',
    headerFallback: 'Premium features',
    rows: [
      { key: 'premium.review_refresh', live: true, premium: true, labelKey: 'org_settings.perm_review_refresh', labelFallback: 'Manual Review Refreshes' },
      { key: 'premium.ai_schedule_upload', live: false, premium: true, labelKey: 'org_settings.perm_schedule_uploads', labelFallback: 'AI Schedule Uploads' },
    ],
  },
];

// Collapsible glass group (mockup .tsec): header row with title + optional
// mono badge + chevron, body conditionally rendered. LayoutAnimation drives
// the reflow (the CollapsibleSection mechanism) — never an animated height.
function FoldGroup({
  title,
  badge,
  open,
  onToggle,
  colors,
  children,
}: {
  title: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  colors: any;
  children: React.ReactNode;
}) {
  const press = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };
  return (
    <GlassCard variant="glass" radius={13} style={foldStyles.card}>
      <TouchableOpacity style={foldStyles.header} onPress={press} activeOpacity={0.7}>
        <Text style={[foldStyles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {!!badge && (
          <View style={[foldStyles.badge, { backgroundColor: colors.blue + '29' }]}>
            <Text style={[foldStyles.badgeText, { color: colors.blueText }]}>{badge}</Text>
          </View>
        )}
        <IconSymbol
          ios_icon_name={open ? 'chevron.up' : 'chevron.down'}
          android_material_icon_name={open ? 'expand-less' : 'expand-more'}
          size={16}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {open && <View style={foldStyles.body}>{children}</View>}
    </GlassCard>
  );
}

const foldStyles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  title: {
    flex: 1,
    fontFamily: fonts.display.semibold,
    fontSize: 14,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgeText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  body: {
    paddingHorizontal: 13,
    paddingBottom: 13,
    gap: 7,
  },
});

export default function OrganizationSettingsScreen() {
  const router = useRouter();
  const { tab, scoped } = useLocalSearchParams<{ tab?: string; scoped?: string }>();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId, organization, refreshOrganization } = useOrganization();
  const { perms, loading: permsLoading } = useManagerPermissions();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Scoped entry (?scoped=1, s70b generalized from the s68 menu-only shape): a
  // granted manager deep-links here (Menu ⚙ sheet passes tab=menu&scoped=1;
  // the Plan & Access tile passes scoped=1 alone) and sees ONLY the tabs their
  // grants cover — Save writes just those field groups (the server enforces the
  // same groups). Owners always get the full screen; plain ?tab=menu merely
  // preselects the Menu tab. The Manager Permissions group inside Jobs & Tools
  // stays owner-ROLE-gated regardless of the jobs_tools grant (⛔ THE RULE).
  const scopedEntry = scoped === '1' && user?.role === 'manager';

  const [activeTab, setActiveTab] = useState<SettingsTab>(tab === 'menu' ? 'menu' : 'branding');
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

  // The tab set this viewer may see. Owners: all four. Scoped managers: the
  // granted subset (order preserved). Pager index math + the tab bar + page
  // rendering ALL derive from this one list, so they can never disagree.
  const grantedTabs = useMemo<SettingsTab[]>(
    () =>
      TABS.map(tb => tb.key).filter(
        k =>
          (k === 'menu' && perms.menuConfig) ||
          (k === 'branding' && perms.branding) ||
          (k === 'jobs-tools' && perms.jobsTools) ||
          (k === 'access' && perms.access),
      ),
    [perms],
  );
  const visibleTabs: SettingsTab[] = scopedEntry ? grantedTabs : TABS.map(tb => tb.key);
  const showTab = (k: SettingsTab) => !scopedEntry || grantedTabs.includes(k);

  // Scoped landing: perms resolve async (the gate shows a spinner meanwhile),
  // so retarget activeTab + the pager once the granted set is known. ?tab picks
  // the landing tab when granted (the Menu ⚙ sheet's tab=menu), else the first
  // granted tab (the Plan & Access tile's bare scoped=1).
  const grantedSig = grantedTabs.join(',');
  useEffect(() => {
    if (!scopedEntry || permsLoading || grantedTabs.length === 0) return;
    const target: SettingsTab =
      tab && grantedTabs.includes(tab as SettingsTab) ? (tab as SettingsTab) : grantedTabs[0];
    setActiveTab(target);
    requestAnimationFrame(() => {
      const idx = grantedTabs.indexOf(target);
      if (idx > 0) pagerRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedEntry, permsLoading, grantedSig]);

  // Jobs & Tools groups — ALL collapsed by default. Above the gate for the
  // same hook-order reason as pagerRef.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [jobTitleCount, setJobTitleCount] = useState<number | null>(null);
  const [assistantCount, setAssistantCount] = useState<number | null>(null);

  // Manager Permissions admin state (owner only). Reads the raw grant map via
  // get_manager_permissions directly — useManagerPermissions stays the
  // manager-side convenience view (owners resolve all-true there, which is
  // exactly wrong for an admin panel showing the real stored grants).
  const [permMap, setPermMap] = useState<Record<string, boolean> | null>(null);
  const [permSaving, setPermSaving] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user?.role !== 'owner' || scopedEntry || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_manager_permissions', {
          p_actor_id: user.id,
        });
        if (error) throw error;
        if (cancelled) return;
        const map: Record<string, boolean> = {};
        (data || []).forEach((r: { permission_key: string; granted: boolean }) => {
          map[r.permission_key] = !!r.granted;
        });
        setPermMap(map);
      } catch (e) {
        // Display-only failure: switches render OFF but stay usable — a toggle
        // still writes (and reverts on error), so server truth always wins.
        console.error('[OrgSettings] manager permissions load error:', e);
        if (!cancelled) setPermMap({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, scopedEntry]);

  // Owner deep-link (?tab=menu without scoped=1): activeTab already starts on
  // Menu, so just land the pager there too. Deferred a frame so the pager has
  // laid out before the jump. Scoped mode retargets via the grantedTabs effect
  // above instead.
  useEffect(() => {
    if (scopedEntry || tab !== 'menu') return;
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

  // Owners always pass. A manager passes ONLY through the scoped entry, and
  // only with at least one org-settings grant; while the grant check is in
  // flight, show a plain spinner rather than flashing the access-denied bounce.
  if (user?.role !== 'owner') {
    if (scopedEntry && permsLoading) {
      return (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    if (!scopedEntry || grantedTabs.length === 0) {
      return (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>
            {t('org_settings.access_denied', 'Only the restaurant owner can access this screen.')}
          </Text>
          <TouchableOpacity style={[styles.saveButton, { marginTop: 20, paddingHorizontal: 24 }]} onPress={() => router.back()}>
            <Text style={styles.saveButtonText}>{t('manage_categories:go_back', 'Go Back')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
  }

  // A jobs_tools-only scoped manager has NO settings field group — their edits
  // save instantly through the job-title/assistant RPCs, so the Save pill (and
  // an update_organization_settings call, which the server would reject with
  // an owner-only error) is meaningless for them.
  const scopedCanSaveSettings = !scopedEntry || perms.menuConfig || perms.branding || perms.access;

  const handleSave = async () => {
    if (!scopedCanSaveSettings) return;
    // Validate the name only when this save actually writes branding fields
    // (owner, or a branding-granted scoped manager).
    const savesBranding = !scopedEntry || perms.branding;
    if (savesBranding && !name.trim()) {
      Alert.alert(t('common:error'), t('onboarding:restaurant_name_required', 'Restaurant name is required.'));
      return;
    }
    if (!organizationId || !user?.id) return;

    // Detect a newly added / changed Google Maps query so we can auto-import
    // reviews after saving (only when it actually changed — avoids a needless
    // Outscraper call on unrelated saves). Only when this save writes branding,
    // and only for callers the import edge fn admits (owner, or a manager with
    // the review-refresh grant — the query still SAVES either way; the Mon/Thu
    // cron imports for ungranted savers).
    const newQuery = googleMapsQuery.trim();
    const queryChanged = savesBranding && !!newQuery && newQuery !== (organization.google_maps_query || '').trim();
    const canTriggerImport = user.role === 'owner' || perms.reviewRefresh;

    setSaving(true);
    try {
      // Scoped managers send ONLY their granted field groups — the server
      // rejects any group the caller's grants don't cover, so the payload and
      // the grant set must always agree (s70b field-group gating).
      const { data, error } = await supabase.rpc('update_organization_settings', scopedEntry
        ? {
            p_organization_id: organizationId,
            p_user_id: user.id,
            ...(perms.menuConfig
              ? {
                  p_menu_count: menuCount,
                  p_menu_1_name: menu1Name.trim() || 'Menu 1',
                  p_menu_2_name: menu2Name.trim() || 'Menu 2',
                  p_menu_1_icon: menu1Icon,
                  p_menu_2_icon: menu2Icon,
                }
              : {}),
            ...(perms.branding
              ? {
                  p_name: name.trim(),
                  p_address: address.trim() || undefined,
                  p_city: city.trim() || undefined,
                  p_state: state.trim() || undefined,
                  p_zip: zip.trim() || undefined,
                  p_weather_location: weatherLocation.trim() || undefined,
                  p_google_maps_query: googleMapsQuery.trim() || undefined,
                  p_reward_currency_name: rewardCurrencyName.trim() || 'Bucks',
                }
              : {}),
            ...(perms.access
              ? {
                  p_allow_self_signup: allowSelfSignup,
                  p_staff_can_view_roster: staffCanViewRoster,
                  p_default_password: defaultPassword.trim() || 'welcome123',
                }
              : {}),
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
      // Ungranted scoped managers save the query without triggering the import
      // (the edge fn would 403) — the cron picks it up.
      if (queryChanged && canTriggerImport) {
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
      // s70b: a branding-granted manager without the review-refresh grant saves
      // the location but cannot trigger the import (the edge fn 403s) — the
      // Mon/Thu cron imports for them; the alert must not promise otherwise.
      if (user.role === 'owner' || perms.reviewRefresh) {
        Alert.alert(
          t('org_settings.location_saved_title', 'Location saved'),
          t('org_settings.location_saved_msg', "Saved! We're importing Google reviews for this location — they'll appear shortly."),
        );
        supabase.functions
          .invoke('import-google-reviews', { body: { source: 'manual', user_id: user?.id, organization_id: organizationId, backfill: true } })
          .then(() => refreshOrganization())
          .catch((e: any) => console.error('[OrgSettings] background review import failed:', e));
      } else {
        Alert.alert(
          t('org_settings.location_saved_title', 'Location saved'),
          t('org_settings.saved_msg', 'Organization settings updated successfully.'),
        );
      }
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

  // Index math over visibleTabs — the SAME list the pager renders from, so a
  // scoped manager's reduced page set can never desync from the tab bar (the
  // s68 single-page guard generalizes away: with one page, index 0 IS the
  // active tab and the math is a no-op).
  const goToTab = (key: SettingsTab) => {
    const idx = visibleTabs.indexOf(key);
    if (idx < 0) return;
    setActiveTab(key);
    pagerRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
  };

  const handlePagerScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const next = visibleTabs[idx];
    if (next && next !== activeTab) setActiveTab(next);
  };

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Optimistic grant toggle: flip locally, write, revert on any failure. The
  // RPC reports failures as JSON ({success:false}) rather than throwing, so
  // both branches revert. A key already in flight is ignored (the switch is
  // disabled anyway — this guards double-fires racing the state update).
  const togglePerm = async (key: string) => {
    if (!user?.id || permSaving.has(key) || permMap === null) return;
    const prev = permMap[key] ?? false;
    const next = !prev;
    setPermMap(m => ({ ...(m ?? {}), [key]: next }));
    setPermSaving(s => {
      const n = new Set(s);
      n.add(key);
      return n;
    });
    try {
      const { data, error } = await supabase.rpc('set_manager_permission', {
        p_actor_id: user.id,
        p_key: key,
        p_granted: next,
      });
      if (error) throw error;
      const result: any = typeof data === 'string' ? JSON.parse(data) : data;
      if (result && result.success === false) {
        setPermMap(m => ({ ...(m ?? {}), [key]: prev }));
        Alert.alert(t('common:error'), translateServerError({ message: result.error }, t('org_settings.perm_save_failed', 'Failed to update permission.')));
      }
    } catch (err: any) {
      setPermMap(m => ({ ...(m ?? {}), [key]: prev }));
      Alert.alert(t('common:error'), translateServerError(err, t('org_settings.perm_save_failed', 'Failed to update permission.')));
    } finally {
      setPermSaving(s => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
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
    <View style={styles.container}>
      <AmbientGlow />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header — glass chrome; the labelled Save pill is the old header
            Save (Steve's smoke call: a bare checkmark was too easy to miss —
            rightWide gives the pill room, the title truncates one-line). */}
        <ScreenHeader
          title={t('manager_manage:open_org_settings', 'Organization Settings')}
          eyebrow={organization.name || undefined}
          rightWide={scopedCanSaveSettings}
          right={!scopedCanSaveSettings ? undefined : saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <HeaderNavButton
              label={t('common:save')}
              iconIos="checkmark"
              iconAndroid="check"
              onPress={handleSave}
            />
          )}
        />

        {/* Tab Bar — renders the viewer's visible tab set; hidden when only a
            single tab is granted (that page is the whole screen). */}
        {visibleTabs.length > 1 && (
          <View style={styles.tabBarWrap}>
            <View style={styles.tabBar}>
              {TABS.filter(tab => visibleTabs.includes(tab.key)).map(tab => (
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
          {/* ─── Branding Tab ──────────────────────────────────────────── */}
          {showTab('branding') && (
          <View style={{ width: SCREEN_WIDTH }}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <>
              {/* Branding Section */}
              <GlassCard variant="surface" radius={17} style={styles.sectionCard}>
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
                <View style={[styles.fieldContainer, { marginBottom: 0 }]}>
                  <Text style={styles.fieldLabel}>{t('onboarding:reward_currency', 'Reward Currency Name')}</Text>
                  <TextInput
                    style={styles.input}
                    value={rewardCurrencyName}
                    onChangeText={setRewardCurrencyName}
                    placeholder={t('org_settings.reward_currency_ph', 'e.g. Bucks, Points, Stars')}
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </GlassCard>

              {/* Location Section */}
              <GlassCard variant="surface" radius={17} style={styles.sectionCard}>
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
                <View style={[styles.fieldContainer, { marginBottom: 0 }]}>
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
                    style={styles.gmapsBtn}
                  >
                    {savingGmaps ? (
                      <ActivityIndicator size="small" color={colors.fireText} />
                    ) : (
                      <>
                        <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={15} color={colors.fireText} />
                        <Text style={styles.gmapsBtnText}>{t('org_settings.gmaps_update_btn', 'Update & Import Reviews')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.fieldHint}>
                    {t('org_settings.gmaps_hint', "Enter your restaurant's name and address exactly as it appears on Google Maps. We'll import your Google Reviews from this location — tap Update & Import (or save settings) to fetch them.")}
                  </Text>
                </View>
              </GlassCard>

            </>
            {saveButtonNode}
            <View style={{ height: 60 }} />
            </ScrollView>
          </View>
          )}

          {/* ─── Menu Tab ───────────────────────────────────────────────── */}
          {showTab('menu') && (
          <View style={{ width: SCREEN_WIDTH }}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <GlassCard variant="surface" radius={17} style={styles.sectionCard}>
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
                <View style={[styles.fieldContainer, { marginBottom: 0 }]}>
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
            </GlassCard>
            {saveButtonNode}
            <View style={{ height: 60 }} />
            </ScrollView>
          </View>
          )}

          {/* ─── Jobs & Tools Tab ───────────────────────────────────────── */}
          {/* NestableScrollContainer (not ScrollView): the Job Titles fold
              holds a NestableDraggableFlatList — the pair coordinates the
              drag gesture with this outer scroll. Other tabs keep ScrollView. */}
          {showTab('jobs-tools') && (
          <View style={{ width: SCREEN_WIDTH }}>
            <NestableScrollContainer contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <FoldGroup
                title={t('onboarding:step1_title', 'Job Titles')}
                badge={jobTitleCount != null ? String(jobTitleCount) : undefined}
                open={openGroups.has('titles')}
                onToggle={() => toggleGroup('titles')}
                colors={colors}
              >
                <JobTitlesManager colors={colors} embedded onCountChange={setJobTitleCount} />
              </FoldGroup>

              <FoldGroup
                title={t('org_settings.tools_assistants', 'Tools & Assistants')}
                badge={assistantCount != null ? String(assistantCount) : undefined}
                open={openGroups.has('tools')}
                onToggle={() => toggleGroup('tools')}
                colors={colors}
              >
                <AssistantsManager colors={colors} embedded onCountChange={setAssistantCount} />
              </FoldGroup>

              {/* ⛔ Owner-ROLE gate, never a permission key: these switches live
                  inside a grantable tab — a manager who could see them could
                  grant themselves everything. Since s70b a jobs_tools-granted
                  manager DOES reach this page (that is the grant's purpose), so
                  this literal role check is THE load-bearing layer keeping the
                  group invisible to every manager, regardless of any grant. */}
              {user?.role === 'owner' && (
                <FoldGroup
                  title={t('org_settings.group_manager_permissions', 'Manager Permissions')}
                  badge={t('org_settings.owner_only_badge', 'OWNER ONLY')}
                  open={openGroups.has('perms')}
                  onToggle={() => toggleGroup('perms')}
                  colors={colors}
                >
                  <Text style={styles.permFooterNote}>
                    {t('org_settings.perm_intro', 'Choose what features your managers can access. Granted managers never see this section, so they cannot extend or revoke their own access.')}
                  </Text>
                  {permMap === null && (
                    <ActivityIndicator color={colors.primary} style={{ paddingVertical: 8 }} />
                  )}
                  {PERM_SECTIONS.map(section => (
                    <React.Fragment key={section.headerKey}>
                      <Text style={styles.permSectionHeader}>
                        {t(section.headerKey, section.headerFallback)}
                      </Text>
                      {section.rows.map(row => {
                        const labelNode = (
                          <View style={{ flex: 1 }}>
                            <View style={styles.permLabelRow}>
                              <Text style={styles.permLabel}>{t(row.labelKey, row.labelFallback)}</Text>
                              {!!row.premium && (
                                <IconSymbol
                                  ios_icon_name="star.fill"
                                  android_material_icon_name="star"
                                  size={12}
                                  color={colors.tint}
                                />
                              )}
                            </View>
                            {!!row.subKey && (
                              <Text style={styles.permSub}>{t(row.subKey, row.subFallback ?? '')}</Text>
                            )}
                          </View>
                        );
                        return row.live ? (
                          <View key={row.key} style={styles.permRow}>
                            {labelNode}
                            <Switch
                              value={permMap?.[row.key] ?? false}
                              onValueChange={() => togglePerm(row.key)}
                              disabled={permSaving.has(row.key) || permMap === null}
                              trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
                              thumbColor={colors.card}
                            />
                          </View>
                        ) : (
                          <View
                            key={row.key}
                            style={[styles.permRow, styles.permRowSoon]}
                            accessibilityState={{ disabled: true }}
                          >
                            {labelNode}
                            <View style={[styles.laterPill, { backgroundColor: colors.blue + '29' }]}>
                              <Text style={[styles.laterPillText, { color: colors.blueText }]}>
                                {t('org_settings.later_badge', 'LATER')}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </React.Fragment>
                  ))}
                  <View style={styles.premiumFootRow}>
                    <IconSymbol
                      ios_icon_name="star.fill"
                      android_material_icon_name="star"
                      size={11}
                      color={colors.tint}
                    />
                    <Text style={[styles.permFooterNote, { flex: 1, marginTop: 0 }]}>
                      {t('org_settings.perm_premium_footnote', 'Marked Premium Features will spend your monthly upload credits.')}
                    </Text>
                  </View>
                </FoldGroup>
              )}
              <View style={{ height: 60 }} />
            </NestableScrollContainer>
          </View>
          )}

          {/* ─── Access Tab ─────────────────────────────────────────────── */}
          {showTab('access') && (
          <View style={{ width: SCREEN_WIDTH }}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <GlassCard variant="surface" radius={17} style={styles.sectionCard}>
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
              <View style={styles.featureRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureLabel}>{t('org_settings.allow_self_signup', 'Allow Self-Signup')}</Text>
                  <Text style={styles.featureHint}>{t('org_settings.allow_self_signup_hint', 'Employees can create their own accounts using the join code')}</Text>
                </View>
                <Switch
                  value={allowSelfSignup}
                  onValueChange={setAllowSelfSignup}
                  trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
                  thumbColor={colors.card}
                />
              </View>

              {/* Staff Roster Visibility Toggle */}
              <View style={styles.featureRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureLabel}>{t('org_settings.staff_can_view_roster', 'Staff Can View Roster')}</Text>
                  <Text style={styles.featureHint}>{t('org_settings.staff_can_view_roster_hint', "Employees can browse the day roster to see coworkers' shifts. Managers always can.")}</Text>
                </View>
                <Switch
                  value={staffCanViewRoster}
                  onValueChange={setStaffCanViewRoster}
                  trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
                  thumbColor={colors.card}
                />
              </View>

              {/* Default Password */}
              <View style={[styles.fieldContainer, { marginBottom: 0 }]}>
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
            </GlassCard>
            {saveButtonNode}
            <View style={{ height: 60 }} />
            </ScrollView>
          </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    tabBarWrap: {
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 13,
      padding: 3,
      gap: 4,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: 'center',
    },
    tabActive: {
      backgroundColor: colors.primary,
    },
    tabText: {
      fontFamily: fonts.display.semibold,
      fontSize: 12.5,
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.fireText,
    },
    scrollContent: {
      padding: 16,
      paddingTop: 8,
      paddingBottom: 80,
    },
    sectionCard: {
      padding: 16,
      marginBottom: 16,
    },
    sectionTitle: {
      fontFamily: fonts.display.semibold,
      fontSize: 15.5,
      color: colors.text,
      marginBottom: 12,
    },
    fieldContainer: {
      marginBottom: 16,
    },
    fieldLabel: {
      fontFamily: fonts.mono.semibold,
      fontSize: 10,
      color: colors.textSecondary,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    fieldHint: {
      fontFamily: fonts.body.regular,
      fontSize: 11.5,
      lineHeight: 15,
      color: colors.textSecondary,
      marginTop: 6,
    },
    input: {
      backgroundColor: colors.glass,
      borderRadius: 13,
      paddingHorizontal: 13,
      paddingVertical: 11,
      minHeight: 43,
      fontFamily: fonts.body.regular,
      fontSize: 14,
      color: colors.text,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
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
      fontFamily: fonts.body.regular,
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    scopeBulletText: {
      flex: 1,
      fontFamily: fonts.body.regular,
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    scopeBulletLead: {
      fontFamily: fonts.body.semibold,
      color: colors.text,
    },
    row: {
      flexDirection: 'row',
      marginBottom: 0,
    },
    segmentedControl: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 13,
      padding: 3,
      gap: 4,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    segment: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 10,
    },
    segmentActive: {
      backgroundColor: colors.primary,
    },
    segmentText: {
      fontFamily: fonts.display.semibold,
      fontSize: 12.5,
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
      backgroundColor: colors.glass,
      borderRadius: 13,
      paddingHorizontal: 13,
      paddingVertical: 11,
      minHeight: 43,
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    joinCodeText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 17,
      color: colors.text,
      letterSpacing: 1,
    },
    joinCodeAction: {
      width: 43,
      height: 43,
      borderRadius: 13,
      backgroundColor: colors.glass,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      paddingHorizontal: 13,
      borderRadius: 13,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
      marginBottom: 10,
    },
    featureLabel: {
      fontFamily: fonts.display.semibold,
      fontSize: 14,
      color: colors.text,
    },
    featureHint: {
      fontFamily: fonts.body.regular,
      fontSize: 11.5,
      lineHeight: 15,
      marginTop: 2,
      color: colors.textSecondary,
    },
    permSectionHeader: {
      fontFamily: fonts.mono.semibold,
      fontSize: 10,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      marginTop: 6,
    },
    permRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      paddingHorizontal: 13,
      borderRadius: 13,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    permRowSoon: {
      opacity: 0.45,
    },
    permLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    permLabel: {
      fontFamily: fonts.body.medium,
      fontSize: 13.5,
      color: colors.text,
    },
    permSub: {
      fontFamily: fonts.body.regular,
      fontSize: 11.5,
      lineHeight: 15,
      marginTop: 2,
      color: colors.textSecondary,
    },
    laterPill: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 5,
    },
    laterPillText: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9,
      letterSpacing: 0.6,
    },
    permFooterNote: {
      fontFamily: fonts.body.regular,
      fontSize: 11,
      lineHeight: 16,
      color: colors.textSecondary,
      marginTop: 2,
    },
    premiumFootRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginTop: 2,
      paddingRight: 4,
    },
    logoUploadArea: {
      width: 120,
      height: 120,
      borderRadius: 16,
      backgroundColor: colors.glass,
      borderWidth: 1.5,
      borderColor: colors.glassBorder,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: 8,
    },
    logoImage: {
      width: 120,
      height: 120,
      borderRadius: 14,
    },
    logoPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoPlaceholderText: {
      fontFamily: fonts.body.semibold,
      fontSize: 12,
      marginTop: 6,
    },
    logoActions: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 4,
    },
    logoActionText: {
      fontFamily: fonts.body.semibold,
      fontSize: 14,
    },
    gmapsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      marginTop: 8,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 11,
      backgroundColor: colors.primary,
    },
    gmapsBtnText: {
      fontFamily: fonts.body.semibold,
      fontSize: 13,
      color: colors.fireText,
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 13,
      height: 47,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    saveButtonText: {
      fontFamily: fonts.body.semibold,
      fontSize: 15,
      color: colors.fireText,
    },
  });
}
