
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
import { useAuth } from '@/contexts/AuthContext';
import { splashColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { deriveUsername, findAvailableUsername } from '@/utils/username';

type Phase = 'enter_code' | 'create_account';

interface FoundOrg {
  id: string;
  name: string;
  allow_self_signup: boolean;
  default_password: string;
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
  const { login } = useAuth();

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
      setError('Please enter a join code.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const { data, error: queryError } = await (supabase as any)
        .from('organizations')
        .select('id, name, allow_self_signup, default_password')
        .ilike('join_code', code)
        .single();

      if (queryError || !data) {
        setError('Invalid join code. Please check with your manager.');
        setIsLoading(false);
        return;
      }

      setOrg({
        id: (data as any).id,
        name: (data as any).name,
        allow_self_signup: (data as any).allow_self_signup,
        default_password: (data as any).default_password,
      });
      setPhase('create_account');
    } catch (e) {
      console.error('[Join] Error looking up code:', e);
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!org) return;

    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }
    if (!lastName.trim()) {
      setError('Last name is required.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;

      // Username = first initial + last name (e.g. "seccles"), with a numeric
      // suffix if that's already taken.
      const base = deriveUsername(firstName, lastName);
      const username = await findAvailableUsername(base, async (candidate) => {
        const { data } = await supabase
          .from('users')
          .select('id')
          .eq('username', candidate)
          .maybeSingle();
        return !!data;
      });

      // Create user via RPC
      const { data: newUserId, error: createError } = await supabase.rpc('create_user', {
        p_username: username,
        p_name: fullName,
        p_email: email.trim() || '',
        p_job_title: '',
        p_phone_number: '',
        p_role: 'employee',
        p_password: org.default_password,
        p_organization_id: org.id,
      });

      if (createError) {
        console.error('[Join] Error creating user:', createError);
        throw createError;
      }

      // Set force_password_change flag
      if (newUserId) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ force_password_change: true } as any)
          .eq('id', newUserId);

        if (updateError) {
          console.error('[Join] Error setting force_password_change:', updateError);
        }
      }

      // Auto-login
      const loginSuccess = await login(username, org.default_password, false);

      if (loginSuccess) {
        Alert.alert(
          'Account Created',
          `Your username is "${username}". Use it to sign in next time.\n\nNow set your own password.`,
          [{ text: 'Continue', onPress: () => router.replace('/change-password') }],
        );
      } else {
        setError(
          `Account created with username "${username}", but login failed. ` +
            'Please go to the login page and sign in.',
        );
      }
    } catch (e: any) {
      console.error('[Join] Error creating account:', e);
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderEnterCode = () => (
    <>
      <Text style={styles.subtext}>Enter the code your manager gave you</Text>

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
          placeholder="e.g. JOES-7X4K"
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
          <Text style={styles.primaryButtonText}>Continue</Text>
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
              Self-registration is disabled for this restaurant. Please ask your manager to create your account.
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
            <Text style={styles.secondaryButtonText}>Try a Different Code</Text>
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
          <Text style={styles.orgBadgeText}>Joining {org.name}</Text>
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
              placeholder="First Name *"
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
              placeholder="Last Name *"
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
            Your username will be{' '}
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
            placeholder="Email (optional)"
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
            Your temporary password is: {org.default_password}{'\n'}
            You'll be asked to change it on first login.
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
            <Text style={styles.primaryButtonText}>Create Account</Text>
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
          <Text style={styles.secondaryButtonText}>Back</Text>
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
          <Text style={styles.header}>Join Your Restaurant</Text>
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
          <Text style={styles.backToLoginText}>Back to Login</Text>
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
