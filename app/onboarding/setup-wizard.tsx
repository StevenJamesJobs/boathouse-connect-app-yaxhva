/**
 * Owner setup wizard (s86, mockups S-1 … S-5) — Jobs · Menus · Reviews · Theme · Review, on
 * the Onboarding Kit: the five-segment rail up top, one pinned Back / Next dock, a left hero
 * and glass cards per step. Each step body is a top-level module component (props in,
 * callbacks out); the screen owns the state, the RPCs and the step flow.
 *
 * Step 4 (Theme) hosts the shared AppearanceBody — it repaints the whole app live, so the
 * wizard page is its own preview. Step 5 sums everything up with an Edit chip per card.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Keyboard } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from "expo-router/react-navigation";
import { useTranslation } from 'react-i18next';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import { IconSymbol } from '@/components/IconSymbol';
import GlassCard from '@/components/GlassCard';
import MenuIconPicker from '@/components/MenuIconPicker';
import { StorageImage } from '@/components/StorageImage';
import AppearanceBody from '@/components/appearance/AppearanceBody';
import { THEME_LABEL_KEY } from '@/components/appearance/appearanceKit';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { markPersonalized } from '@/utils/deviceFlags';
import {
  OnbScreen,
  OnboardingRail,
  OnboardingDock,
  Hero,
  Disc,
  CtaButton,
  IconField,
  InfoBlurb,
  Body,
  B,
  Bullet,
  Pill,
  ErrorLine,
  LinkRow,
  useOnbAccents,
} from '@/components/onboarding/OnboardingKit';

const DEFAULT_JOB_TITLES = [
  'Manager',
  'Server',
  'Bartender',
  'Host',
  'Busser',
  'Runner',
  'Chef',
  'Cook',
  'Kitchen',
  'Dishwasher',
];

type CategoryScope = 'shared' | 'per_menu';
type ImportResult = { success: boolean; count: number; error?: string } | null;

/** "26 Broad Street, Red Bank, NJ 07701" — whatever parts the org has, in postal order. */
function formatOrgAddress(org: { address: string | null; city: string | null; state: string | null; zip: string | null }): string {
  const stateZip = [org.state, org.zip].filter(Boolean).join(' ');
  const cityLine = [org.city, stateZip].filter(Boolean).join(', ');
  return [org.address, cityLine].filter(Boolean).join(', ');
}

export default function SetupWizardScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ organizationId: string }>();
  const { organizationId: contextOrgId, organization, isLoading: orgLoading, refreshOrganization } = useOrganization();
  const { user } = useAuth();
  const organizationId = params.organizationId || contextOrgId;

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  // Inline validation (the dock's Next has no alert): one foot-of-step line + the scope nudge.
  const [error, setError] = useState('');
  const [scopeMissing, setScopeMissing] = useState(false);

  // Step 1 state — job titles
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
  const [customTitle, setCustomTitle] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Step 2 state — menus
  const [hasSeasonalMenus, setHasSeasonalMenus] = useState(true);
  const [menu1Name, setMenu1Name] = useState(t('onboarding.default_menu_1'));
  const [menu2Name, setMenu2Name] = useState(t('onboarding.default_menu_2'));
  const [menu1Icon, setMenu1Icon] = useState('snowflake');
  const [menu2Icon, setMenu2Icon] = useState('sun.max.fill');
  // Both mode chips start closed and unselected — the owner has to pick one (2 menus only).
  const [categoryScope, setCategoryScope] = useState<CategoryScope | null>(null);

  // Step 3 state — Google Reviews
  const [googleMapsQuery, setGoogleMapsQuery] = useState('');
  // True while the query is the one we prefilled; the first manual edit drops the tag.
  const [autoFilled, setAutoFilled] = useState(false);
  const queryEdited = useRef(false);
  const [importingReviews, setImportingReviews] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult>(null);
  // The query the owner actually stands behind: imported, or typed / edited by hand.
  const confirmedQuery =
    (importResult && importResult.success) || !autoFilled ? googleMapsQuery.trim() : '';
  // True once the org has menu items (i.e. they uploaded their first menu).
  const [menuUploaded, setMenuUploaded] = useState(false);
  const [menuItemCount, setMenuItemCount] = useState(0);

  // The context holds a placeholder org until the real one lands — never show / use that.
  const orgReady = !orgLoading && !!contextOrgId;
  const orgName = orgReady ? organization.name : '';
  const orgAddress = orgReady ? formatOrgAddress(organization) : '';

  // Re-check on focus (e.g. returning from the AI menu uploader) so step 2 can
  // swap the "upload your menu" prompt for a confirmation once a menu exists.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!organizationId || !user?.id) return;
        const { data: menuRows } = await supabase.rpc('get_menu_items', { p_actor_id: user.id });
        if (!cancelled) {
          setMenuUploaded((menuRows || []).length > 0);
          setMenuItemCount((menuRows || []).length);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [organizationId]),
  );

  // Prefill the Google Maps query from Create Your Restaurant ("Name, Street, City, ST Zip")
  // — or the org's saved query on a revisit — once, and only while the owner hasn't typed.
  useEffect(() => {
    if (!orgReady || queryEdited.current || googleMapsQuery) return;
    const saved = organization.google_maps_query?.trim();
    const composed = orgName && orgAddress ? [orgName, orgAddress].join(', ') : '';
    const prefill = saved || composed;
    if (!prefill) return;
    setGoogleMapsQuery(prefill);
    setAutoFilled(true);
  }, [orgReady, organization.google_maps_query, orgName, orgAddress, googleMapsQuery]);

  // A new step starts clean.
  useEffect(() => {
    setError('');
    setScopeMissing(false);
  }, [step]);

  // ─── Step 1: Job Titles ───────────────────────────────────────────

  const toggleTitle = (title: string) => {
    setError('');
    setSelectedTitles((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    );
  };

  const addCustomTitle = () => {
    const trimmed = customTitle.trim();
    if (!trimmed) return;
    if (selectedTitles.includes(trimmed)) {
      setError(t('onboarding.duplicate_msg'));
      return;
    }
    setError('');
    setSelectedTitles((prev) => [...prev, trimmed]);
    setCustomTitle('');
    setShowCustomInput(false);
  };

  // All known titles (defaults + any custom ones the user added)
  const allTitles = Array.from(new Set([...DEFAULT_JOB_TITLES, ...selectedTitles]));

  // ─── Navigation ───────────────────────────────────────────────────

  // Persist the menu configuration as soon as the user finishes step 2, so the
  // choice is saved the moment it's made (not only at the very end) and the rest
  // of the app reflects it immediately via refreshOrganization. Returns false on
  // failure so the caller can keep the user on the step.
  const persistMenuConfig = async (): Promise<boolean> => {
    if (!organizationId || !user?.id) return false;
    const menuCount = hasSeasonalMenus ? 2 : 1;
    // Two menus never get here without a pick (requireScope); `?? 'shared'` only narrows the type.
    const scope: CategoryScope = hasSeasonalMenus ? (categoryScope ?? 'shared') : 'shared';
    console.log('[SetupWizard] Saving menu config:', {
      organizationId, menuCount, scope, menu1Icon, menu2Icon,
    });
    const { data: settingsRes, error: settingsError } = await supabase.rpc('update_organization_settings', {
      p_organization_id: organizationId,
      p_user_id: user.id,
      p_menu_count: menuCount,
      p_menu_1_name: menu1Name.trim() || t('onboarding.default_menu_1'),
      // menu_2_name is NOT NULL; menu_count governs display, so keep a valid
      // placeholder even with one menu.
      p_menu_2_name: menu2Name.trim() || t('onboarding.default_menu_2'),
      p_menu_1_icon: menu1Icon,
      p_menu_2_icon: menu2Icon,
    });
    const settingsResult: any = typeof settingsRes === 'string' ? JSON.parse(settingsRes) : settingsRes;
    if (settingsError || (settingsResult && settingsResult.success === false)) {
      console.error('[SetupWizard] Save menu config error:', settingsError || settingsResult?.error);
      return false;
    }
    // The scope goes through its own RPC, which also materializes the per-menu
    // category trees when switching to per_menu (the old direct write skipped that).
    const { data: scopeRes, error: scopeError } = await supabase.rpc('set_org_menu_category_scope', {
      p_organization_id: organizationId,
      p_user_id: user.id,
      p_scope: scope,
    });
    const scopeResult: any = typeof scopeRes === 'string' ? JSON.parse(scopeRes) : scopeRes;
    if (scopeError || (scopeResult && scopeResult.success === false)) {
      console.error('[SetupWizard] Save menu scope error:', scopeError || scopeResult?.error);
      return false;
    }
    // Per-menu mode needs the slot-1/slot-2 category trees materialized from the
    // seeded slot-0 tree. Idempotent, so re-running on a revisit is safe.
    if (scope === 'per_menu') {
      const { error: matError } = await supabase.rpc('materialize_org_per_menu_categories_actor', {
        p_actor_id: user.id,
      });
      if (matError) console.error('[SetupWizard] Materialize per-menu categories error:', matError);
    }
    await refreshOrganization();
    return true;
  };

  // Two menus need a category mode before anything is saved (Next AND the uploader).
  const requireScope = (): boolean => {
    if (hasSeasonalMenus && !categoryScope) {
      setScopeMissing(true);
      return false;
    }
    return true;
  };

  const nextStep = async () => {
    setError('');
    if (step === 1 && selectedTitles.length === 0) {
      setError(t('onboarding.select_titles_msg'));
      return;
    }
    // Leaving the Menu step: persist the menu configuration right now.
    if (step === 2) {
      if (!requireScope()) return;
      setIsLoading(true);
      const ok = await persistMenuConfig();
      setIsLoading(false);
      if (!ok) {
        setError(t('onboarding.save_menu_failed'));
        return;
      }
    }
    // Step 3 (Google Reviews): if they typed a business but haven't imported
    // yet, nudge them — but let them skip (the query is saved either way and
    // the Mon/Thu cron will pick it up).
    if (step === 3 && googleMapsQuery.trim() && !(importResult && importResult.success)) {
      Alert.alert(
        t('onboarding.import_reviews_q_title'),
        t('onboarding.import_reviews_q_msg'),
        [
          { text: t('onboarding.import_now'), style: 'cancel' },
          { text: t('onboarding.skip_for_now'), onPress: () => setStep((s) => s + 1) },
        ],
      );
      return;
    }
    // Step 4 (Theme) has nothing to validate — walking past it settles the first-run
    // personalize offer for this device.
    if (step === 4) {
      markPersonalized();
    }
    setStep((s) => s + 1);
  };

  const prevStep = () => setStep((s) => s - 1);

  // Save the menu choice, then open the AI menu uploader. Persisting first means
  // the uploader sees the correct menu_count / category scope.
  const launchMenuUpload = async () => {
    setIsLoading(true);
    const ok = await persistMenuConfig();
    setIsLoading(false);
    if (!ok) {
      Alert.alert(t('common.error'), t('onboarding.save_menu_failed'));
      return;
    }
    // Flag the uploader as onboarding so it hides the add/replace choice (first
    // menu) and offers a "Return to Onboarding" button when done.
    router.push({ pathname: '/menu-upload', params: { onboarding: '1' } } as any);
  };

  const handleUploadPress = () => {
    setError('');
    if (!requireScope()) return;
    launchMenuUpload();
  };

  // ─── Step 3: Google Reviews import ────────────────────────────────

  const handleQueryChange = (text: string) => {
    queryEdited.current = true;
    setAutoFilled(false);
    setGoogleMapsQuery(text);
    setImportResult(null);
  };

  const handleImportReviews = async () => {
    // Drop the keyboard so the result blurb and the Back/Next bar are visible.
    Keyboard.dismiss();
    const query = googleMapsQuery.trim();
    if (!query || !organizationId || !user?.id) return;

    setImportingReviews(true);
    setImportResult(null);

    try {
      // Save the query first so it persists even if the import errors out — the
      // Mon/Thu cron will then pick it up for this org.
      const { data: saveRes, error: saveError } = await supabase.rpc('update_organization_settings', {
        p_organization_id: organizationId,
        p_user_id: user.id,
        p_google_maps_query: query,
      });
      if (saveError) throw saveError;
      const saveResult: any = typeof saveRes === 'string' ? JSON.parse(saveRes) : saveRes;
      if (saveResult && saveResult.success === false) throw new Error(saveResult.error);

      const { data, error } = await supabase.functions.invoke('import-google-reviews', {
        body: {
          source: 'manual',
          user_id: user?.id,
          organization_id: organizationId,
          backfill: true,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Import failed');

      // The query is now saved on the org — refresh context so Org Settings and
      // the rest of the app pick it up (and don't prompt for it again).
      await refreshOrganization();
      // Async import: the submit just queues the Outscraper scrape; reviews are
      // ingested later via webhook, so there's no synchronous count to show.
      setImportResult({ success: true, count: 0 });
    } catch (err: any) {
      console.error('[SetupWizard] Import reviews error:', err);
      setImportResult({ success: false, count: 0, error: err?.message });
    } finally {
      setImportingReviews(false);
    }
  };

  // ─── Step 5: Save ─────────────────────────────────────────────────

  const handleComplete = async () => {
    if (!organizationId || !user?.id) {
      Alert.alert(t('common.error'), t('onboarding.org_not_found'));
      return;
    }

    setIsLoading(true);

    try {
      // Idempotent: replace any titles left over from a previous (failed) attempt
      // so tapping Complete Setup again replaces them instead of duplicating. The
      // RPC deletes leftover titles and inserts the selected ones in order
      // server-side (blank strings dropped).
      const { error: titlesError } = await supabase.rpc('replace_org_job_titles', {
        p_actor_id: user.id,
        p_titles: selectedTitles,
      });

      if (titlesError) {
        console.error('[SetupWizard] Save job titles error:', titlesError);
        Alert.alert(t('common.error'), t('onboarding.titles_save_failed'));
        setIsLoading(false);
        return;
      }

      // Seed default job-title → assistant mappings now that titles exist, so
      // employees can see the right assistants out of the box (idempotent;
      // owner can adjust in Org Settings → Jobs & Tools). Non-fatal on error.
      const { error: seedError } = await supabase.rpc(
        'seed_default_job_title_assistants_actor',
        { p_actor_id: user.id }
      );
      if (seedError) {
        console.error('[SetupWizard] Seed assistant mappings error:', seedError);
      }

      // Seed the Cocktails A-Z starter library (clone from the canonical source
      // org). Idempotent by name; non-fatal — a failure here must not block
      // onboarding. Actor-gated: target = the owner's own org, and a NULL
      // p_source_org defaults to the sample org inside the RPC.
      const { error: cocktailSeedError } = await supabase.rpc('seed_org_cocktails_actor', {
        p_actor_id: user.id,
      });
      if (cocktailSeedError) {
        console.error('[SetupWizard] Seed cocktails error:', cocktailSeedError);
      }

      // Menu config (count/scope/names/icons) was already saved when the user
      // left step 2 via persistMenuConfig — we deliberately don't re-write it
      // here so a stale render can never clobber their choice. We only
      // idempotently persist the Google Maps query, in case it was typed on
      // step 3 but never imported (the cron will then pick it up). No-op if
      // empty; non-fatal so onboarding is never blocked by it.
      // s86: a query that was only AUTO-FILLED from the address and never imported or edited
      // is not the owner's word — saving it would let the cron scrape (and bill) a guess.
      if (confirmedQuery && organizationId && user?.id) {
        const { data: queryRes, error: queryError } = await supabase.rpc('update_organization_settings', {
          p_organization_id: organizationId,
          p_user_id: user.id,
          p_google_maps_query: confirmedQuery,
        });
        const queryResult: any = typeof queryRes === 'string' ? JSON.parse(queryRes) : queryRes;
        if (queryError || (queryResult && queryResult.success === false)) {
          console.error('[SetupWizard] Save google_maps_query error:', queryError || queryResult?.error);
        }
      }

      // Reflect everything we saved (menu config, query, seeds) in the rest of
      // the app so Org Settings & the menu show the owner's choices immediately.
      await refreshOrganization();

      router.push({
        pathname: '/onboarding/join-code',
        params: { organizationId },
      });
    } catch (err: any) {
      console.error('[SetupWizard] Unexpected error:', err);
      Alert.alert(t('common.error'), t('onboarding.something_went_wrong'));
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────

  const menu1Display = menu1Name.trim() || t('onboarding.default_menu_1');
  const menu2Display = menu2Name.trim() || t('onboarding.default_menu_2');
  const imported = !!(importResult && importResult.success);
  const isLast = step === 5;

  const railSteps = [
    t('onboarding.rail_jobs'),
    t('onboarding.rail_menus'),
    t('onboarding.rail_reviews'),
    t('onboarding.rail_theme'),
    t('onboarding.rail_review'),
  ];

  return (
    // Keyed by step so every step opens scrolled to its top.
    <OnbScreen
      key={step}
      header={<OnboardingRail steps={railSteps} current={step} rightLabel={orgName || undefined} />}
      dock={
        <OnboardingDock
          onBack={step > 1 ? prevStep : undefined}
          nextLabel={isLast ? t('onboarding.complete_setup') : t('onboarding.next')}
          onNext={isLast ? handleComplete : nextStep}
          nextIosIcon={isLast ? 'checkmark' : undefined}
          nextAndroidIcon={isLast ? 'check' : undefined}
          nextLeading={isLast}
          // Step 3's shining button is Import My Reviews — one shine per screen.
          quietNext={step === 3}
          loading={isLoading}
        />
      }
    >
      {step === 1 && (
        <JobsStep
          titles={allTitles}
          selected={selectedTitles}
          onToggle={toggleTitle}
          adding={showCustomInput}
          customTitle={customTitle}
          onChangeCustom={(v) => {
            setCustomTitle(v);
            setError('');
          }}
          onOpenCustom={() => setShowCustomInput(true)}
          onCancelCustom={() => {
            setShowCustomInput(false);
            setCustomTitle('');
            setError('');
          }}
          onAddCustom={addCustomTitle}
          error={error}
        />
      )}

      {step === 2 && (
        <MenusStep
          twoMenus={hasSeasonalMenus}
          onTwoMenus={(two) => {
            setHasSeasonalMenus(two);
            setError('');
            setScopeMissing(false);
          }}
          menu1Name={menu1Name}
          menu2Name={menu2Name}
          onMenu1Name={(v) => {
            setMenu1Name(v);
            setError('');
          }}
          onMenu2Name={(v) => {
            setMenu2Name(v);
            setError('');
          }}
          menu1Display={menu1Display}
          menu2Display={menu2Display}
          menu1Icon={menu1Icon}
          menu2Icon={menu2Icon}
          onMenu1Icon={setMenu1Icon}
          onMenu2Icon={setMenu2Icon}
          scope={categoryScope}
          onScope={(s) => {
            setCategoryScope(s);
            setScopeMissing(false);
            setError('');
          }}
          scopeError={scopeMissing}
          menuUploaded={menuUploaded}
          onUpload={handleUploadPress}
          busy={isLoading}
          error={error}
        />
      )}

      {step === 3 && (
        <ReviewsStep
          query={googleMapsQuery}
          onChangeQuery={handleQueryChange}
          autoFilled={autoFilled}
          importing={importingReviews}
          result={importResult}
          onImport={handleImportReviews}
          onSkip={() => setStep((s) => s + 1)}
        />
      )}

      {step === 4 && <ThemeStep />}

      {step === 5 && (
        <SummaryStep
          orgName={orgName}
          orgLogoUrl={orgReady ? organization.logo_url : null}
          orgAddress={orgAddress}
          username={user?.username}
          titles={selectedTitles}
          menus={
            hasSeasonalMenus
              ? [{ name: menu1Display, icon: menu1Icon }, { name: menu2Display, icon: menu2Icon }]
              : [{ name: menu1Display, icon: menu1Icon }]
          }
          scope={hasSeasonalMenus ? categoryScope : null}
          menuUploaded={menuUploaded}
          menuItemCount={menuItemCount}
          query={confirmedQuery}
          imported={imported}
          onEdit={setStep}
        />
      )}
    </OnbScreen>
  );
}

// ── Top-level module components (a component redefined inside render remounts per keystroke
//    and drops TextInput focus). ─────────────────────────────────────────────────────────────

/** A translated string whose `<b>…</b>` runs become the kit's bold run. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/<b>(.*?)<\/b>/g);
  return <>{parts.map((part, i) => (i % 2 === 1 ? <B key={i}>{part}</B> : part))}</>;
}

/** ok- / bad-tinted result row: icon + optional title + text. */
function NoteRow({ tone, iosIcon, androidIcon, title, text }: { tone: 'ok' | 'bad'; iosIcon: string; androidIcon: string; title?: string; text: string }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  const hue = tone === 'ok' ? a.ok : a.bad;
  return (
    <View style={[styles.note, { backgroundColor: hexToRgba(hue, 0.1), borderColor: hexToRgba(hue, 0.3) }]}>
      <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={16} color={hue} style={{ marginTop: 1 }} />
      <View style={styles.fill}>
        {!!title && <Text style={[styles.noteTitle, { color: colors.text }]}>{title}</Text>}
        <Text style={[styles.noteText, { color: title ? colors.textSecondary : colors.text }]}>{text}</Text>
      </View>
    </View>
  );
}

// ── Step 1 · Job Titles ───────────────────────────────────────────────────

function JobChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: hexToRgba(a.pop, 0.13), borderColor: hexToRgba(a.pop, 0.42) }
          : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
      ]}
    >
      {/* Always-present slot (○ → ✓): the chip keeps its width, so picking never reflows the row. */}
      <IconSymbol
        ios_icon_name={selected ? 'checkmark.circle.fill' : 'circle'}
        android_material_icon_name={selected ? 'check-circle' : 'radio-button-unchecked'}
        size={14}
        color={selected ? a.pop : colors.textSecondary}
      />
      <Text style={[styles.chipText, { color: selected ? colors.text : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

interface JobsStepProps {
  titles: string[];
  selected: string[];
  onToggle: (title: string) => void;
  adding: boolean;
  customTitle: string;
  onChangeCustom: (value: string) => void;
  onOpenCustom: () => void;
  onCancelCustom: () => void;
  onAddCustom: () => void;
  error: string;
}

function JobsStep({ titles, selected, onToggle, adding, customTitle, onChangeCustom, onOpenCustom, onCancelCustom, onAddCustom, error }: JobsStepProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const a = useOnbAccents();
  return (
    <>
      <Hero align="left" title={t('onboarding.step1_title')} subtitle={t('onboarding.step1_subtitle')} />

      <GlassCard variant="glass" radius={16} style={styles.cardJobs}>
        <View style={styles.rowCenter}>
          <Text style={[styles.eyebrow, styles.fill, { color: a.quiet }]}>{t('onboarding.positions')}</Text>
          <Text style={[styles.eyebrow, { color: a.pop }]}>{t('onboarding.n_selected', { count: selected.length })}</Text>
        </View>

        <View style={styles.chips}>
          {titles.map((title) => (
            <JobChip key={title} label={title} selected={selected.includes(title)} onPress={() => onToggle(title)} />
          ))}
          {!adding && (
            <Pressable
              onPress={onOpenCustom}
              accessibilityRole="button"
              style={({ pressed }) => [styles.chip, styles.chipDashed, { backgroundColor: colors.glass, borderColor: colors.glassBorder, opacity: pressed ? 0.8 : 1 }]}
            >
              <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={13} color={a.quiet} />
              <Text style={[styles.chipText, { color: colors.text }]}>{t('onboarding.add_custom_title')}</Text>
            </Pressable>
          )}
        </View>

        {adding && (
          <View style={styles.customRow}>
            <IconField
              containerStyle={styles.fill}
              iosIcon="briefcase.fill"
              androidIcon="work"
              placeholder={t('onboarding.custom_title_ph')}
              value={customTitle}
              onChangeText={onChangeCustom}
              autoCapitalize="words"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={onAddCustom}
            />
            <Pressable
              onPress={onAddCustom}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.add_custom_title')}
              style={({ pressed }) => [styles.square, { backgroundColor: a.fill, borderColor: a.fill, opacity: pressed ? 0.85 : 1 }]}
            >
              <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={19} color={a.ink} />
            </Pressable>
            <Pressable
              onPress={onCancelCustom}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              style={({ pressed }) => [styles.square, { backgroundColor: colors.glass, borderColor: colors.glassBorder, opacity: pressed ? 0.8 : 1 }]}
            >
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}

        <ErrorLine message={error} />
      </GlassCard>
    </>
  );
}

// ── Step 2 · Menu Configuration ───────────────────────────────────────────

/** The 1 | 2 capsule driving the menu count. */
function CountCapsule({ two, onChange }: { two: boolean; onChange: (two: boolean) => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const a = useOnbAccents();
  const cell = (n: 1 | 2, on: boolean, label: string) => (
    <Pressable
      onPress={() => onChange(n === 2)}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={[styles.capCell, on && { backgroundColor: a.fill }]}
    >
      <Text style={[styles.capText, { color: on ? a.ink : colors.textSecondary }]}>{n}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.capsule, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      {cell(1, !two, t('onboarding.menus_one'))}
      {cell(2, two, t('onboarding.menus_two'))}
    </View>
  );
}

/** A category-mode tile chip: name + one-line gist; the pick wears the corner tick. */
function ScopeTile({ title, gist, selected, onPress }: { title: string; gist: string; selected: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  return (
    // No overflow clip here — the tick badge hangs off the top-right corner.
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.scopeTile,
        selected
          ? { backgroundColor: hexToRgba(a.pop, 0.11), borderColor: hexToRgba(a.pop, 0.45) }
          : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
      ]}
    >
      <Text style={[styles.scopeTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.scopeGist, { color: colors.textSecondary }]}>{gist}</Text>
      {selected && (
        <View style={[styles.tick, { backgroundColor: a.fill }]}>
          <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={11} color={a.ink} />
        </View>
      )}
    </Pressable>
  );
}

interface MenusStepProps {
  twoMenus: boolean;
  onTwoMenus: (two: boolean) => void;
  menu1Name: string;
  menu2Name: string;
  onMenu1Name: (value: string) => void;
  onMenu2Name: (value: string) => void;
  /** The typed names, falling back to the defaults — what the bullets and picker titles read. */
  menu1Display: string;
  menu2Display: string;
  menu1Icon: string;
  menu2Icon: string;
  onMenu1Icon: (sf: string) => void;
  onMenu2Icon: (sf: string) => void;
  scope: CategoryScope | null;
  onScope: (scope: CategoryScope) => void;
  scopeError: boolean;
  menuUploaded: boolean;
  onUpload: () => void;
  busy: boolean;
  error: string;
}

function MenusStep({
  twoMenus, onTwoMenus,
  menu1Name, menu2Name, onMenu1Name, onMenu2Name, menu1Display, menu2Display,
  menu1Icon, menu2Icon, onMenu1Icon, onMenu2Icon,
  scope, onScope, scopeError,
  menuUploaded, onUpload, busy, error,
}: MenusStepProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const a = useOnbAccents();
  const names = { menu1: menu1Display, menu2: menu2Display };
  return (
    <>
      <Hero align="left" title={t('onboarding.step2_title')} subtitle={t('onboarding.step2_subtitle')} />

      {/* How many menus + their names and icons */}
      <GlassCard variant="glass" radius={16} style={styles.card}>
        <View style={styles.countRow}>
          <Text style={[styles.countQ, { color: colors.text }]}>{t('onboarding.menu_count_q')}</Text>
          <CountCapsule two={twoMenus} onChange={onTwoMenus} />
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary, marginTop: -4 }]}>
          {twoMenus ? t('onboarding.seasonal_on_hint') : t('onboarding.seasonal_off_hint')}
        </Text>

        <View style={styles.menuRow}>
          <MenuIconPicker compact label={t('onboarding.menu_icon_label', { menuName: menu1Display })} value={menu1Icon} onChange={onMenu1Icon} />
          <IconField
            containerStyle={styles.fill}
            label={t('onboarding.menu1_label')}
            placeholder={t('onboarding.default_menu_1')}
            value={menu1Name}
            onChangeText={onMenu1Name}
            autoCapitalize="words"
          />
        </View>
        {twoMenus && (
          <View style={styles.menuRow}>
            <MenuIconPicker compact label={t('onboarding.menu_icon_label', { menuName: menu2Display })} value={menu2Icon} onChange={onMenu2Icon} />
            <IconField
              containerStyle={styles.fill}
              label={t('onboarding.menu2_label')}
              placeholder={t('onboarding.default_menu_2')}
              value={menu2Name}
              onChangeText={onMenu2Name}
              autoCapitalize="words"
            />
          </View>
        )}
      </GlassCard>

      {/* Category mode — two menus only; both tiles closed until the owner picks one */}
      {twoMenus && (
        <GlassCard variant="glass" radius={16} style={styles.card}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('onboarding.categories_q2')}</Text>
          <View style={styles.bullets}>
            <Bullet>{t('onboarding.cat_bullet_switch')}</Bullet>
            <Bullet><Rich text={t('onboarding.cat_bullet_specials')} /></Bullet>
          </View>

          <View style={styles.scopeRow}>
            <ScopeTile
              title={t('onboarding.shared_cats_title')}
              gist={t('onboarding.shared_gist')}
              selected={scope === 'shared'}
              onPress={() => onScope('shared')}
            />
            <ScopeTile
              title={t('onboarding.per_menu_cats_title')}
              gist={t('onboarding.per_menu_gist')}
              selected={scope === 'per_menu'}
              onPress={() => onScope('per_menu')}
            />
          </View>

          {scope === 'shared' && (
            <View style={styles.bullets}>
              <Bullet><Rich text={t('onboarding.shared_b1')} /></Bullet>
              <Bullet><Rich text={t('onboarding.shared_b2', names)} /></Bullet>
              <Bullet><Rich text={t('onboarding.shared_b3', names)} /></Bullet>
            </View>
          )}
          {scope === 'per_menu' && (
            <View style={styles.bullets}>
              <Bullet><Rich text={t('onboarding.per_b1', names)} /></Bullet>
              <Bullet><Rich text={t('onboarding.per_b2')} /></Bullet>
              <Bullet><Rich text={t('onboarding.per_b3')} /></Bullet>
            </View>
          )}

          <ErrorLine message={scopeError ? t('onboarding.pick_scope_required') : null} />
        </GlassCard>
      )}

      {/* AI menu upload — or the done note once a menu exists */}
      {menuUploaded ? (
        <NoteRow
          tone="ok"
          iosIcon="checkmark.seal.fill"
          androidIcon="verified"
          title={t('onboarding.menu_done_title')}
          text={t('onboarding.menu_done_text')}
        />
      ) : (
        <GlassCard variant="glass" radius={16} style={styles.cardUpload}>
          <Disc small tone="pop">
            <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={17} color={a.pop} />
          </Disc>
          <View style={styles.fill}>
            <View style={styles.uploadTitleRow}>
              <Text style={[styles.uploadTitle, { color: colors.text }]}>{t('onboarding.menu_handy_title')}</Text>
              <Pill tone="ok" label={t('onboarding.free_pill')} />
            </View>
            <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 2 }]}>{t('onboarding.menu_handy_text')}</Text>
          </View>
          <Pressable
            onPress={onUpload}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.uploadChip,
              { backgroundColor: hexToRgba(a.pop, 0.13), borderColor: hexToRgba(a.pop, 0.34), opacity: busy ? 0.5 : pressed ? 0.8 : 1 },
            ]}
          >
            <IconSymbol ios_icon_name="arrow.up.doc.fill" android_material_icon_name="upload-file" size={15} color={a.pop} />
            <Text style={[styles.uploadChipText, { color: a.pop }]}>{t('onboarding.upload_chip')}</Text>
          </Pressable>
        </GlassCard>
      )}

      <ErrorLine message={error} />
    </>
  );
}

// ── Step 3 · Google Reviews ───────────────────────────────────────────────

interface ReviewsStepProps {
  query: string;
  onChangeQuery: (value: string) => void;
  autoFilled: boolean;
  importing: boolean;
  result: ImportResult;
  onImport: () => void;
  onSkip: () => void;
}

function ReviewsStep({ query, onChangeQuery, autoFilled, importing, result, onImport, onSkip }: ReviewsStepProps) {
  const { t } = useTranslation();
  const imported = !!(result && result.success);
  return (
    <>
      <Hero align="left" title={t('onboarding.step3_title')} subtitle={t('onboarding.step3_subtitle')} />

      <GlassCard variant="glass" radius={16} style={styles.card}>
        <IconField
          multiline
          numberOfLines={3}
          iosIcon="mappin.and.ellipse"
          androidIcon="place"
          label={t('onboarding.find_on_gmaps')}
          labelTrailing={
            autoFilled ? <Pill tone="ok" iosIcon="checkmark" androidIcon="check" label={t('onboarding.auto_filled')} /> : undefined
          }
          placeholder={t('onboarding.gmaps_ph')}
          value={query}
          onChangeText={onChangeQuery}
          autoCapitalize="words"
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          editable={!importing}
          hint={t('onboarding.gmaps_hint')}
        />

        <CtaButton
          label={t('onboarding.import_my_reviews')}
          onPress={onImport}
          iosIcon="arrow.down.circle.fill"
          androidIcon="file-download"
          leading
          loading={importing}
          disabled={!query.trim()}
        />

        {imported && (
          <NoteRow tone="ok" iosIcon="checkmark.circle.fill" androidIcon="check-circle" text={t('onboarding.import_success_note')} />
        )}
        {!!result && !result.success && (
          <NoteRow tone="bad" iosIcon="exclamationmark.triangle.fill" androidIcon="error-outline" text={t('onboarding.import_error_note')} />
        )}
      </GlassCard>

      {/* Always offer a clear skip until reviews are actually imported — e.g. if
          they still need to look up exactly how their business appears on Google
          Maps. The query (if any) is saved and the cron will pick it up. */}
      {!imported && <LinkRow label={t('onboarding.skip_link')} onPress={onSkip} />}
    </>
  );
}

// ── Step 4 · Theme ────────────────────────────────────────────────────────

function ThemeStep() {
  const { t } = useTranslation();
  return (
    <>
      <Hero align="left" title={t('onboarding.theme_title')} subtitle={t('onboarding.theme_subtitle')} />
      <InfoBlurb>
        <Body>
          {t('onboarding.theme_note_a')}{' '}
          <B>{t('onboarding.theme_note_b')}</B>{' '}
          {t('onboarding.theme_note_c')}{' '}
          <B>{t('onboarding.theme_note_d')}</B>.
        </Body>
      </InfoBlurb>
      {/* Repaints the whole app live — this page is its own preview. */}
      <AppearanceBody showTags={false} />
    </>
  );
}

// ── Step 5 · Review & Save ────────────────────────────────────────────────

function EditChip({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      style={({ pressed }) => [styles.editChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder, opacity: pressed ? 0.8 : 1 }]}
    >
      <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={13} color={colors.text} />
      <Text style={[styles.editChipText, { color: colors.text }]}>{t('onboarding.edit')}</Text>
    </Pressable>
  );
}

/** One glass card per step: icon + title + optional status pill + the Edit chip, then the body. */
function SummaryCard({ iosIcon, androidIcon, title, pill, onEdit, children }: { iosIcon: string; androidIcon: string; title: string; pill?: React.ReactNode; onEdit: () => void; children?: React.ReactNode }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  return (
    <GlassCard variant="glass" radius={16} style={styles.cardSummary}>
      <View style={styles.summaryHead}>
        <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={15} color={a.quiet} />
        <Text style={[styles.summaryTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        {pill}
        <EditChip onPress={onEdit} />
      </View>
      {children}
    </GlassCard>
  );
}

interface SummaryStepProps {
  orgName: string;
  orgLogoUrl: string | null;
  orgAddress: string;
  username?: string;
  titles: string[];
  menus: { name: string; icon: string }[];
  /** null with one menu (no mode to show). */
  scope: CategoryScope | null;
  menuUploaded: boolean;
  menuItemCount: number;
  query: string;
  imported: boolean;
  onEdit: (step: number) => void;
}

function SummaryStep({ orgName, orgLogoUrl, orgAddress, username, titles, menus, scope, menuUploaded, menuItemCount, query, imported, onEdit }: SummaryStepProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { palette, resolvedMode } = useAppTheme();
  const initials = orgName.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
  const modeLabel = resolvedMode === 'dark' ? t('appearance.dark_mode') : t('appearance.light_mode');
  const glassSkin = { backgroundColor: colors.glass, borderColor: colors.glassBorder };

  return (
    <>
      <Hero align="left" title={t('onboarding.step4_title')} subtitle={t('onboarding.step4_subtitle')} />

      {/* The restaurant */}
      <GlassCard variant="glass" radius={18} style={styles.orgCard}>
        {orgLogoUrl ? (
          <StorageImage source={{ uri: orgLogoUrl }} style={[styles.orgLogo, { borderColor: colors.glassBorder }]} resizeMode="cover" />
        ) : (
          <View style={[styles.orgLogo, styles.center, { borderColor: colors.glassBorder, backgroundColor: hexToRgba(colors.tint, 0.18) }]}>
            <Text style={[styles.orgInitials, { color: colors.tint }]}>{initials}</Text>
          </View>
        )}
        <View style={styles.fill}>
          <Text style={[styles.orgName, { color: colors.text }]} numberOfLines={2}>{orgName}</Text>
          {!!orgAddress && <Text style={[styles.orgAddress, { color: colors.textSecondary }]} numberOfLines={2}>{orgAddress}</Text>}
          {!!username && <Text style={[styles.orgOwner, { color: colors.textSecondary }]} numberOfLines={1}>{t('onboarding.owner_line', { username })}</Text>}
        </View>
      </GlassCard>

      {/* Job Titles */}
      <SummaryCard
        iosIcon="briefcase.fill"
        androidIcon="work"
        title={t('onboarding.step1_title')}
        pill={<Pill label={t('onboarding.n_positions', { count: titles.length })} />}
        onEdit={() => onEdit(1)}
      >
        <View style={styles.miniWrap}>
          {titles.map((title) => (
            <View key={title} style={[styles.mini, glassSkin]}>
              <Text style={[styles.miniText, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            </View>
          ))}
        </View>
      </SummaryCard>

      {/* Menus */}
      <SummaryCard
        iosIcon="fork.knife"
        androidIcon="restaurant"
        title={t('onboarding.menus_card')}
        pill={scope ? <Pill label={scope === 'per_menu' ? t('onboarding.scope_per_pill') : t('onboarding.scope_shared_pill')} /> : undefined}
        onEdit={() => onEdit(2)}
      >
        <View style={styles.menuTiles}>
          {menus.map((menu, i) => (
            <View key={i} style={[styles.menuTile, glassSkin]}>
              <IconSymbol ios_icon_name={menu.icon} android_material_icon_name={menu.icon} size={16} color={colors.tint} />
              <Text style={[styles.menuTileText, { color: colors.text }]} numberOfLines={1}>{menu.name}</Text>
            </View>
          ))}
        </View>
        {menuUploaded ? (
          <View style={styles.kv}>
            <Pill tone="ok" iosIcon="checkmark" androidIcon="check" label={t('onboarding.menu_uploaded_pill')} />
            <Text style={[styles.kvStrong, { color: colors.text }]}>{t('onboarding.n_items', { count: menuItemCount })}</Text>
          </View>
        ) : (
          <Text style={[styles.kvText, { color: colors.textSecondary }]}>{t('onboarding.no_menu_yet')}</Text>
        )}
      </SummaryCard>

      {/* Google Reviews */}
      <SummaryCard
        iosIcon="star.fill"
        androidIcon="star"
        title={t('onboarding.step3_title')}
        pill={
          imported ? (
            <Pill tone="gold" label={t('onboarding.status_importing')} />
          ) : query ? (
            <Pill label={t('onboarding.status_will_import')} />
          ) : (
            <Pill label={t('onboarding.status_skipped')} />
          )
        }
        onEdit={() => onEdit(3)}
      >
        {!!query && (
          <View style={[styles.kv, { alignItems: 'flex-start' }]}>
            <IconSymbol ios_icon_name="mappin.and.ellipse" android_material_icon_name="place" size={13} color={colors.textSecondary} style={{ marginTop: 2 }} />
            <Text style={[styles.kvText, styles.fill, { color: colors.textSecondary }]}>{query}</Text>
          </View>
        )}
      </SummaryCard>

      {/* Your theme */}
      <SummaryCard iosIcon="paintpalette.fill" androidIcon="palette" title={t('onboarding.your_theme')} onEdit={() => onEdit(4)}>
        <View style={styles.kv}>
          <View style={[styles.swatch, { backgroundColor: colors.background, borderColor: colors.glassBorder }]} />
          <View style={[styles.swatch, { backgroundColor: colors.ember, borderColor: colors.glassBorder }]} />
          <View style={[styles.swatch, { backgroundColor: colors.tint, borderColor: colors.glassBorder }]} />
          <Text style={[styles.kvText, styles.fill, { color: colors.textSecondary }]}>
            <B>{t(THEME_LABEL_KEY[palette])}</B> · {modeLabel} · {t('onboarding.just_for_you')}
          </Text>
        </View>
      </SummaryCard>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' },

  card: { padding: 14, gap: 10 },
  cardJobs: { padding: 14, gap: 12 },
  cardTitle: { fontFamily: fonts.display.semibold, fontSize: 15, lineHeight: 20 },
  hint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16 },
  bullets: { gap: 7 },

  // Step 1
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 36, borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipDashed: { borderStyle: 'dashed' },
  chipText: { fontFamily: fonts.body.semibold, fontSize: 13 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  square: { width: 43, height: 43, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  // Step 2
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countQ: { flex: 1, fontFamily: fonts.display.semibold, fontSize: 17 },
  capsule: { flexDirection: 'row', padding: 3, gap: 3, borderRadius: 13, borderWidth: 1 },
  capCell: { width: 44, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  capText: { fontFamily: fonts.display.bold, fontSize: 16 },
  menuRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  scopeRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  scopeTile: { flex: 1, minWidth: 0, borderRadius: 14, borderWidth: 1, paddingVertical: 11, paddingHorizontal: 12, gap: 3 },
  scopeTitle: { fontFamily: fonts.body.semibold, fontSize: 14 },
  scopeGist: { fontFamily: fonts.body.regular, fontSize: 11, lineHeight: 15 },
  tick: { position: 'absolute', top: -6, right: -6, width: 19, height: 19, borderRadius: 9.5, alignItems: 'center', justifyContent: 'center' },
  cardUpload: { padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  uploadTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  uploadTitle: { fontFamily: fonts.body.semibold, fontSize: 14 },
  uploadChip: { height: 38, borderRadius: 12, borderWidth: 1, paddingLeft: 9, paddingRight: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  uploadChipText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },

  // Result rows
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 10, paddingHorizontal: 11, borderRadius: 13, borderWidth: 1 },
  noteTitle: { fontFamily: fonts.body.semibold, fontSize: 13, marginBottom: 2 },
  noteText: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 17 },

  // Step 5
  orgCard: { padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  orgLogo: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  orgInitials: { fontFamily: fonts.display.bold, fontSize: 16 },
  orgName: { fontFamily: fonts.display.bold, fontSize: 17, letterSpacing: -0.2 },
  orgAddress: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, marginTop: 1 },
  orgOwner: { fontFamily: fonts.mono.medium, fontSize: 10.5, marginTop: 3 },
  cardSummary: { padding: 12, gap: 9 },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryTitle: { flex: 1, minWidth: 0, fontFamily: fonts.display.semibold, fontSize: 14 },
  editChip: { height: 30, borderRadius: 10, borderWidth: 1, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  editChipText: { fontFamily: fonts.body.semibold, fontSize: 11.5 },
  miniWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mini: { height: 26, borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  miniText: { fontFamily: fonts.body.semibold, fontSize: 11.5 },
  menuTiles: { flexDirection: 'row', gap: 8 },
  menuTile: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1 },
  menuTileText: { flex: 1, minWidth: 0, fontFamily: fonts.body.semibold, fontSize: 13 },
  kv: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kvText: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 16 },
  kvStrong: { fontFamily: fonts.body.semibold, fontSize: 12 },
  swatch: { width: 22, height: 22, borderRadius: 8, borderWidth: 1 },
});
