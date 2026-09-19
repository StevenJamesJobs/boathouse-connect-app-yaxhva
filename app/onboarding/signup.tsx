/**
 * Create Your Account (s86, mockup O-2) — owner setup 1 of 2. One glass card: names, the
 * username preview chip (the thing they must remember), email, password pair, inline error.
 * Nothing is created here — the details ride to create-restaurant, which makes the org +
 * owner atomically.
 */
import React, { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/GlassCard';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { deriveUsername } from '@/utils/username';
import {
  OnbScreen,
  TopBar,
  Hero,
  IconField,
  EyeToggle,
  UsernameChip,
  ErrorLine,
  CtaButton,
  LinkRow,
} from '@/components/onboarding/OnboardingKit';

export default function SignupScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');

  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const validate = (): string | null => {
    if (!firstName.trim()) return t('onboarding.first_name_required');
    if (!lastName.trim()) return t('onboarding.last_name_required');
    if (!email.trim()) return t('onboarding.email_required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return t('onboarding.email_invalid');
    if (password.length < 6) return t('onboarding.password_min');
    if (password !== confirmPassword) return t('onboarding.passwords_no_match');
    return null;
  };

  // Live preview of the username the owner will get (collisions may append a
  // number at creation time, but this shows the rule).
  const usernamePreview = deriveUsername(firstName, lastName);

  const handleContinue = () => {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }

    // Defer account creation: carry the owner's details to the restaurant step,
    // where the org + owner account are created atomically in one transaction.
    // This avoids ever attaching the new owner to another tenant.
    router.push({
      pathname: '/onboarding/create-restaurant',
      params: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
      },
    });
  };

  return (
    <OnbScreen header={<TopBar onBack={() => router.back()} eyebrow={t('onboarding.owner_setup_step', { n: 1 })} />}>
      <Hero align="left" title={t('onboarding.signup_title')} subtitle={t('onboarding.signup_subtitle')} />

      <GlassCard variant="glass" radius={16} style={styles.card}>
        {/* First / Last name row */}
        <View style={styles.nameRow}>
          <IconField
            containerStyle={styles.nameField}
            label={t('onboarding.first_name')}
            placeholder={t('onboarding.first_name')}
            value={firstName}
            onChangeText={(v) => { setFirstName(v); setError(''); }}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="givenName"
            autoComplete="given-name"
            returnKeyType="next"
            onSubmitEditing={() => lastNameRef.current?.focus()}
            blurOnSubmit={false}
          />
          <IconField
            ref={lastNameRef}
            containerStyle={styles.nameField}
            label={t('onboarding.last_name')}
            placeholder={t('onboarding.last_name')}
            value={lastName}
            onChangeText={(v) => { setLastName(v); setError(''); }}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="familyName"
            autoComplete="family-name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>

        {/* Username preview — your login name is first initial + last name. */}
        {usernamePreview ? (
          <View style={styles.usernameRow}>
            <Text style={[styles.usernameLead, { color: colors.textSecondary }]}>{t('onboarding.username_will_be')}</Text>
            <UsernameChip username={usernamePreview} />
          </View>
        ) : null}

        <IconField
          ref={emailRef}
          label={t('onboarding.email')}
          iosIcon="envelope.fill"
          androidIcon="email"
          placeholder={t('onboarding.email')}
          value={email}
          onChangeText={(v) => { setEmail(v); setError(''); }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />

        <IconField
          ref={passwordRef}
          label={t('onboarding.password')}
          iosIcon="lock.fill"
          androidIcon="lock"
          placeholder={t('onboarding.password')}
          value={password}
          onChangeText={(v) => { setPassword(v); setError(''); }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          blurOnSubmit={false}
          trailing={<EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
        />

        <IconField
          ref={confirmRef}
          label={t('onboarding.confirm_password')}
          iosIcon="lock.fill"
          androidIcon="lock"
          placeholder={t('onboarding.confirm_password_ph')}
          value={confirmPassword}
          onChangeText={(v) => { setConfirmPassword(v); setError(''); }}
          secureTextEntry={!showConfirmPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={handleContinue}
          hint={t('onboarding.password_hint')}
          trailing={<EyeToggle shown={showConfirmPassword} onToggle={() => setShowConfirmPassword((v) => !v)} />}
        />

        <ErrorLine message={error} />
        <CtaButton label={t('onboarding.continue')} onPress={handleContinue} />
      </GlassCard>

      {/* The last escape route — back to Welcome, not /login. */}
      <LinkRow lead={t('onboarding.already_have_account')} label={t('login.sign_in')} onPress={() => router.replace('/welcome')} />
    </OnbScreen>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 10 },
  nameRow: { flexDirection: 'row', gap: 10 },
  nameField: { flex: 1, minWidth: 0 },
  usernameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  usernameLead: { fontFamily: fonts.body.regular, fontSize: 12 },
});
