/**
 * Word Search — s75 Arcade Shelf category page.
 * Category tiles expand into that category's top-3 board + your best + Play;
 * Play runs the difficulty → play-mode GlassSheet steps. The Libations
 * category honors the org's category switch (Game Hub Editor → Game Setup).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { isManagerOrOwner } from '@/utils/roles';
import { supabase } from '@/app/integrations/supabase/client';
import {
  WORD_SEARCH_CATEGORIES,
  WORD_SEARCH_CATEGORY_INFO,
  WordSearchCategory,
  WordSearchDifficulty,
  WordSearchPlayMode,
} from '@/types/game';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import BottomNavBar from '@/components/BottomNavBar';
import JoltOverlay from '@/components/JoltOverlay';
import GameSquareTile from '@/components/game/GameSquareTile';
import GameBoardCard, { GameBoardRow } from '@/components/game/GameBoardCard';
import GamePickerSheet from '@/components/game/GamePickerSheet';
import { CATEGORY_VISUALS as SHARED_VISUALS } from '@/components/game/gameVisuals';
import { fetchCategoryBoard } from '@/utils/game/boards';
import { formatPlayedLine } from '@/utils/game/scoreLine';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import { fonts } from '@/constants/fonts';

const CATEGORY_LABEL_KEYS: Record<WordSearchCategory, string> = {
  dishes_ingredients: 'word_search:cat_dishes_ingredients',
  libations_ingredients: 'word_search:cat_libations_ingredients',
};

const CATEGORY_DESC_KEYS: Record<WordSearchCategory, string> = {
  dishes_ingredients: 'word_search:cat_dishes_ingredients_desc',
  libations_ingredients: 'word_search:cat_libations_ingredients_desc',
};

// Categories mapped onto the shared cross-game color language (gameVisuals.ts).
const CATEGORY_VISUALS: Record<WordSearchCategory, { accent: string; gradient: readonly [string, string] }> = {
  dishes_ingredients: SHARED_VISUALS.food,
  libations_ingredients: SHARED_VISUALS.libations,
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

interface MyCategoryLine {
  score: number;
  games_played: number;
}

export default function WordSearchGameScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { open: openMiniProfile } = useMiniProfile();

  const [expanded, setExpanded] = useState<WordSearchCategory | null>(null);
  const [boards, setBoards] = useState<Partial<Record<WordSearchCategory, GameBoardRow[]>>>({});
  const [myStats, setMyStats] = useState<Record<string, MyCategoryLine>>({});

  const [pickerCategory, setPickerCategory] = useState<WordSearchCategory | null>(null);
  const [pickerStep, setPickerStep] = useState<'difficulty' | 'playmode'>('difficulty');
  const [selectedDifficulty, setSelectedDifficulty] = useState<WordSearchDifficulty>('easy');

  // The Libations category waits for the real org row (no flash of a
  // switched-off tile on cold start); errors fail open via the context default.
  const categories = WORD_SEARCH_CATEGORIES.filter(
    (cat) =>
      cat !== 'libations_ingredients' || (!orgLoading && organization.games_show_ws_libations)
  );

  // If the switch hides the expanded category, close the orphaned board card.
  const categoriesKey = categories.join(',');
  useEffect(() => {
    if (expanded && !categories.includes(expanded)) setExpanded(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriesKey, expanded]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      let cancelled = false;
      (async () => {
        const { data } = await supabase.rpc('get_my_game_category_stats', {
          p_actor_id: user.id,
          p_game: 'word_search',
        });
        if (cancelled) return;
        const byCat: Record<string, MyCategoryLine> = {};
        for (const row of data || []) {
          byCat[row.category] = { score: Number(row.score), games_played: Number(row.games_played) };
        }
        setMyStats(byCat);
        setBoards({});
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.id])
  );

  // Lazy top-3 for the expanded category — best single score per player.
  useEffect(() => {
    if (!expanded || !user?.id || boards[expanded]) return;
    let cancelled = false;
    (async () => {
      // null = fetch failed: keep the cache (spinner if nothing) rather than
      // rendering a false empty board.
      const rows = await fetchCategoryBoard(user.id, 'word_search', expanded);
      if (cancelled || !rows) return;
      setBoards((prev) => ({ ...prev, [expanded]: rows }));
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, user?.id, boards]);

  const openPicker = (category: WordSearchCategory) => {
    setPickerCategory(category);
    setPickerStep('difficulty');
    setSelectedDifficulty('easy');
  };

  const handleFinalPick = (playMode: string) => {
    const category = pickerCategory;
    setPickerCategory(null);
    if (!category) return;
    router.push({
      pathname: '/word-search-play',
      params: { category, difficulty: selectedDifficulty, playMode },
    });
  };

  const youLine = (cat: WordSearchCategory): string =>
    formatPlayedLine(t, myStats[cat]?.score, myStats[cat]?.games_played);

  const expandedInfo = expanded ? WORD_SEARCH_CATEGORY_INFO[expanded] : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={t('word_search:hub_title')} eyebrow={t('game_hub_ui:title')} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <View style={[styles.introCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.introTitle, { color: colors.text }]}>🔤 {t('word_search:intro_title')}</Text>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            {t('word_search:intro_desc')}
          </Text>
          <Text style={[styles.introTip, { color: colors.textSecondary }]}>
            {t('word_search:intro_tip')}
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t('word_search:choose_category')}
        </Text>

        <View style={styles.grid}>
          {categories.map((cat) => {
            const info = WORD_SEARCH_CATEGORY_INFO[cat];
            return (
              <View key={cat} style={styles.gridCell}>
                <GameSquareTile
                  label={t(CATEGORY_LABEL_KEYS[cat])}
                  iosIcon={info.icon.ios}
                  androidIcon={info.icon.android}
                  gradient={CATEGORY_VISUALS[cat].gradient}
                  aspectRatio={1.45}
                  selected={expanded === cat}
                  onPress={() => setExpanded((prev) => (prev === cat ? null : cat))}
                />
              </View>
            );
          })}
        </View>

        {expanded && expandedInfo && (
          <GameBoardCard
            accent={CATEGORY_VISUALS[expanded].accent}
            iosIcon={expandedInfo.icon.ios}
            androidIcon={expandedInfo.icon.android}
            title={t(CATEGORY_LABEL_KEYS[expanded])}
            desc={t(CATEGORY_DESC_KEYS[expanded])}
            rows={boards[expanded] ?? null}
            emptyText={t('word_search:no_scores_yet')}
            youLabel={t('game_hub_ui:your_best')}
            youValue={youLine(expanded)}
            playLabel={t('game_hub_ui:play')}
            onPlay={() => openPicker(expanded)}
            onRowPress={openMiniProfile}
          />
        )}
      </ScrollView>

      <BottomNavBar activeTab="tools" />
      <JoltOverlay role={isManagerOrOwner(user) ? 'manager' : 'employee'} />

      {/* Difficulty → play mode */}
      <GamePickerSheet
        visible={pickerCategory !== null}
        onClose={() => setPickerCategory(null)}
        title={
          pickerStep === 'difficulty'
            ? t('word_search:choose_difficulty')
            : t('word_search:choose_play_mode')
        }
        subtitle={
          pickerStep === 'difficulty'
            ? pickerCategory
              ? t(CATEGORY_LABEL_KEYS[pickerCategory])
              : undefined
            : t('word_search:difficulty_suffix', {
                difficulty: t(`word_search:difficulty_${selectedDifficulty}`),
              })
        }
        dismissOnPick={pickerStep === 'playmode'}
        options={
          pickerStep === 'difficulty'
            ? DIFFICULTIES.map((d) => ({
                key: d.value,
                label: `${d.emoji} ${t(d.labelKey)}`,
                desc: t(d.descKey),
                color: d.color,
              }))
            : PLAY_MODES.map((pm) => ({
                key: pm.value,
                label: `${pm.emoji} ${t(pm.labelKey)}`,
                desc: t(pm.descKey),
              }))
        }
        onPick={(key) => {
          if (pickerStep === 'difficulty') {
            setSelectedDifficulty(key as WordSearchDifficulty);
            setPickerStep('playmode');
          } else {
            handleFinalPick(key);
          }
        }}
        backLabel={pickerStep === 'playmode' ? t('word_search:back_to_difficulty') : undefined}
        onBack={pickerStep === 'playmode' ? () => setPickerStep('difficulty') : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 140,
  },
  introCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 14,
    marginBottom: 14,
  },
  introTitle: {
    fontFamily: fonts.display.semibold,
    fontSize: 14.5,
    marginBottom: 4,
  },
  introText: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    lineHeight: 18,
  },
  introTip: {
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    lineHeight: 16,
    fontStyle: 'italic',
    marginTop: 6,
  },
  sectionLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  gridCell: {
    flexBasis: '48%',
    flexGrow: 1,
    maxWidth: '49%',
  },
});
