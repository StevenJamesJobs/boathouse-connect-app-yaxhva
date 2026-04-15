import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  StyleProp,
  ViewStyle,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { JOB_TITLES } from '@/constants/jobTitles';

export interface ShiftLike {
  id: string;
  upload_id?: string;
  user_id: string | null;
  employee_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[];
  is_closer: boolean;
  is_opener: boolean;
  is_training: boolean;
  room_assignment: string | null;
}

type Mode = 'add' | 'edit';

interface ShiftEditFormProps {
  visible: boolean;
  mode: Mode;
  /** Required when mode === 'edit' */
  shift?: ShiftLike;
  /** For add mode — who this shift belongs to */
  employeeName?: string;
  userId?: string | null;
  /** For add mode — which upload to attach to. If omitted (Roster case), the form
   *  finds or creates a schedule_uploads row covering defaultDate. */
  uploadId?: string;
  /** For add mode — the date to pre-fill (defaults to today). */
  defaultDate?: Date;
  /** For add mode — current auth user id, used when auto-creating an upload row. */
  currentUserId?: string;
  colors: {
    primary: string;
    background: string;
    text: string;
    textSecondary: string;
    card: string;
    border: string;
  };
  onClose: () => void;
  onSaved: () => void;
}

function parseTimeToDate(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTimeDisplay(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateHuman(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
}

/** Returns the Monday on/before the given date (week_start) and the following Sunday (week_end). */
function weekBounds(date: Date): { start: string; end: string } {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diffToMon = (day + 6) % 7; // Mon=0, Tue=1, ... Sun=6
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toISODate(monday), end: toISODate(sunday) };
}

/**
 * Find or create a schedule_uploads row whose week covers the given date.
 * Used when a manager adds a shift from the Roster and we don't have an
 * upload context to attach it to.
 */
async function resolveUploadIdForDate(
  shiftDate: string,
  currentUserId: string | undefined
): Promise<string> {
  // Look for a completed upload whose week contains shiftDate
  const { data: existing, error: findErr } = await supabase
    .from('schedule_uploads')
    .select('id')
    .lte('week_start', shiftDate)
    .gte('week_end', shiftDate)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1);

  if (findErr) throw findErr;
  if (existing && existing.length > 0) return existing[0].id;

  // None found — create a placeholder "Manual Entry" upload for the containing week
  const { start, end } = weekBounds(new Date(shiftDate + 'T00:00:00'));
  const { data: created, error: createErr } = await supabase
    .from('schedule_uploads')
    .insert({
      uploaded_by: currentUserId,
      file_url: '',
      file_name: 'Manual Entry',
      week_start: start,
      week_end: end,
      status: 'completed',
      parsed_shifts_count: 0,
    })
    .select('id')
    .single();

  if (createErr) throw createErr;
  return created.id;
}

export default function ShiftEditForm({
  visible,
  mode,
  shift,
  employeeName,
  userId,
  uploadId,
  defaultDate,
  currentUserId,
  colors,
  onClose,
  onSaved,
}: ShiftEditFormProps) {
  const [saving, setSaving] = useState(false);

  const [shiftDate, setShiftDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date>(new Date());
  const [role, setRole] = useState<string>('Server');
  const [isOpener, setIsOpener] = useState(false);
  const [isCloser, setIsCloser] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [roomAssignment, setRoomAssignment] = useState<string | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);

  // Re-initialize form state each time the modal opens
  useEffect(() => {
    if (!visible) return;

    if (mode === 'edit' && shift) {
      setShiftDate(new Date(shift.shift_date + 'T12:00:00'));
      setStartTime(parseTimeToDate(shift.start_time));
      setEndTime(parseTimeToDate(shift.end_time));
      setRole(shift.roles.length > 0 ? shift.roles[0] : 'Server');
      setIsOpener(shift.is_opener);
      setIsCloser(shift.is_closer);
      setIsTraining(shift.is_training);
      setRoomAssignment(shift.room_assignment);
    } else {
      setShiftDate(defaultDate ? new Date(defaultDate) : new Date());
      const startDefault = new Date();
      startDefault.setHours(16, 30, 0, 0);
      setStartTime(startDefault);
      const endDefault = new Date();
      endDefault.setHours(22, 0, 0, 0);
      setEndTime(endDefault);
      setRole('Server');
      setIsOpener(false);
      setIsCloser(false);
      setIsTraining(false);
      setRoomAssignment(null);
    }

    setShowDatePicker(false);
    setShowStartTimePicker(false);
    setShowEndTimePicker(false);
    setShowRolePicker(false);
  }, [visible, mode, shift, defaultDate]);

  const displayEmployeeName = mode === 'edit' ? shift?.employee_name : employeeName;

  const handleSave = async () => {
    try {
      setSaving(true);

      const dateStr = toISODate(shiftDate);
      const startStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(
        startTime.getMinutes()
      ).padStart(2, '0')}`;
      const endStr = `${String(endTime.getHours()).padStart(2, '0')}:${String(
        endTime.getMinutes()
      ).padStart(2, '0')}`;

      const shiftData = {
        shift_date: dateStr,
        start_time: startStr,
        end_time: endStr,
        roles: [role],
        is_opener: isOpener,
        is_closer: isCloser,
        is_training: isTraining,
      };

      if (mode === 'edit' && shift) {
        const { error } = await supabase
          .from('staff_schedules')
          .update(shiftData)
          .eq('id', shift.id);
        if (error) throw error;

        onClose();
        onSaved();
        return;
      }

      // ADD mode
      let targetUploadId = uploadId;
      if (!targetUploadId) {
        targetUploadId = await resolveUploadIdForDate(dateStr, currentUserId);
      }

      const { error: insertErr } = await supabase.from('staff_schedules').insert({
        upload_id: targetUploadId,
        user_id: userId ?? null,
        employee_name: displayEmployeeName || '',
        ...shiftData,
        room_assignment: roomAssignment,
      });
      if (insertErr) throw insertErr;

      // Keep parsed_shifts_count in sync when possible (best-effort)
      try {
        const { count } = await supabase
          .from('staff_schedules')
          .select('id', { count: 'exact', head: true })
          .eq('upload_id', targetUploadId);
        if (typeof count === 'number') {
          await supabase
            .from('schedule_uploads')
            .update({ parsed_shifts_count: count })
            .eq('id', targetUploadId);
        }
      } catch (_) {
        /* non-fatal */
      }

      onClose();
      onSaved();
    } catch (error: any) {
      console.error('Error saving shift:', error);
      Alert.alert('Error', error.message || 'Failed to save shift.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (mode !== 'edit' || !shift) return;
    Alert.alert(
      'Delete Shift',
      `Remove ${shift.employee_name}'s shift on ${formatDateHuman(shift.shift_date)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              const { error } = await supabase
                .from('staff_schedules')
                .delete()
                .eq('id', shift.id);
              if (error) throw error;

              // Best-effort: update parsed_shifts_count
              if (shift.upload_id) {
                try {
                  const { count } = await supabase
                    .from('staff_schedules')
                    .select('id', { count: 'exact', head: true })
                    .eq('upload_id', shift.upload_id);
                  if (typeof count === 'number') {
                    await supabase
                      .from('schedule_uploads')
                      .update({ parsed_shifts_count: count })
                      .eq('id', shift.upload_id);
                  }
                } catch (_) {
                  /* non-fatal */
                }
              }

              onClose();
              onSaved();
            } catch (error: any) {
              console.error('Error deleting shift:', error);
              Alert.alert('Error', error.message || 'Failed to delete shift.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalCancel} disabled={saving}>
            <Text style={[styles.modalCancelText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {mode === 'edit' ? 'Edit Shift' : 'Add Shift'}
          </Text>
          <TouchableOpacity onPress={handleSave} style={styles.modalSave} disabled={saving}>
            <Text style={[styles.modalSaveText, { color: colors.primary }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
          {/* Employee name */}
          <View style={styles.formSection}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Employee</Text>
            <Text style={[styles.formValue, { color: colors.text }]}>{displayEmployeeName}</Text>
          </View>

          {/* Date */}
          <View style={styles.formSection}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Date</Text>
            <TouchableOpacity
              style={[styles.pickerButton, { backgroundColor: colors.card }]}
              onPress={() => setShowDatePicker(!showDatePicker)}
            >
              <IconSymbol
                ios_icon_name="calendar"
                android_material_icon_name="event"
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.pickerText, { color: colors.text }]}>{formatDateDisplay(shiftDate)}</Text>
              <IconSymbol
                ios_icon_name="chevron.down"
                android_material_icon_name="expand-more"
                size={16}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={shiftDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant="light"
                onChange={(_event, date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (date) setShiftDate(date);
                }}
                style={styles.datePicker}
              />
            )}
          </View>

          {/* Start Time */}
          <View style={styles.formSection}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Start Time</Text>
            <TouchableOpacity
              style={[styles.pickerButton, { backgroundColor: colors.card }]}
              onPress={() => setShowStartTimePicker(!showStartTimePicker)}
            >
              <IconSymbol
                ios_icon_name="clock"
                android_material_icon_name="schedule"
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.pickerText, { color: colors.text }]}>{formatTimeDisplay(startTime)}</Text>
              <IconSymbol
                ios_icon_name="chevron.down"
                android_material_icon_name="expand-more"
                size={16}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            {showStartTimePicker && (
              <DateTimePicker
                value={startTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant="light"
                minuteInterval={5}
                onChange={(_event, date) => {
                  if (Platform.OS === 'android') setShowStartTimePicker(false);
                  if (date) setStartTime(date);
                }}
                style={styles.datePicker}
              />
            )}
          </View>

          {/* End Time */}
          <View style={styles.formSection}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>End Time</Text>
            <TouchableOpacity
              style={[styles.pickerButton, { backgroundColor: colors.card }]}
              onPress={() => setShowEndTimePicker(!showEndTimePicker)}
            >
              <IconSymbol
                ios_icon_name="clock.fill"
                android_material_icon_name="schedule"
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.pickerText, { color: colors.text }]}>{formatTimeDisplay(endTime)}</Text>
              <IconSymbol
                ios_icon_name="chevron.down"
                android_material_icon_name="expand-more"
                size={16}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            {showEndTimePicker && (
              <DateTimePicker
                value={endTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant="light"
                minuteInterval={5}
                onChange={(_event, date) => {
                  if (Platform.OS === 'android') setShowEndTimePicker(false);
                  if (date) setEndTime(date);
                }}
                style={styles.datePicker}
              />
            )}
          </View>

          {/* Role picker */}
          <View style={styles.formSection}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Job Title / Role</Text>
            <TouchableOpacity
              style={[styles.pickerButton, { backgroundColor: colors.card }]}
              onPress={() => setShowRolePicker(!showRolePicker)}
            >
              <IconSymbol
                ios_icon_name="person.fill"
                android_material_icon_name="person"
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.pickerText, { color: colors.text }]}>{role}</Text>
              <IconSymbol
                ios_icon_name="chevron.down"
                android_material_icon_name="expand-more"
                size={16}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            {showRolePicker && (
              <View style={[styles.rolePickerList, { backgroundColor: colors.card }]}>
                {JOB_TITLES.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.rolePickerItem,
                      role === r && { backgroundColor: colors.primary + '15' },
                    ]}
                    onPress={() => {
                      setRole(r);
                      setShowRolePicker(false);
                    }}
                  >
                    <Text style={[styles.rolePickerText, { color: role === r ? colors.primary : colors.text }]}>
                      {r}
                    </Text>
                    {role === r && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={16}
                        color={colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Shift Tags: Opener / Closer / Training */}
          <View style={styles.formSection}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Shift Tags</Text>
            <View style={styles.toggleRow}>
              <ToggleChip
                active={isOpener}
                onPress={() => {
                  setIsOpener(!isOpener);
                  if (!isOpener) setIsCloser(false);
                }}
                label="Opener"
                iconIos="sunrise.fill"
                iconMat="wb-sunny"
                activeColor="#4CAF50"
                colors={colors}
              />
              <ToggleChip
                active={isCloser}
                onPress={() => {
                  setIsCloser(!isCloser);
                  if (!isCloser) setIsOpener(false);
                }}
                label="Closer"
                iconIos="moon.fill"
                iconMat="nightlight-round"
                activeColor="#FF9800"
                colors={colors}
              />
              <ToggleChip
                active={isTraining}
                onPress={() => setIsTraining(!isTraining)}
                label="Training"
                iconIos="graduationcap.fill"
                iconMat="school"
                activeColor="#2196F3"
                colors={colors}
              />
            </View>
          </View>

          {/* Delete button (edit mode only) */}
          {mode === 'edit' && (
            <TouchableOpacity
              style={[styles.deleteButton, { borderColor: '#F44336' }]}
              onPress={handleDelete}
              disabled={saving}
            >
              <IconSymbol
                ios_icon_name="trash.fill"
                android_material_icon_name="delete"
                size={16}
                color="#F44336"
              />
              <Text style={styles.deleteButtonText}>Delete Shift</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

interface ToggleChipProps {
  active: boolean;
  onPress: () => void;
  label: string;
  iconIos: string;
  iconMat: string;
  activeColor: string;
  colors: { card: string; textSecondary: string };
}

function ToggleChip({ active, onPress, label, iconIos, iconMat, activeColor, colors }: ToggleChipProps) {
  const containerStyle: StyleProp<ViewStyle> = [
    styles.toggleButton,
    { backgroundColor: active ? activeColor + '20' : colors.card },
    active && { borderColor: activeColor, borderWidth: 1 },
  ];
  return (
    <TouchableOpacity style={containerStyle} onPress={onPress}>
      <IconSymbol
        ios_icon_name={iconIos}
        android_material_icon_name={iconMat}
        size={16}
        color={active ? activeColor : colors.textSecondary}
      />
      <Text style={[styles.toggleText, { color: active ? activeColor : colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 16 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCancel: { width: 60 },
  modalCancelText: { fontSize: 16, fontWeight: '500' },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalSave: { width: 60, alignItems: 'flex-end' },
  modalSaveText: { fontSize: 16, fontWeight: '600' },
  form: { flex: 1 },
  formContent: { padding: 16, paddingBottom: 40 },
  formSection: { marginBottom: 20 },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formValue: { fontSize: 17, fontWeight: '600' },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  pickerText: { flex: 1, fontSize: 16, fontWeight: '500' },
  datePicker: { marginTop: 8 },
  rolePickerList: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  rolePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.1)',
  },
  rolePickerText: { fontSize: 15, fontWeight: '500' },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleText: { fontSize: 13, fontWeight: '600' },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  deleteButtonText: {
    color: '#F44336',
    fontSize: 15,
    fontWeight: '600',
  },
});
