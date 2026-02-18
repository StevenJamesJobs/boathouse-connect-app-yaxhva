
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { splashColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';

export default function LoginScreen() {
  console.log('[Android Login] Screen mounted, Platform:', Platform.OS);
  const { t } = useTranslation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [screenReady, setScreenReady] = useState(false);
  const router = useRouter();
  const { login, isAuthenticated, user } = useAuth();

  // Mark screen as ready after a short delay to ensure smooth rendering
  useEffect(() => {
    console.log('[Android Login] Initializing screen');
    const timer = setTimeout(() => {
      setScreenReady(true);
      console.log('[Android Login] Screen ready');
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Check if already authenticated and redirect
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('[Android Login] Already authenticated, redirecting to portal');
      const timeout = setTimeout(() => {
        try {
          if (user.role === 'manager') {
            router.replace('/(portal)/manager');
          } else {
            router.replace('/(portal)/employee');
          }
        } catch (error) {
          console.error('[Android Login] Navigation error:', error);
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [isAuthenticated, user, router]);

  const handleLogin = async () => {
    console.log('[Android Login] Login button pressed');
    
    if (!username.trim() || !password.trim()) {
      console.log('[Android Login] Empty username or password');
      Alert.alert(t('common:error'), t('login:error_empty_fields'));
      return;
    }

    console.log('[Android Login] Starting login process for username:', username.trim());
    setIsLoading(true);
    
    try {
      const success = await login(username.trim(), password, rememberMe);
      console.log('[Android Login] Login result:', success);
      
      setIsLoading(false);

      if (success) {
        console.log('[Android Login] Login successful, navigating to portal');
        // Wait a bit longer for state to update
        setTimeout(() => {
          try {
            router.replace('/(portal)');
          } catch (navError) {
            console.error('[Android Login] Navigation error:', navError);
            // Try alternative navigation
            router.push('/(portal)');
          }
        }, 200);
      } else {
        console.log('[Android Login] Login failed - invalid credentials');
        Alert.alert(t('login:error_login_failed'), t('login:error_invalid'));
      }
    } catch (error) {
      console.error('[Android Login] Login error:', error);
      setIsLoading(false);
      Alert.alert(t('common:error'), t('login:error_generic'));
    }
  };

  // Show loading indicator while screen initializes
  if (!screenReady) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={splashColors.primary} />
        <Text style={styles.loadingText}>{t('common:loading')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo Section */}
        <View style={styles.logoContainer}>
          <Image
            source={require('@/assets/images/43c91958-d4c9-4b12-8d2a-51e85de57f94.jpeg')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Form Section */}
        <View style={styles.formContainer}>
          {/* Username Input */}
          <View style={styles.inputContainer}>
            <IconSymbol
              ios_icon_name="person.fill"
              android_material_icon_name="person"
              size={20}
              color={splashColors.textSecondary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder={t('login:username')}
              placeholderTextColor={splashColors.textSecondary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              keyboardType="default"
              underlineColorAndroid="transparent"
              returnKeyType="next"
              editable={!isLoading}
            />
          </View>

          {/* Password Input */}
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
              placeholder={t('login:password')}
              placeholderTextColor={splashColors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              underlineColorAndroid="transparent"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!isLoading}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
              activeOpacity={0.7}
              disabled={isLoading}
            >
              <IconSymbol
                ios_icon_name={showPassword ? 'eye.slash.fill' : 'eye.fill'}
                android_material_icon_name={showPassword ? 'visibility-off' : 'visibility'}
                size={20}
                color={splashColors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Remember Me */}
          <TouchableOpacity
            style={styles.rememberMeContainer}
            onPress={() => setRememberMe(!rememberMe)}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && (
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={16}
                  color="#FFFFFF"
                />
              )}
            </View>
            <Text style={styles.rememberMeText}>{t('login:remember_me')}</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>{t('login:sign_in')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: splashColors.background,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: splashColors.text,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 60,
  },
  logo: {
    width: 340,
    height: 240,
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
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: splashColors.text,
    paddingVertical: 0,
  },
  eyeIcon: {
    padding: 8,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: splashColors.primary,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: splashColors.primary,
  },
  rememberMeText: {
    fontSize: 16,
    color: splashColors.text,
  },
  loginButton: {
    backgroundColor: splashColors.primary,
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
