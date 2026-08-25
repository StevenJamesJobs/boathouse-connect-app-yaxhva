/**
 * Menu Memory Game — s75 Arcade Shelf category page.
 * Mode tiles expand into that mode's top-3 board + your best + Play; Play
 * opens the Lives/Timed GlassSheet, then gameplay continues from the highest
 * completed difficulty. Mode visibility honors the org's category switches
 * (Game Hub Editor → Game Setup) and the menu's Wine visibility.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { isManagerOrOwner } from '@/utils/roles';
import { supabase } from '@/app/integrations/supabase/client';
import { fetchOwnWineVisible } from '@/utils/game/wineVisibility';
import { GameMode, PlayMode, GAME_MODE_INFO } from '@/types/game';
import PremiumGate from '@/components/PremiumGate';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import BottomNavBar from '@/components/BottomNavBar';
import JoltOverlay from '@/components/JoltOverlay';
import GameSquareTile from '@/components/game/GameSquareTile';
import GameBoardCard, { GameBoardRow } from '@/components/game/GameBoardCard';
import GamePickerSheet from '@/components/game/GamePickerSheet';
import { CATEGORY_VISUALS } from '@/components/game/gameVisuals';
import { fetchCategoryBoard } from '@/utils/game/boards';
import { formatPlayedLine } from '@/utils/game/scoreLine';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import { fonts } from '@/constants/fonts';

interface ModeStats {
  best_score: number;
  games_played: number;
  highest_difficulty: number;
}

// Modes mapped onto the shared cross-game color language (gameVisuals.ts).
const MODE_VISUALS: Record<GameMode, { accent: string; gradient: readonly [string, string] }> = {
  wine_pairings: CATEGORY_VISUALS.wine,
  ingredients_dishes: CATEGORY_VISUALS.food,
  cocktail_ingredients: CATEGORY_VISUALS.libations,
};

export default function MenuMemoryGameScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { hasPremium } = useSubscription();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { open: openMiniProfile } = useMiniProfile();

  const [modeStats, setModeStats] = useState<Record<string, ModeStats | null>>({});
  const [myLines, setMyLines] = useState<Record<string, { score: number; games_played: number }>>({});
  const [expanded, setExpanded] = useState<GameMode | null>(null);
  const [boards, setBoards] = useState<Partial<Record<GameMode, GameBoardRow[]>>>({});
  const [pickerMode, setPickerMode] = useState<GameMode | null>(null);

  // Wine & Entree Pairings shows only when the org's Wine category is visible
  // AND the editor's category switch is on. null = still checking: render
  // NOTHING yet so wine-hidden orgs never see the tile flash-then-vanish.
  const perMenu = organization?.menu_category_scope === 'per_menu';
  const [wineVisible, setWineVisible] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchOwnWineVisible(user?.id, perMenu).then((v) => {
      if (!cancelled) setWineVisible(v);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, perMenu]);

  // Conditional modes wait for the real org row (no flash of a switched-off
  // tile on cold start); on fetch error the context fails open, matching the
  // wine-visibility precedent.
  const modes: GameMode[] = [
    ...(!orgLoading && organization.games_show_wine_pairings && wineVisible === true
      ? (['wine_pairings'] as GameMode[])
      : []),
    'ingredients_dishes' as GameMode,
    ...(!orgLoading && organization.games_show_cocktails
      ? (['cocktail_ingredients'] as GameMode[])
      : []),
  ];

  // If a category switch (or wine visibility) hides the expanded mode, close
  // the orphaned board card too.
  const modesKey = modes.join(',');
  useEffect(() => {
    if (expanded && !modes.includes(expanded)) setExpanded(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modesKey, expanded]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      let cancelled = false;
      (async () => {
        // Two self-only RPCs: get_my_game_stats drives the difficulty
        // continuation (its aggregates include incomplete plays), while the
        // DISPLAYED best/count comes from get_my_game_category_stats so it
        // matches the completed-only board right above it.
        const [statsRes, lineRes] = await Promise.all([
          supabase.rpc('get_my_game_stats', { p_actor_id: user.id }),
          supabase.rpc('get_my_game_category_stats', { p_actor_id: user.id, p_game: 'memory' }),
        ]);
        if (cancelled) return;
        const stats: Record<string, ModeStats | null> = {};
        for (const row of statsRes.data || []) {
          stats[row.game_mode] = {
            best_score: row.best_score,
            games_played: Number(row.games_played),
            highest_difficulty: row.highest_completed_difficulty,
          };
        }
        setModeStats(stats);
        if (!lineRes.error) {
          const lines: Record<string, { score: number; games_played: number }> = {};
          for (const row of lineRes.data || []) {
            lines[row.category] = { score: Number(row.score), games_played: Number(row.games_played) };
          }
          setMyLines(lines);
        }
        setBoards({});
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.id])
  );

  // Lazy top-3 for the expanded mode — best single score across play modes.
  useEffect(() => {
    if (!expanded || !user?.id || boards[expanded]) return;
    let cancelled = false;
    (async () => {
      // null = fetch failed: keep the cache (spinner if nothing) rather than
      // rendering a false empty board.
      const rows = await fetchCategoryBoard(user.id, 'memory', expanded);
      if (cancelled || !rows) return;
      setBoards((prev) => ({ ...prev, [expanded]: rows }));
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, user?.id, boards]);

  const startGame = (mode: GameMode, playMode: PlayMode) => {
    const stats = modeStats[mode];
    // Start at difficulty 1, or continue from highest completed + 1
    const startDifficulty =
      stats && stats.highest_difficulty > 0 ? Math.min(stats.highest_difficulty + 1, 5) : 1;
    router.push({
      pathname: '/memory-game-play',
      params: { mode, difficulty: String(startDifficulty), play_mode: playMode },
    });
  };

  const youLine = (mode: GameMode): string =>
    formatPlayedLine(t, myLines[mode]?.score, myLines[mode]?.games_played);

  if (!hasPremium) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('memory_game.hub_title')} eyebrow={t('game_hub_ui:title')} />
        {isManagerOrOwner(user) ? (
          <PremiumGate
            desc={t('game_hub_ui.premium_intro')}
            bullets={[t('game_hub_ui.premium_b1'), t('game_hub_ui.premium_b2')]}
            footer={t('game_hub_ui.premium_footer')}
          />
        ) : (
          // Employees can't purchase — no upsell, just a friendly nudge.
          <PremiumGate
            title={t('common.feature_locked_title')}
            desc={t('common.feature_locked_desc')}
            footer={t('game_hub_ui.locked_joke')}
            showButton={false}
          />
        )}
      </View>
    );
  }

  const expandedInfo = expanded ? GAME_MODE_INFO[expanded] : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={t('memory_game.hub_title')} eyebrow={t('game_hub_ui:title')} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <View style={[styles.introCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.introTitle, { color: colors.text }]}>{t('memory_game.intro_title')}</Text>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            {t('memory_game.intro_desc')}
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t('memory_game.choose_mode')}
        </Text>

        <View style={styles.grid}>
          {modes.map((mode) => {
            const info = GAME_MODE_INFO[mode];
            const visuals = MODE_VISUALS[mode];
            return (
              <View key={mode} style={styles.gridCell}>
                <GameSquareTile
                  label={t(info.titleKey)}
                  iosIcon={info.icon.ios}
                  androidIcon={info.icon.android}
                  gradient={visuals.gradient}
                  aspectRatio={1.45}
                  selected={expanded === mode}
                  onPress={() => setExpanded((prev) => (prev === mode ? null : mode))}
                />
              </View>
            );
          })}
        </View>

        {expanded && expandedInfo && (
          <GameBoardCard
            accent={MODE_VISUALS[expanded].accent}
            iosIcon={expandedInfo.icon.ios}
            androidIcon={expandedInfo.icon.android}
            title={t(expandedInfo.titleKey)}
            desc={t(expandedInfo.descKey)}
            rows={boards[expanded] ?? null}
            emptyText={t('memory_game.no_scores_yet')}
            youLabel={t('game_hub_ui:your_best')}
            youValue={youLine(expanded)}
            playLabel={t('game_hub_ui:play')}
            onPlay={() => setPickerMode(expanded)}
            onRowPress={openMiniProfile}
          />
        )}
      </ScrollView>

      <BottomNavBar activeTab="tools" />
      <JoltOverlay role={isManagerOrOwner(user) ? 'manager' : 'employee'} />

      {/* Lives / Timed */}
      <GamePickerSheet
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={t('memory_game.choose_play_mode')}
        subtitle={pickerMode ? t(GAME_MODE_INFO[pickerMode].titleKey) : undefined}
        dismissOnPick
        options={[
          {
            key: 'lives',
            label: `❤️ ${t('memory_game.lives_mode')}`,
            desc: t('memory_game.lives_mode_desc'),
            color: pickerMode ? MODE_VISUALS[pickerMode].accent : undefined,
          },
          {
            key: 'timed',
            label: `⏱ ${t('memory_game.timed_mode')}`,
            desc: t('memory_game.timed_mode_desc'),
            color: '#F5A623',
          },
        ]}
        onPick={(key) => {
          const mode = pickerMode;
          setPickerMode(null);
          if (mode) startGame(mode, key as PlayMode);
        }}
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
