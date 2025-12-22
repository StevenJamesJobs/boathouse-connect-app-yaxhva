
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
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

interface User {
  id: string;
  name: string;
  job_title: string;
  job_titles: string[];
  role: string;
}

interface RecipientGroup {
  id: string;
  label: string;
  description: string;
  userIds: string[];
}

export default function ComposeMessageScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<User[]>([]);
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [recipientGroups, setRecipientGroups] = useState<RecipientGroup[]>([]);

  const colors = user?.role === 'manager' ? managerColors : employeeColors;

  const loadUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, job_title, job_titles, role')
        .eq('is_active', true)
        .neq('id', user?.id || '')
        .order('name');

      if (error) throw error;
      setAllUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'Failed to load users');
    }
  }, [user?.id]);

  const generateRecipientGroups = useCallback(() => {
    const groups: RecipientGroup[] = [];

    // Default group for employees: All Managers
    if (user?.role === 'employee') {
      const managers = allUsers.filter(u => u.role === 'manager');
      if (managers.length > 0) {
        groups.push({
          id: 'all-managers',
          label: 'All Managers',
          description: `Send to all ${managers.length} manager${managers.length > 1 ? 's' : ''}`,
          userIds: managers.map(m => m.id),
        });
      }
    }

    // Default group for managers: All Employees
    if (user?.role === 'manager') {
      const employees = allUsers.filter(u => u.role === 'employee');
      const allCount = allUsers.length;
      
      groups.push({
        id: 'all-employees',
        label: 'All Employees',
        description: `Send to all ${allCount} employee${allCount > 1 ? 's' : ''} and managers`,
        userIds: allUsers.map(u => u.id),
      });
    }

    // Group by job titles (using the new job_titles array)
    const jobTitlesSet = new Set<string>();
    allUsers.forEach(u => {
      if (u.job_titles && Array.isArray(u.job_titles)) {
        u.job_titles.forEach(title => jobTitlesSet.add(title));
      }
    });

    const jobTitles = Array.from(jobTitlesSet).sort();
    
    jobTitles.forEach(jobTitle => {
      const usersWithTitle = allUsers.filter(u => 
        u.job_titles && Array.isArray(u.job_titles) && u.job_titles.includes(jobTitle)
      );
      
      if (usersWithTitle.length > 0) {
        groups.push({
          id: `job-${jobTitle}`,
          label: jobTitle,
          description: `Send to all ${usersWithTitle.length} ${jobTitle}${usersWithTitle.length > 1 ? 's' : ''}`,
          userIds: usersWithTitle.map(u => u.id),
        });
      }
    });

    setRecipientGroups(groups);
  }, [allUsers, user?.role]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (allUsers.length > 0) {
      generateRecipientGroups();
    }
  }, [allUsers, generateRecipientGroups]);

  const handleSelectGroup = (group: RecipientGroup) => {
    const groupUsers = allUsers.filter(u => group.userIds.includes(u.id));
    
    // Add users that aren't already selected
    const newRecipients = groupUsers.filter(
      gu => !selectedRecipients.some(sr => sr.id === gu.id)
    );
    
    setSelectedRecipients([...selectedRecipients, ...newRecipients]);
    setShowRecipientPicker(false);
    setSearchQuery('');
  };

  const handleSelectUser = (selectedUser: User) => {
    if (selectedRecipients.some(r => r.id === selectedUser.id)) {
      // Remove if already selected
      setSelectedRecipients(selectedRecipients.filter(r => r.id !== selectedUser.id));
    } else {
      // Add to selected
      setSelectedRecipients([...selectedRecipients, selectedUser]);
    }
  };

  const handleRemoveRecipient = (userId: string) => {
    setSelectedRecipients(selectedRecipients.filter(r => r.id !== userId));
  };

  const handleSend = async () => {
    if (selectedRecipients.length === 0) {
      Alert.alert('Error', 'Please select at least one recipient');
      return;
    }

    if (!body.trim()) {
      Alert.alert('Error', 'Please enter a message');
      return;
    }

    try {
      setSending(true);

      // Create the message
      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .insert({
          sender_id: user?.id,
          subject: subject.trim() || null,
          body: body.trim(),
          thread_id: null,
          parent_message_id: null,
        })
        .select()
        .single();

      if (messageError) throw messageError;

      // Create message recipients
      const recipients = selectedRecipients.map(recipient => ({
        message_id: messageData.id,
        recipient_id: recipient.id,
      }));

      const { error: recipientsError } = await supabase
        .from('message_recipients')
        .insert(recipients);

      if (recipientsError) throw recipientsError;

      Alert.alert('Success', 'Message sent successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const getJobTitlesDisplay = (u: User) => {
    if (u.job_titles && Array.isArray(u.job_titles) && u.job_titles.length > 0) {
      return u.job_titles.join(', ');
    }
    return u.job_title || 'No job title';
  };

  const filteredUsers = allUsers.filter(u => {
    const nameMatch = u.name.toLowerCase().includes(searchQuery.toLowerCase());
    const jobTitlesMatch = u.job_titles && Array.isArray(u.job_titles) && 
      u.job_titles.some(title => title.toLowerCase().includes(searchQuery.toLowerCase()));
    const oldJobTitleMatch = u.job_title && u.job_title.toLowerCase().includes(searchQuery.toLowerCase());
    
    return nameMatch || jobTitlesMatch || oldJobTitleMatch;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Message</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Recipients */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>To:</Text>
          <TouchableOpacity
            style={[styles.recipientButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowRecipientPicker(true)}
          >
            <IconSymbol
              ios_icon_name="person.badge.plus"
              android_material_icon_name="person_add"
              size={20}
              color={colors.primary || colors.highlight}
            />
            <Text style={[styles.recipientButtonText, { color: colors.text }]}>
              {selectedRecipients.length === 0
                ? 'Select Recipients'
                : `${selectedRecipients.length} recipient${selectedRecipients.length > 1 ? 's' : ''} selected`}
            </Text>
          </TouchableOpacity>

          {/* Selected Recipients */}
          {selectedRecipients.length > 0 && (
            <View style={styles.selectedRecipients}>
              {selectedRecipients.map((recipient, index) => (
                <View key={index} style={[styles.recipientChip, { backgroundColor: colors.highlight }]}>
                  <Text style={[styles.recipientChipText, { color: user?.role === 'manager' ? colors.text : '#FFFFFF' }]} numberOfLines={1}>
                    {recipient.name}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemoveRecipient(recipient.id)}>
                    <IconSymbol
                      ios_icon_name="xmark.circle.fill"
                      android_material_icon_name="cancel"
                      size={18}
                      color={user?.role === 'manager' ? colors.text : '#FFFFFF'}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Subject */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Subject (Optional):</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={subject}
            onChangeText={setSubject}
            placeholder="Enter subject"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* Message Body */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Message:</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={body}
            onChangeText={setBody}
            placeholder="Type your message here..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={10}
            textAlignVertical="top"
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: colors.textSecondary }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.cancelButtonText, { color: user?.role === 'manager' ? colors.text : '#FFFFFF' }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: colors.primary || colors.highlight }]}
            onPress={handleSend}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color={user?.role === 'manager' ? colors.text : '#FFFFFF'} />
            ) : (
              <>
                <IconSymbol
                  ios_icon_name="paperplane.fill"
                  android_material_icon_name="send"
                  size={20}
                  color={user?.role === 'manager' ? colors.text : '#FFFFFF'}
                />
                <Text style={[styles.sendButtonText, { color: user?.role === 'manager' ? colors.text : '#FFFFFF' }]}>
                  Send
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Recipient Picker Modal */}
      <Modal
        visible={showRecipientPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRecipientPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Recipients</Text>
              <TouchableOpacity onPress={() => setShowRecipientPicker(false)}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <IconSymbol
                ios_icon_name="magnifyingglass"
                android_material_icon_name="search"
                size={20}
                color={colors.textSecondary}
              />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by name or job title..."
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Recipient Groups */}
            {searchQuery === '' && recipientGroups.length > 0 && (
              <View style={styles.groupsSection}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Quick Select</Text>
                {recipientGroups.map((group, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.groupItem, { backgroundColor: colors.card }]}
                    onPress={() => handleSelectGroup(group)}
                  >
                    <View style={styles.groupInfo}>
                      <Text style={[styles.groupLabel, { color: colors.text }]}>{group.label}</Text>
                      <Text style={[styles.groupDescription, { color: colors.textSecondary }]}>
                        {group.description}
                      </Text>
                    </View>
                    <IconSymbol
                      ios_icon_name="chevron.right"
                      android_material_icon_name="chevron_right"
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Individual Users */}
            <View style={styles.usersSection}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                {searchQuery === '' ? 'All Users' : 'Search Results'}
              </Text>
              <FlatList
                data={filteredUsers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isSelected = selectedRecipients.some(r => r.id === item.id);
                  return (
                    <TouchableOpacity
                      style={[styles.userItem, { backgroundColor: colors.card }]}
                      onPress={() => handleSelectUser(item)}
                    >
                      <View style={styles.userInfo}>
                        <Text style={[styles.userName, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.userJobTitle, { color: colors.textSecondary }]}>
                          {getJobTitlesDisplay(item)}
                        </Text>
                      </View>
                      {isSelected && (
                        <IconSymbol
                          ios_icon_name="checkmark.circle.fill"
                          android_material_icon_name="check_circle"
                          size={24}
                          color={colors.primary || colors.highlight}
                        />
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyList}>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      No users found
                    </Text>
                  </View>
                }
              />
            </View>

            {/* Done Button */}
            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: colors.primary || colors.highlight }]}
              onPress={() => setShowRecipientPicker(false)}
            >
              <Text style={[styles.doneButtonText, { color: user?.role === 'manager' ? colors.text : '#FFFFFF' }]}>
                Done ({selectedRecipients.length} selected)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  recipientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  recipientButtonText: {
    fontSize: 16,
    flex: 1,
  },
  selectedRecipients: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  recipientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    maxWidth: '100%',
  },
  recipientChipText: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  input: {
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  textArea: {
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    minHeight: 200,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  sendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  groupsSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  groupInfo: {
    flex: 1,
  },
  groupLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  groupDescription: {
    fontSize: 13,
  },
  usersSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  userJobTitle: {
    fontSize: 13,
  },
  emptyList: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  doneButton: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
