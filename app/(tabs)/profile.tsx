
import { IconSymbol } from '@/components/IconSymbol';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { employeeColors, managerColors } from '@/styles/commonStyles';
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
import { useAuth } from '@/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/app/integrations/supabase/client';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  profileImageSection: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  uploadButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userJobTitle: {
    fontSize: 16,
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  roleBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  messagesSection: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  messagesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  messagesSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  unreadBadge: {
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
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
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
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 16,
  },
  input: {
    fontSize: 16,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
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
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  passwordSection: {
    marginHorizontal: 20,
    marginBottom: 30,
    borderRadius: 12,
    overflow: 'hidden',
  },
  passwordSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  passwordSectionContent: {
    padding: 16,
    paddingTop: 0,
  },
  passwordInput: {
    fontSize: 16,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
});

export default function ProfileScreen() {
  const { user, isManager } = useAuth();
  const router = useRouter();
  const colors = isManager ? managerColors : employeeColors;

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editedEmail, setEditedEmail] = useState('');
  const [editedPhoneNumber, setEditedPhoneNumber] = useState('');

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [infoExpanded, setInfoExpanded] = useState(true);
  const [passwordExpanded, setPasswordExpanded] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        setProfilePictureUrl(data.profile_picture_url);
        setName(data.name || '');
        setUsername(data.username || '');
        setJobTitle(data.job_title || '');
        setJobTitles(data.job_titles || []);
        setRole(data.role || '');
        setEmail(data.email || '');
        setPhoneNumber(data.phone_number || '');
        setEditedEmail(data.email || '');
        setEditedPhoneNumber(data.phone_number || '');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
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
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
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
  };

  const uploadImage = async (uri: string) => {
    if (!user?.id) return;

    setUploading(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `profile-pictures/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('app-images')
        .upload(filePath, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('app-images')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_picture_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfilePictureUrl(publicUrl);
      Alert.alert('Success', 'Profile picture updated successfully!');
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({
          email: editedEmail,
          phone_number: editedPhoneNumber,
        })
        .eq('id', user.id);

      if (error) throw error;

      setEmail(editedEmail);
      setPhoneNumber(editedPhoneNumber);
      setIsEditingInfo(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
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
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsChangingPassword(false);
      setPasswordExpanded(false);
      Alert.alert('Success', 'Password changed successfully!');
    } catch (error) {
      console.error('Error changing password:', error);
      Alert.alert('Error', 'Failed to change password. Please try again.');
    }
  };

  const handleCancelPasswordChange = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsChangingPassword(false);
  };

  const getProfilePictureUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const { data } = supabase.storage.from('app-images').getPublicUrl(url);
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
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Image Section */}
        <View style={[styles.profileImageSection, { backgroundColor: colors.card }]}>
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
              style={[styles.uploadButton, { backgroundColor: colors.primary, borderColor: colors.card }]}
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

          <Text style={[styles.userName, { color: colors.text }]}>{name}</Text>
          <Text style={[styles.userJobTitle, { color: colors.textSecondary }]}>{getJobTitlesDisplay()}</Text>
          <View style={[styles.roleBadge, { backgroundColor: isManager ? '#FF6B6B' : '#4ECDC4' }]}>
            <Text style={styles.roleBadgeText}>{role}</Text>
          </View>
        </View>

        {/* Messages Section */}
        <TouchableOpacity
          style={[styles.messagesSection, { backgroundColor: colors.card }]}
          onPress={() => router.push('/messages')}
        >
          <View style={styles.messagesSectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconSymbol ios_icon_name="envelope.fill" android_material_icon_name="email" size={24} color={colors.primary} />
              <Text style={[styles.messagesSectionTitle, { color: colors.text }]}>Messages</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {unreadCount > 0 && (
                <View style={[styles.unreadBadge, { backgroundColor: '#FF6B6B' }]}>
                  <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                </View>
              )}
              <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={colors.textSecondary} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Profile Information Section */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setInfoExpanded(!infoExpanded)}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Profile Information</Text>
            <IconSymbol
              ios_icon_name={infoExpanded ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={infoExpanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {infoExpanded && (
            <View style={styles.sectionContent}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Username</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{username}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Full Name</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{name}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Email</Text>
                {isEditingInfo ? (
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={editedEmail}
                    onChangeText={setEditedEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor={colors.textSecondary}
                  />
                ) : (
                  <Text style={[styles.infoValue, { color: colors.text }]}>{email || 'Not set'}</Text>
                )}
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Phone Number</Text>
                {isEditingInfo ? (
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={editedPhoneNumber}
                    onChangeText={setEditedPhoneNumber}
                    keyboardType="phone-pad"
                    placeholderTextColor={colors.textSecondary}
                  />
                ) : (
                  <Text style={[styles.infoValue, { color: colors.text }]}>{phoneNumber || 'Not set'}</Text>
                )}
              </View>

              {isEditingInfo ? (
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: colors.border }]}
                    onPress={handleCancelEdit}
                  >
                    <Text style={[styles.buttonText, { color: colors.text }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: colors.primary }]}
                    onPress={handleSaveChanges}
                  >
                    <Text style={[styles.buttonText, { color: '#fff' }]}>Save</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.primary }]}
                  onPress={() => setIsEditingInfo(true)}
                >
                  <Text style={[styles.buttonText, { color: '#fff' }]}>Edit Information</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Change Password Section */}
        <View style={[styles.passwordSection, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={styles.passwordSectionHeader}
            onPress={() => setPasswordExpanded(!passwordExpanded)}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Change Password</Text>
            <IconSymbol
              ios_icon_name={passwordExpanded ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={passwordExpanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {passwordExpanded && (
            <View style={styles.passwordSectionContent}>
              {!isChangingPassword ? (
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.primary }]}
                  onPress={() => setIsChangingPassword(true)}
                >
                  <Text style={[styles.buttonText, { color: '#fff' }]}>Change Password</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Current Password"
                    placeholderTextColor={colors.textSecondary}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry
                  />
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="New Password"
                    placeholderTextColor={colors.textSecondary}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                  />
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Confirm New Password"
                    placeholderTextColor={colors.textSecondary}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                  />
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: colors.border }]}
                      onPress={handleCancelPasswordChange}
                    >
                      <Text style={[styles.buttonText, { color: colors.text }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: colors.primary }]}
                      onPress={handleChangePassword}
                    >
                      <Text style={[styles.buttonText, { color: '#fff' }]}>Update</Text>
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
