/**
 * Language — a GlassSheet with two check rows. Replaces the old centred dialog.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useLanguage, SupportedLanguage } from '@/contexts/LanguageContext';
import { fonts } from '@/constants/fonts';
import { hexToRgba } from './profileVisuals';

const OPTIONS: { key: SupportedLanguage; label: string; subKey: string }[] = [
  { key: 'en', label: 'English', subKey: 'profile_hub.lang_en_sub' },
  { key: 'es', label: 'Español', subKey: 'profile_hub.lang_es_sub' },
];

export default function LanguageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { defer, onDismiss } = useSheetHandoff(onClose);
  const tintHex = colors.tint.startsWith('#') ? colors.tint : '#FF7A2F';

  return (
    <GlassSheet visible={visible} onClose={onClose} onDismiss={onDismiss} title={t('settings.language')} subtitle={t('profile_hub.lang_sub')}>
      {OPTIONS.map((o) => {
        const on = language === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            activeOpacity={0.85}
            onPress={() => defer(() => { setLanguage(o.key); })}
            style={[styles.row, { backgroundColor: colors.glass, borderColor: on ? hexToRgba(tintHex, 0.45) : colors.glassBorder }]}
          >
            <View style={styles.bd}>
              <Text style={[styles.l1, { color: colors.text }]}>{o.label}</Text>
              <Text style={[styles.l2, { color: colors.textSecondary }]}>{t(o.subKey)}</Text>
            </View>
            <View style={[styles.ck, { borderColor: colors.glassBorder }, on && { backgroundColor: colors.tint, borderColor: colors.tint }]}>
              {on ? <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={12} color={colors.fireText} /> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingLeft: 13, borderRadius: 13, borderWidth: 1 },
  bd: { flex: 1 },
  l1: { fontFamily: fonts.body.semibold, fontSize: 14.5 },
  l2: { fontFamily: fonts.body.regular, fontSize: 11.5, marginTop: 1 },
  ck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
