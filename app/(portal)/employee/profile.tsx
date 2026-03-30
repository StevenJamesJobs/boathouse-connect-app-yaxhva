
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
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { MessageBadge } from '@/components/MessageBadge';
import { useTranslation } from 'react-i18next';
import { QUICK_TOOLS_CATALOG, getAvailableTools, getDefaultQuickTools } from '@/config/quickTools';
import QuickToolsSelector from '@/components/QuickToolsSelector';

interface NextShift {
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[];
}

const formatTime = (timeStr: string) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${h}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

const formatShiftDate = (dateStr: string) => {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};

export default function EmployeeProfileScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const { unreadCount } = useUnreadMessages();
  const [email, setEmail] = useState(user?.email || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileInfoExpanded, setProfileInfoExpanded] = useState(false);
  const [nextShift, setNextShift] = useState<NextShift | null>(null);
  const [loadingShift, setLoadingShift] = useState(true);
  const [showToolSelector, setShowToolSelector] = useState(false);
  const [totalGameScore, setTotalGameScore] = useState(0);

  // Update local state when user context changes
  useEffect(() => {
    if (user) {
      setEmail(user.email);
      setPhoneNumber(user.phoneNumber);
    }
  }, [user]);

  // Load next shift
  const loadNextShift = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoadingShift(true);
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('staff_schedules')
        .select('shift_date, start_time, end_time, roles')
        .eq('user_id', user.id)
        .gte('shift_date', today)
        .order('shift_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading next shift:', error);
      }
      setNextShift(data || null);
    } catch (err) {
      console.error('Error loading next shift:', err);
      setNextShift(null);
    } finally {
      setLoadingShift(false);
    }
  }, [user?.id]);

  // Load total game score
  const loadGameScore = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await (supabase.rpc as any)('get_user_total_game_score', {
        p_user_id: user.id,
      });
      if (!error && data !== null) {
        setTotalGameScore(Number(data));
      }
    } catch {}
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadNextShift();
      loadGameScore();
    }, [loadNextShift, loadGameScore])
  );

  const handleSave = async () => {
    try {
      setSaving(true);
      if (!user?.id) return;

      console.log('Employee Profile: Saving profile info');
      // Use the new RPC function to update profile info
      const { error } = await supabase.rpc('update_profile_info', {
        user_id: user.id,
        new_email: email,
        new_phone_number: phoneNumber,
      });

      if (error) {
        console.error('Error updating profile:', error);
        throw error;
      }

      // Refresh user data in context
      await refreshUser();

      Alert.alert(t('common.success'), t('profile.profile_updated'));
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert(t('common.error'), t('profile.error_update_profile'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEmail(user?.email || '');
    setPhoneNumber(user?.phoneNumber || '');
    setIsEditing(false);
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permission_required'), t('profile.grant_camera_permissions'));
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
      Alert.alert(t('common.error'), t('profile.error_pick_image'));
    }
  };

  const uploadImage = async (uri: string) => {
    if (!user?.id) return;

    try {
      setUploading(true);
      console.log('Starting image upload for user:', user.id);

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      // Create file name
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      console.log('Uploading file:', fileName);

      // Determine content type
      let contentType = 'image/jpeg';
      if (fileExt === 'png') contentType = 'image/png';
      else if (fileExt === 'gif') contentType = 'image/gif';
      else if (fileExt === 'webp') contentType = 'image/webp';

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(fileName, byteArray, {
          contentType: contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      console.log('Upload successful:', uploadData);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(fileName);

      console.log('Public URL:', urlData.publicUrl);

      // Update user record using the new RPC function
      const { error: updateError } = await supabase.rpc('update_profile_picture', {
        user_id: user.id,
        picture_url: urlData.publicUrl,
      });

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      console.log('Database updated successfully with profile picture URL');

      // Refresh user data in context to update profile picture everywhere
      await refreshUser();

      Alert.alert(t('common.success'), t('profile.profile_picture_updated'));
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert(t('common.error'), error.message || t('profile.error_upload_picture'));
    } finally {
      setUploading(false);
    }
  };

  const handleSaveQuickTools = async (toolIds: string[]) => {
    try {
      await supabase.rpc('update_quick_tools', {
        user_id: user?.id,
        tools: JSON.stringify(toolIds),
      });
      await refreshUser();
      setShowToolSelector(false);
    } catch (error) {
      console.error('Error saving quick tools:', error);
    }
  };

  // Resolve quick tool IDs to configs
  const userToolIds = user?.quickTools || getDefaultQuickTools(user?.role || 'employee', user?.jobTitles || []);
  const resolvedTools = userToolIds
    .map((id) => QUICK_TOOLS_CATALOG.find((tool) => tool.id === id))
    .filter(Boolean);

  const quickActions = [
    {
      key: 'messages',
      iosIcon: 'envelope.fill' as const,
      androidIcon: 'mail' as const,
      label: t('profile_dashboard.messages', 'Messages'),
      onPress: () => router.push('/messages'),
      showBadge: true,
    },
    {
      key: 'schedule',
      iosIcon: 'calendar' as const,
      androidIcon: 'event' as const,
      label: t('profile_dashboard.my_schedule', 'My Schedule'),
      onPress: () => router.push('/my-schedule'),
      showBadge: false,
    },
    {
      key: 'rewards',
      iosIcon: 'star.fill' as const,
      androidIcon: 'star' as const,
      label: t('profile_dashboard.my_rewards', 'My Rewards'),
      onPress: () => router.push('/(portal)/employee/rewards' as any),
      showBadge: false,
    },
    {
      key: 'settings',
      iosIcon: 'gearshape.fill' as const,
      androidIcon: 'settings' as const,
      label: t('profile_dashboard.settings', 'Settings'),
      onPress: () => router.push('/settings' as any),
      showBadge: false,
    },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Compact Header Card */}
        <View style={[styles.headerCard, { backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={handlePickImage} style={styles.headerAvatarContainer}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.headerAvatar} />
            ) : user?.profilePictureUrl ? (
              <Image
                source={{ uri: user.profilePictureUrl }}
                style={styles.headerAvatar}
                key={user.profilePictureUrl}
              />
            ) : (
              <IconSymbol
                ios_icon_name="person.circle.fill"
                android_material_icon_name="account-circle"
                size={64}
                color={colors.primary}
              />
            )}
            <View style={[styles.headerCameraIcon, { backgroundColor: colors.primary, borderColor: colors.card }]}>
              <IconSymbol
                ios_icon_name="camera.fill"
                android_material_icon_name="camera-alt"
                size={10}
                color="#FFFFFF"
              />
            </View>
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>
              {user?.name}
            </Text>
            <Text style={[styles.headerJobTitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {user?.jobTitle}
            </Text>
            {user?.badgeTitle && (
              <View style={[styles.badgePill, { backgroundColor: colors.primary + '20' }]}>
                <IconSymbol
                  ios_icon_name="star.fill"
                  android_material_icon_name="star"
                  size={10}
                  color={colors.primary}
                />
                <Text style={[styles.badgePillText, { color: colors.primary }]}>
                  {user.badgeTitle}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.headerChips}>
            <View style={[styles.bucksChip, { backgroundColor: colors.primary }]}>
              <IconSymbol
                ios_icon_name="dollarsign.circle.fill"
                android_material_icon_name="attach-money"
                size={16}
                color="#FFFFFF"
              />
              <Text style={styles.bucksText}>
                ${user?.mcloonesBucks ?? 0}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.gameScoreChip, { backgroundColor: '#F59E0B' }]}
              onPress={() => router.push('/game-hub')}
              activeOpacity={0.7}
            >
              <Text style={styles.gameScoreIcon}>🏆</Text>
              <Text style={styles.gameScoreText}>
                {totalGameScore.toLocaleString()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. Quick Actions Grid */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.quickActionsRow}>
            {quickActions.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={[styles.quickActionButton, { backgroundColor: colors.primary + '15' }]}
                onPress={action.onPress}
              >
                <View style={styles.quickActionIconWrap}>
                  <IconSymbol
                    ios_icon_name={action.iosIcon}
                    android_material_icon_name={action.androidIcon}
                    size={24}
                    color={colors.primary}
                  />
                  {action.showBadge && unreadCount > 0 && (
                    <View style={styles.quickActionBadge}>
                      <MessageBadge count={unreadCount} size="small" />
                    </View>
                  )}
                </View>
                <Text style={[styles.quickActionLabel, { color: colors.text }]} numberOfLines={1}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 3. Next Shift Card */}
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.card }]}
          onPress={() => router.push('/my-schedule')}
          activeOpacity={0.7}
        >
          {loadingShift ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : nextShift ? (
            <View style={styles.shiftRow}>
              <View style={[styles.shiftIconWrap, { backgroundColor: colors.primary + '15' }]}>
                <IconSymbol
                  ios_icon_name="calendar"
                  android_material_icon_name="event"
                  size={24}
                  color={colors.primary}
                />
              </View>
              <View style={styles.shiftInfo}>
                <Text style={[styles.shiftTitle, { color: colors.text }]}>
                  {t('profile_dashboard.your_next_shift', 'Your Next Shift')}
                </Text>
                <Text style={[styles.shiftDateTime, { color: colors.textSecondary }]}>
                  {formatShiftDate(nextShift.shift_date)} · {formatTime(nextShift.start_time)} - {formatTime(nextShift.end_time)}
                </Text>
                {nextShift.roles && nextShift.roles.length > 0 && (
                  <View style={styles.shiftRolesRow}>
                    {nextShift.roles.map((role, idx) => (
                      <View key={idx} style={[styles.roleBadge, { backgroundColor: colors.primary + '15' }]}>
                        <Text style={[styles.roleBadgeText, { color: colors.primary }]}>{role}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={20}
                color={colors.textSecondary}
              />
            </View>
          ) : (
            <View style={styles.shiftRow}>
              <View style={[styles.shiftIconWrap, { backgroundColor: colors.textSecondary + '15' }]}>
                <IconSymbol
                  ios_icon_name="calendar"
                  android_material_icon_name="event"
                  size={24}
                  color={colors.textSecondary}
                />
              </View>
              <View style={styles.shiftInfo}>
                <Text style={[styles.noShiftText, { color: colors.textSecondary }]}>
                  {t('profile_dashboard.no_upcoming_shifts', 'No upcoming shifts scheduled')}
                </Text>
              </View>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={20}
                color={colors.textSecondary}
              />
            </View>
          )}
        </TouchableOpacity>

        {/* 4. Profile Information - Collapsible */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => setProfileInfoExpanded(!profileInfoExpanded)}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.profile_information')}</Text>
            <IconSymbol
              ios_icon_name={profileInfoExpanded ? "chevron.up" : "chevron.down"}
              android_material_icon_name={profileInfoExpanded ? "expand-less" : "expand-more"}
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>

          {profileInfoExpanded && (
            <>
              {/* Username (Read-only) */}
              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('profile.username')}</Text>
                <View style={[styles.input, styles.inputDisabled, { borderColor: colors.border }]}>
                  <Text style={[styles.inputTextDisabled, { color: colors.textSecondary }]}>{user?.username}</Text>
                </View>
                <Text style={[styles.fieldNote, { color: colors.textSecondary }]}>{t('profile.username_cannot_change')}</Text>
              </View>

              {/* Full Name (Read-only) */}
              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('profile.full_name')}</Text>
                <View style={[styles.input, styles.inputDisabled, { borderColor: colors.border }]}>
                  <Text style={[styles.inputTextDisabled, { color: colors.textSecondary }]}>{user?.name}</Text>
                </View>
                <Text style={[styles.fieldNote, { color: colors.textSecondary }]}>{t('profile.name_cannot_change')}</Text>
              </View>

              {/* Email (Editable) */}
              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('profile.email')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }, !isEditing && styles.inputDisabled]}
                  value={email}
                  onChangeText={setEmail}
                  editable={isEditing}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {/* Phone Number (Editable) */}
              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('profile.phone_number')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }, !isEditing && styles.inputDisabled]}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  editable={isEditing}
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {/* Action Buttons */}
              {!isEditing ? (
                <TouchableOpacity style={[styles.editButton, { backgroundColor: colors.primary }]} onPress={() => setIsEditing(true)}>
                  <IconSymbol
                    ios_icon_name="pencil"
                    android_material_icon_name="edit"
                    size={20}
                    color="#FFFFFF"
                  />
                  <Text style={styles.editButtonText}>{t('profile.edit_profile')}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.buttonRow}>
                  <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.textSecondary }]} onPress={handleCancel}>
                    <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
                    {saving ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveButtonText}>{t('profile.save_changes')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        {/* 5. My Quick Tools */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.quickToolsHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('profile_dashboard.my_quick_tools', 'My Quick Tools')}
            </Text>
            <TouchableOpacity
              onPress={() => setShowToolSelector(true)}
              style={[styles.editToolsButton, { backgroundColor: colors.primary + '15' }]}
            >
              <IconSymbol
                ios_icon_name="pencil"
                android_material_icon_name="edit"
                size={16}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.quickToolsGrid}>
            {resolvedTools.map((tool) => {
              if (!tool) return null;
              return (
                <TouchableOpacity
                  key={tool.id}
                  style={styles.quickToolItem}
                  onPress={() => router.push(tool.route as any)}
                >
                  <View style={[styles.quickToolIconCircle, { backgroundColor: colors.primary + '15' }]}>
                    <IconSymbol
                      ios_icon_name={tool.iosIcon as any}
                      android_material_icon_name={tool.androidIcon as any}
                      size={28}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={[styles.quickToolLabel, { color: colors.text }]} numberOfLines={2}>
                    {t(tool.labelKey, tool.id)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <QuickToolsSelector
        visible={showToolSelector}
        selectedToolIds={userToolIds}
        onSave={handleSaveQuickTools}
        onClose={() => setShowToolSelector(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  // 1. Header Card
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  headerAvatarContainer: {
    position: 'relative',
  },
  headerAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  headerCameraIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  headerName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerJobTitle: {
    fontSize: 13,
    marginTop: 2,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
    gap: 4,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerChips: {
    alignItems: 'flex-end',
    gap: 6,
  },
  bucksChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  bucksText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  gameScoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  gameScoreIcon: {
    fontSize: 13,
  },
  gameScoreText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  // 2. Quick Actions
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickActionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  quickActionIconWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  quickActionBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
  },
  quickActionLabel: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  // 3. Next Shift
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shiftIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shiftInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  shiftTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  shiftDateTime: {
    fontSize: 13,
    marginTop: 2,
  },
  shiftRolesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noShiftText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  // 4. Profile Information
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  fieldContainer: {
    marginTop: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  inputDisabled: {
    backgroundColor: '#E8E8E8',
  },
  inputTextDisabled: {
    fontSize: 16,
  },
  fieldNote: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
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
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
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
  // 5. Quick Tools
  quickToolsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  editToolsButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickToolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickToolItem: {
    width: '23%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  quickToolIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickToolLabel: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
});
