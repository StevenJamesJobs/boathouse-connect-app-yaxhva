/**
 * Invite sheet — the join code + the org's starter password, Copy and Share. The same
 * share message ManageEmployeesPane sends, lifted into a GlassSheet.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useOrganization } from '@/contexts/OrganizationContext';
import { fonts } from '@/constants/fonts';

export default function InviteSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { organization } = useOrganization();
  const [copied, setCopied] = useState(false);
  const code = organization?.join_code || '';
  const pw = organization?.default_password || '';

  const shareMessage = t('manager_manage.emp_share_msg', {
    org: organization?.name || '',
    code,
    pw,
    defaultValue: 'Join {{org}} on the team app! Use sign-up code {{code}} and temporary password {{pw}} to create your account.',
  });

  const copyCode = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const shareCode = async () => {
    if (!code) {
      Alert.alert(t('manager_manage.emp_share_title', 'Invite Employees'), t('manager_manage.emp_no_code', 'No sign-up code is available yet.'));
      return;
    }
    try {
      await Share.share({ message: shareMessage });
    } catch {}
  };

  return (
    <GlassSheet visible={visible} onClose={onClose} title={t('manager_manage.emp_share_title', 'Invite Employees')} subtitle={t('profile_hub.invite_sub')}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('manager_manage.emp_share_code_label', 'Sign-up code')}</Text>
      <View style={[styles.codeBox, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <Text style={[styles.code, { color: colors.text }]}>{code || '—'}</Text>
        <TouchableOpacity onPress={copyCode} style={[styles.copy, { backgroundColor: colors.tint }]} activeOpacity={0.85} disabled={!code}>
          <IconSymbol ios_icon_name={copied ? 'checkmark' : 'doc.on.doc'} android_material_icon_name={copied ? 'check' : 'content-copy'} size={15} color={colors.fireText} />
          <Text style={[styles.copyText, { color: colors.fireText }]}>{copied ? t('manager_manage.emp_copied', 'Copied') : t('manager_manage.emp_copy', 'Copy')}</Text>
        </TouchableOpacity>
      </View>
      {!!pw && (
        <>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('manager_manage.emp_default_pw_label', 'Starter password')}</Text>
          <View style={[styles.pwBox, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={[styles.pw, { color: colors.text }]}>{pw}</Text>
          </View>
        </>
      )}
      <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('manager_manage.emp_share_hint')}</Text>
      <TouchableOpacity onPress={shareCode} style={[styles.share, { backgroundColor: colors.tint }]} activeOpacity={0.85}>
        <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="share" size={16} color={colors.fireText} />
        <Text style={[styles.shareText, { color: colors.fireText }]}>{t('manager_manage.emp_share_via', 'Share invite')}</Text>
      </TouchableOpacity>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.mono.semibold, fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 4 },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 13, borderWidth: 1, paddingLeft: 14, paddingRight: 6, paddingVertical: 6 },
  code: { flex: 1, fontFamily: fonts.mono.semibold, fontSize: 20, letterSpacing: 2 },
  copy: { height: 34, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  copyText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  pwBox: { borderRadius: 13, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  pw: { fontFamily: fonts.mono.medium, fontSize: 15 },
  hint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  share: { height: 47, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 4 },
  shareText: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
