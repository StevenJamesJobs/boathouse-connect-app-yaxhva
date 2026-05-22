/**
 * Picture This! Editor (Manager Only)
 * Reset scores by category or all at once.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '../contexts/OrganizationContext';
import { PictureThisCategory } from '@/utils/game/pictureThisGenerator';

interface CategoryRow {
  key: PictureThisCategory;
  labelKey: string;
  icon: { ios: string; android: string };
  color: string;
}

const CATEGORIES: CategoryRow[] = [
  { key: 'food',         labelKey: 'pt_editor:cat_food',         icon: { ios: 'fork.knife', android: 'restaurant' },              color: '#EF4444' },
  { key: 'libations',    labelKey: 'pt_editor:cat_libations',    icon: { ios: 'wineglass.fill', android: 'local-bar' },           color: '#8B5CF6' },
  { key: 'wine',         labelKey: 'pt_editor:cat_wine',         icon: { ios: 'wineglass', android: 'wine-bar' },                 color: '#A21CAF' },
  { key: 'menu_prices',  labelKey: 'pt_editor:cat_menu_prices',  icon: { ios: 'dollarsign.circle.fill', android: 'attach-money' }, color: '#0891B2' },
];

export default function PictureThisEditorScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [resetting, setResetting] = useState<string | null>(null);

  const confirmReset = (category: PictureThisCategory | null) => {
    const label = category ? t(CATEGORIES.find(c => c.key === category)!.labelKey) : t('pt_editor:all_categories');
    Alert.alert(
      t('pt_editor:confirm_title'),
      t('pt_editor:confirm_msg', { label }),
      [
        { text: t('pt_editor:cancel'), style: 'cancel' },
        {
          text: t('pt_editor:reset_btn'),
          style: 'destructive',
          onPress: () => resetScores(category),
        },
      ],
    );
  };

  const resetScores = async (category: PictureThisCategory | null) => {
    const key = category ?? 'all';
    setResetting(key);
    try {
      const { error } = await supabase.rpc('reset_picture_this_scores', {
        p_category: category ?? null,
        p_difficulty: null,
        p_organization_id: organizationId,
      });
      if (error) throw error;
      const label = category ? t(CATEGORIES.find(c => c.key === category)!.labelKey) : t('pt_editor:all_categories');
      Alert.alert(t('pt_editor:success'), t('pt_editor:success_msg', { label }));
    } catch (err) {
      console.error('[PictureThisEditor] reset error:', err);
      Alert.alert(t('pt_editor:error'), t('pt_editor:error_msg'));
    } finally {
      setResetting(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('pt_editor:title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.infoCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
          <IconSymbol ios_icon_name="info.circle.fill" android_material_icon_name="info" size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('pt_editor:info')}
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('pt_editor:scoreboard_management')}</Text>
        <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
          {t('pt_editor:scoreboard_desc')}
        </Text>

        {CATEGORIES.map(cat => {
          const isResetting = resetting === cat.key;
          return (
            <View key={cat.key} style={[styles.resetCard, { backgroundColor: colors.card }]}>
              <View style={[styles.resetIcon, { backgroundColor: cat.color + '18' }]}>
                <IconSymbol
                  ios_icon_name={cat.icon.ios as any}
                  android_material_icon_name={cat.icon.android as any}
                  size={22}
                  color={cat.color}
                />
              </View>
              <Text style={[styles.resetLabel, { color: colors.text }]}>{t(cat.labelKey)}</Text>
              <TouchableOpacity
                style={[styles.resetBtn, { borderColor: '#EF444450', backgroundColor: '#EF444410' }]}
                onPress={() => confirmReset(cat.key)}
                disabled={!!resetting}
              >
                {isResetting ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text style={[styles.resetBtnText, { color: '#EF4444' }]}>{t('pt_editor:reset_btn')}</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.resetAllBtn, { borderColor: '#EF4444' }]}
          onPress={() => confirmReset(null)}
          disabled={!!resetting}
        >
          {resetting === 'all' ? (
            <ActivityIndicator color="#EF4444" />
          ) : (
            <>
              <IconSymbol ios_icon_name="trash.fill" android_material_icon_name="delete" size={18} color="#EF4444" />
              <Text style={styles.resetAllText}>{t('pt_editor:reset_all_btn')}</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.tip, { color: colors.textSecondary }]}>
          {t('pt_editor:tip')}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 60, gap: 12 },
  infoCard: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  sectionDesc: { fontSize: 13, lineHeight: 18 },
  resetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    boxShadow: '0px 2px 6px rgba(0,0,0,0.1)',
    elevation: 2,
  },
  resetIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  resetLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  resetBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 68,
    alignItems: 'center',
  },
  resetBtnText: { fontSize: 13, fontWeight: '700' },
  resetAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 2,
    paddingVertical: 14,
    gap: 8,
    marginTop: 4,
  },
  resetAllText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
  tip: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginTop: 18, lineHeight: 17 },
});
