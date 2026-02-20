
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { MessageBadge } from '@/components/MessageBadge';
import { useTranslation } from 'react-i18next';

export default function EmployeeProfileScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const { unreadCount } = useUnreadMessages();
  const [email, setEmail] = useState(user?.email || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileInfoExpanded, setProfileInfoExpanded] = useState(false);

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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      {/* Profile Header */}
      <View style={[styles.profileHeader, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={handlePickImage} style={styles.avatarContainer}>
          {uploading ? (
            <ActivityIndicator size="large" color={colors.primary} />
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
              color={colors.primary}
            />
          )}
          <View style={[styles.cameraIcon, { backgroundColor: colors.primary, borderColor: colors.card }]}>
            <IconSymbol
              ios_icon_name="camera.fill"
              android_material_icon_name="camera-alt"
              size={16}
              color="#FFFFFF"
            />
          </View>
        </TouchableOpacity>
        <Text style={[styles.uploadHint, { color: colors.textSecondary }]}>{t('profile.tap_to_change_photo')}</Text>
        <Text style={[styles.userName, { color: colors.text }]}>{user?.name}</Text>
        <Text style={[styles.userRole, { color: colors.primary }]}>{user?.jobTitle}</Text>
      </View>

      {/* Messages Section */}
      <TouchableOpacity
        style={[styles.messagesCard, { backgroundColor: colors.card }]}
        onPress={() => router.push('/messages')}
      >
        <View style={styles.messagesHeader}>
          <View style={styles.messagesIconContainer}>
            <IconSymbol
              ios_icon_name="envelope.fill"
              android_material_icon_name="mail"
              size={24}
              color={colors.primary}
            />
            {unreadCount > 0 && (
              <View style={styles.badgePosition}>
                <MessageBadge count={unreadCount} size="small" />
              </View>
            )}
          </View>
          <View style={styles.messagesContent}>
            <Text style={[styles.messagesTitle, { color: colors.text }]}>{t('common.messages')}</Text>
            <Text style={[styles.messagesSubtitle, { color: colors.textSecondary }]}>
              {unreadCount > 0
                ? t(unreadCount > 1 ? 'profile.unread_message_other' : 'profile.unread_message_one', { count: unreadCount })
                : t('profile.no_new_messages')}
            </Text>
          </View>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={24}
            color={colors.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {/* Profile Information - Collapsible */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={styles.collapsibleHeader}
          onPress={() => setProfileInfoExpanded(!profileInfoExpanded)}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.profile_information')}</Text>
          <IconSymbol
            ios_icon_name={profileInfoExpanded ? "chevron.up" : "chevron.down"}
            android_material_icon_name={profileInfoExpanded ? "expand-less" : "expand-more"}
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>

        {profileInfoExpanded && (
          <>
            {/* Username (Read-only) */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('profile.username')}</Text>
              <View style={[styles.input, styles.inputDisabled, { borderColor: colors.border }]}>
                <Text style={[styles.inputTextDisabled, { color: colors.textSecondary }]}>{user?.username}</Text>
              </View>
              <Text style={[styles.fieldNote, { color: colors.textSecondary }]}>{t('profile.username_cannot_change')}</Text>
            </View>

            {/* Full Name (Read-only) */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('profile.full_name')}</Text>
              <View style={[styles.input, styles.inputDisabled, { borderColor: colors.border }]}>
                <Text style={[styles.inputTextDisabled, { color: colors.textSecondary }]}>{user?.name}</Text>
              </View>
              <Text style={[styles.fieldNote, { color: colors.textSecondary }]}>{t('profile.name_cannot_change')}</Text>
            </View>

            {/* Email (Editable) */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('profile.email')}</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }, !isEditing && styles.inputDisabled]}
                value={email}
                onChangeText={setEmail}
                editable={isEditing}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Phone Number (Editable) */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('profile.phone_number')}</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }, !isEditing && styles.inputDisabled]}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                editable={isEditing}
                keyboardType="phone-pad"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Action Buttons */}
            {!isEditing ? (
              <TouchableOpacity style={[styles.editButton, { backgroundColor: colors.primary }]} onPress={() => setIsEditing(true)}>
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
                <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.textSecondary }]} onPress={handleCancel}>
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
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

      {/* Settings Card */}
      <TouchableOpacity
        style={[styles.messagesCard, { backgroundColor: colors.card }]}
        onPress={() => router.push('/settings' as any)}
      >
        <View style={styles.messagesHeader}>
          <View style={styles.messagesIconContainer}>
            <IconSymbol
              ios_icon_name="gearshape.fill"
              android_material_icon_name="settings"
              size={24}
              color={colors.primary}
            />
          </View>
          <View style={styles.messagesContent}>
            <Text style={[styles.messagesTitle, { color: colors.text }]}>{t('settings.title')}</Text>
            <Text style={[styles.messagesSubtitle, { color: colors.textSecondary }]}>
              {t('settings.settings_subtitle')}
            </Text>
          </View>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={24}
            color={colors.textSecondary}
          />
        </View>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  profileHeader: {
    alignItems: 'center',
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
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  uploadHint: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userRole: {
    fontSize: 16,
    fontWeight: '600',
  },
  messagesCard: {
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
    marginBottom: 2,
  },
  messagesSubtitle: {
    fontSize: 14,
  },
  card: {
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
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  inputDisabled: {
    backgroundColor: '#E8E8E8',
  },
  inputTextDisabled: {
    fontSize: 16,
  },
  fieldNote: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
});
