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
import BottomNavBar from '@/components/BottomNavBar';
import {
  PictureThisCategory,
  PictureThisDifficulty,
  PictureThisPlayMode,
} from '@/utils/game/pictureThisGenerator';

type PickerStep = 'difficulty' | 'playmode';

interface CategoryInfo {
  key: PictureThisCategory;
  label: string;
  desc: string;
  icon: { ios: string; android: string };
  color: string;
  difficulties: PictureThisDifficulty[];
}

const CATEGORIES: CategoryInfo[] = [
  {
    key: 'food',
    label: 'Lunch & Dinner Menu',
    desc: 'Identify ingredients in our food menu items',
    icon: { ios: 'fork.knife', android: 'restaurant' },
    color: '#EF4444',
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    key: 'libations',
    label: 'Libations',
    desc: 'Cocktails, martinis, sangria, and ABV drinks',
    icon: { ios: 'wineglass.fill', android: 'local-bar' },
    color: '#8B5CF6',
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    key: 'wine',
    label: 'Wine',
    desc: 'Match wines to their location and price',
    icon: { ios: 'wineglass', android: 'wine-bar' },
    color: '#A21CAF',
    difficulties: ['medium', 'hard'],
  },
  {
    key: 'menu_prices',
    label: 'Menu Prices',
    desc: 'Match prices across the entire menu',
    icon: { ios: 'dollarsign.circle.fill', android: 'attach-money' },
    color: '#0891B2',
    difficulties: ['only'],
  },
];

const DIFFICULTY_INFO: Record<PictureThisDifficulty, { label: string; desc: string; color: string }> = {
  easy:   { label: '🟢 Easy',    desc: 'Pick the correct ingredient • 3 lives',                color: '#10B981' },
  medium: { label: '🟡 Medium',  desc: 'Pick 2 correct ingredients • 4 lives',                 color: '#F59E0B' },
  hard:   { label: '🔴 Hard',    desc: 'Pick the full ingredient list • 5 lives',              color: '#EF4444' },
  only:   { label: '💎 Expert',  desc: 'Match prices across the menu • 4 lives • most points', color: '#0891B2' },
};

const DIFFICULTY_DESC_BY_CATEGORY: Partial<Record<PictureThisCategory, Partial<Record<PictureThisDifficulty, string>>>> = {
  wine: {
    medium: 'Match name + location • 4 lives',
    hard:   'Pick the correct price • 5 lives',
  },
};

const PLAY_MODES: { value: PictureThisPlayMode; label: string; desc: string }[] = [
  { value: 'lives', label: '❤️ Lives Mode',   desc: 'Wrong answers cost a life. Bonuses every 5 questions!' },
  { value: 'timed', label: '⏱ Beat the Clock', desc: '2 minutes — answer as many as you can correctly!' },
];

export default function PictureThisGameScreen() {
  const colors = useThemeColors();
  const router = useRouter();

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
      const override = DIFFICULTY_DESC_BY_CATEGORY[selectedCategory.key]?.[difficulty];
      if (override) return override;
    }
    return DIFFICULTY_INFO[difficulty].desc;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Picture This!</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.introCard, { backgroundColor: '#EC489915', borderColor: '#EC489940' }]}>
          <Text style={[styles.introTitle, { color: '#EC4899' }]}>📸 Picture This!</Text>
          <Text style={[styles.introDesc, { color: colors.textSecondary }]}>
            Spot the correct ingredients, prices, and more from menu pictures. Choose a category, pick your difficulty, and play with Lives or Beat the Clock!
          </Text>
          <Text style={[styles.introTip, { color: colors.textSecondary }]}>
            💡 Wrong answers cost a life (or seconds), so read each option carefully — you can&apos;t move on until you pick correctly.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CHOOSE A CATEGORY</Text>
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
              <Text style={[styles.categoryTitle, { color: colors.text }]}>{cat.label}</Text>
              <Text style={[styles.categoryDesc, { color: colors.textSecondary }]}>{cat.desc}</Text>
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
          <Text style={[styles.leaderboardBtnText, { color: colors.primary }]}>View Leaderboard</Text>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={() => {}}>
            {pickerStep === 'difficulty' ? (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Difficulty</Text>
                <Text style={[styles.modalSub, { color: colors.textSecondary }]}>{selectedCategory?.label}</Text>
                {selectedCategory?.difficulties.map((d) => {
                  const info = DIFFICULTY_INFO[d];
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.optionBtn, { borderColor: info.color + '50', backgroundColor: info.color + '10' }]}
                      onPress={() => handleDifficultySelect(d)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.optionLabel, { color: info.color }]}>{info.label}</Text>
                      <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                        {renderDifficultyDesc(d)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Play Mode</Text>
                <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                  {DIFFICULTY_INFO[selectedDifficulty].label.replace(/^[^A-Za-z]+/, '')}
                </Text>
                {PLAY_MODES.map((pm) => (
                  <TouchableOpacity
                    key={pm.value}
                    style={[styles.optionBtn, { borderColor: colors.primary + '50', backgroundColor: colors.primary + '10' }]}
                    onPress={() => handlePlayModeSelect(pm.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.optionLabel, { color: colors.primary }]}>{pm.label}</Text>
                    <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>{pm.desc}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setPickerStep('difficulty')} style={styles.backOption}>
                  <Text style={[styles.backOptionText, { color: colors.textSecondary }]}>← Back to Difficulty</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={() => setShowPicker(false)} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
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
