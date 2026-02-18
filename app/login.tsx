
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
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
import { useTranslation } from 'react-i18next';

export default function LoginScreen() {
  console.log('[iOS Login] Screen mounted, Platform:', Platform.OS);
  const { t } = useTranslation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { login, isAuthenticated, user } = useAuth();

  // Animation values - use useRef to avoid re-renders
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(50)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    console.log('[iOS Login] Starting animations');
    // Animate logo
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Animate form after logo
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(formTranslateY, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(formOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    }, 400);
    // Empty dependency array is correct - we only want to run this animation once on mount
    // The animated values are stable because they're wrapped in useRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if already authenticated and redirect
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('[iOS Login] Already authenticated, redirecting to portal');
      const timeout = setTimeout(() => {
        try {
          if (user.role === 'manager') {
            router.replace('/(portal)/manager');
          } else {
            router.replace('/(portal)/employee');
          }
        } catch (error) {
          console.error('[iOS Login] Navigation error:', error);
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [isAuthenticated, user, router]);

  const handleLogin = async () => {
    console.log('[iOS Login] Login button pressed');
    
    if (!username.trim() || !password.trim()) {
      console.log('[iOS Login] Empty username or password');
      Alert.alert(t('common.error'), t('login.error_empty_fields'));
      return;
    }

    console.log('[iOS Login] Starting login process for username:', username.trim());
    setIsLoading(true);
    
    try {
      const success = await login(username.trim(), password, rememberMe);
      console.log('[iOS Login] Login result:', success);
      
      setIsLoading(false);

      if (success) {
        console.log('[iOS Login] Login successful, navigating to portal');
        // Wait a moment for auth state to update, then navigate
        setTimeout(() => {
          try {
            router.replace('/(portal)');
          } catch (navError) {
            console.error('[iOS Login] Navigation error:', navError);
            // Try alternative navigation
            router.push('/(portal)');
          }
        }, 200);
      } else {
        console.log('[iOS Login] Login failed - invalid credentials');
        Alert.alert(t('login.error_login_failed'), t('login.error_invalid'));
      }
    } catch (error) {
      console.error('[iOS Login] Login error:', error);
      setIsLoading(false);
      Alert.alert(t('common.error'), t('login.error_generic'));
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
        {/* Logo Section */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [{ scale: logoScale }],
              opacity: logoOpacity,
            },
          ]}
        >
          <Image
            source={require('@/assets/images/43c91958-d4c9-4b12-8d2a-51e85de57f94.jpeg')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Form Section */}
        <Animated.View
          style={[
            styles.formContainer,
            {
              transform: [{ translateY: formTranslateY }],
              opacity: formOpacity,
            },
          ]}
        >
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
              placeholder={t('login.username')}
              placeholderTextColor={splashColors.textSecondary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              keyboardType="default"
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
              placeholder={t('login.password')}
              placeholderTextColor={splashColors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!isLoading}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
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
            <Text style={styles.rememberMeText}>{t('login.remember_me')}</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>{t('login.sign_in')}</Text>
            )}
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
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
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
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
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
    boxShadow: '0px 4px 8px rgba(44, 95, 141, 0.2)',
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
