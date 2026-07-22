/**
 * Word Search Game Hub
 * Category selection screen with difficulty + play mode picker modal.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import {
  WORD_SEARCH_CATEGORIES,
  WORD_SEARCH_CATEGORY_INFO,
  WordSearchCategory,
  WordSearchDifficulty,
  WordSearchPlayMode,
} from '@/types/game';
import BottomNavBar from '@/components/BottomNavBar';

type PickerStep = 'difficulty' | 'playmode';

const CATEGORY_LABEL_KEYS: Record<WordSearchCategory, string> = {
  dishes_ingredients: 'word_search:cat_dishes_ingredients',
  libations_ingredients: 'word_search:cat_libations_ingredients',
};

const CATEGORY_DESC_KEYS: Record<WordSearchCategory, string> = {
  dishes_ingredients: 'word_search:cat_dishes_ingredients_desc',
  libations_ingredients: 'word_search:cat_libations_ingredients_desc',
};

const DIFFICULTIES: { value: WordSearchDifficulty; emoji: string; labelKey: string; descKey: string; color: string }[] = [
  { value: 'easy',   emoji: '🟢', labelKey: 'word_search:difficulty_easy',   descKey: 'word_search:difficulty_easy_desc',   color: '#10B981' },
  { value: 'medium', emoji: '🟡', labelKey: 'word_search:difficulty_medium', descKey: 'word_search:difficulty_medium_desc', color: '#F59E0B' },
  { value: 'hard',   emoji: '🔴', labelKey: 'word_search:difficulty_hard',   descKey: 'word_search:difficulty_hard_desc',   color: '#EF4444' },
];

const PLAY_MODES: { value: WordSearchPlayMode; emoji: string; labelKey: string; descKey: string }[] = [
  { value: 'free',  emoji: '🔓', labelKey: 'word_search:play_mode_free',  descKey: 'word_search:play_mode_free_desc' },
  { value: 'timed', emoji: '⏱', labelKey: 'word_search:play_mode_timed', descKey: 'word_search:play_mode_timed_desc' },
];

export default function WordSearchGameScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [selectedCategory, setSelectedCategory] = useState<WordSearchCategory | null>(null);
  const [pickerStep, setPickerStep] = useState<PickerStep>('difficulty');
  const [selectedDifficulty, setSelectedDifficulty] = useState<WordSearchDifficulty>('easy');
  const [showPicker, setShowPicker] = useState(false);

  const openPicker = (category: WordSearchCategory) => {
    setSelectedCategory(category);
    setPickerStep('difficulty');
    setSelectedDifficulty('easy');
    setShowPicker(true);
  };

  const handleDifficultySelect = (difficulty: WordSearchDifficulty) => {
    setSelectedDifficulty(difficulty);
    setPickerStep('playmode');
  };

  const handlePlayModeSelect = (playMode: WordSearchPlayMode) => {
    setShowPicker(false);
    if (!selectedCategory) return;
    router.push({
      pathname: '/word-search-play',
      params: {
        category: selectedCategory,
        difficulty: selectedDifficulty,
        playMode,
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('word_search:hub_title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Intro Card */}
        <View style={[styles.introCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
          <Text style={[styles.introTitle, { color: colors.primary }]}>🔤 {t('word_search:intro_title')}</Text>
          <Text style={[styles.introDesc, { color: colors.textSecondary }]}>
            {t('word_search:intro_desc')}
          </Text>
          <Text style={[styles.introTip, { color: colors.textSecondary }]}>
            {t('word_search:intro_tip')}
          </Text>
        </View>

        {/* Category Cards */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('word_search:choose_category')}</Text>
        {WORD_SEARCH_CATEGORIES.map((cat) => {
          const info = WORD_SEARCH_CATEGORY_INFO[cat];
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryCard, { backgroundColor: colors.card }]}
              onPress={() => openPicker(cat)}
              activeOpacity={0.75}
            >
              <View style={[styles.categoryIcon, { backgroundColor: info.color + '20' }]}>
                <IconSymbol
                  ios_icon_name={info.icon.ios as any}
                  android_material_icon_name={info.icon.android as any}
                  size={28}
                  color={info.color}
                />
              </View>
              <View style={styles.categoryText}>
                <Text style={[styles.categoryTitle, { color: colors.text }]}>
                  {t(CATEGORY_LABEL_KEYS[cat])}
                </Text>
                <Text style={[styles.categoryDesc, { color: colors.textSecondary }]}>
                  {t(CATEGORY_DESC_KEYS[cat])}
                </Text>
              </View>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          );
        })}

        {/* Leaderboard Button */}
        <TouchableOpacity
          style={[styles.leaderboardBtn, { backgroundColor: colors.card, borderColor: colors.primary + '40' }]}
          onPress={() => router.push('/word-search-leaderboard')}
          activeOpacity={0.75}
        >
          <IconSymbol ios_icon_name="trophy.fill" android_material_icon_name="emoji-events" size={22} color={colors.primary} />
          <Text style={[styles.leaderboardBtnText, { color: colors.primary }]}>{t('word_search:view_leaderboard')}</Text>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>

      {/* Difficulty / Play Mode Picker Modal */}
      <Modal visible={showPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={() => {}}>
            {pickerStep === 'difficulty' ? (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('word_search:choose_difficulty')}</Text>
                <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                  {selectedCategory ? t(CATEGORY_LABEL_KEYS[selectedCategory]) : ''}
                </Text>
                {DIFFICULTIES.map((d) => (
                  <TouchableOpacity
                    key={d.value}
                    style={[styles.optionBtn, { borderColor: d.color + '50', backgroundColor: d.color + '10' }]}
                    onPress={() => handleDifficultySelect(d.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.optionLabel, { color: d.color }]}>{d.emoji} {t(d.labelKey)}</Text>
                    <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>{t(d.descKey)}</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('word_search:choose_play_mode')}</Text>
                <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                  {t('word_search:difficulty_suffix', { difficulty: t(`word_search:difficulty_${selectedDifficulty}`) })}
                </Text>
                {PLAY_MODES.map((pm) => (
                  <TouchableOpacity
                    key={pm.value}
                    style={[styles.optionBtn, { borderColor: colors.primary + '50', backgroundColor: colors.primary + '10' }]}
                    onPress={() => handlePlayModeSelect(pm.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.optionLabel, { color: colors.primary }]}>{pm.emoji} {t(pm.labelKey)}</Text>
                    <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>{t(pm.descKey)}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setPickerStep('difficulty')} style={styles.backOption}>
                  <Text style={[styles.backOptionText, { color: colors.textSecondary }]}>{t('word_search:back_to_difficulty')}</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={() => setShowPicker(false)} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('word_search:cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <BottomNavBar activeTab="tools" />
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
  headerTitle: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 120 },
  introCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  introTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  introDesc: { fontSize: 13, lineHeight: 19 },
  introTip: { fontSize: 12, lineHeight: 17, fontStyle: 'italic', marginTop: 6 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    boxShadow: '0px 2px 8px rgba(0,0,0,0.12)',
    elevation: 3,
  },
  categoryIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: { flex: 1 },
  categoryTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  categoryDesc: { fontSize: 12, lineHeight: 16 },
  leaderboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 8,
    borderWidth: 1.5,
    gap: 8,
    boxShadow: '0px 2px 8px rgba(0,0,0,0.08)',
    elevation: 2,
  },
  leaderboardBtnText: { fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    gap: 12,
    boxShadow: '0px 8px 24px rgba(0,0,0,0.2)',
    elevation: 10,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  modalSub: { fontSize: 13, textAlign: 'center', marginBottom: 4 },
  optionBtn: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    gap: 4,
  },
  optionLabel: { fontSize: 16, fontWeight: '700' },
  optionDesc: { fontSize: 12 },
  backOption: { alignItems: 'center', paddingVertical: 4 },
  backOptionText: { fontSize: 13 },
  cancelBtn: { alignItems: 'center', paddingVertical: 6 },
  cancelText: { fontSize: 14 },
});
