
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { MessageBadge } from '@/components/MessageBadge';
import NotificationPreferences from '@/components/NotificationPreferences';
import { useTranslation } from 'react-i18next';
import { useLanguage, SupportedLanguage } from '@/contexts/LanguageContext';

export default function EmployeeProfileScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const { unreadCount } = useUnreadMessages();
  const [email, setEmail] = useState(user?.email || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileInfoExpanded, setProfileInfoExpanded] = useState(false);
  const [notificationPrefsExpanded, setNotificationPrefsExpanded] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Password visibility state
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Update local state when user context changes
  useEffect(() => {
    if (user) {
      setEmail(user.email);
      setPhoneNumber(user.phoneNumber);
    }
  }, [user]);

  const handleSave = async () => {
    try {
      setSaving(true);
      if (!user?.id) return;

      console.log('Employee Profile: Saving profile info');
      // Use the new RPC function to update profile info
      const { error } = await supabase.rpc('update_profile_info', {
        user_id: user.id,
        new_email: email,
        new_phone_number: phoneNumber,
      });

      if (error) {
        console.error('Error updating profile:', error);
        throw error;
      }

      // Refresh user data in context
      await refreshUser();

      Alert.alert(t('common.success'), t('profile.profile_updated'));
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert(t('common.error'), t('profile.error_update_profile'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEmail(user?.email || '');
    setPhoneNumber(user?.phoneNumber || '');
    setIsEditing(false);
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permission_required'), t('profile.grant_camera_permissions'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('common.error'), t('profile.error_pick_image'));
    }
  };

  const uploadImage = async (uri: string) => {
    if (!user?.id) return;

    try {
      setUploading(true);
      console.log('Starting image upload for user:', user.id);

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      // Create file name
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      console.log('Uploading file:', fileName);

      // Determine content type
      let contentType = 'image/jpeg';
      if (fileExt === 'png') contentType = 'image/png';
      else if (fileExt === 'gif') contentType = 'image/gif';
      else if (fileExt === 'webp') contentType = 'image/webp';

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(fileName, byteArray, {
          contentType: contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      console.log('Upload successful:', uploadData);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(fileName);

      console.log('Public URL:', urlData.publicUrl);

      // Update user record using the new RPC function
      const { error: updateError } = await supabase.rpc('update_profile_picture', {
        user_id: user.id,
        picture_url: urlData.publicUrl,
      });

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      console.log('Database updated successfully with profile picture URL');

      // Refresh user data in context to update profile picture everywhere
      await refreshUser();

      Alert.alert(t('common.success'), t('profile.profile_picture_updated'));
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert(t('common.error'), error.message || t('profile.error_upload_picture'));
    } finally {
      setUploading(false);
    }
  };

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

      console.log('Employee Profile: Changing password');
      // Verify current password using pgcrypto
      const { data: verifyData, error: verifyError } = await supabase.rpc('verify_password', {
        user_id: user.id,
        password: currentPassword,
      });

      if (verifyError) {
        console.error('Password verification error:', verifyError);
        Alert.alert(t('common.error'), t('profile.error_verify_password'));
        return;
      }

      if (!verifyData) {
        Alert.alert(t('common.error'), t('profile.error_password_incorrect'));
        return;
      }

      // Update password using pgcrypto
      const { error: updateError } = await supabase.rpc('update_password', {
        user_id: user.id,
        new_password: newPassword,
      });

      if (updateError) {
        console.error('Password update error:', updateError);
        throw updateError;
      }

      Alert.alert(t('common.success'), t('profile.password_changed'));
      setShowPasswordChange(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    } catch (error: any) {
      console.error('Error changing password:', error);
      Alert.alert(t('common.error'), error.message || t('profile.error_change_password'));
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <TouchableOpacity onPress={handlePickImage} style={styles.avatarContainer}>
          {uploading ? (
            <ActivityIndicator size="large" color={employeeColors.primary} />
          ) : user?.profilePictureUrl ? (
            <Image 
              source={{ uri: user.profilePictureUrl }} 
              style={styles.avatar}
              key={user.profilePictureUrl} // Force re-render when URL changes
            />
          ) : (
            <IconSymbol
              ios_icon_name="person.circle.fill"
              android_material_icon_name="account-circle"
              size={100}
              color={employeeColors.primary}
            />
          )}
          <View style={styles.cameraIcon}>
            <IconSymbol
              ios_icon_name="camera.fill"
              android_material_icon_name="camera-alt"
              size={16}
              color="#FFFFFF"
            />
          </View>
        </TouchableOpacity>
        <Text style={styles.uploadHint}>{t('profile.tap_to_change_photo')}</Text>
        <Text style={styles.userName}>{user?.name}</Text>
        <Text style={styles.userRole}>{user?.jobTitle}</Text>
      </View>

      {/* Messages Section */}
      <TouchableOpacity
        style={styles.messagesCard}
        onPress={() => router.push('/messages')}
      >
        <View style={styles.messagesHeader}>
          <View style={styles.messagesIconContainer}>
            <IconSymbol
              ios_icon_name="envelope.fill"
              android_material_icon_name="mail"
              size={24}
              color={employeeColors.primary}
            />
            {unreadCount > 0 && (
              <View style={styles.badgePosition}>
                <MessageBadge count={unreadCount} size="small" />
              </View>
            )}
          </View>
          <View style={styles.messagesContent}>
            <Text style={styles.messagesTitle}>{t('common.messages')}</Text>
            <Text style={styles.messagesSubtitle}>
              {unreadCount > 0
                ? t(unreadCount > 1 ? 'profile.unread_message_other' : 'profile.unread_message_one', { count: unreadCount })
                : t('profile.no_new_messages')}
            </Text>
          </View>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={24}
            color={employeeColors.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {/* Profile Information - Collapsible */}
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.collapsibleHeader}
          onPress={() => setProfileInfoExpanded(!profileInfoExpanded)}
        >
          <Text style={styles.sectionTitle}>{t('profile.profile_information')}</Text>
          <IconSymbol
            ios_icon_name={profileInfoExpanded ? "chevron.up" : "chevron.down"}
            android_material_icon_name={profileInfoExpanded ? "expand-less" : "expand-more"}
            size={24}
            color={employeeColors.text}
          />
        </TouchableOpacity>

        {profileInfoExpanded && (
          <>
            {/* Username (Read-only) */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('profile.username')}</Text>
              <View style={[styles.input, styles.inputDisabled]}>
                <Text style={styles.inputTextDisabled}>{user?.username}</Text>
              </View>
              <Text style={styles.fieldNote}>{t('profile.username_cannot_change')}</Text>
            </View>

            {/* Full Name (Read-only) */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('profile.full_name')}</Text>
              <View style={[styles.input, styles.inputDisabled]}>
                <Text style={styles.inputTextDisabled}>{user?.name}</Text>
              </View>
              <Text style={styles.fieldNote}>{t('profile.name_cannot_change')}</Text>
            </View>

            {/* Email (Editable) */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('profile.email')}</Text>
              <TextInput
                style={[styles.input, !isEditing && styles.inputDisabled]}
                value={email}
                onChangeText={setEmail}
                editable={isEditing}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={employeeColors.textSecondary}
              />
            </View>

            {/* Phone Number (Editable) */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('profile.phone_number')}</Text>
              <TextInput
                style={[styles.input, !isEditing && styles.inputDisabled]}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                editable={isEditing}
                keyboardType="phone-pad"
                placeholderTextColor={employeeColors.textSecondary}
              />
            </View>

            {/* Action Buttons */}
            {!isEditing ? (
              <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
                <IconSymbol
                  ios_icon_name="pencil"
                  android_material_icon_name="edit"
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.editButtonText}>{t('profile.edit_profile')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveButtonText}>{t('profile.save_changes')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>

      {/* Notification Preferences - Collapsible */}
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.collapsibleHeader}
          onPress={() => setNotificationPrefsExpanded(!notificationPrefsExpanded)}
        >
          <Text style={styles.sectionTitle}>{t('profile.notification_preferences')}</Text>
          <IconSymbol
            ios_icon_name={notificationPrefsExpanded ? "chevron.up" : "chevron.down"}
            android_material_icon_name={notificationPrefsExpanded ? "expand-less" : "expand-more"}
            size={24}
            color={employeeColors.text}
          />
        </TouchableOpacity>

        {notificationPrefsExpanded && (
          <NotificationPreferences variant="employee" />
        )}
      </View>

      {/* Language Settings */}
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.collapsibleHeader}
          onPress={() => setLanguageModalVisible(true)}
        >
          <Text style={styles.sectionTitle}>{t('profile.language')}</Text>
          <View style={styles.languageDisplay}>
            <Text style={styles.languageValue}>{language === 'en' ? '🇺🇸 English' : '🇲🇽 Español'}</Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={24}
              color={employeeColors.textSecondary}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* Password Change */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('profile.change_password')}</Text>
        <Text style={styles.passwordNote}>{t('profile.password_note')}</Text>
        {!showPasswordChange ? (
          <TouchableOpacity
            style={styles.passwordButton}
            onPress={() => setShowPasswordChange(true)}
          >
            <IconSymbol
              ios_icon_name="key.fill"
              android_material_icon_name="vpn-key"
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.passwordButtonText}>{t('profile.change_password')}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('profile.current_password')}</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry={!showCurrentPassword}
                  placeholder={t('profile.enter_current_password')}
                  placeholderTextColor={employeeColors.textSecondary}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  <IconSymbol
                    ios_icon_name={showCurrentPassword ? "eye.slash.fill" : "eye.fill"}
                    android_material_icon_name={showCurrentPassword ? "visibility-off" : "visibility"}
                    size={24}
                    color={employeeColors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('profile.new_password')}</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPassword}
                  placeholder={t('profile.enter_new_password')}
                  placeholderTextColor={employeeColors.textSecondary}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowNewPassword(!showNewPassword)}
                >
                  <IconSymbol
                    ios_icon_name={showNewPassword ? "eye.slash.fill" : "eye.fill"}
                    android_material_icon_name={showNewPassword ? "visibility-off" : "visibility"}
                    size={24}
                    color={employeeColors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('profile.confirm_new_password')}</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  placeholder={t('profile.confirm_new_password_placeholder')}
                  placeholderTextColor={employeeColors.textSecondary}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <IconSymbol
                    ios_icon_name={showConfirmPassword ? "eye.slash.fill" : "eye.fill"}
                    android_material_icon_name={showConfirmPassword ? "visibility-off" : "visibility"}
                    size={24}
                    color={employeeColors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
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
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleChangePassword}>
                <Text style={styles.saveButtonText}>{t('profile.update_password')}</Text>
              </TouchableOpacity>
            </View>
          </>
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
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{t('profile.select_language')}</Text>
            <TouchableOpacity
              style={[styles.languageOption, language === 'en' && styles.languageOptionActive]}
              onPress={() => { setLanguage('en'); setLanguageModalVisible(false); }}
            >
              <Text style={styles.languageOptionText}>🇺🇸 English</Text>
              {language === 'en' && (
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={20} color={employeeColors.primary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.languageOption, language === 'es' && styles.languageOptionActive]}
              onPress={() => { setLanguage('es'); setLanguageModalVisible(false); }}
            >
              <Text style={styles.languageOptionText}>🇲🇽 Español</Text>
              {language === 'es' && (
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={20} color={employeeColors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: employeeColors.background,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  profileHeader: {
    alignItems: 'center',
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: employeeColors.primary,
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: employeeColors.card,
  },
  uploadHint: {
    fontSize: 12,
    color: employeeColors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginBottom: 4,
  },
  userRole: {
    fontSize: 16,
    color: employeeColors.primary,
    fontWeight: '600',
  },
  messagesCard: {
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  messagesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  messagesIconContainer: {
    position: 'relative',
  },
  badgePosition: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
  messagesContent: {
    flex: 1,
  },
  messagesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: employeeColors.text,
    marginBottom: 2,
  },
  messagesSubtitle: {
    fontSize: 14,
    color: employeeColors.textSecondary,
  },
  card: {
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: employeeColors.text,
  },
  passwordNote: {
    fontSize: 12,
    color: employeeColors.textSecondary,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: employeeColors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: employeeColors.text,
    borderWidth: 1,
    borderColor: employeeColors.border,
  },
  inputDisabled: {
    backgroundColor: '#E8E8E8',
  },
  inputTextDisabled: {
    fontSize: 16,
    color: employeeColors.textSecondary,
  },
  fieldNote: {
    fontSize: 12,
    color: employeeColors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: employeeColors.border,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: employeeColors.text,
  },
  eyeIcon: {
    paddingHorizontal: 12,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: employeeColors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: employeeColors.textSecondary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButton: {
    flex: 1,
    backgroundColor: employeeColors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginLeft: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  passwordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: employeeColors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  passwordButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  languageDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  languageValue: {
    fontSize: 16,
    color: employeeColors.text,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: employeeColors.text,
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
  languageOptionActive: {
    backgroundColor: `${employeeColors.primary}20`,
  },
  languageOptionText: {
    fontSize: 16,
    color: employeeColors.text,
    fontWeight: '500',
  },
});
