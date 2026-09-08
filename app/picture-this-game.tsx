/**
 * Picture This! — s75 Arcade Shelf category page.
 * Category tiles expand into that category's top-3 board (accumulated score,
 * matching the game's board semantics) + your score + Play; Play runs the
 * difficulty → play-mode GlassSheet steps. Libations/Wine honor the org's
 * category switches, and Wine additionally follows the menu's Wine visibility.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from "expo-router/react-navigation";
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { isManagerOrOwner } from '@/utils/roles';
import { supabase } from '@/app/integrations/supabase/client';
import { fetchOwnWineVisible } from '@/utils/game/wineVisibility';
import {
  PictureThisCategory,
  PictureThisDifficulty,
  PictureThisPlayMode,
} from '@/utils/game/pictureThisGenerator';
import PremiumGate from '@/components/PremiumGate';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import BottomNavBar from '@/components/BottomNavBar';
import JoltOverlay from '@/components/JoltOverlay';
import GameSquareTile from '@/components/game/GameSquareTile';
import GameBoardCard, { GameBoardRow } from '@/components/game/GameBoardCard';
import GameHubHeaderAction from '@/components/game/GameHubHeaderAction';
import GamePickerSheet from '@/components/game/GamePickerSheet';
import { CATEGORY_VISUALS } from '@/components/game/gameVisuals';
import { fetchCategoryBoard } from '@/utils/game/boards';
import { formatPlayedLine } from '@/utils/game/scoreLine';
import { QuickSetup, loadQuickSetup, saveQuickSetup } from '@/utils/game/quickSetup';
import { useMiniProfile } from '@/contexts/MiniProfileContext';
import { fonts } from '@/constants/fonts';

interface CategoryInfo {
  key: PictureThisCategory;
  labelKey: string;
  descKey: string;
  icon: { ios: string; android: string };
  accent: string;
  gradient: readonly [string, string];
  difficulties: PictureThisDifficulty[];
}

// Categories carry the shared cross-game color language (gameVisuals.ts).
const CATEGORIES: CategoryInfo[] = [
  {
    key: 'food',
    labelKey: 'picture_this:cat_food',
    descKey: 'picture_this:cat_food_desc',
    icon: { ios: 'fork.knife', android: 'restaurant' },
    accent: CATEGORY_VISUALS.food.accent,
    gradient: CATEGORY_VISUALS.food.gradient,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    key: 'libations',
    labelKey: 'picture_this:cat_libations',
    descKey: 'picture_this:cat_libations_desc',
    icon: { ios: 'wineglass.fill', android: 'local-bar' },
    accent: CATEGORY_VISUALS.libations.accent,
    gradient: CATEGORY_VISUALS.libations.gradient,
    difficulties: ['easy', 'medium', 'hard'],
  },
  {
    key: 'wine',
    labelKey: 'picture_this:cat_wine',
    descKey: 'picture_this:cat_wine_desc',
    icon: { ios: 'wineglass', android: 'wine-bar' },
    accent: CATEGORY_VISUALS.wine.accent,
    gradient: CATEGORY_VISUALS.wine.gradient,
    difficulties: ['medium', 'hard'],
  },
  {
    key: 'menu_prices',
    labelKey: 'picture_this:cat_menu_prices',
    descKey: 'picture_this:cat_menu_prices_desc',
    icon: { ios: 'dollarsign.circle.fill', android: 'attach-money' },
    accent: CATEGORY_VISUALS.menu_prices.accent,
    gradient: CATEGORY_VISUALS.menu_prices.gradient,
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

interface MyCategoryLine {
  score: number;
  games_played: number;
}

export default function PictureThisGameScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { hasPremium } = useSubscription();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { open: openMiniProfile } = useMiniProfile();
  const perMenu = organization?.menu_category_scope === 'per_menu';

  // Wine tile shows only when the org's Wine category is visible on the menu
  // AND the editor's category switch is on. null = still checking: keep the
  // tile hidden until resolved (no flash-then-vanish on wine-hidden orgs).
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

  // Conditional categories wait for the real org row (no flash of a
  // switched-off tile on cold start); errors fail open via the context default.
  const visibleCategories = CATEGORIES.filter((c) => {
    if (c.key === 'wine')
      return !orgLoading && organization.games_show_pt_wine && wineVisible === true;
    if (c.key === 'libations') return !orgLoading && organization.games_show_pt_libations;
    return true;
  });

  const [expanded, setExpanded] = useState<PictureThisCategory | null>(null);
  const [boards, setBoards] = useState<Partial<Record<PictureThisCategory, GameBoardRow[]>>>({});
  const [myStats, setMyStats] = useState<Record<string, MyCategoryLine>>({});

  const [pickerCategory, setPickerCategory] = useState<CategoryInfo | null>(null);
  const [pickerStep, setPickerStep] = useState<'difficulty' | 'playmode'>('difficulty');
  const [selectedDifficulty, setSelectedDifficulty] = useState<PictureThisDifficulty>('easy');
  // Remembered quick-play setup per category (device-local; Hub·A lockdown).
  const [setups, setSetups] = useState<Record<string, QuickSetup>>({});

  // If a switch (or wine visibility) hides the expanded category, close the
  // orphaned board card too.
  const visibleKey = visibleCategories.map((c) => c.key).join(',');
  useEffect(() => {
    if (expanded && !visibleCategories.some((c) => c.key === expanded)) setExpanded(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, expanded]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      let cancelled = false;
      (async () => {
        const { data } = await supabase.rpc('get_my_game_category_stats', {
          p_actor_id: user.id,
          p_game: 'picture_this',
        });
        if (cancelled) return;
        const byCat: Record<string, MyCategoryLine> = {};
        for (const row of data || []) {
          byCat[row.category] = { score: Number(row.score), games_played: Number(row.games_played) };
        }
        setMyStats(byCat);
        setBoards({});
      })();
      // Remembered setups load in parallel (device-local, never blocks the boards).
      (async () => {
        const loaded: Record<string, QuickSetup> = {};
        for (const cat of CATEGORIES) {
          const s = await loadQuickSetup('picture_this', cat.key);
          if (s) loaded[cat.key] = s;
        }
        if (!cancelled) setSetups(loaded);
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.id])
  );

  // Lazy top-3 for the expanded category — accumulated score per player.
  useEffect(() => {
    if (!expanded || !user?.id || boards[expanded]) return;
    let cancelled = false;
    (async () => {
      // null = fetch failed: keep the cache (spinner if nothing) rather than
      // rendering a false empty board.
      const rows = await fetchCategoryBoard(user.id, 'picture_this', expanded);
      if (cancelled || !rows) return;
      setBoards((prev) => ({ ...prev, [expanded]: rows }));
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, user?.id, boards]);

  const openPicker = (cat: CategoryInfo) => {
    setPickerCategory(cat);
    setPickerStep('difficulty');
    // The ⚙ path starts from the remembered difficulty when it's still offered.
    const stored = setups[cat.key]?.difficulty as PictureThisDifficulty | undefined;
    setSelectedDifficulty(stored && cat.difficulties.includes(stored) ? stored : cat.difficulties[0]);
  };

  const launch = (catKey: PictureThisCategory, difficulty: PictureThisDifficulty, playMode: string) => {
    router.push({
      pathname: '/picture-this-play',
      params: { category: catKey, difficulty, playMode },
    });
  };

  // Quick play: a remembered setup launches straight in; first run opens the sheet.
  const handlePlay = (cat: CategoryInfo) => {
    const s = setups[cat.key];
    const stored = s?.difficulty as PictureThisDifficulty | undefined;
    if (s && stored && cat.difficulties.includes(stored)) {
      launch(cat.key, stored, s.playMode);
    } else {
      openPicker(cat);
    }
  };

  const handleFinalPick = (playMode: string) => {
    const cat = pickerCategory;
    setPickerCategory(null);
    if (!cat) return;
    const setup: QuickSetup = { difficulty: selectedDifficulty, playMode };
    setSetups((prev) => ({ ...prev, [cat.key]: setup }));
    saveQuickSetup('picture_this', cat.key, setup);
    launch(cat.key, selectedDifficulty, playMode);
  };

  // Difficulty labels carry a leading emoji — strip it for the compact sub-line.
  const stripEmoji = (s: string) => s.replace(/^[^A-Za-zÀ-ÿ¿¡]+/, '');

  const setupLine = (cat: CategoryInfo): string | undefined => {
    const s = setups[cat.key];
    const stored = s?.difficulty as PictureThisDifficulty | undefined;
    if (!s || !stored || !cat.difficulties.includes(stored)) return undefined;
    const modeKey = s.playMode === 'timed' ? 'picture_this:mode_timed' : 'picture_this:mode_lives';
    return `${stripEmoji(t(DIFFICULTY_INFO[stored].labelKey))} · ${t(modeKey)}`;
  };

  const renderDifficultyDesc = (difficulty: PictureThisDifficulty): string => {
    if (pickerCategory) {
      const overrideKey = DIFFICULTY_DESC_OVERRIDE[pickerCategory.key]?.[difficulty];
      if (overrideKey) return t(overrideKey);
    }
    return t(DIFFICULTY_INFO[difficulty].descKey);
  };

  const youLine = (catKey: PictureThisCategory): string =>
    formatPlayedLine(t, myStats[catKey]?.score, myStats[catKey]?.games_played);

  if (!hasPremium) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader
          title={t('picture_this:hub_title')}
          eyebrow={t('game_hub_ui:title')}
          right={<GameHubHeaderAction context="gamePage" />}
          rightWide
        />
        {isManagerOrOwner(user) ? (
          <PremiumGate
            desc={t('game_hub_ui:premium_intro')}
            bullets={[t('game_hub_ui:premium_b1'), t('game_hub_ui:premium_b2')]}
            footer={t('game_hub_ui:premium_footer')}
          />
        ) : (
          // Employees can't purchase — no upsell, just a friendly nudge.
          <PremiumGate
            title={t('common:feature_locked_title')}
            desc={t('common:feature_locked_desc')}
            footer={t('game_hub_ui:locked_joke')}
            showButton={false}
          />
        )}
      </View>
    );
  }

  const expandedInfo = expanded ? CATEGORIES.find((c) => c.key === expanded) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
          title={t('picture_this:hub_title')}
          eyebrow={t('game_hub_ui:title')}
          right={<GameHubHeaderAction context="gamePage" />}
          rightWide
        />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <View style={[styles.introCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.introTitle, { color: colors.text }]}>{t('picture_this:intro_title')}</Text>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            {t('picture_this:intro_desc')}
          </Text>
          <Text style={[styles.introTip, { color: colors.textSecondary }]}>
            {t('picture_this:intro_tip')}
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t('picture_this:choose_category')}
        </Text>

        <View style={styles.grid}>
          {visibleCategories.map((cat) => (
            <View key={cat.key} style={styles.gridCell}>
              <GameSquareTile
                label={t(cat.labelKey)}
                iosIcon={cat.icon.ios}
                androidIcon={cat.icon.android}
                gradient={cat.gradient}
                aspectRatio={1.45}
                selected={expanded === cat.key}
                onPress={() => setExpanded((prev) => (prev === cat.key ? null : cat.key))}
              />
            </View>
          ))}
        </View>

        {expandedInfo && (
          <GameBoardCard
            accent={expandedInfo.accent}
            iosIcon={expandedInfo.icon.ios}
            androidIcon={expandedInfo.icon.android}
            title={t(expandedInfo.labelKey)}
            desc={t(expandedInfo.descKey)}
            rows={boards[expandedInfo.key] ?? null}
            emptyText={t('picture_this:no_scores_yet')}
            youLabel={t('game_hub_ui:your_score')}
            youValue={youLine(expandedInfo.key)}
            playLabel={t('game_hub_ui:play')}
            onPlay={() => handlePlay(expandedInfo)}
            playSetupLine={setupLine(expandedInfo)}
            onChangeSetup={setupLine(expandedInfo) ? () => openPicker(expandedInfo) : undefined}
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
            ? t('picture_this:choose_difficulty')
            : t('picture_this:choose_play_mode')
        }
        subtitle={
          pickerStep === 'difficulty'
            ? pickerCategory
              ? t(pickerCategory.labelKey)
              : undefined
            : // Difficulty labels carry a leading emoji — strip it for the quiet subtitle.
              t(DIFFICULTY_INFO[selectedDifficulty].labelKey).replace(/^[^A-Za-zÀ-ÿ¿¡]+/, '')
        }
        dismissOnPick={pickerStep === 'playmode'}
        options={
          pickerStep === 'difficulty'
            ? (pickerCategory?.difficulties ?? []).map((d) => ({
                key: d,
                label: t(DIFFICULTY_INFO[d].labelKey),
                desc: renderDifficultyDesc(d),
                color: DIFFICULTY_INFO[d].color,
              }))
            : PLAY_MODES.map((pm) => ({
                key: pm.value,
                label: t(pm.labelKey),
                desc: t(pm.descKey),
              }))
        }
        onPick={(key) => {
          if (pickerStep === 'difficulty') {
            setSelectedDifficulty(key as PictureThisDifficulty);
            setPickerStep('playmode');
          } else {
            handleFinalPick(key);
          }
        }}
        backLabel={pickerStep === 'playmode' ? t('picture_this:back_to_difficulty') : undefined}
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
