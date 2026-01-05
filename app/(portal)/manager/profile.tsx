
import { supabase } from '@/app/integrations/supabase/client';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { managerColors } from '@/styles/commonStyles';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { IconSymbol } from '@/components/IconSymbol';
import React, { useState, useEffect, useCallback } from 'react';
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 30,
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: 15,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: managerColors.card,
  },
  editImageButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: managerColors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: managerColors.background,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 5,
  },
  jobTitle: {
    fontSize: 16,
    color: managerColors.textSecondary,
  },
  section: {
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  infoLabel: {
    fontSize: 14,
    color: managerColors.textSecondary,
    width: 100,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: managerColors.text,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: managerColors.text,
    backgroundColor: managerColors.background,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  button: {
    flex: 1,
    backgroundColor: managerColors.primary,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: managerColors.card,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: managerColors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: managerColors.background,
  },
  unreadBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default function ManagerProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Profile data
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);

  // Edit state
  const [editEmail, setEditEmail] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      console.log('=== LOADING PROFILE ===');
      console.log('User ID:', user.id);

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error loading profile:', error);
        throw error;
      }

      console.log('=== PROFILE DATA ===', data);

      if (data) {
        setName(data.name || '');
        setJobTitle(data.job_title || '');
        setJobTitles(data.job_titles || []);
        setEmail(data.email || '');
        setPhoneNumber(data.phone_number || '');
        setProfilePictureUrl(data.profile_picture_url || null);
        setEditEmail(data.email || '');
        setEditPhoneNumber(data.phone_number || '');
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
      Alert.alert('Error', 'Failed to load profile');
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
        mediaTypes: 'images',
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
    if (!user?.id) {
      Alert.alert('Error', 'User session not found. Please log in again.');
      return;
    }

    try {
      setUploading(true);
      console.log('=== STARTING IMAGE UPLOAD ===');
      console.log('URI:', uri);
      console.log('User ID from context:', user.id);

      // Verify user exists in database first
      const { data: userData, error: userCheckError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (userCheckError || !userData) {
        console.error('=== USER NOT FOUND IN DATABASE ===');
        console.error('Error:', userCheckError);
        throw new Error('User profile not found in database. Please contact support.');
      }

      console.log('User verified in database:', userData.id);

      // Create file path
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = fileName;

      console.log('File path:', filePath);

      // Read file as base64
      console.log('Reading file as base64...');
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log('Base64 read complete, length:', base64.length);

      // Convert base64 to blob
      console.log('Converting to blob...');
      const response = await fetch(`data:image/${fileExt};base64,${base64}`);
      const blob = await response.blob();

      console.log('Blob created, size:', blob.size, 'type:', blob.type);

      // Upload to Supabase Storage
      console.log('Uploading to storage...');
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(filePath, blob, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        console.error('=== STORAGE UPLOAD ERROR ===', uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      console.log('=== STORAGE UPLOAD SUCCESS ===', uploadData);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(filePath);

      console.log('=== PUBLIC URL ===', publicUrl);

      // Update user profile in database
      console.log('Updating database with URL:', publicUrl);
      console.log('For user ID:', user.id);

      const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({ profile_picture_url: publicUrl })
        .eq('id', user.id)
        .select('id, profile_picture_url');

      if (updateError) {
        console.error('=== DATABASE UPDATE ERROR ===', updateError);
        console.error('Error code:', updateError.code);
        console.error('Error message:', updateError.message);
        console.error('Error details:', updateError.details);
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      console.log('=== UPDATE RESPONSE ===', updateData);

      // Check if update was successful
      if (!updateData || updateData.length === 0) {
        console.error('=== NO ROWS UPDATED ===');
        console.error('User ID:', user.id);
        console.error('This means the update query matched 0 rows');
        console.error('Possible causes:');
        console.error('1. User ID does not exist in users table');
        console.error('2. RLS policy is blocking the update');
        console.error('3. User ID mismatch between auth and database');
        
        // Try to fetch the user again to see if they exist
        const { data: recheckUser, error: recheckError } = await supabase
          .from('users')
          .select('id, name')
          .eq('id', user.id)
          .single();
        
        console.error('Recheck user result:', recheckUser, recheckError);
        
        throw new Error('Failed to update profile picture. The database update returned no rows. Please contact support.');
      }

      console.log('=== UPDATE SUCCESS ===');
      console.log('Updated user:', updateData[0]);

      // Update local state
      setProfilePictureUrl(publicUrl);
      
      // Reload profile to ensure we have the latest data
      await loadProfile();
      
      Alert.alert('Success', 'Profile picture updated successfully');

    } catch (error: any) {
      console.error('=== IMAGE UPLOAD FAILED ===');
      console.error('Error type:', typeof error);
      console.error('Error message:', error?.message);
      console.error('Full error:', error);
      Alert.alert('Upload Failed', error?.message || 'Failed to upload profile picture. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!user?.id) return;

    try {
      console.log('=== SAVING PROFILE CHANGES ===');
      console.log('User ID:', user.id);
      console.log('Email:', editEmail);
      console.log('Phone:', editPhoneNumber);

      const { data, error } = await supabase
        .from('users')
        .update({
          email: editEmail,
          phone_number: editPhoneNumber,
        })
        .eq('id', user.id)
        .select();

      if (error) {
        console.error('=== SAVE ERROR ===', error);
        throw error;
      }

      console.log('=== SAVE RESPONSE ===', data);

      if (!data || data.length === 0) {
        throw new Error('Failed to update profile. Please contact support.');
      }

      setEmail(editEmail);
      setPhoneNumber(editPhoneNumber);
      setEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error: any) {
      console.error('Failed to save changes:', error);
      Alert.alert('Error', error.message || 'Failed to save changes');
    }
  };

  const handleCancelEdit = () => {
    setEditEmail(email);
    setEditPhoneNumber(phoneNumber);
    setEditing(false);
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all password fields');
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
      console.log('=== CHANGING PASSWORD ===');

      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        Alert.alert('Error', 'No active session. Please log in again.');
        return;
      }

      console.log('Session exists, updating password...');

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error('=== PASSWORD UPDATE ERROR ===', error);
        throw error;
      }

      console.log('=== PASSWORD UPDATE SUCCESS ===');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setChangingPassword(false);
      Alert.alert('Success', 'Password updated successfully');
    } catch (error: any) {
      console.error('Failed to change password:', error);
      Alert.alert('Error', error.message || 'Failed to change password');
    }
  };

  const handleCancelPasswordChange = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setChangingPassword(false);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace('/login');
    } catch (error) {
      console.error('Error logging out:', error);
      Alert.alert('Error', 'Failed to log out');
    }
  };

  const getProfilePictureUrl = (url: string | null | undefined): string => {
    if (!url) {
      return 'https://via.placeholder.com/120/CCCCCC/FFFFFF?text=No+Image';
    }
    return url;
  };

  const getJobTitlesDisplay = (): string => {
    if (jobTitles && jobTitles.length > 0) {
      return jobTitles.join(', ');
    }
    return jobTitle || 'No job title';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={managerColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.profileImageContainer}>
            <Image
              source={{ uri: getProfilePictureUrl(profilePictureUrl) }}
              style={styles.profileImage}
            />
            <TouchableOpacity
              style={styles.editImageButton}
              onPress={handlePickImage}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <IconSymbol
                  ios_icon_name="camera.fill"
                  android_material_icon_name="camera"
                  size={20}
                  color="#FFFFFF"
                />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.jobTitle}>{getJobTitlesDisplay()}</Text>
        </View>

        {/* Profile Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Information</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={editEmail}
                onChangeText={setEditEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            ) : (
              <Text style={styles.infoValue}>{email || 'Not set'}</Text>
            )}
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone:</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={editPhoneNumber}
                onChangeText={setEditPhoneNumber}
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={styles.infoValue}>{phoneNumber || 'Not set'}</Text>
            )}
          </View>

          {editing ? (
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.button} onPress={handleSaveChanges}>
                <Text style={styles.buttonText}>Save Changes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.buttonSecondary} onPress={handleCancelEdit}>
                <Text style={styles.buttonTextSecondary}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.button} onPress={() => setEditing(true)}>
              <Text style={styles.buttonText}>Edit Profile</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Change Password */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Change Password</Text>
          
          {changingPassword ? (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>New Password:</Text>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="Enter new password"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Confirm:</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  placeholder="Confirm new password"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.button} onPress={handleChangePassword}>
                  <Text style={styles.buttonText}>Update Password</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.buttonSecondary} onPress={handleCancelPasswordChange}>
                  <Text style={styles.buttonTextSecondary}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity style={styles.button} onPress={() => setChangingPassword(true)}>
              <Text style={styles.buttonText}>Change Password</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Logout */}
        <TouchableOpacity style={[styles.button, { backgroundColor: '#FF3B30' }]} onPress={handleLogout}>
          <Text style={styles.buttonText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
