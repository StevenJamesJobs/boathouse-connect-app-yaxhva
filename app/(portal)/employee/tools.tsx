
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';

export default function EmployeeToolsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitFeedback = async () => {
    if (!feedbackTitle.trim()) {
      Alert.alert('Error', 'Please enter a title for your feedback');
      return;
    }

    if (!feedbackDescription.trim()) {
      Alert.alert('Error', 'Please enter a description for your feedback');
      return;
    }

    try {
      setSubmitting(true);

      const { error } = await supabase
        .from('feedback')
        .insert({
          sender_id: user?.id,
          title: feedbackTitle.trim(),
          description: feedbackDescription.trim(),
        });

      if (error) {
        console.error('Error submitting feedback:', error);
        throw error;
      }

      Alert.alert(
        'Success',
        'Your feedback has been submitted successfully! Management will review it.',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowFeedbackModal(false);
              setFeedbackTitle('');
              setFeedbackDescription('');
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting feedback:', error);
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* User's Name Header with Feedback Button */}
      <View style={styles.nameHeader}>
        <Text style={styles.nameHeaderText}>{user?.name}&apos;s Tools</Text>
        <TouchableOpacity
          style={styles.feedbackHeaderButton}
          onPress={() => setShowFeedbackModal(true)}
        >
          <IconSymbol
            ios_icon_name="bubble.left.and.bubble.right.fill"
            android_material_icon_name="feedback"
            size={20}
            color="#FFFFFF"
          />
          <Text style={styles.feedbackHeaderButtonText}>Feedback</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Check Out Calculator Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconSymbol
              ios_icon_name="calculator.fill"
              android_material_icon_name="calculate"
              size={32}
              color={employeeColors.primary}
            />
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Check Out Calculator</Text>
              <Text style={styles.cardDescription}>
                Calculate your shift check out totals and tip outs
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.cardButton}
            onPress={() => router.push('/check-out-calculator')}
          >
            <Text style={styles.cardButtonText}>Open Calculator</Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron_right"
              size={20}
              color={employeeColors.text}
            />
          </TouchableOpacity>
        </View>

        {/* Guides and Training Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconSymbol
              ios_icon_name="book.fill"
              android_material_icon_name="menu_book"
              size={32}
              color={employeeColors.primary}
            />
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Guides and Training</Text>
              <Text style={styles.cardDescription}>
                Access training materials, handbooks, and guides
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.cardButton}
            onPress={() => router.push('/guides-and-training')}
          >
            <Text style={styles.cardButtonText}>View Guides</Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron_right"
              size={20}
              color={employeeColors.text}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Feedback Modal - Fixed with proper height */}
      <Modal
        visible={showFeedbackModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFeedbackModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity 
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => {
              setShowFeedbackModal(false);
              setFeedbackTitle('');
              setFeedbackDescription('');
            }}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Feedback and Suggestions</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowFeedbackModal(false);
                  setFeedbackTitle('');
                  setFeedbackDescription('');
                }}
                style={styles.closeButton}
              >
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={employeeColors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.modalScroll} 
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.feedbackInstructions}>
                Have any feedback or suggestions that can help the team? Let us know below and submit your idea! 
                Your feedback is not anonymous, but will only be seen as a private message between only you and management.
              </Text>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput
                  style={styles.titleInput}
                  value={feedbackTitle}
                  onChangeText={setFeedbackTitle}
                  placeholder="Enter a brief title"
                  placeholderTextColor={employeeColors.textSecondary}
                  maxLength={100}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={styles.descriptionInput}
                  value={feedbackDescription}
                  onChangeText={setFeedbackDescription}
                  placeholder="Describe your feedback or suggestion in detail"
                  placeholderTextColor={employeeColors.textSecondary}
                  multiline
                  numberOfLines={8}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={handleSubmitFeedback}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <IconSymbol
                      ios_icon_name="paperplane.fill"
                      android_material_icon_name="send"
                      size={20}
                      color="#FFFFFF"
                    />
                    <Text style={styles.submitButtonText}>Submit Feedback</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: employeeColors.background,
  },
  nameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: employeeColors.card,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.highlight,
  },
  nameHeaderText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: employeeColors.text,
  },
  feedbackHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: employeeColors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  feedbackHeaderButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: employeeColors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: employeeColors.textSecondary,
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: employeeColors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: employeeColors.text,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: employeeColors.card,
    borderRadius: 24,
    width: '90%',
    maxWidth: 500,
    height: 600,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: employeeColors.text,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 20,
  },
  feedbackInstructions: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    lineHeight: 20,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: employeeColors.text,
    marginBottom: 8,
  },
  titleInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: employeeColors.text,
    borderWidth: 1,
    borderColor: employeeColors.border,
  },
  descriptionInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: employeeColors.text,
    borderWidth: 1,
    borderColor: employeeColors.border,
    minHeight: 150,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: employeeColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
    marginTop: 8,
    marginBottom: 20,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
