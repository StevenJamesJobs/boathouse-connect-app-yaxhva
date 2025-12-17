
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { MessageBadge } from '@/components/MessageBadge';

export default function EmployeeProfileScreen() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const { unreadCount } = useUnreadMessages();
  const [email, setEmail] = useState(user?.email || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileInfoExpanded, setProfileInfoExpanded] = useState(false);
  
  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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

      Alert.alert('Success', 'Profile updated successfully!');
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile');
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
        Alert.alert('Permission Required', 'Please grant camera roll permissions');
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
      Alert.alert('Error', 'Failed to pick image');
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

      Alert.alert('Success', 'Profile picture updated successfully');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', error.message || 'Failed to upload profile picture');
    } finally {
      setUploading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword.trim()) {
      Alert.alert('Error', 'Please enter your current password');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    try {
      if (!user?.id) return;

      // Verify current password using pgcrypto
      const { data: verifyData, error: verifyError } = await supabase.rpc('verify_password', {
        user_id: user.id,
        password: currentPassword,
      });

      if (verifyError) {
        console.error('Password verification error:', verifyError);
        Alert.alert('Error', 'Failed to verify current password');
        return;
      }

      if (!verifyData) {
        Alert.alert('Error', 'Current password is incorrect');
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

      Alert.alert('Success', 'Password changed successfully');
      setShowPasswordChange(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Error changing password:', error);
      Alert.alert('Error', error.message || 'Failed to change password');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Compact Profile Header - Image Left, Details Right */}
      <View style={styles.profileHeader}>
        <TouchableOpacity onPress={handlePickImage} style={styles.avatarContainer}>
          {uploading ? (
            <ActivityIndicator size="large" color={employeeColors.primary} />
          ) : user?.profilePictureUrl ? (
            <Image 
              source={{ uri: user.profilePictureUrl }} 
              style={styles.avatar}
              key={user.profilePictureUrl}
            />
          ) : (
            <IconSymbol
              ios_icon_name="person.circle.fill"
              android_material_icon_name="account_circle"
              size={70}
              color={employeeColors.primary}
            />
          )}
          <View style={styles.cameraIcon}>
            <IconSymbol
              ios_icon_name="camera.fill"
              android_material_icon_name="camera_alt"
              size={14}
              color="#FFFFFF"
            />
          </View>
        </TouchableOpacity>
        
        <View style={styles.profileDetails}>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userRole}>{user?.jobTitle}</Text>
          <View style={styles.roleBadge}>
            <IconSymbol
              ios_icon_name="person.fill"
              android_material_icon_name="person"
              size={12}
              color="#FFFFFF"
            />
            <Text style={styles.roleBadgeText}>Employee</Text>
          </View>
        </View>
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
            <Text style={styles.messagesTitle}>Messages</Text>
            <Text style={styles.messagesSubtitle}>
              {unreadCount > 0
                ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`
                : 'No new messages'}
            </Text>
          </View>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron_right"
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
          <Text style={styles.sectionTitle}>Profile Information</Text>
          <IconSymbol
            ios_icon_name={profileInfoExpanded ? "chevron.up" : "chevron.down"}
            android_material_icon_name={profileInfoExpanded ? "expand_less" : "expand_more"}
            size={24}
            color={employeeColors.text}
          />
        </TouchableOpacity>

        {profileInfoExpanded && (
          <>
            {/* Username (Read-only) */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Username</Text>
              <View style={[styles.input, styles.inputDisabled]}>
                <Text style={styles.inputTextDisabled}>{user?.username}</Text>
              </View>
              <Text style={styles.fieldNote}>Username cannot be changed</Text>
            </View>

            {/* Full Name (Read-only) */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <View style={[styles.input, styles.inputDisabled]}>
                <Text style={styles.inputTextDisabled}>{user?.name}</Text>
              </View>
              <Text style={styles.fieldNote}>Name cannot be changed</Text>
            </View>

            {/* Email (Editable) */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Email</Text>
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
              <Text style={styles.fieldLabel}>Phone Number</Text>
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
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>

      {/* Password Change */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Change Password</Text>
        <Text style={styles.passwordNote}>
          You can change your password here. Make sure to remember your new password.
        </Text>
        {!showPasswordChange ? (
          <TouchableOpacity
            style={styles.passwordButton}
            onPress={() => setShowPasswordChange(true)}
          >
            <IconSymbol
              ios_icon_name="key.fill"
              android_material_icon_name="vpn_key"
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.passwordButtonText}>Change Password</Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Current Password</Text>
              <TextInput
                style={styles.input}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                placeholder="Enter current password"
                placeholderTextColor={employeeColors.textSecondary}
              />
            </View>

            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>New Password</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="Enter new password"
                placeholderTextColor={employeeColors.textSecondary}
              />
            </View>

            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Confirm new password"
                placeholderTextColor={employeeColors.textSecondary}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowPasswordChange(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleChangePassword}>
                <Text style={styles.saveButtonText}>Update Password</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: employeeColors.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: employeeColors.card,
  },
  profileDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginBottom: 4,
  },
  userRole: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    marginBottom: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: employeeColors.primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 4,
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
});
