
import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

interface Employee {
  id: string;
  username: string;
  name: string;
  email: string;
  job_title: string;
  phone_number: string;
  role: string;
  is_active: boolean;
  profile_picture_url?: string;
}

type FilterType = 'all' | 'a-e' | 'f-i' | 'j-r' | 's-z' | 'inactive';

export default function EmployeeEditorScreen() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // New employee form state
  const [newEmployee, setNewEmployee] = useState({
    username: '',
    name: '',
    email: '',
    job_title: '',
    phone_number: '',
    role: 'employee',
    password: 'boathouseconnect',
  });

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    filterEmployees();
  }, [employees, searchQuery, activeFilter]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      Alert.alert('Error', 'Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  };

  const filterEmployees = () => {
    let filtered = [...employees];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (emp) =>
          emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          emp.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
          emp.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply alphabetical filter
    if (activeFilter !== 'all' && activeFilter !== 'inactive') {
      filtered = filtered.filter((emp) => {
        const firstLetter = emp.name.charAt(0).toLowerCase();
        switch (activeFilter) {
          case 'a-e':
            return firstLetter >= 'a' && firstLetter <= 'e';
          case 'f-i':
            return firstLetter >= 'f' && firstLetter <= 'i';
          case 'j-r':
            return firstLetter >= 'j' && firstLetter <= 'r';
          case 's-z':
            return firstLetter >= 's' && firstLetter <= 'z';
          default:
            return true;
        }
      });
    }

    // Apply inactive filter
    if (activeFilter === 'inactive') {
      filtered = filtered.filter((emp) => !emp.is_active);
    } else {
      filtered = filtered.filter((emp) => emp.is_active);
    }

    setFilteredEmployees(filtered);
  };

  const handleAddEmployee = async () => {
    try {
      if (!newEmployee.username || !newEmployee.name || !newEmployee.email) {
        Alert.alert('Error', 'Please fill in all required fields');
        return;
      }

      // Insert into users table
      const { data, error } = await supabase
        .from('users')
        .insert([
          {
            username: newEmployee.username,
            name: newEmployee.name,
            email: newEmployee.email,
            job_title: newEmployee.job_title,
            phone_number: newEmployee.phone_number,
            role: newEmployee.role,
            is_active: true,
          },
        ])
        .select();

      if (error) throw error;

      Alert.alert('Success', 'Employee added successfully');
      setShowAddModal(false);
      setNewEmployee({
        username: '',
        name: '',
        email: '',
        job_title: '',
        phone_number: '',
        role: 'employee',
        password: 'boathouseconnect',
      });
      fetchEmployees();
    } catch (error: any) {
      console.error('Error adding employee:', error);
      Alert.alert('Error', error.message || 'Failed to add employee');
    }
  };

  const handleEditEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    router.push({
      pathname: '/employee-detail',
      params: { employeeId: employee.id },
    });
  };

  const handleToggleActive = async (employee: Employee) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !employee.is_active })
        .eq('id', employee.id);

      if (error) throw error;

      Alert.alert(
        'Success',
        `Employee ${employee.is_active ? 'deactivated' : 'activated'} successfully`
      );
      fetchEmployees();
    } catch (error) {
      console.error('Error toggling employee status:', error);
      Alert.alert('Error', 'Failed to update employee status');
    }
  };

  const renderFilterButton = (filter: FilterType, label: string) => (
    <TouchableOpacity
      key={filter}
      style={[styles.filterButton, activeFilter === filter && styles.filterButtonActive]}
      onPress={() => setActiveFilter(filter)}
    >
      <Text
        style={[styles.filterButtonText, activeFilter === filter && styles.filterButtonTextActive]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={managerColors.highlight} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Employee Editor</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addButton}>
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add_circle"
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
          placeholder="Search employees..."
          placeholderTextColor={managerColors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Buttons */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        {renderFilterButton('all', 'All')}
        {renderFilterButton('a-e', 'A-E')}
        {renderFilterButton('f-i', 'F-I')}
        {renderFilterButton('j-r', 'J-R')}
        {renderFilterButton('s-z', 'S-Z')}
        {renderFilterButton('inactive', 'Inactive')}
      </ScrollView>

      {/* Employee List */}
      <ScrollView style={styles.employeeList} contentContainerStyle={styles.employeeListContent}>
        {filteredEmployees.length === 0 ? (
          <Text style={styles.emptyText}>No employees found</Text>
        ) : (
          filteredEmployees.map((employee, index) => (
            <View key={index} style={styles.employeeCard}>
              <View style={styles.employeeInfo}>
                <View style={styles.employeeAvatar}>
                  <IconSymbol
                    ios_icon_name="person.circle.fill"
                    android_material_icon_name="account_circle"
                    size={50}
                    color={managerColors.highlight}
                  />
                </View>
                <View style={styles.employeeDetails}>
                  <Text style={styles.employeeName}>{employee.name}</Text>
                  <Text style={styles.employeeRole}>{employee.job_title}</Text>
                  <Text style={styles.employeeUsername}>@{employee.username}</Text>
                </View>
              </View>
              <View style={styles.employeeActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleEditEmployee(employee)}
                >
                  <IconSymbol
                    ios_icon_name="pencil.circle.fill"
                    android_material_icon_name="edit"
                    size={24}
                    color={managerColors.highlight}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleToggleActive(employee)}
                >
                  <IconSymbol
                    ios_icon_name={employee.is_active ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                    android_material_icon_name={employee.is_active ? 'check_circle' : 'cancel'}
                    size={24}
                    color={employee.is_active ? '#4CAF50' : '#F44336'}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add Employee Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Employee</Text>
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
                <Text style={styles.formLabel}>Username *</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmployee.username}
                  onChangeText={(text) => setNewEmployee({ ...newEmployee, username: text })}
                  placeholder="Enter username"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Full Name *</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmployee.name}
                  onChangeText={(text) => setNewEmployee({ ...newEmployee, name: text })}
                  placeholder="Enter full name"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Email *</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmployee.email}
                  onChangeText={(text) => setNewEmployee({ ...newEmployee, email: text })}
                  placeholder="Enter email"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Job Title</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmployee.job_title}
                  onChangeText={(text) => setNewEmployee({ ...newEmployee, job_title: text })}
                  placeholder="Enter job title"
                  placeholderTextColor={managerColors.textSecondary}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Phone Number</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmployee.phone_number}
                  onChangeText={(text) => setNewEmployee({ ...newEmployee, phone_number: text })}
                  placeholder="Enter phone number"
                  placeholderTextColor={managerColors.textSecondary}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Role</Text>
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
                      Employee
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
                      Manager
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Default Password</Text>
                <View style={[styles.formInput, styles.formInputDisabled]}>
                  <Text style={styles.formInputTextDisabled}>boathouseconnect</Text>
                </View>
                <Text style={styles.formNote}>
                  Employee can change password after first login
                </Text>
              </View>

              <TouchableOpacity style={styles.submitButton} onPress={handleAddEmployee}>
                <Text style={styles.submitButtonText}>Add Employee</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
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
  filterContainer: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: managerColors.card,
    marginRight: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  filterButtonActive: {
    backgroundColor: managerColors.highlight,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: managerColors.textSecondary,
  },
  filterButtonTextActive: {
    color: managerColors.text,
  },
  employeeList: {
    flex: 1,
    marginTop: 16,
  },
  employeeListContent: {
    paddingHorizontal: 16,
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
  },
  actionButton: {
    marginLeft: 12,
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
