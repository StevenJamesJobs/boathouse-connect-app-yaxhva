
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import * as ImagePicker from 'expo-image-picker';
import { useOrgJobTitles } from '@/hooks/useOrgJobTitles';
import AmbientGlow from '@/components/AmbientGlow';
import MultiSelectField from '@/components/MultiSelectField';
import { fonts } from '@/constants/fonts';

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

export default function EmployeeDetailScreen() {
  const router = useRouter();
  const { employeeId } = useLocalSearchParams();
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { activeJobTitles: JOB_TITLE_OPTIONS } = useOrgJobTitles();
  const defaultPassword = organization.default_password;
  const { t } = useTranslation('employee_detail');
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const fetchEmployee = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Fetching employee with ID:', employeeId);
      const { data, error } = await supabase.rpc('get_employee', {
        p_actor_id: user?.id ?? '',
        p_employee_id: employeeId as string,
      });

      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('Employee not found');
      console.log('Fetched employee data:', row);
      console.log('Employee job_titles:', row.job_titles);

      // Ensure job_titles is an array
      if (!row.job_titles || !Array.isArray(row.job_titles)) {
        row.job_titles = [];
      }

      setEmployee(row);
    } catch (error) {
      console.error('Error fetching employee:', error);
      Alert.alert(t('common:error'), t('error_load'));
      router.back();
    } finally {
      setLoading(false);
    }
  }, [employeeId, router, user?.id]);

  useEffect(() => {
    if (employeeId) {
      fetchEmployee();
    }
  }, [employeeId, fetchEmployee]);

  const handleSave = async () => {
    if (!employee) return;

    if (!user?.id) {
      Alert.alert(t('common:error'), t('error_not_authenticated'));
      return;
    }

    if (!employee.job_titles || employee.job_titles.length === 0) {
      Alert.alert(t('common:error'), t('error_job_title'));
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
        p_organization_id: organizationId,
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
        p_organization_id: organizationId,
        p_actor_id: user?.id,
      });

      if (updateError) {
        console.error('Job titles update error:', updateError);
        throw updateError;
      }

      console.log('Employee updated successfully with job_titles:', employee.job_titles);
      Alert.alert(t('common:success'), t('employee_updated'));

      // Refresh the employee data to confirm the update
      await fetchEmployee();
    } catch (error: any) {
      console.error('Error updating employee:', error);
      Alert.alert(t('common:error'), error.message || t('error_load'));
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!employee) return;

    Alert.alert(
      t('reset_password'),
      t('reset_password_confirm', { name: employee.name, defaultPassword }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('reset'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('update_password', {
                user_id: employee.id,
                new_password: defaultPassword,
                p_actor_id: user?.id,
                p_organization_id: organizationId,
              });
              if (error) throw error;
              Alert.alert(
                t('common:success'),
                t('reset_password_success', { defaultPassword })
              );
            } catch (error) {
              console.error('Error resetting password:', error);
              Alert.alert(t('common:error'), t('error_reset_password'));
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
        Alert.alert(t('permission_required'), t('grant_camera_permissions'));
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
      Alert.alert(t('common:error'), t('error_pick_image'));
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

      // Update user record via the gated RPC (manager sets an employee's photo).
      const { error: updateError } = await supabase.rpc('update_profile_picture', {
        user_id: employee.id,
        picture_url: urlData.publicUrl,
        p_organization_id: organizationId,
        p_actor_id: user?.id,
      });

      if (updateError) throw updateError;

      setEmployee({ ...employee, profile_picture_url: urlData.publicUrl });
      Alert.alert(t('common:success'), t('picture_updated'));
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert(t('common:error'), t('error_upload_picture'));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteEmployee = () => {
    if (!employee) return;

    Alert.alert(
      t('delete_employee'),
      t('delete_confirm', { name: employee.name }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('delete_employee' as any, {
                p_actor_id: user?.id,
                p_employee_id: employee.id,
                p_organization_id: organizationId,
              });

              if (error) throw error;

              Alert.alert(t('common:success'), t('employee_deleted'));
              router.back();
            } catch (error: any) {
              console.error('Error deleting employee:', error);
              Alert.alert(t('common:error'), error.message || t('error_delete'));
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!employee) {
    return null;
  }

  // Owner-account protection (mirrors the DB-enforced guards in the UI).
  const currentUserIsOwner = user?.role === 'owner';
  const targetIsOwner = employee.role === 'owner';
  const targetIsPrimaryOwner = employee.id === organization.owner_id;
  const roleLocked = targetIsPrimaryOwner || (targetIsOwner && !currentUserIsOwner);
  const roleOptions: string[] =
    currentUserIsOwner || targetIsOwner ? ['employee', 'manager', 'owner'] : ['employee', 'manager'];
  const canResetPassword = currentUserIsOwner || !targetIsOwner;
  const canDelete = !targetIsPrimaryOwner && (currentUserIsOwner || !targetIsOwner);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AmbientGlow />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('title')}</Text>
        {canDelete ? (
          <TouchableOpacity onPress={handleDeleteEmployee} style={styles.deleteButton}>
            <IconSymbol
              ios_icon_name="trash.fill"
              android_material_icon_name="delete"
              size={24}
              color="#F44336"
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.deleteButton} />
        )}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
        {/* Profile Picture */}
        <View style={styles.profileSection}>
          <TouchableOpacity onPress={handlePickImage} style={styles.avatarContainer}>
            {uploading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : employee.profile_picture_url ? (
              <Image source={{ uri: employee.profile_picture_url }} style={styles.avatar} />
            ) : (
              <IconSymbol
                ios_icon_name="person.circle.fill"
                android_material_icon_name="account-circle"
                size={120}
                color={colors.primary}
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
          <Text style={styles.uploadHint}>{t('tap_change_photo')}</Text>
        </View>

        {/* Employee Information */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('employee_info')}</Text>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>{t('username')}</Text>
            <View style={[styles.formInput, styles.formInputDisabled]}>
              <Text style={styles.formInputTextDisabled}>{employee.username}</Text>
            </View>
            <Text style={styles.formNote}>{t('username_cannot_change')}</Text>
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>{t('full_name')}</Text>
            <TextInput
              style={styles.formInput}
              value={employee.name}
              onChangeText={(text) => setEmployee({ ...employee, name: text })}
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>{t('email')}</Text>
            <TextInput
              style={styles.formInput}
              value={employee.email}
              onChangeText={(text) => setEmployee({ ...employee, email: text })}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>{t('job_titles')}</Text>
            <MultiSelectField
              options={JOB_TITLE_OPTIONS}
              selected={employee.job_titles || []}
              onChange={(next) => setEmployee({ ...employee, job_titles: next })}
              title={t('job_titles')}
              placeholder={t('job_titles')}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>{t('phone_number')}</Text>
            <TextInput
              style={styles.formInput}
              value={employee.phone_number}
              onChangeText={(text) => setEmployee({ ...employee, phone_number: text })}
              keyboardType="phone-pad"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>{t('role')}</Text>
            <View style={styles.roleSelector}>
              {roleOptions.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.roleButton,
                    employee.role === r && styles.roleButtonActive,
                    roleLocked && { opacity: 0.5 },
                  ]}
                  onPress={() => { if (!roleLocked) setEmployee({ ...employee, role: r }); }}
                  disabled={roleLocked}
                >
                  <Text
                    style={[
                      styles.roleButtonText,
                      employee.role === r && styles.roleButtonTextActive,
                    ]}
                  >
                    {t(r)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {roleLocked && (
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8, fontStyle: 'italic' }}>
                {targetIsPrimaryOwner ? t('role_locked_primary') : t('role_locked_owner')}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.fireText} />
            ) : (
              <Text style={styles.saveButtonText}>{t('save_changes')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Password Reset */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('password_management')}</Text>
          <Text style={styles.sectionDescription}>
            {t('reset_password_desc', { defaultPassword })}
          </Text>
          {canResetPassword ? (
            <TouchableOpacity style={styles.resetButton} onPress={handleResetPassword}>
              <IconSymbol
                ios_icon_name="key.fill"
                android_material_icon_name="vpn-key"
                size={20}
                color={colors.text}
              />
              <Text style={styles.resetButtonText}>{t('reset_password')}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={{ fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' }}>
              {t('owner_password_locked')}
            </Text>
          )}
        </View>

        {/* Account Status */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('account_status')}</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>{t('status')}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: employee.is_active ? '#4CAF50' : '#F44336' },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {employee.is_active ? t('active') : t('inactive')}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontFamily: fonts.display.bold,
    fontSize: 20,
    color: colors.text,
  },
  deleteButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 22,
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
    backgroundColor: colors.primary,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  uploadHint: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: colors.surfaceBorder,
  },
  sectionTitle: {
    fontFamily: fonts.display.bold,
    fontSize: 17,
    color: colors.text,
    marginBottom: 8,
  },
  sectionDescription: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  formField: {
    marginBottom: 16,
  },
  formLabel: {
    fontFamily: fonts.display.semibold,
    fontSize: 13,
    color: colors.text,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body.regular,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  formInputDisabled: {
    opacity: 0.6,
  },
  formInputTextDisabled: {
    fontFamily: fonts.body.regular,
    fontSize: 15,
    color: colors.textSecondary,
  },
  formNote: {
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    color: colors.textSecondary,
    marginTop: 5,
    fontStyle: 'italic',
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 10,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: colors.primary,
    borderColor: 'transparent',
  },
  roleButtonText: {
    fontFamily: fonts.display.semibold,
    fontSize: 14,
    color: colors.textSecondary,
  },
  roleButtonTextActive: {
    color: colors.fireText,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  saveButtonText: {
    fontFamily: fonts.display.bold,
    fontSize: 16,
    color: colors.fireText,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  resetButtonText: {
    fontFamily: fonts.display.semibold,
    fontSize: 15,
    color: colors.text,
    marginLeft: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLabel: {
    fontFamily: fonts.display.semibold,
    fontSize: 15,
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontFamily: fonts.body.semibold,
    fontSize: 13,
    color: '#FFFFFF',
  },
});
