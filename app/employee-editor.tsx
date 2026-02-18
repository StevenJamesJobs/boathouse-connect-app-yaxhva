
import React, { useState, useEffect, useCallback } from 'react';
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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

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

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function EmployeeEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation('employee_editor');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // New employee form state
  const [newEmployee, setNewEmployee] = useState({
    username: '',
    name: '',
    email: '',
    job_titles: [] as string[],
    phone_number: '',
    role: 'employee',
    password: 'boathouseconnect',
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
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      console.log('Fetched employees:', data?.length);
      setEmployees(data || []);
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
        password: 'boathouseconnect',
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

  const handleToggleActive = async (employee: Employee) => {
    try {
      console.log('Toggling active status for employee:', employee.name, 'Current status:', employee.is_active);
      
      const newStatus = !employee.is_active;
      
      // Use RPC function to bypass RLS
      const { error } = await supabase.rpc('update_user_active_status', {
        p_user_id: employee.id,
        p_is_active: newStatus,
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
    
    // Otherwise, construct the Supabase storage URL
    const { data } = supabase.storage.from('profile-pictures').getPublicUrl(url);
    return data.publicUrl;
  };

  const toggleJobTitle = (title: string) => {
    const currentTitles = [...newEmployee.job_titles];
    const index = currentTitles.indexOf(title);
    
    if (index > -1) {
      currentTitles.splice(index, 1);
    } else {
      currentTitles.push(title);
    }
    
    console.log('Job titles updated to:', currentTitles);
    setNewEmployee({ ...newEmployee, job_titles: currentTitles });
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
        <ActivityIndicator size="large" color={managerColors.highlight} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
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
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addButton}>
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add-circle"
            size={28}
            color={managerColors.highlight}
          />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <IconSymbol
          ios_icon_name="magnifyingglass"
          android_material_icon_name="search"
          size={20}
          color={managerColors.textSecondary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search_placeholder')}
          placeholderTextColor={managerColors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <IconSymbol
              ios_icon_name="xmark.circle.fill"
              android_material_icon_name="cancel"
              size={20}
              color={managerColors.textSecondary}
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
                color={managerColors.text}
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
              
              return (
                <View key={index} style={styles.employeeCard}>
                  <View style={styles.employeeInfo}>
                    <View style={styles.employeeAvatar}>
                      {profilePictureUrl ? (
                        <Image
                          source={{ uri: profilePictureUrl }}
                          style={styles.profileImage}
                        />
                      ) : (
                        <IconSymbol
                          ios_icon_name="person.circle.fill"
                          android_material_icon_name="account-circle"
                          size={50}
                          color={managerColors.highlight}
                        />
                      )}
                    </View>
                    <View style={styles.employeeDetails}>
                      <Text style={styles.employeeName}>{employee.name}</Text>
                      <Text style={styles.employeeRole}>{getJobTitlesDisplay(employee)}</Text>
                      <Text style={styles.employeeUsername}>@{employee.username}</Text>
                    </View>
                  </View>
                  <View style={styles.employeeActions}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => handleEditEmployee(employee)}
                    >
                      <IconSymbol
                        ios_icon_name="pencil.circle.fill"
                        android_material_icon_name="edit"
                        size={36}
                        color={managerColors.highlight}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.statusButton}
                      onPress={() => handleToggleActive(employee)}
                    >
                      <IconSymbol
                        ios_icon_name={employee.is_active ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                        android_material_icon_name={employee.is_active ? 'check-circle' : 'cancel'}
                        size={36}
                        color={employee.is_active ? '#4CAF50' : '#F44336'}
                      />
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
                  color={managerColors.textSecondary}
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
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('full_name_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmployee.name}
                  onChangeText={(text) => setNewEmployee({ ...newEmployee, name: text })}
                  placeholder={t('full_name_placeholder')}
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('email_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmployee.email}
                  onChangeText={(text) => setNewEmployee({ ...newEmployee, email: text })}
                  placeholder={t('email_placeholder')}
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('job_titles_label')}</Text>
                <View style={styles.jobTitlesContainer}>
                  {JOB_TITLE_OPTIONS.map((title, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.checkboxRow}
                      onPress={() => toggleJobTitle(title)}
                    >
                      <View style={styles.checkbox}>
                        {newEmployee.job_titles.includes(title) && (
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
                <Text style={styles.formLabel}>{t('phone_number_label')}</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmployee.phone_number}
                  onChangeText={(text) => setNewEmployee({ ...newEmployee, phone_number: text })}
                  placeholder={t('phone_number_placeholder')}
                  placeholderTextColor={managerColors.textSecondary}
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
                  <Text style={styles.formInputTextDisabled}>boathouseconnect</Text>
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
  addButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: managerColors.card,
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: managerColors.text,
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
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: managerColors.highlight,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: managerColors.card,
  },
  toggleCheckboxActive: {
    backgroundColor: managerColors.highlight,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
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
    fontSize: 16,
    color: managerColors.textSecondary,
    marginTop: 40,
  },
  employeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: managerColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  employeeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  employeeAvatar: {
    marginRight: 12,
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  employeeDetails: {
    flex: 1,
  },
  employeeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: managerColors.text,
    marginBottom: 4,
  },
  employeeRole: {
    fontSize: 14,
    color: managerColors.textSecondary,
    marginBottom: 2,
  },
  employeeUsername: {
    fontSize: 12,
    color: managerColors.textSecondary,
  },
  employeeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    padding: 4,
  },
  statusButton: {
    padding: 4,
  },
  alphabetNav: {
    width: 40,
    backgroundColor: managerColors.card,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    marginRight: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  alphabetNavContent: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  alphabetButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 16,
  },
  alphabetButtonActive: {
    backgroundColor: managerColors.highlight,
  },
  alphabetButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  alphabetButtonTextActive: {
    color: managerColors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: managerColors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.highlight,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: managerColors.text,
  },
  modalForm: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  formField: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.text,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: managerColors.card,
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
    backgroundColor: managerColors.card,
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
    borderColor: managerColors.highlight,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: managerColors.card,
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
  submitButton: {
    backgroundColor: managerColors.highlight,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: managerColors.text,
  },
});
