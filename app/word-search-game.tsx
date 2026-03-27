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

const CATEGORY_LABELS: Record<WordSearchCategory, string> = {
  weekly_specials: 'Weekly Specials',
  lunch: 'Lunch',
  dinner: 'Dinner',
  happy_hour: 'Happy Hour',
  libations: 'Libations',
};

const CATEGORY_DESCS: Record<WordSearchCategory, string> = {
  weekly_specials: "Find ingredients from this week's specials",
  lunch: 'Discover what goes into every lunch dish',
  dinner: 'Explore ingredients across the dinner menu',
  happy_hour: 'Learn happy hour food & drink ingredients',
  libations: 'Search for cocktail & libation ingredients',
};

const DIFFICULTIES: { value: WordSearchDifficulty; label: string; desc: string; color: string }[] = [
  { value: 'easy',   label: '🟢 Easy',   desc: '1 item • 10×10 grid', color: '#10B981' },
  { value: 'medium', label: '🟡 Medium', desc: '2 items • 12×12 grid', color: '#F59E0B' },
  { value: 'hard',   label: '🔴 Hard',   desc: '4 items • 15×15 grid', color: '#EF4444' },
];

const PLAY_MODES: { value: WordSearchPlayMode; label: string; desc: string }[] = [
  { value: 'free',  label: '🔓 Free Play', desc: 'No time limit — learn at your own pace' },
  { value: 'timed', label: '⏱ Timed Mode', desc: 'Race the clock for bonus points!' },
];

export default function WordSearchGameScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Word Search</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Intro Card */}
        <View style={[styles.introCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
          <Text style={[styles.introTitle, { color: colors.primary }]}>🔤 Menu Word Search!</Text>
          <Text style={[styles.introDesc, { color: colors.textSecondary }]}>
            Find ingredient words hidden in the grid. Learn what&apos;s in every dish while you search!
          </Text>
          <Text style={[styles.introTip, { color: colors.textSecondary }]}>
            💡 Each ingredient shows its full name, but you only need to find the key word in the grid (e.g. "Shiitake" for Shiitake Mushrooms).
          </Text>
        </View>

        {/* Category Cards */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CHOOSE A CATEGORY</Text>
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
                  {CATEGORY_LABELS[cat]}
                </Text>
                <Text style={[styles.categoryDesc, { color: colors.textSecondary }]}>
                  {CATEGORY_DESCS[cat]}
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
          <Text style={[styles.leaderboardBtnText, { color: colors.primary }]}>View Leaderboard</Text>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>

      {/* Difficulty / Play Mode Picker Modal */}
      <Modal visible={showPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={() => {}}>
            {pickerStep === 'difficulty' ? (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Difficulty</Text>
                <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                  {selectedCategory ? CATEGORY_LABELS[selectedCategory] : ''}
                </Text>
                {DIFFICULTIES.map((d) => (
                  <TouchableOpacity
                    key={d.value}
                    style={[styles.optionBtn, { borderColor: d.color + '50', backgroundColor: d.color + '10' }]}
                    onPress={() => handleDifficultySelect(d.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.optionLabel, { color: d.color }]}>{d.label}</Text>
                    <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>{d.desc}</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Play Mode</Text>
                <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                  {selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1)} difficulty
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
