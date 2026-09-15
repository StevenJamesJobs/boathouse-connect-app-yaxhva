/**
 * Your profile — the one edit sheet: photo (changed from INSIDE the open sheet — the only
 * proven picker pattern), the locked pair in mono, Email, Phone, Tagline (60, counter),
 * Cancel / Save. Writes update_profile_info (+ p_tagline) then refreshUser().
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { FieldLabel, GlassTextInput, Hint } from '@/components/content/FormKit';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';
import { brokerUploadImage } from '@/utils/storageBroker';
import { translateServerError } from '@/utils/serverErrors';
import { toPublicUrl } from '@/utils/storageResolver';
import { fonts } from '@/constants/fonts';
import { TAGLINE_MAX } from './profileVisuals';

interface Props {
  visible: boolean;
  onClose: () => void;
  tagline: string | null | undefined;
  onSaved: (tagline: string | null) => void;
}

export default function ProfileSheet({ visible, onClose, tagline, onSaved }: Props) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { organizationId } = useOrganization();
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phoneNumber || '');
  const [tag, setTag] = useState(tagline || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      setEmail(user?.email || '');
      setPhone(user?.phoneNumber || '');
      setTag(tagline || '');
    }
  }, [visible, user?.email, user?.phoneNumber, tagline]);

  const url = user?.profilePictureUrl ? (user.profilePictureUrl.startsWith('http') ? user.profilePictureUrl : toPublicUrl('profile-pictures', user.profilePictureUrl)) : null;

  const pickPhoto = async () => {
    if (!user?.id) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permission_required'), t('profile.grant_camera_permissions'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;
      setUploading(true);
      const publicUrl = await brokerUploadImage('profile_picture', result.assets[0].uri, user.id);
      if (!publicUrl) throw new Error(t('profile.error_upload_picture'));
      const { error } = await supabase.rpc('update_profile_picture', {
        user_id: user.id,
        picture_url: publicUrl,
        p_organization_id: organizationId ?? undefined,
        p_actor_id: user.id,
      });
      if (error) throw error;
      await refreshUser();
    } catch (e: any) {
      Alert.alert(t('common.error'), translateServerError(e, t('profile.error_upload_picture')));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!user?.id) return;
    try {
      setSaving(true);
      const cleanTag = tag.trim();
      const { error } = await supabase.rpc('update_profile_info', {
        user_id: user.id,
        new_email: email.trim(),
        new_phone_number: phone.trim(),
        p_organization_id: organizationId ?? undefined,
        p_tagline: cleanTag, // '' clears on the server
      });
      if (error) throw error;
      await refreshUser();
      onSaved(cleanTag || null);
      onClose();
    } catch (e: any) {
      Alert.alert(t('common.error'), translateServerError(e, t('profile.error_update_profile')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('profile_hub.sheet_title')}
      subtitle={t('profile_hub.sheet_sub')}
      footer={
        <View style={styles.foot}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={[styles.btn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={[styles.btnText, { color: colors.text }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.85} style={[styles.btn, styles.save, { backgroundColor: colors.tint, borderColor: colors.tint }]}>
            {saving ? (
              <ActivityIndicator color={colors.fireText} />
            ) : (
              <>
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={colors.fireText} />
                <Text style={[styles.btnText, { color: colors.fireText }]}>{t('common.save', 'Save')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.photoRow}>
        <TouchableOpacity onPress={pickPhoto} activeOpacity={0.85} style={[styles.av, { backgroundColor: colors.thumbPlaceholder, borderColor: colors.glassBorder }]}>
          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : url ? (
            <StorageImage source={{ uri: url }} style={styles.avImg} key={url} />
          ) : (
            <Text style={[styles.initial, { color: colors.primary }]}>{(user?.name || '?').trim()[0]?.toUpperCase()}</Text>
          )}
          <View style={[styles.cam, { backgroundColor: colors.tint, borderColor: colors.background }]}>
            <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="photo-camera" size={11} color={colors.fireText} />
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.photoTitle, { color: colors.text }]}>{t('profile_hub.photo')}</Text>
          <Text style={[styles.photoHint, { color: colors.textSecondary }]}>{t('profile_hub.photo_hint')}</Text>
        </View>
      </View>

      <View style={styles.two}>
        <View style={styles.col}>
          <FieldLabel label={t('profile.username')} />
          <View style={[styles.locked, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={15} color={colors.textSecondary} />
            <Text style={[styles.lockedText, { color: colors.textSecondary }]} numberOfLines={1}>
              {user?.username}
            </Text>
          </View>
        </View>
        <View style={styles.col}>
          <FieldLabel label={t('profile.full_name')} />
          <View style={[styles.locked, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={15} color={colors.textSecondary} />
            <Text style={[styles.lockedText, { color: colors.textSecondary, fontFamily: fonts.body.regular, fontSize: 14 }]} numberOfLines={1}>
              {user?.name}
            </Text>
          </View>
        </View>
      </View>
      <Hint>{t('profile_hub.locked_hint')}</Hint>

      <View>
        <FieldLabel label={t('profile.email')} />
        <GlassTextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      </View>
      <View>
        <FieldLabel label={t('profile.phone_number')} />
        <GlassTextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      </View>
      <View>
        <FieldLabel label={t('profile_hub.tagline')} trailing={`${tag.length} / ${TAGLINE_MAX}`} />
        <GlassTextInput value={tag} onChangeText={(v) => setTag(v.slice(0, TAGLINE_MAX))} maxLength={TAGLINE_MAX} placeholder={t('profile_hub.tagline_ph')} />
        <Hint>{t('profile_hub.tagline_hint')}</Hint>
      </View>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 2 },
  av: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avImg: { width: 64, height: 64, borderRadius: 32 },
  initial: { fontFamily: fonts.display.bold, fontSize: 22 },
  cam: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  photoTitle: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
  photoHint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  two: { flexDirection: 'row', gap: 10 },
  col: { flex: 1, minWidth: 0 },
  locked: { minHeight: 43, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockedText: { flex: 1, fontFamily: fonts.mono.medium, fontSize: 13 },
  foot: { flexDirection: 'row', gap: 11 },
  btn: { flex: 1, height: 47, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  save: { flex: 1.35 },
  btnText: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
