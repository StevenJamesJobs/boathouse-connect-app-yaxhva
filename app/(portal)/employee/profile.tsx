
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '@/app/integrations/supabase/client';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { employeeColors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: employeeColors.background,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  profileSection: {
    backgroundColor: employeeColors.card,
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.border,
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e0e0e0',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: employeeColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: employeeColors.card,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginBottom: 4,
  },
  userJobTitle: {
    fontSize: 16,
    color: employeeColors.textSecondary,
    marginBottom: 12,
  },
  roleBadge: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  messagesSection: {
    backgroundColor: employeeColors.card,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  messagesSectionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  messagesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  messagesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: employeeColors.text,
  },
  messagesSubtitle: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    marginTop: 2,
  },
  messagesRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  unreadBadge: {
    backgroundColor: '#FF6B6B',
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  section: {
    backgroundColor: employeeColors.card,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: employeeColors.card,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: employeeColors.text,
  },
  sectionContent: {
    padding: 16,
    paddingTop: 0,
  },
  infoRow: {
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: employeeColors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 16,
    color: employeeColors.text,
    backgroundColor: employeeColors.background,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: employeeColors.border,
  },
  input: {
    fontSize: 16,
    color: employeeColors.text,
    backgroundColor: employeeColors.background,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: employeeColors.primary,
  },
  disabledInput: {
    backgroundColor: '#f5f5f5',
    color: employeeColors.textSecondary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: employeeColors.border,
  },
  saveButton: {
    backgroundColor: employeeColors.primary,
  },
  editButton: {
    backgroundColor: employeeColors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  passwordInput: {
    fontSize: 16,
    color: employeeColors.text,
    backgroundColor: employeeColors.background,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: employeeColors.border,
    marginBottom: 12,
  },
  passwordDescription: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    marginBottom: 16,
    fontStyle: 'italic',
  },
});

export default function EmployeeProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Profile data
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [role, setRole] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);

  // Messages
  const [unreadCount, setUnreadCount] = useState(0);

  // Edit states
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editedEmail, setEditedEmail] = useState('');
  const [editedPhoneNumber, setEditedPhoneNumber] = useState('');

  // Password change states
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Collapsible sections
  const [infoExpanded, setInfoExpanded] = useState(true);
  const [passwordExpanded, setPasswordExpanded] = useState(false);

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

      if (data) {
        setName(data.name || '');
        setUsername(data.username || '');
        setEmail(data.email || '');
        setPhoneNumber(data.phone_number || '');
        setJobTitle(data.job_title || '');
        setJobTitles(data.job_titles || []);
        setRole(data.role || '');
        setProfilePictureUrl(data.profile_picture_url || null);
        setEditedEmail(data.email || '');
        setEditedPhoneNumber(data.phone_number || '');
      }
    } catch (error: any) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', error.message);
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

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadUnreadCount();
    }, [loadProfile, loadUnreadCount])
  );

  useEffect(() => {
    loadProfile();
    loadUnreadCount();
  }, [loadProfile, loadUnreadCount]);

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo library access');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    if (!user?.id) return;

    try {
      setUploading(true);
      console.log('Starting image upload...');
      
      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      console.log('Uploading to profile-pictures bucket:', filePath);

      // Upload to the correct bucket: profile-pictures
      const { error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(filePath, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      console.log('Image uploaded successfully, getting public URL...');

      // Get public URL from the correct bucket
      const { data: { publicUrl } } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(filePath);

      console.log('Public URL:', publicUrl);

      // Update user profile with new image URL
      const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({ profile_picture_url: publicUrl })
        .eq('id', user.id)
        .select();

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      console.log('Profile updated successfully:', updateData);

      setProfilePictureUrl(publicUrl);
      Alert.alert('Success', 'Profile picture updated successfully!');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', `Failed to upload profile picture: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!user?.id) return;

    try {
      setSaving(true);
      console.log('Saving profile changes...', { email: editedEmail, phone: editedPhoneNumber });
      
      // Update the users table with the new email and phone number
      const { data, error } = await supabase
        .from('users')
        .update({
          email: editedEmail,
          phone_number: editedPhoneNumber,
        })
        .eq('id', user.id)
        .select();

      if (error) {
        console.error('Error updating profile:', error);
        throw error;
      }

      console.log('Profile update successful:', data);

      // Update local state with the new values
      setEmail(editedEmail);
      setPhoneNumber(editedPhoneNumber);
      setIsEditingInfo(false);
      
      Alert.alert('Success', 'Profile updated successfully!');
      
      // Reload profile to ensure we have the latest data
      await loadProfile();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', `Failed to update profile: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedEmail(email);
    setEditedPhoneNumber(phoneNumber);
    setIsEditingInfo(false);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long.');
      return;
    }

    try {
      setSaving(true);
      console.log('Checking for active session...');
      
      // Get the current session first
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !sessionData.session) {
        console.error('Session error:', sessionError);
        throw new Error('No active session found. Please log in again.');
      }

      console.log('Session found, updating password...');

      // Update the password using the session
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error('Password update error:', error);
        throw error;
      }

      console.log('Password update successful:', data);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsChangingPassword(false);
      setPasswordExpanded(false);
      Alert.alert('Success', 'Password changed successfully!');
    } catch (error: any) {
      console.error('Error changing password:', error);
      Alert.alert('Error', `Failed to change password: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelPasswordChange = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsChangingPassword(false);
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const getProfilePictureUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const { data } = supabase.storage.from('profile-pictures').getPublicUrl(url);
    return data.publicUrl;
  };

  const getJobTitlesDisplay = () => {
    if (jobTitles && jobTitles.length > 0) {
      return jobTitles.join(', ');
    }
    return jobTitle || 'No job title';
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={employeeColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.profileImageContainer}>
            <Image
              source={
                getProfilePictureUrl(profilePictureUrl)
                  ? { uri: getProfilePictureUrl(profilePictureUrl)! }
                  : require('@/assets/images/final_quest_240x240.png')
              }
              style={styles.profileImage}
            />
            <TouchableOpacity
              style={styles.cameraButton}
              onPress={handlePickImage}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="camera" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.userName}>{name}</Text>
          <Text style={styles.userJobTitle}>{getJobTitlesDisplay()}</Text>
          <View style={styles.roleBadge}>
            <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={16} color="#fff" />
            <Text style={styles.roleBadgeText}>{role}</Text>
          </View>
        </View>

        {/* Messages Section */}
        <TouchableOpacity
          style={styles.messagesSection}
          onPress={() => router.push('/messages')}
        >
          <View style={styles.messagesSectionContent}>
            <View style={styles.messagesLeft}>
              <IconSymbol ios_icon_name="envelope.fill" android_material_icon_name="email" size={24} color={employeeColors.primary} />
              <View>
                <Text style={styles.messagesTitle}>Messages</Text>
                <Text style={styles.messagesSubtitle}>
                  {unreadCount > 0 ? `${unreadCount} new message${unreadCount > 1 ? 's' : ''}` : 'No new messages'}
                </Text>
              </View>
            </View>
            <View style={styles.messagesRight}>
              {unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                </View>
              )}
              <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={employeeColors.textSecondary} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Profile Information Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setInfoExpanded(!infoExpanded)}
          >
            <Text style={styles.sectionTitle}>Profile Information</Text>
            <IconSymbol
              ios_icon_name={infoExpanded ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={infoExpanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={employeeColors.textSecondary}
            />
          </TouchableOpacity>

          {infoExpanded && (
            <View style={styles.sectionContent}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Username</Text>
                <Text style={styles.infoValue}>{username}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Full Name</Text>
                <Text style={styles.infoValue}>{name}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email</Text>
                {isEditingInfo ? (
                  <TextInput
                    style={styles.input}
                    value={editedEmail}
                    onChangeText={setEditedEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="Enter email"
                    placeholderTextColor={employeeColors.textSecondary}
                  />
                ) : (
                  <Text style={styles.infoValue}>{email || 'Not set'}</Text>
                )}
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Phone Number</Text>
                {isEditingInfo ? (
                  <TextInput
                    style={styles.input}
                    value={editedPhoneNumber}
                    onChangeText={setEditedPhoneNumber}
                    keyboardType="phone-pad"
                    placeholder="Enter phone number"
                    placeholderTextColor={employeeColors.textSecondary}
                  />
                ) : (
                  <Text style={styles.infoValue}>{phoneNumber || 'Not set'}</Text>
                )}
              </View>

              {isEditingInfo ? (
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={handleCancelEdit}
                    disabled={saving}
                  >
                    <Text style={[styles.buttonText, { color: employeeColors.text }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.saveButton]}
                    onPress={handleSaveChanges}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={[styles.buttonText, { color: '#fff' }]}>Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setIsEditingInfo(true)}
                >
                  <Text style={[styles.buttonText, { color: '#fff' }]}>Edit Profile</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Change Password Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setPasswordExpanded(!passwordExpanded)}
          >
            <Text style={styles.sectionTitle}>Change Password</Text>
            <IconSymbol
              ios_icon_name={passwordExpanded ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={passwordExpanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={employeeColors.textSecondary}
            />
          </TouchableOpacity>

          {passwordExpanded && (
            <View style={styles.sectionContent}>
              {!isChangingPassword ? (
                <>
                  <Text style={styles.passwordDescription}>
                    You can change your password here. Make sure to remember your new password.
                  </Text>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => setIsChangingPassword(true)}
                  >
                    <Text style={[styles.buttonText, { color: '#fff' }]}>Change Password</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Current Password</Text>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Enter current password"
                      placeholderTextColor={employeeColors.textSecondary}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      secureTextEntry
                    />
                  </View>

                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>New Password</Text>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Enter new password"
                      placeholderTextColor={employeeColors.textSecondary}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                    />
                  </View>

                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Confirm New Password</Text>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Confirm new password"
                      placeholderTextColor={employeeColors.textSecondary}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                    />
                  </View>

                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.button, styles.cancelButton]}
                      onPress={handleCancelPasswordChange}
                      disabled={saving}
                    >
                      <Text style={[styles.buttonText, { color: employeeColors.text }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, styles.saveButton]}
                      onPress={handleChangePassword}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={[styles.buttonText, { color: '#fff' }]}>Update Password</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
