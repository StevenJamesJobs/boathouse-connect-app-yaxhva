
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
import { useAuth, getStashedLoginPassword } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { splashColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';
import { useTranslation } from 'react-i18next';

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { user, refreshUser, logout } = useAuth();
  const { organizationId, organization, isLoading: orgLoading } = useOrganization();

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

  const handleChangePassword = async () => {
    setError('');

    if (!newPassword || !confirmPassword) {
      setError(t('change_password_screen.fill_both_fields'));
      return;
    }

    if (newPassword.length < 6) {
      setError(t('onboarding.password_min'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('onboarding.passwords_no_match'));
      return;
    }

    if (!user?.id) {
      setError(t('change_password_screen.session_missing'));
      return;
    }

    if (orgLoading) {
      return;
    }

    setIsLoading(true);

    try {
      // Update password via RPC. The server verifies p_current_password against
      // the stored hash (do NOT weaken that — it's the B1.1 takeover guard), so
      // send the password the user ACTUALLY logged in with (stashed at login),
      // not the org default. Falls back to the org default only when there's no
      // stash (e.g. a session-restore with no typed password) — same as before,
      // which works for users still on the default.
      const { error: updateError } = await supabase.rpc('update_password', {
        user_id: user.id,
        new_password: newPassword,
        p_actor_id: user.id,
        p_organization_id: organizationId ?? undefined,
        p_current_password: getStashedLoginPassword() ?? organization?.default_password ?? undefined,
      });

      if (updateError) {
        console.error('[ChangePassword] Error updating password:', updateError);
        throw updateError;
      }

      // force_password_change is now cleared server-side by update_password on a self-service change.

      // Refresh user data so forcePasswordChange becomes false
      await refreshUser();

      const navigateToPortal = () => {
        if (user.role === 'manager' || user.role === 'owner') {
          router.replace('/(portal)/manager');
        } else {
          router.replace('/(portal)/employee');
        }
      };

      if (Platform.OS === 'web') {
        window.alert(t('change_password_screen.updated_msg'));
        navigateToPortal();
      } else {
        Alert.alert(t('common.success'), t('change_password_screen.updated_msg'), [
          { text: t('common.ok'), onPress: navigateToPortal },
        ]);
      }
    } catch (e: any) {
      console.error('[ChangePassword] Error:', e);
      // No fallback arg: the helper's own default (onboarding.something_went_wrong) is localized.
      setError(translateServerError(e));
    } finally {
      setIsLoading(false);
    }
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
            ios_icon_name="lock.rotation"
            android_material_icon_name="lock-reset"
            size={48}
            color={splashColors.primary}
          />
          <Text style={styles.header}>{t('change_password_screen.title')}</Text>
          <Text style={styles.subtext}>{t('change_password_screen.subtitle')}</Text>
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
          {/* New Password */}
          <View style={styles.inputContainer}>
            <IconSymbol
              ios_icon_name="lock.fill"
              android_material_icon_name="lock"
              size={20}
              color={splashColors.textSecondary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder={t('change_password_screen.new_password')}
              placeholderTextColor={splashColors.textSecondary}
              value={newPassword}
              onChangeText={(text) => {
                setNewPassword(text);
                setError('');
              }}
              secureTextEntry={!showNewPassword}
              autoCapitalize="none"
              returnKeyType="next"
              editable={!isLoading}
            />
            <TouchableOpacity
              onPress={() => setShowNewPassword(!showNewPassword)}
              style={styles.eyeIcon}
              disabled={isLoading}
            >
              <IconSymbol
                ios_icon_name={showNewPassword ? 'eye.slash.fill' : 'eye.fill'}
                android_material_icon_name={showNewPassword ? 'visibility-off' : 'visibility'}
                size={20}
                color={splashColors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Confirm New Password */}
          <View style={styles.inputContainer}>
            <IconSymbol
              ios_icon_name="lock.fill"
              android_material_icon_name="lock"
              size={20}
              color={splashColors.textSecondary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder={t('profile.confirm_new_password')}
              placeholderTextColor={splashColors.textSecondary}
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setError('');
              }}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleChangePassword}
              editable={!isLoading}
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              style={styles.eyeIcon}
              disabled={isLoading}
            >
              <IconSymbol
                ios_icon_name={showConfirmPassword ? 'eye.slash.fill' : 'eye.fill'}
                android_material_icon_name={showConfirmPassword ? 'visibility-off' : 'visibility'}
                size={20}
                color={splashColors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.hintText}>{t('change_password_screen.password_hint')}</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, (isLoading || orgLoading) && styles.buttonDisabled]}
            onPress={handleChangePassword}
            disabled={isLoading || orgLoading}
          >
            {isLoading || orgLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('profile.update_password')}</Text>
            )}
          </TouchableOpacity>

          {/* Escape hatch. This route is a trap by design: _layout.tsx re-redirects
              here on every navigation while forcePasswordChange is true and disables
              the back gesture. If the org never loads (get_me failure, or a user with
              no organization_id) the default-password fallback is permanently wrong
              and the user can neither pass nor leave. Deliberately NOT disabled while
              isLoading — a hung RPC is exactly when this needs to still work. */}
          <TouchableOpacity
            style={styles.logOutContainer}
            onPress={async () => { await logout(); router.replace('/login'); }}
            activeOpacity={0.7}
          >
            <Text style={styles.logOutText}>{t('profile.log_out')}</Text>
          </TouchableOpacity>
        </Animated.View>
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
    paddingTop: 120,
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
    marginTop: 8,
  },
  formContainer: {
    width: '100%',
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
  eyeIcon: {
    padding: 8,
  },
  hintText: {
    fontSize: 13,
    color: splashColors.textSecondary,
    marginBottom: 20,
    marginLeft: 4,
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
  logOutContainer: {
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 12,
  },
  logOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E74C3C',
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
});
