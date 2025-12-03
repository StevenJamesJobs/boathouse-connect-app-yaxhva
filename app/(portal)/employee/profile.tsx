
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function EmployeeProfileScreen() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    // TODO: Implement save functionality with Supabase
    Alert.alert('Success', 'Profile updated successfully!');
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEmail(user?.email || '');
    setPhoneNumber(user?.phoneNumber || '');
    setIsEditing(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          <IconSymbol
            ios_icon_name="person.circle.fill"
            android_material_icon_name="account_circle"
            size={100}
            color={employeeColors.primary}
          />
        </View>
        <Text style={styles.userName}>{user?.name}</Text>
        <Text style={styles.userRole}>{user?.jobTitle}</Text>
      </View>

      {/* Profile Information */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Profile Information</Text>

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
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Additional Information */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Account Details</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Role:</Text>
          <Text style={styles.infoValue}>{user?.role === 'manager' ? 'Manager' : 'Employee'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Employee ID:</Text>
          <Text style={styles.infoValue}>{user?.id}</Text>
        </View>
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
    alignItems: 'center',
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginBottom: 4,
  },
  userRole: {
    fontSize: 16,
    color: employeeColors.primary,
    fontWeight: '600',
  },
  card: {
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginBottom: 16,
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.highlight,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: employeeColors.text,
  },
  infoValue: {
    fontSize: 16,
    color: employeeColors.textSecondary,
  },
});
