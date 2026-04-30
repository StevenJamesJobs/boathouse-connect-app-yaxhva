/**
 * Picture This! Hub
 * Category cards → difficulty picker → play mode picker → gameplay.
 * Pattern source: word-search-game.tsx.
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
import BottomNavBar from '@/components/BottomNavBar';
import {
  PictureThisCategory,
  PictureThisDifficulty,
  PictureThisPlayMode,
} from '@/utils/game/pictureThisGenerator';

type PickerStep = 'difficulty' | 'playmode';

interface CategoryInfo {
  key: PictureThisCategory;
  labelKey: string;
  descKey: string;
  icon: { ios: string; android: string };
  color: string;
  difficulties: PictureThisDifficulty[];
}

const CATEGORIES: CategoryInfo[] = [
  {
    key: 'food',
    labelKey: 'picture_this:cat_food',
    descKey: 'picture_this:cat_food_desc',
    icon: { ios: 'fork.knife', android: 'restaurant' },
    color: '#EF4444',
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    key: 'libations',
    labelKey: 'picture_this:cat_libations',
    descKey: 'picture_this:cat_libations_desc',
    icon: { ios: 'wineglass.fill', android: 'local-bar' },
    color: '#8B5CF6',
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    key: 'wine',
    labelKey: 'picture_this:cat_wine',
    descKey: 'picture_this:cat_wine_desc',
    icon: { ios: 'wineglass', android: 'wine-bar' },
    color: '#A21CAF',
    difficulties: ['medium', 'hard'],
  },
  {
    key: 'menu_prices',
    labelKey: 'picture_this:cat_menu_prices',
    descKey: 'picture_this:cat_menu_prices_desc',
    icon: { ios: 'dollarsign.circle.fill', android: 'attach-money' },
    color: '#0891B2',
    difficulties: ['only'],
  },
];

const DIFFICULTY_INFO: Record<PictureThisDifficulty, { labelKey: string; descKey: string; color: string }> = {
  easy:   { labelKey: 'picture_this:diff_easy',   descKey: 'picture_this:diff_easy_desc',   color: '#10B981' },
  medium: { labelKey: 'picture_this:diff_medium', descKey: 'picture_this:diff_medium_desc', color: '#F59E0B' },
  hard:   { labelKey: 'picture_this:diff_hard',   descKey: 'picture_this:diff_hard_desc',   color: '#EF4444' },
  only:   { labelKey: 'picture_this:diff_expert', descKey: 'picture_this:diff_expert_desc', color: '#0891B2' },
};

const DIFFICULTY_DESC_OVERRIDE: Partial<Record<PictureThisCategory, Partial<Record<PictureThisDifficulty, string>>>> = {
  wine: {
    medium: 'picture_this:diff_wine_medium_desc',
    hard:   'picture_this:diff_wine_hard_desc',
  },
};

const PLAY_MODES: { value: PictureThisPlayMode; labelKey: string; descKey: string }[] = [
  { value: 'lives', labelKey: 'picture_this:mode_lives', descKey: 'picture_this:mode_lives_desc' },
  { value: 'timed', labelKey: 'picture_this:mode_timed', descKey: 'picture_this:mode_timed_desc' },
];

export default function PictureThisGameScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();

  const [selectedCategory, setSelectedCategory] = useState<CategoryInfo | null>(null);
  const [pickerStep, setPickerStep] = useState<PickerStep>('difficulty');
  const [selectedDifficulty, setSelectedDifficulty] = useState<PictureThisDifficulty>('easy');
  const [showPicker, setShowPicker] = useState(false);

  const openPicker = (cat: CategoryInfo) => {
    setSelectedCategory(cat);
    setPickerStep('difficulty');
    setSelectedDifficulty(cat.difficulties[0]);
    setShowPicker(true);
  };

  const handleDifficultySelect = (difficulty: PictureThisDifficulty) => {
    setSelectedDifficulty(difficulty);
    setPickerStep('playmode');
  };

  const handlePlayModeSelect = (playMode: PictureThisPlayMode) => {
    setShowPicker(false);
    if (!selectedCategory) return;
    router.push({
      pathname: '/picture-this-play',
      params: {
        category: selectedCategory.key,
        difficulty: selectedDifficulty,
        playMode,
      },
    });
  };

  const renderDifficultyDesc = (difficulty: PictureThisDifficulty): string => {
    if (selectedCategory) {
      const overrideKey = DIFFICULTY_DESC_OVERRIDE[selectedCategory.key]?.[difficulty];
      if (overrideKey) return t(overrideKey);
    }
    return t(DIFFICULTY_INFO[difficulty].descKey);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('picture_this:hub_title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.introCard, { backgroundColor: '#EC489915', borderColor: '#EC489940' }]}>
          <Text style={[styles.introTitle, { color: '#EC4899' }]}>{t('picture_this:intro_title')}</Text>
          <Text style={[styles.introDesc, { color: colors.textSecondary }]}>
            {t('picture_this:intro_desc')}
          </Text>
          <Text style={[styles.introTip, { color: colors.textSecondary }]}>
            {t('picture_this:intro_tip')}
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('picture_this:choose_category')}</Text>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={[styles.categoryCard, { backgroundColor: colors.card }]}
            onPress={() => openPicker(cat)}
            activeOpacity={0.75}
          >
            <View style={[styles.categoryIcon, { backgroundColor: cat.color + '20' }]}>
              <IconSymbol
                ios_icon_name={cat.icon.ios as any}
                android_material_icon_name={cat.icon.android as any}
                size={28}
                color={cat.color}
              />
            </View>
            <View style={styles.categoryText}>
              <Text style={[styles.categoryTitle, { color: colors.text }]}>{t(cat.labelKey)}</Text>
              <Text style={[styles.categoryDesc, { color: colors.textSecondary }]}>{t(cat.descKey)}</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.leaderboardBtn, { backgroundColor: colors.card, borderColor: colors.primary + '40' }]}
          onPress={() => router.push('/picture-this-leaderboard')}
          activeOpacity={0.75}
        >
          <IconSymbol ios_icon_name="trophy.fill" android_material_icon_name="emoji-events" size={22} color={colors.primary} />
          <Text style={[styles.leaderboardBtnText, { color: colors.primary }]}>{t('picture_this:view_leaderboard')}</Text>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={() => {}}>
            {pickerStep === 'difficulty' ? (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('picture_this:choose_difficulty')}</Text>
                <Text style={[styles.modalSub, { color: colors.textSecondary }]}>{selectedCategory ? t(selectedCategory.labelKey) : ''}</Text>
                {selectedCategory?.difficulties.map((d) => {
                  const info = DIFFICULTY_INFO[d];
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.optionBtn, { borderColor: info.color + '50', backgroundColor: info.color + '10' }]}
                      onPress={() => handleDifficultySelect(d)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.optionLabel, { color: info.color }]}>{t(info.labelKey)}</Text>
                      <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                        {renderDifficultyDesc(d)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('picture_this:choose_play_mode')}</Text>
                <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                  {t(DIFFICULTY_INFO[selectedDifficulty].labelKey).replace(/^[^A-Za-zÀ-ÿ¿¡]+/, '')}
                </Text>
                {PLAY_MODES.map((pm) => (
                  <TouchableOpacity
                    key={pm.value}
                    style={[styles.optionBtn, { borderColor: colors.primary + '50', backgroundColor: colors.primary + '10' }]}
                    onPress={() => handlePlayModeSelect(pm.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.optionLabel, { color: colors.primary }]}>{t(pm.labelKey)}</Text>
                    <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>{t(pm.descKey)}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setPickerStep('difficulty')} style={styles.backOption}>
                  <Text style={[styles.backOptionText, { color: colors.textSecondary }]}>{t('picture_this:back_to_difficulty')}</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={() => setShowPicker(false)} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('picture_this:cancel')}</Text>
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
