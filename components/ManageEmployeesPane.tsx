import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Animated,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
  Alert,
  Share,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import { useOrgJobTitles } from '@/hooks/useOrgJobTitles';
import { supabase } from '@/app/integrations/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';
import GlassCard from '@/components/GlassCard';
import MultiSelectField from '@/components/MultiSelectField';
import { displayHandle } from '@/utils/displayHandle';
import { getOrgDirectory } from '@/utils/orgDirectory';
import { fonts } from '@/constants/fonts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

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

interface Props {
  width: number;
  scrollRef: React.RefObject<any>;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  headerHeight: number;
  minHeight?: number;
  collapseTranslate?: any; // Animated value (same as the header overlay) so the A-Z rail tracks the collapse
}

export default function ManageEmployeesPane({ width, scrollRef, onScroll, headerHeight, minHeight, collapseTranslate }: Props) {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();
  const { organizationId, organization } = useOrganization();
  const { user } = useAuth();
  const { open: openMiniProfile } = useMiniProfile();
  const { activeJobTitles: JOB_TITLE_OPTIONS } = useOrgJobTitles();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    username: '',
    name: '',
    email: '',
    job_titles: [] as string[],
    phone_number: '',
    role: 'employee',
  });

  const fetchEmployees = useCallback(async () => {
    const actorId = user?.id;
    if (!actorId) return;
    try {
      // Hardened roster read: org is derived server-side from the actor; sort by name client-side
      // to preserve the previous .order('name', { ascending: true }) behavior.
      const roster = await getOrgDirectory(actorId);
      const sorted = [...roster].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setEmployees(sorted as unknown as Employee[]);
    } catch (e) {
      console.error('Employees pane fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { fetchEmployees(); }, [fetchEmployees]));

  const filtered = employees
    .filter((e) => (showInactive ? !e.is_active : e.is_active))
    .filter((e) => (selectedLetter ? e.name.toUpperCase().startsWith(selectedLetter) : true));

  const profileUrl = (url?: string | null) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return supabase.storage.from('profile-pictures').getPublicUrl(url).data.publicUrl;
  };

  const jobTitlesDisplay = (e: Employee) =>
    e.job_titles && e.job_titles.length > 0 ? e.job_titles.join(', ') : e.job_title || t('employee_editor.no_job_title', 'No job title');

  const handleAdd = async () => {
    if (!newEmployee.username || !newEmployee.name || !newEmployee.email) {
      Alert.alert(t('common.error', 'Error'), t('employee_editor.error_required_fields', 'Please fill in all required fields'));
      return;
    }
    if (newEmployee.job_titles.length === 0) {
      Alert.alert(t('common.error', 'Error'), t('employee_editor.error_job_title', 'Please select at least one job title'));
      return;
    }
    setSubmitting(true);
    try {
      const { data: newId, error } = await supabase.rpc('create_user', {
        p_username: newEmployee.username,
        p_name: newEmployee.name,
        p_email: newEmployee.email,
        p_job_title: newEmployee.job_titles[0],
        p_phone_number: newEmployee.phone_number,
        p_role: newEmployee.role,
        p_password: organization?.default_password || 'changeme',
        p_organization_id: organizationId!,
        p_actor_id: user?.id,
      });
      if (error) throw error;
      const { error: jtError } = await supabase.rpc('update_user_job_titles', {
        p_user_id: newId,
        p_job_titles: newEmployee.job_titles,
        p_organization_id: organizationId!,
        p_actor_id: user?.id,
      });
      if (jtError) throw jtError;
      setSubmitting(false);
      setShowAddModal(false);
      setNewEmployee({ username: '', name: '', email: '', job_titles: [], phone_number: '', role: 'employee' });
      Alert.alert(t('common.success', 'Success'), t('employee_editor.employee_added', 'Employee added successfully'));
      fetchEmployees();
    } catch (e: any) {
      setSubmitting(false);
      Alert.alert(t('common.error', 'Error'), e?.message || t('employee_editor.error_fetch', 'Something went wrong'));
    }
  };

  const handleToggleActive = async (emp: Employee) => {
    try {
      const { error } = await supabase.rpc('update_user_active_status', {
        p_user_id: emp.id,
        p_is_active: !emp.is_active,
        p_organization_id: organizationId!,
        p_actor_id: user?.id,
      });
      if (error) throw error;
      fetchEmployees();
    } catch (e) {
      Alert.alert(t('common.error', 'Error'), t('employee_editor.error_toggle_status', 'Could not update status'));
    }
  };

  const handleDelete = (emp: Employee) => {
    Alert.alert(
      t('employee_editor.delete_title', 'Delete Employee'),
      t('employee_editor.delete_confirm', {
        name: emp.name,
        defaultValue: 'Delete {{name}}? This permanently removes their account and cannot be undone.',
      }),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('employee_editor.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await (supabase.rpc as any)('delete_employee', {
                p_actor_id: user?.id,
                p_employee_id: emp.id,
                p_organization_id: organizationId!,
              });
              if (error) throw error;
              fetchEmployees();
            } catch (e: any) {
              Alert.alert(t('common.error', 'Error'), e?.message || t('employee_editor.error_delete', 'Could not delete employee'));
            }
          },
        },
      ]
    );
  };

  const shareMessage = t('manager_manage.emp_share_msg', {
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
      Alert.alert(t('manager_manage.emp_share_title', 'Invite Employees'), t('manager_manage.emp_no_code', 'No sign-up code is available yet.'));
      return;
    }
    try {
      await Share.share({ message: shareMessage });
    } catch {}
  };

  return (
    <View style={{ width, flex: 1 }}>
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight, minHeight }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        nestedScrollEnabled
        bounces={false}
        overScrollMode="never"
        onScroll={onScroll}
      >
        {/* Control row */}
        <View style={styles.controls}>
          <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: colors.primary }]} onPress={() => setShowAddModal(true)} activeOpacity={0.85}>
            <IconSymbol ios_icon_name="person.badge.plus" android_material_icon_name="person-add" size={15} color={colors.fireText} />
            <Text style={[styles.ctrlBtnText, { color: colors.fireText }]}>{t('manager_manage.emp_add', 'Add')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, borderWidth: 1 }]} onPress={() => setShowShareModal(true)} activeOpacity={0.85}>
            <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="ios-share" size={15} color={colors.text} />
            <Text style={[styles.ctrlBtnText, { color: colors.text }]}>{t('manager_manage.emp_share', 'Share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.inactiveChip, { backgroundColor: showInactive ? colors.tint + '24' : colors.surface, borderColor: showInactive ? colors.tint + '66' : colors.surfaceBorder }]}
            onPress={() => setShowInactive((v) => !v)}
            activeOpacity={0.8}
          >
            <IconSymbol
              ios_icon_name={showInactive ? 'checkmark.circle.fill' : 'circle'}
              android_material_icon_name={showInactive ? 'check-circle' : 'radio-button-unchecked'}
              size={14}
              color={showInactive ? colors.tint : colors.textSecondary}
            />
            <Text style={[styles.inactiveChipText, { color: showInactive ? colors.tint : colors.textSecondary }]}>{t('employee_editor.show_inactive', 'Show Inactive')}</Text>
          </TouchableOpacity>
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.center}><ActivityIndicator size="small" color={colors.primary} /></View>
        ) : filtered.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('employee_editor.no_employees', 'No employees found')}</Text>
        ) : (
          filtered.map((emp) => {
            const pic = profileUrl(emp.profile_picture_url);
            return (
              <View key={emp.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
                <View style={styles.cardInfo}>
                  <View style={[styles.avatar, { backgroundColor: colors.thumbPlaceholder }]}>
                    {pic ? (
                      <Image source={{ uri: pic }} style={styles.avatarImg} />
                    ) : (
                      <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={22} color={colors.textSecondary} />
                    )}
                  </View>
                  <View style={styles.cardText}>
                    <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{emp.name}</Text>
                    <Text style={[styles.cardRole, { color: colors.textSecondary }]} numberOfLines={1}>{jobTitlesDisplay(emp)}</Text>
                    <View style={styles.cardMetaRow}>
                      {!!displayHandle(emp.name, emp.username) && (
                        <Text style={[styles.cardUser, { color: colors.textSecondary }]} numberOfLines={1}>@{displayHandle(emp.name, emp.username)}</Text>
                      )}
                      {/* Active/inactive status — tap to toggle (quick deactivate/reactivate) */}
                      <TouchableOpacity
                        onPress={() => handleToggleActive(emp)}
                        hitSlop={6}
                        style={[styles.statusChip, { backgroundColor: (emp.is_active ? '#4CAF50' : '#F44336') + '1F' }]}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.statusDot, { backgroundColor: emp.is_active ? '#4CAF50' : '#F44336' }]} />
                        <Text style={[styles.statusChipText, { color: emp.is_active ? '#4CAF50' : '#F44336' }]}>
                          {emp.is_active ? t('employee_editor.active', 'Active') : t('employee_editor.inactive', 'Inactive')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => openMiniProfile(emp.id)} hitSlop={6} style={styles.actionBtn}>
                    <IconSymbol ios_icon_name="person.crop.circle" android_material_icon_name="account-circle" size={21} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push({ pathname: '/employee-detail', params: { employeeId: emp.id } })} hitSlop={6} style={styles.actionBtn}>
                    <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.tint} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(emp)} hitSlop={6} style={styles.actionBtn}>
                    <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color="#F44336" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </Animated.ScrollView>

      {/* A-Z filter rail — tracks the header collapse so it stays just below the pinned tabs */}
      <Animated.View style={[styles.azWrap, { top: headerHeight + 4, transform: collapseTranslate ? [{ translateY: collapseTranslate }] : undefined }]} pointerEvents="box-none">
        <GlassCard variant="surface" radius={13} style={styles.azCard}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.azContent}>
            <TouchableOpacity style={[styles.azBtn, selectedLetter === null && { backgroundColor: colors.tint }]} onPress={() => setSelectedLetter(null)}>
              <Text style={[styles.azText, { color: selectedLetter === null ? colors.fireText : colors.textSecondary }]}>•</Text>
            </TouchableOpacity>
            {ALPHABET.map((l) => (
              <TouchableOpacity key={l} style={[styles.azBtn, selectedLetter === l && { backgroundColor: colors.tint }]} onPress={() => setSelectedLetter(selectedLetter === l ? null : l)}>
                <Text style={[styles.azText, { color: selectedLetter === l ? colors.fireText : colors.textSecondary }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </GlassCard>
      </Animated.View>

      {/* Add Employee modal */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.hairline }]}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{t('employee_editor.add_employee_title', 'Add Employee')}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)} hitSlop={8}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
              <Field label={t('employee_editor.username_label', 'Username')} colors={colors}>
                <TextInput style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]} value={newEmployee.username} onChangeText={(v) => setNewEmployee((p) => ({ ...p, username: v }))} placeholder={t('employee_editor.username_placeholder', 'Username')} placeholderTextColor={colors.textSecondary} autoCapitalize="none" />
              </Field>
              <Field label={t('employee_editor.full_name_label', 'Full Name')} colors={colors}>
                <TextInput style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]} value={newEmployee.name} onChangeText={(v) => setNewEmployee((p) => ({ ...p, name: v }))} placeholder={t('employee_editor.full_name_placeholder', 'Full name')} placeholderTextColor={colors.textSecondary} />
              </Field>
              <Field label={t('employee_editor.email_label', 'Email')} colors={colors}>
                <TextInput style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]} value={newEmployee.email} onChangeText={(v) => setNewEmployee((p) => ({ ...p, email: v }))} placeholder={t('employee_editor.email_placeholder', 'Email')} placeholderTextColor={colors.textSecondary} keyboardType="email-address" autoCapitalize="none" />
              </Field>
              <Field label={t('employee_editor.job_titles_label', 'Job Titles')} colors={colors}>
                <MultiSelectField
                  options={JOB_TITLE_OPTIONS}
                  selected={newEmployee.job_titles}
                  onChange={(next) => setNewEmployee((p) => ({ ...p, job_titles: next }))}
                  title={t('employee_editor.job_titles_label', 'Job Titles')}
                  placeholder={t('employee_editor.job_titles_label', 'Job Titles')}
                />
              </Field>
              <Field label={t('employee_editor.phone_number_label', 'Phone Number')} colors={colors}>
                <TextInput style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]} value={newEmployee.phone_number} onChangeText={(v) => setNewEmployee((p) => ({ ...p, phone_number: v }))} placeholder={t('employee_editor.phone_number_placeholder', 'Phone number')} placeholderTextColor={colors.textSecondary} keyboardType="phone-pad" />
              </Field>
              <Field label={t('employee_editor.role_label', 'Role')} colors={colors}>
                <View style={styles.roleRow}>
                  {(['employee', 'manager'] as const).map((r) => (
                    <TouchableOpacity key={r} style={[styles.roleBtn, { backgroundColor: newEmployee.role === r ? colors.primary : colors.surface, borderColor: newEmployee.role === r ? 'transparent' : colors.surfaceBorder }]} onPress={() => setNewEmployee((p) => ({ ...p, role: r }))} activeOpacity={0.85}>
                      <Text style={[styles.roleText, { color: newEmployee.role === r ? colors.fireText : colors.textSecondary }]}>{t('employee_editor.' + r, r)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>
              <Field label={t('employee_editor.default_password_label', 'Default Password')} colors={colors}>
                <View style={[styles.input, styles.inputDisabled, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
                  <Text style={{ color: colors.textSecondary, fontFamily: fonts.mono.medium, fontSize: 14 }}>{organization?.default_password || 'changeme'}</Text>
                </View>
                <Text style={[styles.note, { color: colors.textSecondary }]}>{t('employee_editor.default_password_note', 'New employees use this to log in, then set their own.')}</Text>
              </Field>
              <TouchableOpacity style={[styles.submit, { backgroundColor: colors.primary }]} onPress={handleAdd} disabled={submitting} activeOpacity={0.85}>
                {submitting ? <ActivityIndicator size="small" color={colors.fireText} /> : <Text style={[styles.submitText, { color: colors.fireText }]}>{t('employee_editor.add_employee_button', 'Add Employee')}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Share / invite modal */}
      <Modal visible={showShareModal} transparent animationType="fade" onRequestClose={() => setShowShareModal(false)}>
        <Pressable_ onPress={() => setShowShareModal(false)} style={styles.shareScrim}>
          <View style={[styles.shareCard, { backgroundColor: colors.card, borderColor: colors.glassBorder }]}>
            <View style={styles.shareHeader}>
              <View style={[styles.shareIcon, { backgroundColor: colors.tint + '26' }]}>
                <IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="group-add" size={18} color={colors.tint} />
              </View>
              <Text style={[styles.shareTitle, { color: colors.text }]}>{t('manager_manage.emp_share_title', 'Invite Employees')}</Text>
            </View>
            <Text style={[styles.shareCodeLabel, { color: colors.textSecondary }]}>{t('manager_manage.emp_share_code_label', 'Sign-up code')}</Text>
            <Text style={[styles.shareCode, { color: colors.tint }]}>{organization?.join_code || '—'}</Text>
            <View style={styles.shareBtns}>
              <TouchableOpacity style={[styles.shareBtn, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]} onPress={copyCode} activeOpacity={0.85}>
                <IconSymbol ios_icon_name="doc.on.doc" android_material_icon_name="content-copy" size={15} color={colors.text} />
                <Text style={[styles.shareBtnText, { color: colors.text }]}>{copied ? t('manager_manage.emp_copied', 'Copied!') : t('manager_manage.emp_copy', 'Copy')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.shareBtn, { backgroundColor: colors.primary, borderColor: 'transparent' }]} onPress={shareCode} activeOpacity={0.85}>
                <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="ios-share" size={15} color={colors.fireText} />
                <Text style={[styles.shareBtnText, { color: colors.fireText }]}>{t('manager_manage.emp_share_via', 'Share')}</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.sharePw, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
              <Text style={[styles.sharePwLabel, { color: colors.textSecondary }]}>{t('manager_manage.emp_default_pw_label', 'Default password (read-only)')}</Text>
              <Text style={[styles.sharePwVal, { color: colors.text }]}>{organization?.default_password || '—'}</Text>
            </View>
            <Text style={[styles.shareHint, { color: colors.textSecondary }]}>
              {t('manager_manage.emp_share_hint', "Share this code so new staff can create their own account. They'll be asked to set a new password on first login.")}
            </Text>
            <TouchableOpacity style={[styles.shareClose, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]} onPress={() => setShowShareModal(false)} activeOpacity={0.85}>
              <Text style={[styles.shareBtnText, { color: colors.text }]}>{t('manager_manage.go_back', 'Go Back')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable_>
      </Modal>
    </View>
  );
}

// Small labelled field wrapper for the add form.
function Field({ label, colors, children }: { label: string; colors: ReturnType<typeof useThemeColors>; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      {children}
    </View>
  );
}

// Pressable that swallows inner taps (so the share card doesn't dismiss).
function Pressable_({ onPress, style, children }: { onPress: () => void; style: any; children: React.ReactNode }) {
  return (
    <TouchableOpacity activeOpacity={1} style={style} onPress={onPress}>
      <TouchableOpacity activeOpacity={1} onPress={() => {}}>{children}</TouchableOpacity>
    </TouchableOpacity>
  );
}

const AZ_WIDTH = 36;
const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingRight: 16 + AZ_WIDTH + 6, paddingBottom: 150 },

  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 12 },
  ctrlBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 13, borderRadius: 12 },
  ctrlBtnText: { fontFamily: fonts.display.semibold, fontSize: 13 },
  inactiveChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, marginLeft: 'auto' },
  inactiveChipText: { fontFamily: fonts.body.medium, fontSize: 11 },

  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { fontFamily: fonts.body.regular, fontSize: 14, textAlign: 'center', marginTop: 40 },

  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 14, padding: 11, marginBottom: 10 },
  cardInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 11 },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%' },
  cardText: { flex: 1, minWidth: 0 },
  cardName: { fontFamily: fonts.display.semibold, fontSize: 14.5 },
  cardRole: { fontFamily: fonts.body.regular, fontSize: 12, marginTop: 1 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  cardUser: { fontFamily: fonts.mono.medium, fontSize: 10.5, flexShrink: 1 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusChipText: { fontFamily: fonts.mono.medium, fontSize: 9.5 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionBtn: { padding: 3 },

  azWrap: { position: 'absolute', right: 6, bottom: 96, width: AZ_WIDTH, zIndex: 6 },
  azCard: { paddingVertical: 5 },
  azContent: { alignItems: 'center', paddingVertical: 2 },
  azBtn: { width: AZ_WIDTH - 6, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginVertical: 1 },
  azText: { fontFamily: fonts.mono.semibold, fontSize: 13 },

  // Add sheet
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1 },
  sheetTitle: { fontFamily: fonts.display.bold, fontSize: 19 },
  form: { paddingHorizontal: 22, paddingTop: 14 },
  field: { marginBottom: 16 },
  fieldLabel: { fontFamily: fonts.display.semibold, fontSize: 13, marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontFamily: fonts.body.regular, fontSize: 14 },
  inputDisabled: { opacity: 0.7, justifyContent: 'center' },
  note: { fontFamily: fonts.body.regular, fontSize: 11, marginTop: 5, fontStyle: 'italic' },
  jobBox: { borderWidth: 1, borderRadius: 10, padding: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 10 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { fontFamily: fonts.body.regular, fontSize: 14 },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  roleText: { fontFamily: fonts.display.semibold, fontSize: 14 },
  submit: { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4, marginBottom: 30 },
  submitText: { fontFamily: fonts.display.bold, fontSize: 16 },

  // Share modal
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
