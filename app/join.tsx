
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { splashColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { deriveUsername } from '@/utils/username';
import { translateServerError } from '@/utils/serverErrors';

type Phase = 'enter_code' | 'create_account';

// Join-screen override: these two join_signup errors have richer join.* copy
// ("check with your manager" guidance) than the generic server_errors.* pair
// every other surface uses. Site-local on purpose — the shared map stays 1:1.
const JOIN_COPY_OVERRIDES: Record<string, string> = {
  'Invalid join code': 'join.invalid_code',
  'Self-registration is disabled for this organization': 'join.self_signup_disabled',
};

// Pre-login the client only ever learns the org's display name and whether self-signup is
// open — never its id or default_password (that leak is what join_signup exists to close).
interface FoundOrg {
  name: string;
  allow_self_signup: boolean;
}

export default function JoinScreen() {
  const [phase, setPhase] = useState<Phase>('enter_code');
  const [joinCode, setJoinCode] = useState('');
  const [org, setOrg] = useState<FoundOrg | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { t } = useTranslation();
  const { adoptSession } = useAuth();

  // Animation values
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(-20)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(headerTranslateY, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(formTranslateY, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLookupCode = async () => {
    const code = joinCode.trim();
    if (!code) {
      setError(t('join.enter_code_required'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const { data, error: queryError } = await supabase.rpc('lookup_join_code', {
        p_join_code: code,
      });

      const row = Array.isArray(data) ? data[0] : (data as any);
      if (queryError || !row) {
        setError(t('join.invalid_code'));
        setIsLoading(false);
        return;
      }

      setOrg({
        name: row.org_name,
        allow_self_signup: row.allow_self_signup,
      });
      setPhase('create_account');
    } catch (e) {
      console.error('[Join] Error looking up code:', e);
      setError(t('onboarding.something_went_wrong'));
    } finally {
      setIsLoading(false);
    }
  };

  // Prefer this screen's richer copy for the two errors that have it;
  // everything else goes through the shared server-error map.
  const joinServerError = (err: { message?: string | null } | null | undefined) => {
    const overrideKey = JOIN_COPY_OVERRIDES[(err?.message || '').trim()];
    return overrideKey ? t(overrideKey) : translateServerError(err, t('onboarding.something_went_wrong'));
  };

  const handleCreateAccount = async () => {
    if (!org) return;

    if (!firstName.trim()) {
      setError(t('onboarding.first_name_required'));
      return;
    }
    if (!lastName.trim()) {
      setError(t('onboarding.last_name_required'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;

      // join_signup re-validates the code + self-signup flag, resolves a free username from
      // this base server-side (numeric suffix on collision), creates the employee with the
      // org's default password — which never reaches this client — and returns the
      // authenticated row (login_user shape). Its error messages are user-facing.
      const { data, error: signupError } = await supabase.rpc('join_signup', {
        p_join_code: joinCode.trim(),
        p_username: deriveUsername(firstName, lastName),
        p_name: fullName,
        p_email: email.trim(),
      });

      if (signupError) {
        console.error('[Join] Error creating account:', signupError);
        setError(joinServerError(signupError));
        return;
      }

      const row = Array.isArray(data) ? data[0] : (data as any);
      if (!row) {
        setError(t('onboarding.something_went_wrong'));
        return;
      }

      // The row is already authenticated — adopt it as the session (no credential round-trip).
      const adopted = await adoptSession(row, false);

      if (adopted) {
        Alert.alert(
          t('onboarding.account_created_title'),
          t('join.account_created_msg', { username: row.username }),
          [{ text: t('join.continue'), onPress: () => router.replace('/change-password') }],
        );
      } else {
        setError(t('join.created_signin_failed', { username: row.username }));
      }
    } catch (e: any) {
      console.error('[Join] Error creating account:', e);
      setError(joinServerError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const renderEnterCode = () => (
    <>
      <Text style={styles.subtext}>{t('join.subtitle')}</Text>

      <View style={styles.inputContainer}>
        <IconSymbol
          ios_icon_name="ticket.fill"
          android_material_icon_name="confirmation-number"
          size={20}
          color={splashColors.textSecondary}
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          placeholder={t('join.code_ph')}
          placeholderTextColor={splashColors.textSecondary}
          value={joinCode}
          onChangeText={(text) => {
            setJoinCode(text.toUpperCase());
            setError('');
          }}
          autoCapitalize="characters"
          maxLength={9}
          returnKeyType="done"
          onSubmitEditing={handleLookupCode}
          editable={!isLoading}
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
        onPress={handleLookupCode}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>{t('join.continue')}</Text>
        )}
      </TouchableOpacity>
    </>
  );

  const renderCreateAccount = () => {
    if (!org) return null;

    if (!org.allow_self_signup) {
      return (
        <>
          <View style={styles.orgBadge}>
            <IconSymbol
              ios_icon_name="building.2.fill"
              android_material_icon_name="store"
              size={20}
              color={splashColors.primary}
            />
            <Text style={styles.orgBadgeText}>{org.name}</Text>
          </View>

          <View style={styles.infoBox}>
            <IconSymbol
              ios_icon_name="info.circle.fill"
              android_material_icon_name="info"
              size={20}
              color={splashColors.primary}
            />
            <Text style={styles.infoText}>
              {t('join.self_signup_disabled')}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setPhase('enter_code');
              setOrg(null);
              setError('');
            }}
          >
            <Text style={styles.secondaryButtonText}>{t('join.try_different_code')}</Text>
          </TouchableOpacity>
        </>
      );
    }

    return (
      <>
        <View style={styles.orgBadge}>
          <IconSymbol
            ios_icon_name="checkmark.circle.fill"
            android_material_icon_name="check-circle"
            size={20}
            color="#4CAF50"
          />
          <Text style={styles.orgBadgeText}>{t('join.joining', { orgName: org.name })}</Text>
        </View>

        <View style={styles.nameRow}>
          <View style={[styles.inputContainer, styles.nameField]}>
            <IconSymbol
              ios_icon_name="person.fill"
              android_material_icon_name="person"
              size={20}
              color={splashColors.textSecondary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder={t('join.first_name')}
              placeholderTextColor={splashColors.textSecondary}
              value={firstName}
              onChangeText={(text) => {
                setFirstName(text);
                setError('');
              }}
              autoCapitalize="words"
              returnKeyType="next"
              editable={!isLoading}
            />
          </View>
          <View style={[styles.inputContainer, styles.nameField]}>
            <TextInput
              style={styles.input}
              placeholder={t('join.last_name')}
              placeholderTextColor={splashColors.textSecondary}
              value={lastName}
              onChangeText={(text) => {
                setLastName(text);
                setError('');
              }}
              autoCapitalize="words"
              returnKeyType="next"
              editable={!isLoading}
            />
          </View>
        </View>

        {firstName.trim() && lastName.trim() ? (
          <Text style={styles.usernameHintText}>
            {t('onboarding.username_will_be')}{' '}
            <Text style={styles.usernameHintBold}>
              {deriveUsername(firstName, lastName)}
            </Text>
          </Text>
        ) : null}

        <View style={styles.inputContainer}>
          <IconSymbol
            ios_icon_name="envelope.fill"
            android_material_icon_name="email"
            size={20}
            color={splashColors.textSecondary}
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder={t('join.email')}
            placeholderTextColor={splashColors.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="done"
            editable={!isLoading}
          />
        </View>

        <View style={styles.infoBox}>
          <IconSymbol
            ios_icon_name="key.fill"
            android_material_icon_name="vpn-key"
            size={20}
            color={splashColors.primary}
          />
          <Text style={styles.infoText}>
            {t('join.auto_signin_note')}
          </Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={handleCreateAccount}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{t('join.create_account')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            setPhase('enter_code');
            setOrg(null);
            setFirstName('');
            setLastName('');
            setEmail('');
            setError('');
          }}
        >
          <Text style={styles.secondaryButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </>
    );
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
        <Animated.View
          style={[
            styles.headerContainer,
            {
              opacity: headerOpacity,
              transform: [{ translateY: headerTranslateY }],
            },
          ]}
        >
          <IconSymbol
            ios_icon_name="person.badge.plus"
            android_material_icon_name="person-add"
            size={48}
            color={splashColors.primary}
          />
          <Text style={styles.header}>{t('join.title')}</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.formContainer,
            {
              opacity: formOpacity,
              transform: [{ translateY: formTranslateY }],
            },
          ]}
        >
          {phase === 'enter_code' ? renderEnterCode() : renderCreateAccount()}
        </Animated.View>

        <TouchableOpacity
          style={styles.backToLoginContainer}
          onPress={() => router.replace('/login')}
        >
          <Text style={styles.backToLoginText}>{t('join.back_to_login')}</Text>
        </TouchableOpacity>
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
    paddingTop: 100,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: splashColors.text,
    marginTop: 16,
  },
  subtext: {
    fontSize: 16,
    color: splashColors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  formContainer: {
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameField: {
    flex: 1,
  },
  usernameHintText: {
    fontSize: 13,
    color: splashColors.textSecondary,
    marginTop: -4,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  usernameHintBold: {
    color: splashColors.primary,
    fontWeight: '700',
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
  primaryButton: {
    backgroundColor: splashColors.primary,
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 8px rgba(44, 95, 141, 0.2)',
    elevation: 4,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: splashColors.primary,
  },
  secondaryButtonText: {
    color: splashColors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  orgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 8,
  },
  orgBadgeText: {
    fontSize: 17,
    fontWeight: '600',
    color: splashColors.text,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 12,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: splashColors.text,
    lineHeight: 20,
  },
  backToLoginContainer: {
    alignItems: 'center',
    marginTop: 32,
  },
  backToLoginText: {
    fontSize: 16,
    color: splashColors.primary,
    fontWeight: '500',
  },
});
