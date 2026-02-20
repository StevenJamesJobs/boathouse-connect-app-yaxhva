import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { hexToRgba, themePalettes } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage, SupportedLanguage } from '@/contexts/LanguageContext';
import { IconSymbol } from '@/components/IconSymbol';
import { BlurView } from 'expo-blur';
import NotificationPreferences from '@/components/NotificationPreferences';
import { supabase } from '@/app/integrations/supabase/client';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { palette, mode } = useAppTheme();
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isManager = user?.role === 'manager';

  const blurBgColor = Platform.select({
    ios: hexToRgba(colors.tabBarBackground, isManager ? 0.80 : 0.60),
    android: hexToRgba(colors.tabBarBackground, isManager ? 0.95 : 0.90),
    web: hexToRgba(colors.tabBarBackground, isManager ? 0.90 : 0.85),
  });

  const navTabs = isManager
    ? [
        { name: 'index', label: t('tabs.welcome'), iconIos: 'house.fill', iconAndroid: 'home' },
        { name: 'menus', label: t('tabs.menus'), iconIos: 'fork.knife', iconAndroid: 'restaurant' },
        { name: 'tools', label: t('tabs.tools'), iconIos: 'wrench.and.screwdriver.fill', iconAndroid: 'build' },
        { name: 'manage', label: t('tabs.manage'), iconIos: 'slider.horizontal.3', iconAndroid: 'tune' },
        { name: 'profile', label: t('tabs.profile'), iconIos: 'person.fill', iconAndroid: 'person' },
      ]
    : [
        { name: 'index', label: t('tabs.welcome'), iconIos: 'house.fill', iconAndroid: 'home' },
        { name: 'menus', label: t('tabs.menus'), iconIos: 'fork.knife', iconAndroid: 'restaurant' },
        { name: 'tools', label: t('tabs.tools'), iconIos: 'wrench.and.screwdriver.fill', iconAndroid: 'build' },
        { name: 'rewards', label: t('tabs.rewards'), iconIos: 'star.fill', iconAndroid: 'star' },
        { name: 'profile', label: t('tabs.profile'), iconIos: 'person.fill', iconAndroid: 'person' },
      ];

  const [notificationPrefsExpanded, setNotificationPrefsExpanded] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword.trim()) {
      Alert.alert(t('common.error'), t('profile.error_enter_current_password'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('common.error'), t('profile.error_passwords_no_match'));
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert(t('common.error'), t('profile.error_password_too_short'));
      return;
    }
    try {
      if (!user?.id) return;
      const { data: verifyData, error: verifyError } = await supabase.rpc('verify_password', {
        user_id: user.id,
        password: currentPassword,
      });
      if (verifyError) {
        Alert.alert(t('common.error'), t('profile.error_verify_password'));
        return;
      }
      if (!verifyData) {
        Alert.alert(t('common.error'), t('profile.error_password_incorrect'));
        return;
      }
      const { error: updateError } = await supabase.rpc('update_password', {
        user_id: user.id,
        new_password: newPassword,
      });
      if (updateError) throw updateError;
      Alert.alert(t('common.success'), t('profile.password_changed'));
      setShowPasswordChange(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('profile.error_change_password'));
    }
  };

  const currentPalette = themePalettes[palette];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow-back"
              size={24}
              color={colors.primary}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('settings.title')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* 1. Appearance */}
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.card }]}
          onPress={() => router.push('/appearance' as any)}
          activeOpacity={0.7}
        >
          <View style={styles.cardRow}>
            <IconSymbol
              ios_icon_name="paintbrush.fill"
              android_material_icon_name="palette"
              size={24}
              color={colors.primary}
            />
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {t('settings.appearance')}
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                {t(`appearance.theme_${palette}`)}
              </Text>
            </View>
            <View style={styles.swatchRow}>
              {currentPalette.previewColors.map((color, i) => (
                <View
                  key={i}
                  style={[styles.miniSwatch, { backgroundColor: color }]}
                />
              ))}
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={colors.textSecondary}
            />
          </View>
        </TouchableOpacity>

        {/* 2. Notification Preferences - Collapsible */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => setNotificationPrefsExpanded(!notificationPrefsExpanded)}
          >
            <View style={styles.cardRow}>
              <IconSymbol
                ios_icon_name="bell.fill"
                android_material_icon_name="notifications"
                size={24}
                color={colors.primary}
              />
              <View style={styles.cardContent}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  {t('settings.notification_preferences')}
                </Text>
              </View>
              <IconSymbol
                ios_icon_name={notificationPrefsExpanded ? 'chevron.up' : 'chevron.down'}
                android_material_icon_name={notificationPrefsExpanded ? 'expand-less' : 'expand-more'}
                size={24}
                color={colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
          {notificationPrefsExpanded && (
            <View style={styles.expandedContent}>
              <NotificationPreferences variant={user?.role === 'manager' ? 'manager' : 'employee'} />
            </View>
          )}
        </View>

        {/* 3. Language */}
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.card }]}
          onPress={() => setLanguageModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={styles.cardRow}>
            <IconSymbol
              ios_icon_name="globe"
              android_material_icon_name="language"
              size={24}
              color={colors.primary}
            />
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {t('settings.language')}
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                {language === 'en' ? 'English' : 'Español'}
              </Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={colors.textSecondary}
            />
          </View>
        </TouchableOpacity>

        {/* 4. Change Password - Collapsible */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => setShowPasswordChange(!showPasswordChange)}
          >
            <View style={styles.cardRow}>
              <IconSymbol
                ios_icon_name="key.fill"
                android_material_icon_name="vpn-key"
                size={24}
                color={colors.primary}
              />
              <View style={styles.cardContent}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  {t('settings.change_password')}
                </Text>
                <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                  {t('profile.password_note')}
                </Text>
              </View>
              <IconSymbol
                ios_icon_name={showPasswordChange ? 'chevron.up' : 'chevron.down'}
                android_material_icon_name={showPasswordChange ? 'expand-less' : 'expand-more'}
                size={24}
                color={colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
          {showPasswordChange && (
            <View style={styles.expandedContent}>
              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>
                  {t('profile.current_password')}
                </Text>
                <View style={[styles.passwordInputContainer, { borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text }]}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry={!showCurrentPassword}
                    placeholder={t('profile.enter_current_password')}
                    placeholderTextColor={colors.textSecondary}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    <IconSymbol
                      ios_icon_name={showCurrentPassword ? 'eye.slash.fill' : 'eye.fill'}
                      android_material_icon_name={showCurrentPassword ? 'visibility-off' : 'visibility'}
                      size={24}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>
                  {t('profile.new_password')}
                </Text>
                <View style={[styles.passwordInputContainer, { borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                    placeholder={t('profile.enter_new_password')}
                    placeholderTextColor={colors.textSecondary}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowNewPassword(!showNewPassword)}
                  >
                    <IconSymbol
                      ios_icon_name={showNewPassword ? 'eye.slash.fill' : 'eye.fill'}
                      android_material_icon_name={showNewPassword ? 'visibility-off' : 'visibility'}
                      size={24}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>
                  {t('profile.confirm_new_password')}
                </Text>
                <View style={[styles.passwordInputContainer, { borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text }]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    placeholder={t('profile.confirm_new_password_placeholder')}
                    placeholderTextColor={colors.textSecondary}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    <IconSymbol
                      ios_icon_name={showConfirmPassword ? 'eye.slash.fill' : 'eye.fill'}
                      android_material_icon_name={showConfirmPassword ? 'visibility-off' : 'visibility'}
                      size={24}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.cancelButton, { backgroundColor: colors.textSecondary }]}
                  onPress={() => {
                    setShowPasswordChange(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setShowCurrentPassword(false);
                    setShowNewPassword(false);
                    setShowConfirmPassword(false);
                  }}
                >
                  <Text style={styles.buttonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, { backgroundColor: colors.primary }]}
                  onPress={handleChangePassword}
                >
                  <Text style={styles.buttonText}>{t('profile.update_password')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Language Picker Modal */}
        <Modal
          visible={languageModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLanguageModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setLanguageModalVisible(false)}
          >
            <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {t('profile.select_language')}
              </Text>
              <TouchableOpacity
                style={[
                  styles.languageOption,
                  language === 'en' && { backgroundColor: colors.primary + '20' },
                ]}
                onPress={() => { setLanguage('en'); setLanguageModalVisible(false); }}
              >
                <Text style={[styles.languageOptionText, { color: colors.text }]}>
                  English
                </Text>
                {language === 'en' && (
                  <IconSymbol
                    ios_icon_name="checkmark"
                    android_material_icon_name="check"
                    size={20}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.languageOption,
                  language === 'es' && { backgroundColor: colors.primary + '20' },
                ]}
                onPress={() => { setLanguage('es'); setLanguageModalVisible(false); }}
              >
                <Text style={[styles.languageOptionText, { color: colors.text }]}>
                  Español
                </Text>
                {language === 'es' && (
                  <IconSymbol
                    ios_icon_name="checkmark"
                    android_material_icon_name="check"
                    size={20}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </ScrollView>

      {/* Floating Navigation Bar */}
      <View style={navStyles.floatingTabBarContainer}>
        <BlurView
          intensity={80}
          tint={mode === 'dark' ? 'dark' : 'light'}
          style={[navStyles.blurContainer, { backgroundColor: blurBgColor }]}
        >
          <View style={navStyles.tabBarContent}>
            {navTabs.map((tab, index) => {
              const isActive = tab.name === 'profile';
              return (
                <TouchableOpacity
                  key={index}
                  accessibilityRole="button"
                  onPress={() => {
                    if (tab.name === 'profile') {
                      router.back();
                    } else {
                      const portalPrefix = isManager ? '/(portal)/manager' : '/(portal)/employee';
                      const route = tab.name === 'index' ? portalPrefix : `${portalPrefix}/${tab.name}`;
                      router.replace(route as any);
                    }
                  }}
                  style={navStyles.tabButton}
                >
                  <IconSymbol
                    ios_icon_name={tab.iconIos}
                    android_material_icon_name={tab.iconAndroid}
                    size={24}
                    color={isActive ? colors.tabBarActive : colors.tabBarInactive}
                  />
                  <Text
                    style={[
                      navStyles.tabLabel,
                      { color: isActive ? colors.tabBarActive : colors.tabBarInactive },
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </BlurView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginRight: 40,
  },
  headerSpacer: {
    width: 40,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  collapsibleHeader: {},
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 4,
    marginRight: 8,
  },
  miniSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  expandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 8,
    borderWidth: 1,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  eyeIcon: {
    paddingHorizontal: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  languageOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
});

const navStyles = StyleSheet.create({
  floatingTabBarContainer: {
    position: 'absolute',
    bottom: 20,
    left: 10,
    right: 10,
    alignItems: 'center',
  },
  blurContainer: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.2), 0px 4px 16px rgba(0, 0, 0, 0.15)',
    elevation: 20,
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    minWidth: 60,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
  },
});
