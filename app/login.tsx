/**
 * Login (s86, mockup L-C "fold-down") — ONE file for both platforms and both variants.
 *
 * Opens on the username alone; return / leaving the field UNFOLDS the password, "Stay
 * signed in", Sign In and the reset note beneath it. Both inputs are mounted from the
 * first frame with autofill hints, so iOS Keychain / Google can fill the pair in one go —
 * a password arriving while folded opens the card by itself. A returning device wears its
 * last org's logo and pre-fills the last username (never the password; ✕ clears it).
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import { IconSymbol } from '@/components/IconSymbol';
import GlassCard from '@/components/GlassCard';
import { IS_MCLOONES } from '@/constants/buildVariant';
import {
  DEVICE_FLAGS,
  deviceHasReachedDashboard,
  getLastUsername,
  clearLastUsername,
  resetDeviceFirstRun,
} from '@/utils/deviceFlags';
import {
  OnbScreen,
  BrandMark,
  Hero,
  IconField,
  EyeToggle,
  CheckRow,
  CtaButton,
  ErrorLine,
  LinkRow,
  LegalFooter,
  useOnbAccents,
} from '@/components/onboarding/OnboardingKit';

interface CachedOrg {
  orgId: string;
  orgName: string;
  logoUrl: string | null;
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const a = useOnbAccents();
  const router = useRouter();
  const pathname = usePathname();
  const { login, isAuthenticated, user } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [staySignedIn, setStaySignedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [cachedOrg, setCachedOrg] = useState<CachedOrg | null>(null);
  const [remembered, setRemembered] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  // Welcome is still this device's front door until it has reached a dashboard.
  const [firstRun, setFirstRun] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const fold = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    (async () => {
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const cached = await AsyncStorage.getItem(DEVICE_FLAGS.LAST_ORG);
        if (cached) setCachedOrg(JSON.parse(cached));
      } catch {}
      const last = await getLastUsername();
      if (last) {
        setUsername(last);
        setRemembered(true);
        setUnfolded(true);
      }
      if (!IS_MCLOONES) setFirstRun(!(await deviceHasReachedDashboard()));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.timing(fold, { toValue: unfolded ? 1 : 0, duration: 420, easing: Easing.bezier(0.22, 0.9, 0.3, 1), useNativeDriver: false }).start();
  }, [unfolded, fold]);

  // A password manager can fill the (still folded) password field — open up for it.
  useEffect(() => {
    if (password.length > 0 && !unfolded) setUnfolded(true);
  }, [password, unfolded]);

  // Check if already authenticated and redirect.
  // Guard on pathname: this screen can stay mounted underneath the onboarding
  // stack (welcome -> login, or login -> signup -> create-restaurant), so without
  // this check it would hijack the auth flip mid-signup and yank a brand-new owner
  // to the portal/paywall before the success screen + trial load.
  useEffect(() => {
    if (pathname === '/login' && isAuthenticated && user) {
      const timeout = setTimeout(() => {
        try {
          if (user.role === 'manager' || user.role === 'owner') {
            router.replace('/(portal)/manager');
          } else {
            router.replace('/(portal)/employee');
          }
        } catch (navError) {
          console.error('[Login] Navigation error:', navError);
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [pathname, isAuthenticated, user, router]);

  const advance = () => {
    if (!username.trim()) return;
    setUnfolded(true);
    // Let the unfold start before the keyboard retargets.
    setTimeout(() => passwordRef.current?.focus(), 60);
  };

  const clearUsername = async () => {
    setUsername('');
    setPassword('');
    setRemembered(false);
    setUnfolded(false);
    setError('');
    await clearLastUsername();
    usernameRef.current?.focus();
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError(t('login.error_empty_fields'));
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const success = await login(username.trim(), password, staySignedIn);
      setIsLoading(false);
      if (success) {
        // Wait a moment for auth state to update, then navigate
        setTimeout(() => {
          try {
            router.replace('/(portal)');
          } catch (navError) {
            console.error('[Login] Navigation error:', navError);
            router.push('/(portal)');
          }
        }, 200);
      } else {
        setError(t('login.error_invalid'));
      }
    } catch (e) {
      setIsLoading(false);
      if (e instanceof Error && e.message === 'rate_limited') {
        setError(t('login.error_rate_limited'));
      } else {
        setError(t('login.error_generic'));
      }
    }
  };

  const showOrg = !!cachedOrg && remembered;

  return (
    <OnbScreen front>
      <BrandMark size="sm" org={showOrg ? cachedOrg : null} />
      <Hero title={t('login.sign_in')} subtitle={showOrg ? undefined : t('login.subtitle')} />

      <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
        <GlassCard variant="glass" radius={16} style={styles.card}>
          <IconField
            ref={usernameRef}
            label={t('login.username')}
            labelTrailing={remembered ? <Text style={[styles.labelNote, { color: colors.textSecondary }]}>{t('login.not_you')}</Text> : undefined}
            iosIcon="person.fill"
            androidIcon="person"
            placeholder={t('login.username')}
            value={username}
            onChangeText={(v) => { setUsername(v); setError(''); }}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            autoComplete="username"
            returnKeyType="next"
            onSubmitEditing={advance}
            onBlur={advance}
            blurOnSubmit={false}
            editable={!isLoading}
            trailing={
              remembered ? (
                <Pressable onPress={clearUsername} hitSlop={10} accessibilityLabel={t('login.not_you')}>
                  <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={15} color={colors.textSecondary} />
                </Pressable>
              ) : unfolded && !!username.trim() ? (
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={15} color={a.ok} />
              ) : undefined
            }
          />

          {/* Username tip — MyResto usernames follow first-initial + last name. Hidden on the
              McLoone's build, whose accounts predate the convention. Shown while the card is
              folded or the field is empty; a plain conditional on purpose — the height-clipped
              fade it replaced could catch the line half-cut (Steve's s86 device round). */}
          {!IS_MCLOONES && (!unfolded || !username.trim()) && (
            <Text style={[styles.tip, { color: colors.textSecondary }]}>{t('login.username_hint')}</Text>
          )}

          <Animated.View
            style={{
              maxHeight: fold.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }),
              opacity: fold,
              transform: [{ translateY: fold.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
              overflow: 'hidden',
            }}
            pointerEvents={unfolded ? 'auto' : 'none'}
          >
            <View style={styles.unfold}>
              <IconField
                ref={passwordRef}
                label={t('login.password')}
                iosIcon="lock.fill"
                androidIcon="lock"
                placeholder={t('login.password')}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(''); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="current-password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                editable={!isLoading}
                trailing={<EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} disabled={isLoading} />}
              />
              <CheckRow checked={staySignedIn} onToggle={() => setStaySignedIn((v) => !v)} disabled={isLoading}>
                <Text style={[styles.stay, { color: colors.text }]}>{t('login.stay_signed_in')}</Text>
              </CheckRow>
              <ErrorLine message={error} />
              <CtaButton label={t('login.sign_in')} iosIcon={null} androidIcon={null} onPress={handleLogin} loading={isLoading} disabled={!password} />
              <Text style={[styles.forgot, { color: colors.textSecondary }]}>{t('login.forgot_password')}</Text>
            </View>
          </Animated.View>
        </GlassCard>
      </Animated.View>

      {/* Until this device has reached a dashboard, Welcome is one tap back. */}
      {!IS_MCLOONES && firstRun && (
        <LinkRow back lead={t('login.new_here')} label={t('login.back_to_welcome')} onPress={() => router.replace('/welcome')} />
      )}

      {/* Dev-only: make this device first-run again (re-opens Welcome). Never renders in production builds. */}
      {__DEV__ && !IS_MCLOONES && !firstRun && (
        <Pressable
          style={styles.devReset}
          onPress={async () => {
            await resetDeviceFirstRun();
            router.replace('/welcome');
          }}
        >
          <Text style={[styles.devResetText, { color: colors.textSecondary }]}>Show the Welcome screen again (dev only)</Text>
        </Pressable>
      )}

      <LegalFooter />
    </OnbScreen>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14 },
  unfold: { paddingTop: 10, gap: 10 },
  labelNote: { fontFamily: fonts.body.regular, fontSize: 10.5 },
  tip: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  stay: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
  forgot: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, textAlign: 'center' },
  devReset: { alignItems: 'center', paddingVertical: 8 },
  devResetText: { fontFamily: fonts.body.regular, fontSize: 12, textDecorationLine: 'underline' },
});
