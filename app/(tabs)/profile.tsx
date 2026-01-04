
import { IconSymbol } from '@/components/IconSymbol';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/app/integrations/supabase/client';

const ProfileScreen = () => {
  const router = useRouter();
  const { user, isManager } = useAuth();
  const colors = isManager ? managerColors : employeeColors;

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isProfileExpanded, setIsProfileExpanded] = useState(true);
  const [isPasswordExpanded, setIsPasswordExpanded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setProfileData(data);
      setEmail(data.email || '');
      setPhoneNumber(data.phone_number || '');
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const loadUnreadCount = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { count, error } = await supabase
        .from('message_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
      setUnreadCount(count || 0);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    loadProfile();
    loadUnreadCount();
  }, [loadProfile, loadUnreadCount]);

  useFocusEffect(
    useCallback(() => {
      loadUnreadCount();
    }, [loadUnreadCount])
  );

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions to upload a profile picture.');
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
    try {
      setIsSaving(true);

      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user?.id}-${Date.now()}.${fileExt}`;
      const filePath = `profile-pictures/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('app-assets')
        .upload(filePath, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('app-assets')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_picture_url: publicUrl })
        .eq('id', user?.id);

      if (updateError) throw updateError;

      Alert.alert('Success', 'Profile picture updated successfully');
      loadProfile();
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload profile picture');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Email cannot be empty');
      return;
    }

    try {
      setIsSaving(true);

      const { error } = await supabase
        .from('users')
        .update({
          email: email.trim(),
          phone_number: phoneNumber.trim(),
        })
        .eq('id', user?.id);

      if (error) throw error;

      Alert.alert('Success', 'Profile updated successfully');
      setIsEditing(false);
      loadProfile();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEmail(profileData?.email || '');
    setPhoneNumber(profileData?.phone_number || '');
    setIsEditing(false);
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    try {
      setIsChangingPassword(true);

      // Verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profileData?.email || '',
        password: currentPassword,
      });

      if (signInError) {
        Alert.alert('Error', 'Current password is incorrect');
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      Alert.alert('Success', 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsPasswordExpanded(false);
    } catch (error) {
      console.error('Error changing password:', error);
      Alert.alert('Error', 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleCancelPasswordChange = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const getProfilePictureUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const { data } = supabase.storage.from('app-assets').getPublicUrl(url);
    return data.publicUrl;
  };

  const getJobTitlesDisplay = () => {
    if (!profileData) return '';
    if (profileData.job_titles && Array.isArray(profileData.job_titles) && profileData.job_titles.length > 0) {
      return profileData.job_titles.join(', ');
    }
    return profileData.job_title || '';
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.headerBackground }]}>
          <Text style={[styles.headerTitle, { color: colors.headerText }]}>
            {isManager ? 'Manager Portal' : 'Employee Portal'}
          </Text>
          <TouchableOpacity onPress={() => router.push('/login')} style={styles.logoutButton}>
            <IconSymbol ios_icon_name="rectangle.portrait.and.arrow.right" android_material_icon_name="exit-to-app" size={24} color={colors.headerText} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBackground }]}>
        <Text style={[styles.headerTitle, { color: colors.headerText }]}>
          {isManager ? 'Manager Portal' : 'Employee Portal'}
        </Text>
        <TouchableOpacity onPress={() => router.push('/login')} style={styles.logoutButton}>
          <IconSymbol ios_icon_name="rectangle.portrait.and.arrow.right" android_material_icon_name="exit-to-app" size={24} color={colors.headerText} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Profile Header Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
          <View style={styles.profileImageContainer}>
            <TouchableOpacity onPress={handlePickImage} disabled={isSaving}>
              {profileData?.profile_picture_url ? (
                <Image
                  source={{ uri: getProfilePictureUrl(profileData.profile_picture_url) }}
                  style={styles.profileImage}
                />
              ) : (
                <View style={[styles.profileImagePlaceholder, { backgroundColor: colors.primary }]}>
                  <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={50} color="#FFFFFF" />
                </View>
              )}
              <View style={[styles.cameraIconContainer, { backgroundColor: colors.primary }]}>
                <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="camera" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </View>

          <Text style={[styles.profileName, { color: colors.text }]}>{profileData?.name}</Text>
          <Text style={[styles.profileJobTitle, { color: colors.textSecondary }]}>
            {getJobTitlesDisplay()}
          </Text>

          <View style={[styles.roleBadge, { backgroundColor: colors.primary }]}>
            <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={16} color="#FFFFFF" />
            <Text style={styles.roleBadgeText}>{isManager ? 'Manager' : 'Employee'}</Text>
          </View>
        </View>

        {/* Messages Card */}
        <TouchableOpacity
          style={[styles.messagesCard, { backgroundColor: colors.card }]}
          onPress={() => router.push('/messages')}
        >
          <View style={styles.messagesContent}>
            <IconSymbol ios_icon_name="envelope.fill" android_material_icon_name="mail" size={32} color={colors.primary} />
            <View style={styles.messagesTextContainer}>
              <Text style={[styles.messagesTitle, { color: colors.text }]}>Messages</Text>
              <Text style={[styles.messagesSubtitle, { color: colors.textSecondary }]}>
                {unreadCount > 0 ? `${unreadCount} new message${unreadCount > 1 ? 's' : ''}` : 'No new messages'}
              </Text>
            </View>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={24} color={colors.textSecondary} />
          {unreadCount > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: '#FF3B30' }]}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Profile Information Card */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setIsProfileExpanded(!isProfileExpanded)}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Profile Information</Text>
            <IconSymbol
              ios_icon_name={isProfileExpanded ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={isProfileExpanded ? 'expand-less' : 'expand-more'}
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {isProfileExpanded && (
            <View style={styles.sectionContent}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Username</Text>
                <View style={[styles.inputDisabled, { backgroundColor: colors.highlight, borderColor: colors.border }]}>
                  <Text style={[styles.inputDisabledText, { color: colors.textSecondary }]}>
                    {profileData?.username}
                  </Text>
                </View>
                <Text style={[styles.inputHint, { color: colors.textSecondary }]}>
                  Username cannot be changed
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Full Name</Text>
                <View style={[styles.inputDisabled, { backgroundColor: colors.highlight, borderColor: colors.border }]}>
                  <Text style={[styles.inputDisabledText, { color: colors.textSecondary }]}>
                    {profileData?.name}
                  </Text>
                </View>
                <Text style={[styles.inputHint, { color: colors.textSecondary }]}>
                  Name cannot be changed
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Email</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.highlight, borderColor: colors.border, color: colors.text },
                  ]}
                  value={email}
                  onChangeText={setEmail}
                  editable={isEditing}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Phone Number</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.highlight, borderColor: colors.border, color: colors.text },
                  ]}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  editable={isEditing}
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {isEditing ? (
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton, { backgroundColor: colors.textSecondary }]}
                    onPress={handleCancelEdit}
                    disabled={isSaving}
                  >
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.saveButton, { backgroundColor: colors.primary }]}
                    onPress={handleSaveChanges}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.buttonText}>Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.button, styles.editButton, { backgroundColor: colors.primary }]}
                  onPress={() => setIsEditing(true)}
                >
                  <Text style={styles.buttonText}>Edit Profile</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Change Password Card */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setIsPasswordExpanded(!isPasswordExpanded)}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Change Password</Text>
            <IconSymbol
              ios_icon_name={isPasswordExpanded ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={isPasswordExpanded ? 'expand-less' : 'expand-more'}
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {isPasswordExpanded && (
            <View style={styles.sectionContent}>
              <Text style={[styles.passwordHint, { color: colors.textSecondary }]}>
                You can change your password here. Make sure to remember your new password.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Current Password</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.highlight, borderColor: colors.border, color: colors.text },
                  ]}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  placeholder="Enter current password"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>New Password</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.highlight, borderColor: colors.border, color: colors.text },
                  ]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="Enter new password"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Confirm New Password</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.highlight, borderColor: colors.border, color: colors.text },
                  ]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton, { backgroundColor: colors.textSecondary }]}
                  onPress={handleCancelPasswordChange}
                  disabled={isChangingPassword}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.saveButton, { backgroundColor: colors.primary }]}
                  onPress={handleChangePassword}
                  disabled={isChangingPassword}
                >
                  {isChangingPassword ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.buttonText}>Update Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  logoutButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  profileCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  profileImageContainer: {
    marginBottom: 16,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  profileImagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  profileJobTitle: {
    fontSize: 16,
    marginBottom: 12,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  messagesCard: {
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  messagesContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  messagesTextContainer: {
    marginLeft: 16,
    flex: 1,
  },
  messagesTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  messagesSubtitle: {
    fontSize: 14,
  },
  unreadBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sectionCard: {
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sectionContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  inputDisabled: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  inputDisabledText: {
    fontSize: 16,
  },
  inputHint: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  passwordHint: {
    fontSize: 14,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    marginTop: 8,
  },
  cancelButton: {
    opacity: 0.7,
  },
  saveButton: {},
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ProfileScreen;
