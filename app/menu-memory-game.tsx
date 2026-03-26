import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { GameMode, GAME_MODE_INFO } from '@/types/game';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';

interface ModeStats {
  best_score: number;
  games_played: number;
  highest_difficulty: number;
}

export default function MenuMemoryGameScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const [modeStats, setModeStats] = useState<Record<GameMode, ModeStats | null>>({
    wine_pairings: null,
    ingredients_dishes: null,
    cocktail_ingredients: null,
  });

  useEffect(() => {
    if (user?.id) loadStats();
  }, [user?.id]);

  const loadStats = async () => {
    if (!user?.id) return;

    const modes: GameMode[] = ['wine_pairings', 'ingredients_dishes', 'cocktail_ingredients'];
    const stats: Record<string, ModeStats | null> = {};

    for (const mode of modes) {
      const { data } = await supabase
        .from('game_scores')
        .select('score, difficulty, completed')
        .eq('user_id', user.id)
        .eq('game_mode', mode)
        .order('score', { ascending: false }) as { data: { score: number; difficulty: number; completed: boolean }[] | null };

      if (data && data.length > 0) {
        stats[mode] = {
          best_score: data[0].score,
          games_played: data.length,
          highest_difficulty: Math.max(...data.filter(d => d.completed).map(d => d.difficulty), 0),
        };
      } else {
        stats[mode] = null;
      }
    }

    setModeStats(stats as Record<GameMode, ModeStats | null>);
  };

  const startGame = (mode: GameMode) => {
    const stats = modeStats[mode];
    // Start at difficulty 1, or continue from highest completed + 1
    const startDifficulty = stats && stats.highest_difficulty > 0
      ? Math.min(stats.highest_difficulty + 1, 5)
      : 1;
    router.push(`/memory-game-play?mode=${mode}&difficulty=${startDifficulty}`);
  };

  const renderModeCard = (mode: GameMode) => {
    const info = GAME_MODE_INFO[mode];
    const stats = modeStats[mode];

    return (
      <TouchableOpacity
        key={mode}
        style={[styles.modeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => startGame(mode)}
        activeOpacity={0.7}
      >
        <View style={styles.modeCardContent}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '20' }]}>
            <IconSymbol
              ios_icon_name={info.icon.ios as any}
              android_material_icon_name={info.icon.android as any}
              size={28}
              color={colors.primary}
            />
          </View>
          <View style={styles.modeInfo}>
            <Text style={[styles.modeTitle, { color: colors.text }]}>
              {t(info.titleKey)}
            </Text>
            <Text style={[styles.modeDesc, { color: colors.textSecondary }]} numberOfLines={2}>
              {t(info.descKey)}
            </Text>
            {stats ? (
              <View style={styles.statsRow}>
                <View style={[styles.statChip, { backgroundColor: colors.primary + '15' }]}>
                  <Text style={[styles.statText, { color: colors.primary }]}>
                    {t('memory_game.best')}: {stats.best_score.toLocaleString()}
                  </Text>
                </View>
                <View style={[styles.statChip, { backgroundColor: colors.primary + '15' }]}>
                  <Text style={[styles.statText, { color: colors.primary }]}>
                    {t('memory_game.level')} {stats.highest_difficulty}/5
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={[styles.newLabel, { color: colors.primary }]}>
                {t('memory_game.tap_to_start')}
              </Text>
            )}
          </View>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={20}
            color={colors.textSecondary}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('memory_game.hub_title')}
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/memory-game-leaderboard')}
          style={styles.leaderboardButton}
        >
          <IconSymbol
            ios_icon_name="trophy.fill"
            android_material_icon_name="emoji-events"
            size={24}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Intro Card */}
        <View style={[styles.introCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
          <Text style={[styles.introTitle, { color: colors.text }]}>
            {t('memory_game.intro_title')}
          </Text>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            {t('memory_game.intro_desc')}
          </Text>
        </View>

        {/* Game Mode Cards */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t('memory_game.choose_mode')}
        </Text>

        {renderModeCard('wine_pairings')}
        {renderModeCard('ingredients_dishes')}
        {renderModeCard('cocktail_ingredients')}
      </ScrollView>

      <BottomNavBar activeTab="tools" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  leaderboardButton: {
    padding: 4,
    width: 40,
    alignItems: 'flex-end',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  introCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  introTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  introText: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  modeCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  modeCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modeInfo: {
    flex: 1,
    marginRight: 8,
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  modeDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statText: {
    fontSize: 11,
    fontWeight: '600',
  },
  newLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
  },
});
