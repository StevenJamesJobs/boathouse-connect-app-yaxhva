/**
 * Word Search Editor (Manager Only)
 * Scoreboard management — reset scores by category or reset all.
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
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  WORD_SEARCH_CATEGORIES,
  WORD_SEARCH_CATEGORY_INFO,
  WordSearchCategory,
} from '@/types/game';

const CATEGORY_LABEL_KEYS: Record<WordSearchCategory, string> = {
  weekly_specials: 'word_search:cat_weekly_specials',
  lunch: 'word_search:cat_lunch',
  dinner: 'word_search:cat_dinner',
  happy_hour: 'word_search:cat_happy_hour',
  libations: 'word_search:cat_libations',
};

export default function WordSearchEditorScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [resetting, setResetting] = useState<string | null>(null);

  const confirmReset = (category: WordSearchCategory | null) => {
    const label = category ? t(CATEGORY_LABEL_KEYS[category]) : t('ws_editor:all_categories');
    Alert.alert(
      t('ws_editor:confirm_title'),
      t('ws_editor:confirm_msg', { label }),
      [
        { text: t('ws_editor:cancel'), style: 'cancel' },
        {
          text: t('ws_editor:reset_btn'),
          style: 'destructive',
          onPress: () => resetScores(category),
        },
      ]
    );
  };

  const resetScores = async (category: WordSearchCategory | null) => {
    const key = category ?? 'all';
    setResetting(key);
    try {
      const { error } = await supabase.rpc('reset_word_search_scores', {
        p_category: category ?? null,
        p_organization_id: organizationId,
      });
      if (error) throw error;
      const label = category ? t(CATEGORY_LABEL_KEYS[category]) : t('ws_editor:all_categories_long');
      Alert.alert(t('ws_editor:success'), t('ws_editor:success_msg', { label }));
    } catch {
      Alert.alert(t('ws_editor:error'), t('ws_editor:error_msg'));
    } finally {
      setResetting(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('ws_editor:title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
          <IconSymbol ios_icon_name="info.circle.fill" android_material_icon_name="info" size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('ws_editor:info')}
          </Text>
        </View>

        {/* Scoreboard Management */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('ws_editor:scoreboard_management')}</Text>
        <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
          {t('ws_editor:scoreboard_desc')}
        </Text>

        {WORD_SEARCH_CATEGORIES.map((cat) => {
          const info = WORD_SEARCH_CATEGORY_INFO[cat];
          const isResetting = resetting === cat;
          return (
            <View key={cat} style={[styles.resetCard, { backgroundColor: colors.card }]}>
              <View style={[styles.resetIcon, { backgroundColor: info.color + '18' }]}>
                <IconSymbol
                  ios_icon_name={info.icon.ios as any}
                  android_material_icon_name={info.icon.android as any}
                  size={22}
                  color={info.color}
                />
              </View>
              <Text style={[styles.resetLabel, { color: colors.text }]}>
                {t(CATEGORY_LABEL_KEYS[cat])}
              </Text>
              <TouchableOpacity
                style={[
                  styles.resetBtn,
                  { borderColor: '#EF4444' + '50', backgroundColor: '#EF444410' },
                ]}
                onPress={() => confirmReset(cat)}
                disabled={!!resetting}
              >
                {isResetting ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text style={[styles.resetBtnText, { color: '#EF4444' }]}>{t('ws_editor:reset_btn')}</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Reset All */}
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
              <Text style={styles.resetAllText}>{t('ws_editor:reset_all_btn')}</Text>
            </>
          )}
        </TouchableOpacity>
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
  resetIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
});
