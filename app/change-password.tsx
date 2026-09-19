import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth, getStashedLoginPassword } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { hexToRgba, type ThemeColorSet } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import { IconSymbol } from '@/components/IconSymbol';
import AmbientGlow from '@/components/AmbientGlow';
import GlassCard from '@/components/GlassCard';
import { CtaButton, UsernameChip, IconField, EyeToggle } from '@/components/onboarding/OnboardingKit';
import { StorageImage } from '@/components/StorageImage';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';

/**
 * The FORCED change-password screen (s84 "P · Set a new password"): reached by
 * app/_layout.tsx's redirect while user.forcePasswordChange is true, with the
 * back gesture disabled. Themed on the glow now (no more splashColors); the
 * submit contract is unchanged — update_password with the stashed login
 * password as p_current_password, refreshUser, then the role's portal.
 */

// Fixed error / log-out red, stepped for the light theme.
const RED = { dark: '#EF4444', light: '#DC2626' };

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { user, refreshUser, logout } = useAuth();
  const { organizationId, organization, isLoading: orgLoading } = useOrganization();

  const errorColor = isDark ? RED.dark : RED.light;
  const orgName = organization?.name ?? '';
  const orgInitial = orgName.trim().charAt(0).toUpperCase();

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
    <View style={styles.root}>
      <AmbientGlow />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Org line */}
          <View style={styles.orgLine}>
            {organization?.logo_url ? (
              <StorageImage source={{ uri: organization.logo_url }} style={styles.orgLogo} />
            ) : (
              <View style={[styles.orgLogo, { backgroundColor: hexToRgba(colors.tint, 0.18) }]}>
                <Text style={[styles.orgInitial, { color: colors.tint }]}>{orgInitial}</Text>
              </View>
            )}
            <Text style={styles.orgName} numberOfLines={1}>{orgName}</Text>
          </View>

          {/* Key disc + copy */}
          <View style={styles.hero}>
            <GlassCard variant="glass" radius={22} style={styles.disc}>
              <IconSymbol ios_icon_name="key.fill" android_material_icon_name="vpn-key" size={28} color={colors.tint} />
            </GlassCard>
            <Text style={styles.title}>{t('change_password_screen.title2')}</Text>
            <Text style={styles.subtitle}>{t('change_password_screen.subtitle2')}</Text>
            {/* The one thing they must remember — shown here instead of a pop-up (s86). */}
            {!!user?.username && (
              <View style={styles.usernameRow}>
                <Text style={styles.usernameLead}>{t('change_password_screen.your_username_is')}</Text>
                <UsernameChip username={user.username} />
              </View>
            )}
          </View>

          {/* Fields */}
          <GlassCard variant="glass" radius={16} style={styles.card}>
            <IconField
              label={t('change_password_screen.new_password')}
              iosIcon="key.fill"
              androidIcon="vpn-key"
              placeholder={t('change_password_screen.new_password')}
              value={newPassword}
              onChangeText={(text) => {
                setNewPassword(text);
                setError('');
              }}
              secureTextEntry={!showNewPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              editable={!isLoading}
              trailing={<EyeToggle shown={showNewPassword} onToggle={() => setShowNewPassword((v) => !v)} disabled={isLoading} />}
            />

            <IconField
              label={t('profile.confirm_new_password')}
              iosIcon="key.fill"
              androidIcon="vpn-key"
              placeholder={t('change_password_screen.confirm_placeholder')}
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setError('');
              }}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleChangePassword}
              editable={!isLoading}
              trailing={<EyeToggle shown={showConfirmPassword} onToggle={() => setShowConfirmPassword((v) => !v)} disabled={isLoading} />}
              hint={t('change_password_screen.hint2')}
            />

            {error ? <Text style={[styles.error, { color: errorColor }]}>{error}</Text> : null}

            <CtaButton
              label={t('profile.update_password')}
              iosIcon="checkmark"
              androidIcon="check"
              leading
              onPress={handleChangePassword}
              disabled={orgLoading}
              loading={isLoading || orgLoading}
              style={styles.submit}
            />
          </GlassCard>

          {/* Escape hatch. This route is a trap by design: _layout.tsx re-redirects
              here on every navigation while forcePasswordChange is true and disables
              the back gesture. If the org never loads (get_me failure, or a user with
              no organization_id) the default-password fallback is permanently wrong
              and the user can neither pass nor leave. Deliberately NOT disabled while
              isLoading — a hung RPC is exactly when this needs to still work. */}
          <View style={styles.notYou}>
            <Text style={styles.notYouText}>{t('change_password_screen.not_you')}</Text>
            <Text style={styles.notYouText}>·</Text>
            <TouchableOpacity
              style={styles.logout}
              onPress={async () => { await logout(); router.replace('/login'); }}
              activeOpacity={0.7}
              hitSlop={8}
            >
              <IconSymbol
                ios_icon_name="rectangle.portrait.and.arrow.right"
                android_material_icon_name="logout"
                size={13}
                color={errorColor}
              />
              <Text style={[styles.logoutText, { color: errorColor }]}>{t('profile.log_out')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: ThemeColorSet) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingBottom: 40,
    },

    // Org line
    orgLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    orgLogo: {
      width: 18,
      height: 18,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    orgInitial: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9,
    },
    orgName: {
      fontFamily: fonts.mono.semibold,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      flexShrink: 1,
    },

    // Hero
    hero: {
      alignItems: 'center',
      gap: 10,
      paddingTop: 26,
      paddingHorizontal: 8,
      paddingBottom: 6,
      marginBottom: 14,
    },
    disc: {
      width: 64,
      height: 64,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontFamily: fonts.display.bold,
      fontSize: 24,
      letterSpacing: -0.4,
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: fonts.body.regular,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 280,
    },

    usernameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    usernameLead: {
      fontFamily: fonts.body.regular,
      fontSize: 12,
      color: colors.textSecondary,
    },

    // Card
    card: {
      padding: 14,
      gap: 10,
    },
    error: {
      fontFamily: fonts.body.regular,
      fontSize: 12,
      lineHeight: 16,
      textAlign: 'center',
    },
    submit: {
      marginTop: 2,
    },

    // Not you? · Log out
    notYou: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 6,
      paddingVertical: 12,
    },
    notYouText: {
      fontFamily: fonts.body.regular,
      fontSize: 12,
      color: colors.textSecondary,
    },
    logout: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    logoutText: {
      fontFamily: fonts.body.semibold,
      fontSize: 12,
    },
  });
}
