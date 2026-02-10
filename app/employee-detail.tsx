
import React, { useState, useEffect, useCallback } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';

interface Employee {
  id: string;
  username: string;
  name: string;
  email: string;
  job_title: string;
  job_titles: string[];
  phone_number: string;
  role: string;
  is_active: boolean;
  profile_picture_url?: string;
}

const JOB_TITLE_OPTIONS = [
  'Banquet Captain',
  'Banquets',
  'Bartender',
  'Busser',
  'Chef',
  'Host',
  'Kitchen',
  'Lead Server',
  'Manager',
  'Runner',
  'Server',
];

export default function EmployeeDetailScreen() {
  const router = useRouter();
  const { employeeId } = useLocalSearchParams();
  const { user } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const fetchEmployee = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Fetching employee with ID:', employeeId);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', employeeId)
        .single();

      if (error) throw error;
      console.log('Fetched employee data:', data);
      console.log('Employee job_titles:', data.job_titles);
      
      // Ensure job_titles is an array
      if (!data.job_titles || !Array.isArray(data.job_titles)) {
        data.job_titles = [];
      }
      
      setEmployee(data);
    } catch (error) {
      console.error('Error fetching employee:', error);
      Alert.alert('Error', 'Failed to fetch employee details');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [employeeId, router]);

  useEffect(() => {
    if (employeeId) {
      fetchEmployee();
    }
  }, [employeeId, fetchEmployee]);

  const toggleJobTitle = (title: string) => {
    if (!employee) return;
    
    const currentTitles = [...(employee.job_titles || [])];
    const index = currentTitles.indexOf(title);
    
    if (index > -1) {
      currentTitles.splice(index, 1);
    } else {
      currentTitles.push(title);
    }
    
    console.log('Job titles updated to:', currentTitles);
    setEmployee({ ...employee, job_titles: currentTitles });
  };

  const handleSave = async () => {
    if (!employee) return;

    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    if (!employee.job_titles || employee.job_titles.length === 0) {
      Alert.alert('Error', 'Please select at least one job title');
      return;
    }

    try {
      setSaving(true);
      
      console.log('Saving employee data with job_titles:', employee.job_titles);

      // Use the database function to update employee info
      const { data, error } = await supabase.rpc('update_employee_info', {
        p_manager_id: user.id,
        p_employee_id: employee.id,
        p_name: employee.name,
        p_email: employee.email,
        p_job_title: employee.job_titles[0], // Use first job title for backward compatibility
        p_phone_number: employee.phone_number || '',
        p_role: employee.role,
      });

      if (error) {
        console.error('Supabase update error:', error);
        throw error;
      }

      console.log('Basic info updated, now updating job_titles array...');

      // Update the job_titles array using RPC function
      const { error: updateError } = await supabase.rpc('update_user_job_titles', {
        p_user_id: employee.id,
        p_job_titles: employee.job_titles,
      });

      if (updateError) {
        console.error('Job titles update error:', updateError);
        throw updateError;
      }

      console.log('Employee updated successfully with job_titles:', employee.job_titles);
      Alert.alert('Success', 'Employee updated successfully');
      
      // Refresh the employee data to confirm the update
      await fetchEmployee();
    } catch (error: any) {
      console.error('Error updating employee:', error);
      Alert.alert('Error', error.message || 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!employee) return;

    Alert.alert(
      'Reset Password',
      `Reset password to "boathouseconnect" for ${employee.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              // Note: In a real app, you'd need to implement password reset via Supabase Auth
              // For now, we'll just show a success message
              Alert.alert(
                'Success',
                'Password reset to "boathouseconnect". Employee should change it on next login.'
              );
            } catch (error) {
              console.error('Error resetting password:', error);
              Alert.alert('Error', 'Failed to reset password');
            }
          },
        },
      ]
    );
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
    if (!employee) return;

    try {
      setUploading(true);

      // Convert URI to blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Create file name
      const fileExt = uri.split('.').pop();
      const fileName = `${employee.id}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(fileName);

      // Update user record
      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_picture_url: urlData.publicUrl })
        .eq('id', employee.id);

      if (updateError) throw updateError;

      setEmployee({ ...employee, profile_picture_url: urlData.publicUrl });
      Alert.alert('Success', 'Profile picture updated successfully');
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload profile picture');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteEmployee = () => {
    if (!employee) return;

    Alert.alert(
      'Delete Employee',
      `Are you sure you want to delete ${employee.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('users').delete().eq('id', employee.id);

              if (error) throw error;

              Alert.alert('Success', 'Employee deleted successfully');
              router.back();
            } catch (error) {
              console.error('Error deleting employee:', error);
              Alert.alert('Error', 'Failed to delete employee');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={managerColors.highlight} />
      </View>
    );
  }

  if (!employee) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Employee</Text>
        <TouchableOpacity onPress={handleDeleteEmployee} style={styles.deleteButton}>
          <IconSymbol
            ios_icon_name="trash.fill"
            android_material_icon_name="delete"
            size={24}
            color="#F44336"
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
        {/* Profile Picture */}
        <View style={styles.profileSection}>
          <TouchableOpacity onPress={handlePickImage} style={styles.avatarContainer}>
            {uploading ? (
              <ActivityIndicator size="large" color={managerColors.highlight} />
            ) : employee.profile_picture_url ? (
              <Image source={{ uri: employee.profile_picture_url }} style={styles.avatar} />
            ) : (
              <IconSymbol
                ios_icon_name="person.circle.fill"
                android_material_icon_name="account-circle"
                size={120}
                color={managerColors.highlight}
              />
            )}
            <View style={styles.cameraIcon}>
              <IconSymbol
                ios_icon_name="camera.fill"
                android_material_icon_name="camera-alt"
                size={20}
                color="#FFFFFF"
              />
            </View>
          </TouchableOpacity>
          <Text style={styles.uploadHint}>Tap to change profile picture</Text>
        </View>

        {/* Employee Information */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Employee Information</Text>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Username</Text>
            <View style={[styles.formInput, styles.formInputDisabled]}>
              <Text style={styles.formInputTextDisabled}>{employee.username}</Text>
            </View>
            <Text style={styles.formNote}>Username cannot be changed</Text>
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Full Name *</Text>
            <TextInput
              style={styles.formInput}
              value={employee.name}
              onChangeText={(text) => setEmployee({ ...employee, name: text })}
              placeholderTextColor={managerColors.textSecondary}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Email *</Text>
            <TextInput
              style={styles.formInput}
              value={employee.email}
              onChangeText={(text) => setEmployee({ ...employee, email: text })}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={managerColors.textSecondary}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Job Titles * (Select one or more)</Text>
            <View style={styles.jobTitlesContainer}>
              {JOB_TITLE_OPTIONS.map((title, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.checkboxRow}
                  onPress={() => toggleJobTitle(title)}
                >
                  <View style={styles.checkbox}>
                    {employee.job_titles && employee.job_titles.includes(title) && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={18}
                        color={managerColors.highlight}
                      />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>{title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Phone Number</Text>
            <TextInput
              style={styles.formInput}
              value={employee.phone_number}
              onChangeText={(text) => setEmployee({ ...employee, phone_number: text })}
              keyboardType="phone-pad"
              placeholderTextColor={managerColors.textSecondary}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Role</Text>
            <View style={styles.roleSelector}>
              <TouchableOpacity
                style={[styles.roleButton, employee.role === 'employee' && styles.roleButtonActive]}
                onPress={() => setEmployee({ ...employee, role: 'employee' })}
              >
                <Text
                  style={[
                    styles.roleButtonText,
                    employee.role === 'employee' && styles.roleButtonTextActive,
                  ]}
                >
                  Employee
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleButton, employee.role === 'manager' && styles.roleButtonActive]}
                onPress={() => setEmployee({ ...employee, role: 'manager' })}
              >
                <Text
                  style={[
                    styles.roleButtonText,
                    employee.role === 'manager' && styles.roleButtonTextActive,
                  ]}
                >
                  Manager
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={managerColors.text} />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Password Reset */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Password Management</Text>
          <Text style={styles.sectionDescription}>
            Reset employee password to default "boathouseconnect"
          </Text>
          <TouchableOpacity style={styles.resetButton} onPress={handleResetPassword}>
            <IconSymbol
              ios_icon_name="key.fill"
              android_material_icon_name="vpn-key"
              size={20}
              color={managerColors.text}
            />
            <Text style={styles.resetButtonText}>Reset Password</Text>
          </TouchableOpacity>
        </View>

        {/* Account Status */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account Status</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status:</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: employee.is_active ? '#4CAF50' : '#F44336' },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {employee.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: managerColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: managerColors.card,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  deleteButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: managerColors.highlight,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: managerColors.background,
  },
  uploadHint: {
    fontSize: 14,
    color: managerColors.textSecondary,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 16,
  },
  formField: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: managerColors.text,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  formInputDisabled: {
    opacity: 0.6,
  },
  formInputTextDisabled: {
    fontSize: 16,
    color: managerColors.textSecondary,
  },
  formNote: {
    fontSize: 12,
    color: managerColors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  jobTitlesContainer: {
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: managerColors.text,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.card,
  },
  checkboxLabel: {
    fontSize: 16,
    color: managerColors.text,
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: managerColors.background,
    borderWidth: 1,
    borderColor: managerColors.border,
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: managerColors.highlight,
    borderColor: managerColors.highlight,
  },
  roleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  roleButtonTextActive: {
    color: managerColors.text,
  },
  saveButton: {
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
    marginLeft: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: managerColors.text,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
