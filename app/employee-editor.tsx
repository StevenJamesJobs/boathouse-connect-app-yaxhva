
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
  Pressable,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import { useOrgJobTitles } from '@/hooks/useOrgJobTitles';
import MultiSelectField from '@/components/MultiSelectField';
import AmbientGlow from '@/components/AmbientGlow';
import { StorageImage } from '@/components/StorageImage';
import { displayHandle } from '@/utils/displayHandle';
import { getOrgDirectory } from '@/utils/orgDirectory';
import { toPublicUrl } from '@/utils/storageResolver';
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

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function EmployeeEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation('employee_editor');
  const colors = useThemeColors();
  const { organizationId, organization } = useOrganization();
  const { user } = useAuth();
  const { open: openMiniProfile } = useMiniProfile();
  const { activeJobTitles: JOB_TITLE_OPTIONS } = useOrgJobTitles();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // New employee form state
  const [newEmployee, setNewEmployee] = useState({
    username: '',
    name: '',
    email: '',
    job_titles: [] as string[],
    phone_number: '',
    role: 'employee',
    password: organization?.default_password || 'changeme',
  });

  useEffect(() => {
    console.log('Employee Editor: Initial load');
    fetchEmployees();
  }, []);

  const filterEmployees = useCallback(() => {
    let filtered = [...employees];

    // Apply active/inactive filter
    if (showInactive) {
      filtered = filtered.filter((emp) => !emp.is_active);
    } else {
      filtered = filtered.filter((emp) => emp.is_active);
    }

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (emp) =>
          emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          emp.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
          emp.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply alphabetical filter by selected letter
    if (selectedLetter) {
      filtered = filtered.filter((emp) =>
        emp.name.toUpperCase().startsWith(selectedLetter)
      );
    }

    setFilteredEmployees(filtered);
  }, [employees, searchQuery, selectedLetter, showInactive]);

  useEffect(() => {
    filterEmployees();
  }, [filterEmployees]);

  const fetchEmployees = async () => {
    try {
      console.log('Fetching employees...');
      setLoading(true);
      // Hardened RPC read: org-scoped roster for the acting (logged-in) manager.
      // getOrgDirectory is already scoped to the actor's organization, so the
      // .eq('organization_id', ...) filter is dropped. Ordering by name is done
      // client-side to preserve the original .order('name', { ascending: true }).
      const roster = await getOrgDirectory(user?.id);
      const data = [...roster].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );
      console.log('Fetched employees:', data?.length);
      setEmployees(data as unknown as Employee[]);
    } catch (error) {
      console.error('Error fetching employees:', error);
      Alert.alert(t('common:error'), t('error_fetch'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async () => {
    try {
      console.log('Adding new employee with job_titles:', newEmployee.job_titles);
      
      if (!newEmployee.username || !newEmployee.name || !newEmployee.email) {
        Alert.alert(t('common:error'), t('error_required_fields'));
        return;
      }

      if (newEmployee.job_titles.length === 0) {
        Alert.alert(t('common:error'), t('error_job_title'));
        return;
      }

      // Call the database function to create user (bypasses RLS)
      const { data, error } = await supabase.rpc('create_user', {
        p_username: newEmployee.username,
        p_name: newEmployee.name,
        p_email: newEmployee.email,
        p_job_title: newEmployee.job_titles[0], // Use first job title for backward compatibility
        p_phone_number: newEmployee.phone_number,
        p_role: newEmployee.role,
        p_password: newEmployee.password,
        p_organization_id: organizationId,
        p_actor_id: user?.id,
      });

      if (error) {
        console.error('Error creating user:', error);
        throw error;
      }

      console.log('User created, now updating job_titles array...');

      // Update the job_titles array for the new user using RPC function
      const { error: updateError } = await supabase.rpc('update_user_job_titles', {
        p_user_id: data,
        p_job_titles: newEmployee.job_titles,
        p_organization_id: organizationId,
        p_actor_id: user?.id,
      });

      if (updateError) {
        console.error('Error updating job_titles:', updateError);
        throw updateError;
      }

      console.log('Employee added successfully with job_titles:', newEmployee.job_titles);
      Alert.alert(t('common:success'), t('employee_added'));
      setShowAddModal(false);
      setNewEmployee({
        username: '',
        name: '',
        email: '',
        job_titles: [],
        phone_number: '',
        role: 'employee',
        password: organization?.default_password || 'changeme',
      });
      fetchEmployees();
    } catch (error: any) {
      console.error('Error adding employee:', error);
      Alert.alert(t('common:error'), error.message || t('error_fetch'));
    }
  };

  const handleEditEmployee = (employee: Employee) => {
    console.log('Editing employee:', employee.name, 'with job_titles:', employee.job_titles);
    setSelectedEmployee(employee);
    router.push({
      pathname: '/employee-detail',
      params: { employeeId: employee.id },
    });
  };

  const handleDeleteEmployee = (employee: Employee) => {
    Alert.alert(
      t('delete_title', { defaultValue: 'Delete Employee' }),
      t('delete_confirm', {
        name: employee.name,
        defaultValue: 'Delete {{name}}? This permanently removes their account and cannot be undone.',
      }),
      [
        { text: t('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await (supabase.rpc as any)('delete_employee', {
                p_actor_id: user?.id,
                p_employee_id: employee.id,
                p_organization_id: organizationId,
              });
              if (error) throw error;
              fetchEmployees();
            } catch (error: any) {
              Alert.alert(t('common:error'), error?.message || t('error_delete', { defaultValue: 'Could not delete employee' }));
            }
          },
        },
      ]
    );
  };

  const shareMessage = t('manager_manage:emp_share_msg', {
    org: organization?.name || '',
    code: organization?.join_code || '',
    pw: organization?.default_password || '',
    defaultValue: 'Join {{org}} on the team app! Use sign-up code {{code}} and temporary password {{pw}} to create your account.',
  });

  const copyCode = async () => {
    if (!organization?.join_code) return;
    await Clipboard.setStringAsync(organization.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const shareCode = async () => {
    if (!organization?.join_code) {
      Alert.alert(t('manager_manage:emp_share_title', 'Invite Employees'), t('manager_manage:emp_no_code', 'No sign-up code is available yet.'));
      return;
    }
    try {
      await Share.share({ message: shareMessage });
    } catch {}
  };

  const handleToggleActive = async (employee: Employee) => {
    try {
      console.log('Toggling active status for employee:', employee.name, 'Current status:', employee.is_active);
      
      const newStatus = !employee.is_active;
      
      // Use RPC function to bypass RLS
      const { error } = await supabase.rpc('update_user_active_status', {
        p_user_id: employee.id,
        p_is_active: newStatus,
        p_organization_id: organizationId,
        p_actor_id: user?.id,
      });

      if (error) {
        console.error('Error toggling employee status:', error);
        throw error;
      }

      console.log('Employee status updated successfully to:', newStatus);
      Alert.alert(
        t('common:success'),
        newStatus ? t('employee_activated') : t('employee_deactivated')
      );
      fetchEmployees();
    } catch (error) {
      console.error('Error toggling employee status:', error);
      Alert.alert(t('common:error'), t('error_toggle_status'));
    }
  };

  const getProfilePictureUrl = (url: string | null | undefined) => {
    if (!url) return null;
    
    // If it's already a full URL, return it
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    return toPublicUrl('profile-pictures', url);
  };


  const getJobTitlesDisplay = (employee: Employee) => {
    // Prioritize job_titles array if it exists and has items
    if (employee.job_titles && employee.job_titles.length > 0) {
      return employee.job_titles.join(', ');
    }
    // Fall back to old job_title column if job_titles is empty
    return employee.job_title || t('no_job_title');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
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
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowShareModal(true)} style={styles.addButton}>
            <IconSymbol
              ios_icon_name="person.2.badge.plus"
              android_material_icon_name="group-add"
              size={25}
              color={colors.tint}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addButton}>
            <IconSymbol
              ios_icon_name="plus.circle.fill"
              android_material_icon_name="add-circle"
              size={28}
              color={colors.primary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <IconSymbol
          ios_icon_name="magnifyingglass"
          android_material_icon_name="search"
          size={20}
          color={colors.textSecondary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <IconSymbol
              ios_icon_name="xmark.circle.fill"
              android_material_icon_name="cancel"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Show Inactive Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => setShowInactive(!showInactive)}
        >
          <View style={[styles.toggleCheckbox, showInactive && styles.toggleCheckboxActive]}>
            {showInactive && (
              <IconSymbol
                ios_icon_name="checkmark"
                android_material_icon_name="check"
                size={16}
                color={colors.text}
              />
            )}
          </View>
          <Text style={styles.toggleLabel}>{t('show_inactive')}</Text>
        </TouchableOpacity>
      </View>

      {/* Content Container with List and Alphabet Nav */}
      <View style={styles.contentContainer}>
        {/* Employee List */}
        <ScrollView style={styles.employeeList} contentContainerStyle={styles.employeeListContent}>
          {filteredEmployees.length === 0 ? (
            <Text style={styles.emptyText}>{t('no_employees')}</Text>
          ) : (
            filteredEmployees.map((employee, index) => {
              const profilePictureUrl = getProfilePictureUrl(employee.profile_picture_url);
              
              const handle = displayHandle(employee.name, employee.username);
              return (
                <View key={index} style={styles.employeeCard}>
                  <TouchableOpacity style={styles.employeeInfo} onPress={() => openMiniProfile(employee.id)} activeOpacity={0.7}>
                    <View style={styles.employeeAvatar}>
                      {profilePictureUrl ? (
                        <StorageImage
                          source={{ uri: profilePictureUrl }}
                          style={styles.profileImage}
                        />
                      ) : (
                        <IconSymbol
                          ios_icon_name="person.circle.fill"
                          android_material_icon_name="account-circle"
                          size={46}
                          color={colors.primary}
                        />
                      )}
                    </View>
                    <View style={styles.employeeDetails}>
                      <Text style={styles.employeeName} numberOfLines={1}>{employee.name}</Text>
                      <Text style={styles.employeeRole} numberOfLines={1}>{getJobTitlesDisplay(employee)}</Text>
                      <View style={styles.metaRow}>
                        {!!handle && <Text style={styles.employeeUsername} numberOfLines={1}>@{handle}</Text>}
                        <TouchableOpacity
                          onPress={() => handleToggleActive(employee)}
                          hitSlop={6}
                          style={[styles.statusChip, { backgroundColor: (employee.is_active ? '#4CAF50' : '#F44336') + '1F' }]}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.statusDot, { backgroundColor: employee.is_active ? '#4CAF50' : '#F44336' }]} />
                          <Text style={[styles.statusChipText, { color: employee.is_active ? '#4CAF50' : '#F44336' }]}>
                            {employee.is_active ? t('active', { defaultValue: 'Active' }) : t('inactive', { defaultValue: 'Inactive' })}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.employeeActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openMiniProfile(employee.id)} hitSlop={6}>
                      <IconSymbol ios_icon_name="person.crop.circle" android_material_icon_name="account-circle" size={22} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleEditEmployee(employee)} hitSlop={6}>
                      <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.tint} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteEmployee(employee)} hitSlop={6}>
                      <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color="#F44336" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Alphabetical Navigation Bar */}
        <View style={styles.alphabetNav}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.alphabetNavContent}
          >
            <TouchableOpacity
              style={[
                styles.alphabetButton,
                selectedLetter === null && styles.alphabetButtonActive,
              ]}
              onPress={() => setSelectedLetter(null)}
            >
              <Text
                style={[
                  styles.alphabetButtonText,
                  selectedLetter === null && styles.alphabetButtonTextActive,
                ]}
              >
                {t('all')}
              </Text>
            </TouchableOpacity>
            {ALPHABET.map((letter, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.alphabetButton,
                  selectedLetter === letter && styles.alphabetButtonActive,
                ]}
                onPress={() => setSelectedLetter(letter)}
              >
                <Text
                  style={[
                    styles.alphabetButtonText,
                    selectedLetter === letter && styles.alphabetButtonTextActive,
                  ]}
                >
                  {letter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Add Employee Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('add_employee_title')}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('username_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmployee.username}
                  onChangeText={(text) => setNewEmployee({ ...newEmployee, username: text })}
                  placeholder={t('username_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('full_name_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmployee.name}
                  onChangeText={(text) => setNewEmployee({ ...newEmployee, name: text })}
                  placeholder={t('full_name_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('email_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmployee.email}
                  onChangeText={(text) => setNewEmployee({ ...newEmployee, email: text })}
                  placeholder={t('email_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('job_titles_label')}</Text>
                <MultiSelectField
                  options={JOB_TITLE_OPTIONS}
                  selected={newEmployee.job_titles}
                  onChange={(next) => setNewEmployee({ ...newEmployee, job_titles: next })}
                  title={t('job_titles_label')}
                  placeholder={t('job_titles_label')}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('phone_number_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmployee.phone_number}
                  onChangeText={(text) => setNewEmployee({ ...newEmployee, phone_number: text })}
                  placeholder={t('phone_number_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('role_label')}</Text>
                <View style={styles.roleSelector}>
                  <TouchableOpacity
                    style={[
                      styles.roleButton,
                      newEmployee.role === 'employee' && styles.roleButtonActive,
                    ]}
                    onPress={() => setNewEmployee({ ...newEmployee, role: 'employee' })}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        newEmployee.role === 'employee' && styles.roleButtonTextActive,
                      ]}
                    >
                      {t('employee')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.roleButton,
                      newEmployee.role === 'manager' && styles.roleButtonActive,
                    ]}
                    onPress={() => setNewEmployee({ ...newEmployee, role: 'manager' })}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        newEmployee.role === 'manager' && styles.roleButtonTextActive,
                      ]}
                    >
                      {t('manager')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('default_password_label')}</Text>
                <View style={[styles.formInput, styles.formInputDisabled]}>
                  <Text style={styles.formInputTextDisabled}>{organization?.default_password || 'changeme'}</Text>
                </View>
                <Text style={styles.formNote}>
                  {t('default_password_note')}
                </Text>
              </View>

              <TouchableOpacity style={styles.submitButton} onPress={handleAddEmployee}>
                <Text style={styles.submitButtonText}>{t('add_employee_button')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Share / invite modal */}
      <Modal visible={showShareModal} transparent animationType="fade" onRequestClose={() => setShowShareModal(false)}>
        <Pressable style={styles.shareScrim} onPress={() => setShowShareModal(false)}>
          <Pressable style={[styles.shareCard, { backgroundColor: colors.card, borderColor: colors.glassBorder }]} onPress={() => {}}>
            <View style={styles.shareHeader}>
              <View style={[styles.shareIcon, { backgroundColor: colors.tint + '26' }]}>
                <IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="group-add" size={18} color={colors.tint} />
              </View>
              <Text style={[styles.shareTitle, { color: colors.text }]}>{t('manager_manage:emp_share_title', 'Invite Employees')}</Text>
            </View>
            <Text style={[styles.shareCodeLabel, { color: colors.textSecondary }]}>{t('manager_manage:emp_share_code_label', 'Sign-up code')}</Text>
            <Text style={[styles.shareCode, { color: colors.tint }]}>{organization?.join_code || '—'}</Text>
            <View style={styles.shareBtns}>
              <TouchableOpacity style={[styles.shareBtn, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]} onPress={copyCode} activeOpacity={0.85}>
                <IconSymbol ios_icon_name="doc.on.doc" android_material_icon_name="content-copy" size={15} color={colors.text} />
                <Text style={[styles.shareBtnText, { color: colors.text }]}>{copied ? t('manager_manage:emp_copied', 'Copied!') : t('manager_manage:emp_copy', 'Copy')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.shareBtn, { backgroundColor: colors.primary, borderColor: 'transparent' }]} onPress={shareCode} activeOpacity={0.85}>
                <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="ios-share" size={15} color={colors.fireText} />
                <Text style={[styles.shareBtnText, { color: colors.fireText }]}>{t('manager_manage:emp_share_via', 'Share')}</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.sharePw, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
              <Text style={[styles.sharePwLabel, { color: colors.textSecondary }]}>{t('manager_manage:emp_default_pw_label', 'Default password (read-only)')}</Text>
              <Text style={[styles.sharePwVal, { color: colors.text }]}>{organization?.default_password || '—'}</Text>
            </View>
            <Text style={[styles.shareHint, { color: colors.textSecondary }]}>
              {t('manager_manage:emp_share_hint', "Share this code so new staff can create their own account. They'll be asked to set a new password on first login.")}
            </Text>
            <TouchableOpacity style={[styles.shareClose, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]} onPress={() => setShowShareModal(false)} activeOpacity={0.85}>
              <Text style={[styles.shareBtnText, { color: colors.text }]}>{t('manager_manage:go_back', 'Go Back')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingBottom: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontFamily: fonts.display.bold,
    fontSize: 20,
    color: colors.text,
  },
  addButton: {
    padding: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: colors.surfaceBorder,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontFamily: fonts.body.regular,
    fontSize: 15,
    color: colors.text,
  },
  toggleContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.tint,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleCheckboxActive: {
    backgroundColor: colors.tint,
  },
  toggleLabel: {
    fontFamily: fonts.body.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    marginTop: 8,
  },
  employeeList: {
    flex: 1,
    paddingLeft: 16,
  },
  employeeListContent: {
    paddingRight: 8,
    paddingBottom: 100,
  },
  emptyText: {
    textAlign: 'center',
    fontFamily: fonts.body.regular,
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 40,
  },
  employeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: colors.surfaceBorder,
  },
  employeeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  employeeAvatar: {
    marginRight: 11,
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  employeeDetails: {
    flex: 1,
    minWidth: 0,
  },
  employeeName: {
    fontFamily: fonts.display.semibold,
    fontSize: 14.5,
    color: colors.text,
  },
  employeeRole: {
    fontFamily: fonts.body.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  employeeUsername: {
    fontFamily: fonts.mono.medium,
    fontSize: 10.5,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontFamily: fonts.mono.medium,
    fontSize: 9.5,
  },
  employeeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 8,
  },
  actionBtn: {
    padding: 3,
  },
  alphabetNav: {
    width: 38,
    backgroundColor: colors.surface,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: colors.surfaceBorder,
    marginRight: 12,
    marginLeft: 4,
  },
  alphabetNavContent: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  alphabetButton: {
    width: 30,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 1,
    borderRadius: 13,
  },
  alphabetButtonActive: {
    backgroundColor: colors.tint,
  },
  alphabetButtonText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  alphabetButtonTextActive: {
    color: colors.fireText,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  modalTitle: {
    fontFamily: fonts.display.bold,
    fontSize: 19,
    color: colors.text,
  },
  modalForm: {
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  formField: {
    marginBottom: 18,
  },
  formLabel: {
    fontFamily: fonts.display.semibold,
    fontSize: 13,
    color: colors.text,
    marginBottom: 7,
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
    justifyContent: 'center',
  },
  formInputTextDisabled: {
    fontFamily: fonts.mono.medium,
    fontSize: 14,
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
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 24,
  },
  submitButtonText: {
    fontFamily: fonts.display.bold,
    fontSize: 16,
    color: colors.fireText,
  },

  // Share / invite modal
  shareScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  shareCard: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 18 },
  shareHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  shareIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  shareTitle: { fontFamily: fonts.display.bold, fontSize: 16, flex: 1 },
  shareCodeLabel: { fontFamily: fonts.mono.medium, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  shareCode: { fontFamily: fonts.mono.semibold, fontSize: 26, letterSpacing: 1, marginTop: 4, marginBottom: 12 },
  shareBtns: { flexDirection: 'row', gap: 10 },
  shareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  shareBtnText: { fontFamily: fonts.display.semibold, fontSize: 13 },
  sharePw: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, marginTop: 12 },
  sharePwLabel: { fontFamily: fonts.mono.medium, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  sharePwVal: { fontFamily: fonts.mono.semibold, fontSize: 15, marginTop: 3 },
  shareHint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, marginTop: 12 },
  shareClose: { marginTop: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
});
