/**
 * Create Your Restaurant (s86, mockups O-3 + O-4) — owner setup 2 of 2.
 *
 * O-3: two glass cards — where · house settings — every field saying what it is for; the
 * org + owner account + 14-day trial are created atomically by `signup_owner_with_org`.
 * O-4: the account-created state — username + password (behind an eye; it is the route
 * param still in memory, nothing is stored to show it) + the join code, then on to setup.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import GlassCard from '@/components/GlassCard';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { translateServerError } from '@/utils/serverErrors';
import { LEGAL } from '@/config/legal';
import {
  OnbScreen,
  TopBar,
  Hero,
  IconField,
  ErrorLine,
  CtaButton,
  useOnbAccents,
} from '@/components/onboarding/OnboardingKit';

interface CreatedAccount {
  orgId: string;
  username: string;
  joinCode: string;
}

// ── O-4 pieces (top-level module components) ──────────────────────────────

/** The 34pt square button on a credentials row. */
function SquareButton({ onPress, label, children }: { onPress: () => void; label: string; children: React.ReactNode }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.square, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, opacity: pressed ? 0.7 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

/** Copy square: copies `value`, flips to a tick for 2s. */
function CopySquare({ value, label }: { value: string; label: string }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(value);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SquareButton onPress={copy} label={label}>
      <IconSymbol
        ios_icon_name={copied ? 'checkmark' : 'doc.on.doc'}
        android_material_icon_name={copied ? 'check' : 'content-copy'}
        size={15}
        color={copied ? a.ok : colors.text}
      />
    </SquareButton>
  );
}

/** One credentials row: mono eyebrow · big mono value · optional hint · a trailing square. */
function CredRow({ eyebrow, value, masked, hint, trailing, first }: { eyebrow: string; value: string; masked?: boolean; hint?: string; trailing: React.ReactNode; first?: boolean }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  return (
    <View style={[styles.cred, !first && { borderTopWidth: 1, borderTopColor: colors.hairline }]}>
      <View style={styles.credBody}>
        <Text style={[styles.credEyebrow, { color: a.quiet }]}>{eyebrow}</Text>
        {/* Masked bullets stay on one line (clipped, never "…"); a revealed value may wrap so it is always whole. */}
        <Text
          style={[styles.credValue, { color: colors.text }, masked && { letterSpacing: 4 }]}
          numberOfLines={masked ? 1 : undefined}
          ellipsizeMode="clip"
          selectable={!masked}
        >
          {value}
        </Text>
        {!!hint && <Text style={[styles.credHint, { color: colors.textSecondary }]}>{hint}</Text>}
      </View>
      {trailing}
    </View>
  );
}

/** O-4 — the account-created state. */
function CreatedState({ created, password, onContinue }: { created: CreatedAccount; password: string; onContinue: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <OnbScreen contentStyle={styles.createdContent}>
      <Hero
        tone="ok"
        iosIcon="checkmark"
        androidIcon="check"
        title={t('onboarding.all_set_title')}
        subtitle={t('onboarding.all_set_subtitle')}
      />

      <GlassCard variant="glass" radius={18} style={styles.credCard}>
        <CredRow
          first
          eyebrow={t('onboarding.your_username')}
          value={created.username}
          trailing={<CopySquare value={created.username} label={t('onboarding.created_copy_username')} />}
        />
        <CredRow
          eyebrow={t('onboarding.your_password')}
          value={showPassword ? password : '•'.repeat(password.length)}
          masked={!showPassword}
          hint={t('onboarding.username_next_hint')}
          trailing={
            <SquareButton
              onPress={() => setShowPassword((v) => !v)}
              label={showPassword ? t('onboarding.created_hide_password') : t('onboarding.created_show_password')}
            >
              <IconSymbol
                ios_icon_name={showPassword ? 'eye.slash.fill' : 'eye.fill'}
                android_material_icon_name={showPassword ? 'visibility-off' : 'visibility'}
                size={15}
                color={colors.text}
              />
            </SquareButton>
          }
        />
      </GlassCard>

      <GlassCard variant="glass" radius={18} style={styles.credCard}>
        <CredRow
          first
          eyebrow={t('onboarding.team_join_code')}
          value={created.joinCode}
          hint={t('onboarding.share_join_code_hint')}
          trailing={<CopySquare value={created.joinCode} label={t('onboarding.copy_code')} />}
        />
      </GlassCard>

      <CtaButton label={t('onboarding.continue_setup')} onPress={onContinue} style={styles.createdCta} />
    </OnbScreen>
  );
}

// ── O-3 — the form ────────────────────────────────────────────────────────

export default function CreateRestaurantScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
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
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedAccount | null>(null);

  // Guard against landing here without owner details (e.g. deep link / reload).
  const hasOwnerDetails =
    !!params.firstName && !!params.lastName && !!params.password;

  const handleCreate = async () => {
    if (!restaurantName.trim()) {
      setError(t('onboarding.restaurant_name_required'));
      return;
    }

    if (!hasOwnerDetails) {
      Alert.alert(t('common.error'), t('onboarding.details_missing'), [
        { text: t('common.ok'), onPress: () => router.replace('/onboarding/signup') },
      ]);
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const weatherLocation =
        city.trim() && state.trim() ? `${city.trim()}, ${state.trim()}` : '';

      // Atomic: creates the organization, the owner account, and the 14-day
      // trial in one transaction, returning the resolved username + join code.
      const { data, error: rpcError } = await supabase.rpc('signup_owner_with_org', {
        p_first_name: params.firstName,
        p_last_name: params.lastName,
        p_email: params.email ?? '',
        p_password: params.password,
        p_restaurant_name: restaurantName.trim(),
        p_reward_currency_name: rewardCurrencyName.trim() || 'Bucks',
        p_default_password: defaultPassword.trim() || 'welcome123',
        p_address: address.trim() || undefined,
        p_city: city.trim() || undefined,
        p_state: state.trim() || undefined,
        p_zip: zip.trim() || undefined,
        p_weather_location: weatherLocation || undefined,
        // Recorded with the owner's clickwrap tick on Welcome.
        p_tos_version: LEGAL.tosVersion,
      });

      if (rpcError) {
        console.error('[CreateRestaurant] signup_owner_with_org error:', rpcError);
        setError(translateServerError(rpcError, t('onboarding.create_failed')));
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
          t('onboarding.account_created_title'),
          t('onboarding.created_signin_fallback', { username: result.username }),
          [{ text: t('common.ok'), onPress: () => router.replace('/login') }],
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
      setError(t('onboarding.something_went_wrong'));
    } finally {
      setIsLoading(false);
    }
  };

  if (created) {
    return (
      <CreatedState
        created={created}
        password={params.password ?? ''}
        onContinue={() =>
          router.replace({
            pathname: '/onboarding/setup-wizard',
            params: { organizationId: created.orgId },
          })
        }
      />
    );
  }

  return (
    <OnbScreen
      header={
        <TopBar
          onBack={() => { if (!isLoading) router.back(); }}
          eyebrow={t('onboarding.owner_setup_step', { n: 2 })}
        />
      }
    >
      <Hero align="left" title={t('onboarding.create_restaurant_title')} subtitle={t('onboarding.create_restaurant_subtitle')} />

      {/* Where */}
      <GlassCard variant="glass" radius={16} style={styles.card}>
        <IconField
          required
          label={t('onboarding.restaurant_name_label')}
          iosIcon="building.2.fill"
          androidIcon="store"
          placeholder={t('onboarding.restaurant_name_ph')}
          value={restaurantName}
          onChangeText={(v) => { setRestaurantName(v); setError(''); }}
          autoCapitalize="words"
          editable={!isLoading}
        />
        <IconField
          label={t('onboarding.address')}
          iosIcon="mappin.circle.fill"
          androidIcon="place"
          placeholder={t('onboarding.street_address_ph')}
          value={address}
          onChangeText={(v) => { setAddress(v); setError(''); }}
          autoCapitalize="words"
          textContentType="streetAddressLine1"
          editable={!isLoading}
        />
        <View style={styles.cityRow}>
          <IconField
            containerStyle={styles.cityField}
            label={t('onboarding.city')}
            placeholder={t('onboarding.city')}
            value={city}
            onChangeText={(v) => { setCity(v); setError(''); }}
            autoCapitalize="words"
            textContentType="addressCity"
            editable={!isLoading}
          />
          <IconField
            containerStyle={styles.stateField}
            label={t('onboarding.state')}
            placeholder="ST"
            value={state}
            onChangeText={(v) => { setState(v); setError(''); }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={2}
            editable={!isLoading}
          />
          <IconField
            containerStyle={styles.zipField}
            mono
            label={t('onboarding.zip')}
            placeholder="00000"
            value={zip}
            onChangeText={(v) => { setZip(v); setError(''); }}
            keyboardType="number-pad"
            textContentType="postalCode"
            maxLength={5}
            editable={!isLoading}
          />
        </View>
        <Text style={[styles.reuseHint, { color: colors.textSecondary }]}>{t('onboarding.address_reuse_hint')}</Text>
      </GlassCard>

      {/* House settings */}
      <GlassCard variant="glass" radius={16} style={styles.card}>
        <IconField
          label={t('onboarding.reward_currency')}
          iosIcon="star.fill"
          androidIcon="star"
          placeholder={t('onboarding.reward_currency_ph')}
          value={rewardCurrencyName}
          onChangeText={(v) => { setRewardCurrencyName(v); setError(''); }}
          autoCapitalize="words"
          editable={!isLoading}
          hint={t('onboarding.reward_currency_hint')}
        />
        <IconField
          mono
          label={t('onboarding.default_password')}
          iosIcon="key.fill"
          androidIcon="vpn-key"
          placeholder="welcome123"
          value={defaultPassword}
          onChangeText={(v) => { setDefaultPassword(v); setError(''); }}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isLoading}
          hint={t('onboarding.default_password_hint')}
        />
      </GlassCard>

      <ErrorLine message={error} />
      <CtaButton
        label={t('onboarding.create_restaurant_btn')}
        iosIcon={null}
        androidIcon={null}
        onPress={handleCreate}
        loading={isLoading}
      />
    </OnbScreen>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 10 },
  cityRow: { flexDirection: 'row', gap: 8 },
  cityField: { flex: 1.6, minWidth: 0 },
  stateField: { flex: 0.7, minWidth: 0 },
  zipField: { flex: 1, minWidth: 0 },
  reuseHint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, marginTop: -4 },

  createdContent: { paddingTop: 34 },
  credCard: { padding: 0 },
  cred: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12 },
  credBody: { flex: 1, minWidth: 0 },
  credEyebrow: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' },
  credValue: { fontFamily: fonts.mono.semibold, fontSize: 17, letterSpacing: 0.3, marginTop: 2 },
  credHint: { fontFamily: fonts.body.regular, fontSize: 11, lineHeight: 15, marginTop: 2 },
  square: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  createdCta: { marginTop: 4 },
});
