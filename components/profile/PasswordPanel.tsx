/**
 * Change password — current / new / confirm with eye toggles and the "Forgot it?" line.
 * Same flow as the old settings page: verify_password, then update_password.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { FieldLabel, Hint } from '@/components/content/FormKit';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';
import { fonts } from '@/constants/fonts';

function Field({ value, onChange, placeholder, icon, android }: { value: string; onChange: (v: string) => void; placeholder: string; icon: string; android: string }) {
  const colors = useThemeColors();
  const [show, setShow] = useState(false);
  return (
    <View style={[styles.inp, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <IconSymbol ios_icon_name={icon} android_material_icon_name={android} size={16} color={colors.textSecondary} />
      <TextInput
        style={[styles.input, { color: colors.text }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity onPress={() => setShow((s) => !s)} hitSlop={8}>
        <IconSymbol ios_icon_name={show ? 'eye.slash.fill' : 'eye.fill'} android_material_icon_name={show ? 'visibility-off' : 'visibility'} size={17} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

export default function PasswordPanel({ onDone }: { onDone?: () => void }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const submit = async () => {
    if (!user?.id) return;
    if (!current) return Alert.alert(t('common.error'), t('profile.error_enter_current_password'));
    if (next.length < 6) return Alert.alert(t('common.error'), t('profile.error_password_too_short'));
    if (next !== confirm) return Alert.alert(t('common.error'), t('profile.error_passwords_no_match'));
    try {
      setBusy(true);
      const { data: ok, error: vErr } = await supabase.rpc('verify_password', { user_id: user.id, password: current, p_organization_id: organizationId ?? undefined });
      if (vErr) throw vErr;
      if (!ok) {
        Alert.alert(t('common.error'), t('profile.error_password_incorrect'));
        return;
      }
      const { error } = await supabase.rpc('update_password', {
        user_id: user.id,
        new_password: next,
        p_actor_id: user.id,
        p_organization_id: organizationId ?? undefined,
        p_current_password: current,
      });
      if (error) throw error;
      Alert.alert(t('common.success'), t('profile.password_changed'));
      reset();
      onDone?.();
    } catch (e: any) {
      Alert.alert(t('common.error'), translateServerError(e, t('profile.error_change_password')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View>
        <FieldLabel label={t('profile.current_password')} />
        <Field value={current} onChange={setCurrent} placeholder={t('profile.enter_current_password')} icon="lock.fill" android="lock" />
        <Hint>
          {t('profile_hub.forgot_prefix')}{' '}
          <Text style={{ color: colors.tint, fontFamily: fonts.body.semibold }}>{t('profile_hub.forgot_strong')}</Text>{' '}
          {t('profile_hub.forgot_suffix')}
        </Hint>
      </View>
      <View>
        <FieldLabel label={t('profile.new_password')} />
        <Field value={next} onChange={setNext} placeholder={t('profile.enter_new_password')} icon="key.fill" android="vpn-key" />
      </View>
      <View>
        <FieldLabel label={t('profile.confirm_new_password')} />
        <Field value={confirm} onChange={setConfirm} placeholder={t('profile.confirm_new_password_placeholder')} icon="key.fill" android="vpn-key" />
      </View>
      <View style={styles.btns}>
        <TouchableOpacity onPress={() => { reset(); onDone?.(); }} activeOpacity={0.85} style={[styles.btn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text style={[styles.btnText, { color: colors.text }]}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={submit} disabled={busy} activeOpacity={0.85} style={[styles.btn, { backgroundColor: colors.tint, borderColor: colors.tint }]}>
          {busy ? (
            <ActivityIndicator color={colors.fireText} />
          ) : (
            <>
              <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={15} color={colors.fireText} />
              <Text style={[styles.btnText, { color: colors.fireText }]}>{t('profile.update_password')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  inp: { minHeight: 43, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, fontFamily: fonts.body.regular, fontSize: 14, paddingVertical: 10 },
  btns: { flexDirection: 'row', gap: 10, marginTop: 2 },
  btn: { flex: 1, height: 44, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnText: { fontFamily: fonts.body.semibold, fontSize: 14 },
});
