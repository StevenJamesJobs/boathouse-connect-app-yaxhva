/**
 * Game Hub Editor — the s75 "Control Room": two tabs, no satellite screens.
 * Game Setup = sample-data switch, per-category visibility switches, and the
 * Wine & Entree Pairings card (pairings editor lives at /wine-pairings-editor).
 * Leaderboards = employee score lookup + per-game resets expanding INLINE
 * (the old memory/word-search/picture-this editor screens are retired).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavMenu from '@/components/HeaderNavMenu';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getOrgDirectory } from '@/utils/orgDirectory';
import { CATEGORY_VISUALS, GAME_VISUALS } from '@/components/game/gameVisuals';
import { fonts } from '@/constants/fonts';

type EditorTab = 'setup' | 'boards';
type PlayModeFilter = 'all' | 'lives' | 'timed';

type CategoryFlag =
  | 'games_show_wine_pairings'
  | 'games_show_cocktails'
  | 'games_show_ws_libations'
  | 'games_show_pt_libations'
  | 'games_show_pt_wine';

interface UserScoreResult {
  user_id: string;
  name: string;
  profile_picture_url: string | null;
  memory_score: number;
  memory_games: number;
  word_search_score: number;
  word_search_games: number;
  picture_this_score: number;
  picture_this_games: number;
  total_score: number;
  is_test_user: boolean;
}

// The four Setup-tab switches (Wine & Entree Pairings has its own card).
// `premium` rows belong to premium games: on base tier they render LOCKED, not
// hidden (the manager-permissions grammar) — the games they configure are
// locked anyway, and the padlock explains why the switch won't move.
const CATEGORY_SWITCHES: { flag: CategoryFlag; dot: string; labelKey: string; subKey: string; premium?: boolean }[] = [
  { flag: 'games_show_cocktails',    dot: GAME_VISUALS.memory.accent,       labelKey: 'memory_game.mode_cocktail_ingredients', subKey: 'game_hub_editor:sub_cocktails',    premium: true },
  { flag: 'games_show_ws_libations', dot: GAME_VISUALS.word_search.accent,  labelKey: 'word_search:cat_libations_ingredients', subKey: 'game_hub_editor:sub_ws_libations' },
  { flag: 'games_show_pt_libations', dot: GAME_VISUALS.picture_this.accent, labelKey: 'picture_this:cat_libations',            subKey: 'game_hub_editor:sub_pt_libations', premium: true },
  { flag: 'games_show_pt_wine',      dot: GAME_VISUALS.picture_this.accent, labelKey: 'picture_this:cat_wine',                 subKey: 'game_hub_editor:sub_pt_wine',      premium: true },
];

interface ResetRow {
  key: string | null; // null = all of this game
  labelKey: string;
}

interface ResetGame {
  key: 'memory' | 'word_search' | 'picture_this';
  titleKey: string;
  iosIcon: string;
  androidIcon: string;
  accent: string;
  hasModeFilter?: boolean;
  rows: ResetRow[];
}

const RESET_GAMES: ResetGame[] = [
  {
    key: 'word_search',
    titleKey: 'game_hub_cards:word_search_title',
    iosIcon: 'textformat.abc',
    androidIcon: 'spellcheck',
    accent: GAME_VISUALS.word_search.accent,
    rows: [
      { key: 'dishes_ingredients', labelKey: 'word_search:cat_dishes_ingredients' },
      { key: 'libations_ingredients', labelKey: 'word_search:cat_libations_ingredients' },
      { key: null, labelKey: 'game_hub_cards:word_search_title' },
    ],
  },
  {
    key: 'memory',
    titleKey: 'game_hub_cards:memory_title',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    accent: GAME_VISUALS.memory.accent,
    hasModeFilter: true,
    rows: [
      { key: 'wine_pairings', labelKey: 'memory_game.mode_wine_pairings' },
      { key: 'ingredients_dishes', labelKey: 'memory_game.mode_ingredients_dishes' },
      { key: 'cocktail_ingredients', labelKey: 'memory_game.mode_cocktail_ingredients' },
      { key: null, labelKey: 'game_hub_cards:memory_title' },
    ],
  },
  {
    key: 'picture_this',
    titleKey: 'game_hub_cards:picture_this_title',
    iosIcon: 'photo.fill',
    androidIcon: 'photo-camera',
    accent: GAME_VISUALS.picture_this.accent,
    rows: [
      { key: 'food', labelKey: 'picture_this:cat_food' },
      { key: 'libations', labelKey: 'picture_this:cat_libations' },
      { key: 'wine', labelKey: 'picture_this:cat_wine' },
      { key: 'menu_prices', labelKey: 'picture_this:cat_menu_prices' },
      { key: null, labelKey: 'game_hub_cards:picture_this_title' },
    ],
  },
];

export default function GameHubEditorScreen() {
  useRequireManagerRoute();
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();
  const { organizationId, organization, refreshOrganization } = useOrganization();
  const { user } = useAuth();
  const { hasPremium } = useSubscription();
  const params = useLocalSearchParams<{ tab?: string }>();
  const authActorId = user?.id; // stable actor id — the search-result render loops shadow `user`

  // The user-side ⚙ Reset Scores shortcut deep-links straight to Leaderboards.
  const [activeTab, setActiveTab] = useState<EditorTab>(params.tab === 'boards' ? 'boards' : 'setup');
  useEffect(() => {
    if (params.tab === 'boards') setActiveTab('boards');
  }, [params.tab]);

  // ── Setup tab: sample data + category switches ─────────────────────────
  const [useSampleData, setUseSampleData] = useState(organization.games_use_sample_data);
  const [savingSample, setSavingSample] = useState(false);
  useEffect(() => {
    setUseSampleData(organization.games_use_sample_data);
  }, [organization.games_use_sample_data]);

  const handleToggleSampleData = async (value: boolean) => {
    if (!authActorId) return;
    setUseSampleData(value); // optimistic
    setSavingSample(true);
    try {
      const { data, error } = await supabase.rpc('set_org_games_sample_flag', {
        p_actor_id: authActorId,
        p_value: value,
      });
      if (error) throw error;
      const result: any = typeof data === 'string' ? JSON.parse(data) : data;
      if (result && result.success === false) throw new Error(result.error);
      await refreshOrganization();
    } catch (err) {
      console.error('[GameHubEditor] toggle sample data error:', err);
      setUseSampleData(!value); // revert
      Alert.alert(t('game_hub_editor:error'), t('game_hub_editor:sample_data_error'));
    } finally {
      setSavingSample(false);
    }
  };

  const [flags, setFlags] = useState<Record<CategoryFlag, boolean>>({
    games_show_wine_pairings: organization.games_show_wine_pairings,
    games_show_cocktails: organization.games_show_cocktails,
    games_show_ws_libations: organization.games_show_ws_libations,
    games_show_pt_libations: organization.games_show_pt_libations,
    games_show_pt_wine: organization.games_show_pt_wine,
  });
  // Per-flag pending map: two quick toggles must not share a spinner slot, and
  // the resync below must not clobber an optimistic value with a refresh that
  // predates the other toggle's commit.
  const [savingFlags, setSavingFlags] = useState<Partial<Record<CategoryFlag, boolean>>>({});
  useEffect(() => {
    if (Object.values(savingFlags).some(Boolean)) return;
    setFlags({
      games_show_wine_pairings: organization.games_show_wine_pairings,
      games_show_cocktails: organization.games_show_cocktails,
      games_show_ws_libations: organization.games_show_ws_libations,
      games_show_pt_libations: organization.games_show_pt_libations,
      games_show_pt_wine: organization.games_show_pt_wine,
    });
  }, [organization, savingFlags]);

  const handleToggleFlag = async (flag: CategoryFlag, value: boolean) => {
    if (!authActorId) return;
    setFlags((prev) => ({ ...prev, [flag]: value })); // optimistic
    setSavingFlags((prev) => ({ ...prev, [flag]: true }));
    try {
      const { data, error } = await supabase.rpc('set_org_game_category_flag', {
        p_actor_id: authActorId,
        p_flag: flag,
        p_value: value,
      });
      if (error) throw error;
      const result: any = typeof data === 'string' ? JSON.parse(data) : data;
      if (result && result.success === false) throw new Error(result.error);
      await refreshOrganization();
    } catch (err) {
      console.error('[GameHubEditor] toggle category flag error:', err);
      setFlags((prev) => ({ ...prev, [flag]: !value })); // revert
      Alert.alert(t('game_hub_editor:error'), t('game_hub_editor:sample_data_error'));
    } finally {
      setSavingFlags((prev) => ({ ...prev, [flag]: false }));
    }
  };

  // Active-pairing count for the Wine & Entree Pairings card.
  const [pairingCount, setPairingCount] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!authActorId) return;
      let cancelled = false;
      (async () => {
        const { data } = await supabase.rpc('get_wine_pairings', {
          p_actor_id: authActorId,
          p_include_inactive: false,
        });
        if (!cancelled) setPairingCount(Array.isArray(data) ? data.length : 0);
      })();
      return () => {
        cancelled = true;
      };
    }, [authActorId])
  );

  // ── Leaderboards tab: lookup + inline resets ───────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserScoreResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [togglingTestId, setTogglingTestId] = useState<string | null>(null);
  // Monotonic id per lookup: a slow earlier response must not overwrite a
  // newer query's results.
  const searchSeq = useRef(0);

  const [expandedGame, setExpandedGame] = useState<ResetGame['key'] | null>(null);
  const [modeFilter, setModeFilter] = useState<PlayModeFilter>('all');
  const [resettingKey, setResettingKey] = useState<string | null>(null);
  const [resettingAll, setResettingAll] = useState(false);

  // Live search — debounce typing by 250ms, then run the lookup automatically.
  // Empty query clears results.
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    const timer = setTimeout(() => {
      handleSearchUser(trimmed);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleSearchUser = async (queryArg?: string) => {
    if (!authActorId) return;
    const query = (queryArg ?? searchQuery).trim();
    if (!query) return;

    const seq = ++searchSeq.current;
    setSearching(true);
    setHasSearched(true);
    try {
      // Find users matching the search (org-scoped roster via hardened RPC helper)
      const directory = await getOrgDirectory(user?.id);
      const users = directory
        .filter((r) => r.is_active)
        .filter((r) => r.name?.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 10);

      if (!users || users.length === 0) {
        if (seq !== searchSeq.current) return;
        setSearchResults([]);
        setSearching(false);
        return;
      }

      // One manager-gated aggregate RPC replaces three queries per user.
      const { data: totalsData, error: totalsError } = await supabase.rpc('get_org_game_totals', {
        p_actor_id: authActorId,
      });
      if (totalsError) throw totalsError;
      const totalsById = new Map<string, any>((totalsData || []).map((row: any) => [row.user_id, row]));

      const results: UserScoreResult[] = users.map((member: any) => {
        const totals = totalsById.get(member.id);
        const memoryTotal = Number(totals?.memory_score ?? 0);
        const wsTotal = Number(totals?.word_search_score ?? 0);
        const ptTotal = Number(totals?.picture_this_score ?? 0);
        return {
          user_id: member.id,
          name: member.name,
          profile_picture_url: member.profile_picture_url,
          memory_score: memoryTotal,
          memory_games: Number(totals?.memory_games ?? 0),
          word_search_score: wsTotal,
          word_search_games: Number(totals?.word_search_games ?? 0),
          picture_this_score: ptTotal,
          picture_this_games: Number(totals?.picture_this_games ?? 0),
          total_score: memoryTotal + wsTotal + ptTotal,
          is_test_user: !!member.is_test_user,
        };
      });

      if (seq !== searchSeq.current) return;
      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
      if (seq === searchSeq.current) setSearchResults([]);
    }
    if (seq === searchSeq.current) setSearching(false);
  };

  const handleToggleTestUser = async (member: UserScoreResult) => {
    const willBeTest = !member.is_test_user;
    Alert.alert(
      willBeTest
        ? t('game_hub_editor:test_modal_title_mark', { name: member.name })
        : t('game_hub_editor:test_modal_title_unmark', { name: member.name }),
      willBeTest
        ? t('game_hub_editor:test_modal_msg_mark')
        : t('game_hub_editor:test_modal_msg_unmark'),
      [
        { text: t('game_hub_editor:cancel'), style: 'cancel' },
        {
          text: willBeTest ? t('game_hub_editor:mark_btn') : t('game_hub_editor:unmark_btn'),
          style: willBeTest ? 'default' : 'destructive',
          onPress: async () => {
            setTogglingTestId(member.user_id);
            try {
              const { error } = await supabase.rpc('set_user_test_flag', {
                p_user_id: member.user_id,
                p_is_test: willBeTest,
                p_organization_id: organizationId!,
                p_actor_id: authActorId,
              });
              if (error) throw error;
              setSearchResults((prev) =>
                prev.map((r) => (r.user_id === member.user_id ? { ...r, is_test_user: willBeTest } : r))
              );
            } catch (err) {
              console.error('[GameHubEditor] toggle test user error:', err);
              Alert.alert(t('game_hub_editor:error'), t('game_hub_editor:test_flag_error'));
            } finally {
              setTogglingTestId(null);
            }
          },
        },
      ]
    );
  };

  const handleResetUserScores = (member: UserScoreResult) => {
    Alert.alert(
      t('game_hub_editor:reset_all_modal_title'),
      t('game_hub_editor:reset_all_modal_msg'),
      [
        { text: t('game_hub_editor:cancel'), style: 'cancel' },
        {
          text: t('game_hub_editor:reset_everything_btn'),
          style: 'destructive',
          onPress: async () => {
            if (!authActorId) return;
            setResettingUserId(member.user_id);
            try {
              // Manager-gated, same-org enforced; clears all three score tables in one call.
              const { data: resetRes, error: resetError } = await supabase.rpc('reset_user_game_scores', {
                p_actor_id: authActorId,
                p_user_id: member.user_id,
              });
              const resetResult: any = typeof resetRes === 'string' ? JSON.parse(resetRes) : resetRes;

              if (resetError || (resetResult && resetResult.success === false)) {
                console.error('Reset RPC failed:', resetError || resetResult?.error);
                Alert.alert(t('game_hub_editor:error'), t('game_hub_editor:generic_error'));
              } else {
                Alert.alert(t('game_hub_editor:done'), t('game_hub_editor:all_reset_msg'));
                handleSearchUser();
              }
            } catch (err) {
              console.error('Reset user scores error:', err);
              Alert.alert(t('game_hub_editor:error'), t('game_hub_editor:generic_error'));
            }
            setResettingUserId(null);
          },
        },
      ]
    );
  };

  const runScopedReset = async (game: ResetGame, categoryKey: string | null) => {
    if (!authActorId) return;
    const stateKey = `${game.key}:${categoryKey ?? 'all'}`;
    setResettingKey(stateKey);
    try {
      let error;
      if (game.key === 'memory') {
        ({ error } = await supabase.rpc('reset_game_scores_actor', {
          p_actor_id: authActorId,
          p_game_mode: categoryKey ?? undefined,
          p_play_mode: modeFilter !== 'all' ? modeFilter : undefined,
        }));
      } else if (game.key === 'word_search') {
        ({ error } = await supabase.rpc('reset_word_search_scores_actor', {
          p_actor_id: authActorId,
          p_category: categoryKey ?? undefined,
        }));
      } else {
        ({ error } = await supabase.rpc('reset_picture_this_scores_actor', {
          p_actor_id: authActorId,
          p_category: categoryKey ?? undefined,
          p_difficulty: undefined,
        }));
      }
      if (error) throw error;
      Alert.alert(t('game_hub_editor:done'), t('game_hub_editor:reset_done'));
      // Any employee cards on screen still show pre-reset numbers — refresh them.
      if (searchQuery.trim()) handleSearchUser();
    } catch (err) {
      console.error('[GameHubEditor] scoped reset error:', err);
      Alert.alert(t('game_hub_editor:error'), t('game_hub_editor:generic_error'));
    } finally {
      setResettingKey(null);
    }
  };

  const confirmScopedReset = (game: ResetGame, row: ResetRow) => {
    // Include the Lives/Timed filter in the label so the confirm says exactly
    // what will be cleared.
    const filterSuffix =
      game.hasModeFilter && modeFilter !== 'all'
        ? ` (${modeFilter === 'lives' ? t('memory_game.lives_mode') : t('memory_game.timed_mode')})`
        : '';
    const label = row.key === null
      ? `${t(game.titleKey)}${filterSuffix}`
      : `${t(game.titleKey)} — ${t(row.labelKey)}${filterSuffix}`;
    Alert.alert(
      t('game_hub_editor:reset_confirm_title'),
      t('game_hub_editor:reset_confirm_msg', { label }),
      [
        { text: t('game_hub_editor:cancel'), style: 'cancel' },
        {
          text: t('game_hub_editor:reset_btn'),
          style: 'destructive',
          onPress: () => runScopedReset(game, row.key),
        },
      ]
    );
  };

  const handleResetAllScores = () => {
    Alert.alert(
      t('game_hub_editor:reset_all_modal_title'),
      t('game_hub_editor:reset_all_modal_msg'),
      [
        { text: t('game_hub_editor:cancel'), style: 'cancel' },
        {
          text: t('game_hub_editor:reset_everything_btn'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            setResettingAll(true);
            try {
              // Actor-gated RPCs — org derived server-side from the actor.
              // The three deletes touch disjoint tables; run them together.
              const [r1, r2, r3] = await Promise.all([
                supabase.rpc('reset_game_scores_actor', {
                  p_actor_id: user.id,
                  p_game_mode: undefined,
                  p_play_mode: undefined,
                }),
                supabase.rpc('reset_word_search_scores_actor', {
                  p_actor_id: user.id,
                  p_category: undefined,
                }),
                supabase.rpc('reset_picture_this_scores_actor', {
                  p_actor_id: user.id,
                  p_category: undefined,
                  p_difficulty: undefined,
                }),
              ]);
              const firstError = r1.error || r2.error || r3.error;
              if (firstError) throw firstError;

              Alert.alert(t('game_hub_editor:done'), t('game_hub_editor:all_reset_msg'));
              if (searchQuery.trim()) handleSearchUser();
            } catch (err) {
              console.error('Reset all scores error:', err);
              Alert.alert(t('game_hub_editor:error'), t('game_hub_editor:generic_error'));
            } finally {
              setResettingAll(false);
            }
          },
        },
      ]
    );
  };

  // ── Renderers ──────────────────────────────────────────────────────────
  const renderSwitchRow = (
    flag: CategoryFlag,
    dot: string,
    label: string,
    sub: string,
    locked?: boolean
  ) => {
    const on = flags[flag];
    return (
      <View
        key={flag}
        style={[
          styles.switchRow,
          { backgroundColor: colors.glass, borderColor: colors.glassBorder },
          locked && { opacity: 0.55 },
        ]}
      >
        <View style={[styles.switchDot, { backgroundColor: dot, opacity: on && !locked ? 1 : 0.35 }]} />
        <View style={styles.switchTextCol}>
          <Text style={[styles.switchLabel, { color: on && !locked ? colors.text : colors.textSecondary }]}>
            {label}
          </Text>
          <Text style={[styles.switchSub, { color: colors.textSecondary }]}>{sub}</Text>
        </View>
        {locked ? (
          // Premium category on a base org: locked, not hidden — the game
          // itself is locked, so the switch has nothing to show or hide.
          <View style={styles.switchLockBox}>
            <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={15} color={colors.textSecondary} />
          </View>
        ) : savingFlags[flag] ? (
          <ActivityIndicator size="small" color={colors.tint} />
        ) : (
          <Switch
            value={on}
            onValueChange={(v) => handleToggleFlag(flag, v)}
            trackColor={{ false: colors.border, true: colors.tint }}
          />
        )}
      </View>
    );
  };

  const renderSetupTab = () => (
    <>
      {/* Sample game data */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
        <View style={styles.cardRow}>
          <View style={styles.cardTextCol}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {t('game_hub_editor:sample_data_title')}
            </Text>
            <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
              {t('game_hub_editor:sample_data_desc')}
            </Text>
          </View>
          {savingSample ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <Switch
              value={useSampleData}
              onValueChange={handleToggleSampleData}
              trackColor={{ false: colors.border, true: colors.tint }}
            />
          )}
        </View>
      </View>

      {/* Category visibility switches */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
        <View style={styles.cardHead}>
          <View style={[styles.iconChip, { backgroundColor: colors.tint + '20' }]}>
            <IconSymbol
              ios_icon_name="slider.horizontal.3"
              android_material_icon_name="tune"
              size={19}
              color={colors.tint}
            />
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {t('game_hub_editor:categories_title')}
          </Text>
        </View>
        <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
          {t('game_hub_editor:categories_desc')}
        </Text>
        {CATEGORY_SWITCHES.map((row) =>
          renderSwitchRow(row.flag, row.dot, t(row.labelKey), t(row.subKey), row.premium && !hasPremium)
        )}
      </View>

      {/* Wine & Entree Pairings */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
        <View style={styles.cardHead}>
          <View style={[styles.iconChip, { backgroundColor: CATEGORY_VISUALS.wine.accent + '20' }]}>
            <IconSymbol ios_icon_name="wineglass.fill" android_material_icon_name="wine-bar" size={19} color={CATEGORY_VISUALS.wine.accent} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]}>
            {t('memory_game.mode_wine_pairings')}
          </Text>
          <View style={[styles.countPill, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={[styles.countPillText, { color: colors.textSecondary }]}>
              {pairingCount === null
                ? '…'
                : pairingCount === 1
                ? t('game_hub_editor:pairing_one')
                : t('game_hub_editor:pairings_n', { n: pairingCount })}
            </Text>
          </View>
        </View>
        <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
          {t('game_hub_editor:wine_desc')}
        </Text>
        <TouchableOpacity
          style={[styles.manageRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          onPress={() => router.push('/wine-pairings-editor')}
          activeOpacity={0.75}
        >
          <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={15} color={colors.tint} />
          <Text style={[styles.manageText, { color: colors.text }]}>
            {t('game_hub_editor:wine_manage')}
          </Text>
          {/* Base tier: signal the gate up front (the page shows the sales copy). */}
          <IconSymbol
            ios_icon_name={hasPremium ? 'chevron.right' : 'lock.fill'}
            android_material_icon_name={hasPremium ? 'chevron-right' : 'lock'}
            size={14}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        {renderSwitchRow(
          'games_show_wine_pairings',
          GAME_VISUALS.memory.accent,
          t('game_hub_editor:wine_show'),
          t('game_hub_editor:wine_show_sub'),
          !hasPremium
        )}
      </View>
    </>
  );

  const renderBoardsTab = () => (
    <>
      {/* Employee Score Lookup */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        {t('game_hub_editor:lookup_title')}
      </Text>
      <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
        {t('game_hub_editor:lookup_desc')}
      </Text>

      <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
        <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={t('game_hub_editor:search_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={() => handleSearchUser()}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="words"
        />
        {searching && <ActivityIndicator size="small" color={colors.tint} />}
      </View>

      {hasSearched && searchResults.length === 0 && !searching && (
        <Text style={[styles.noResults, { color: colors.textSecondary }]}>
          {t('game_hub_editor:no_employees')}
        </Text>
      )}

      {searchResults.map((member) => (
        <View
          key={member.user_id}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
        >
          <View style={styles.userTop}>
            {member.profile_picture_url ? (
              <StorageImage source={{ uri: member.profile_picture_url }} style={styles.userAvatar} />
            ) : (
              <View style={[styles.userAvatarPlaceholder, { backgroundColor: colors.tint + '2E' }]}>
                <Text style={[styles.userAvatarInitial, { color: colors.tint }]}>
                  {member.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: colors.text }]}>{member.name}</Text>
              <Text style={[styles.userTotal, { color: colors.tint }]}>
                {t('game_hub_editor:total_label', { total: member.total_score.toLocaleString() })}
              </Text>
            </View>
          </View>

          <View style={styles.scoreBreakdown}>
            <View style={[styles.scoreChip, { backgroundColor: GAME_VISUALS.memory.accent + '18' }]}>
              <Text style={[styles.scoreChipLabel, { color: GAME_VISUALS.memory.accent }]}>{t('game_hub_editor:chip_memory')}</Text>
              <Text style={[styles.scoreChipValue, { color: GAME_VISUALS.memory.accent }]}>
                {member.memory_score.toLocaleString()} ({member.memory_games})
              </Text>
            </View>
            <View style={[styles.scoreChip, { backgroundColor: GAME_VISUALS.word_search.accent + '18' }]}>
              <Text style={[styles.scoreChipLabel, { color: GAME_VISUALS.word_search.accent }]}>{t('game_hub_editor:chip_word_search')}</Text>
              <Text style={[styles.scoreChipValue, { color: GAME_VISUALS.word_search.accent }]}>
                {member.word_search_score.toLocaleString()} ({member.word_search_games})
              </Text>
            </View>
            <View style={[styles.scoreChip, { backgroundColor: GAME_VISUALS.picture_this.accent + '18' }]}>
              <Text style={[styles.scoreChipLabel, { color: GAME_VISUALS.picture_this.accent }]}>{t('game_hub_editor:chip_picture_this')}</Text>
              <Text style={[styles.scoreChipValue, { color: GAME_VISUALS.picture_this.accent }]}>
                {member.picture_this_score.toLocaleString()} ({member.picture_this_games})
              </Text>
            </View>
          </View>

          {member.is_test_user && (
            <View style={styles.testBanner}>
              <Text style={styles.testBannerText}>{t('game_hub_editor:test_user_excluded')}</Text>
            </View>
          )}

          <View style={styles.userActions}>
            <TouchableOpacity
              style={[
                styles.testToggleBtn,
                member.is_test_user
                  ? { borderColor: '#F59E0B', backgroundColor: '#F59E0B18' }
                  : { borderColor: colors.glassBorder, backgroundColor: colors.glass },
              ]}
              onPress={() => handleToggleTestUser(member)}
              disabled={togglingTestId === member.user_id}
            >
              {togglingTestId === member.user_id ? (
                <ActivityIndicator size="small" color="#F59E0B" />
              ) : (
                <Text
                  style={[
                    styles.testToggleText,
                    { color: member.is_test_user ? '#F59E0B' : colors.textSecondary },
                  ]}
                >
                  🧪 {member.is_test_user ? t('game_hub_editor:test_user_on') : t('game_hub_editor:mark_test_user')}
                </Text>
              )}
            </TouchableOpacity>

            {(member.memory_games > 0 || member.word_search_games > 0 || member.picture_this_games > 0) && (
              <TouchableOpacity
                style={[styles.resetUserBtn, { borderColor: '#EF4444' }]}
                onPress={() => handleResetUserScores(member)}
                disabled={resettingUserId === member.user_id}
              >
                {resettingUserId === member.user_id ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={14} color="#EF4444" />
                    <Text style={styles.resetUserBtnText}>{t('game_hub_editor:reset_user_scores')}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {/* Reset by game — tiles expand inline */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 14 }]}>
        {t('game_hub_editor:reset_by_game')}
      </Text>
      {RESET_GAMES.map((game) => {
        const isOpen = expandedGame === game.key;
        return (
          <View key={game.key}>
            <TouchableOpacity
              style={[
                styles.gameRow,
                { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
                isOpen && styles.gameRowOpen,
              ]}
              onPress={() => setExpandedGame((prev) => (prev === game.key ? null : game.key))}
              activeOpacity={0.75}
            >
              <View style={[styles.iconChip, { backgroundColor: game.accent + '20' }]}>
                <IconSymbol
                  ios_icon_name={game.iosIcon as any}
                  android_material_icon_name={game.androidIcon as any}
                  size={19}
                  color={game.accent}
                />
              </View>
              <View style={styles.cardTextCol}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{t(game.titleKey)}</Text>
                <Text style={[styles.cardDesc, { color: colors.textSecondary, marginBottom: 0 }]}>
                  {t(game.key === 'memory' ? 'game_hub_editor:reset_desc_mode' : 'game_hub_editor:reset_desc_cat')}
                </Text>
              </View>
              <IconSymbol
                ios_icon_name={isOpen ? 'chevron.up' : 'chevron.down'}
                android_material_icon_name={isOpen ? 'expand-less' : 'expand-more'}
                size={16}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {isOpen && (
              <View
                style={[
                  styles.resetPanel,
                  { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
                ]}
              >
                {game.hasModeFilter && (
                  <View style={styles.filterRow}>
                    {(['all', 'lives', 'timed'] as PlayModeFilter[]).map((f) => {
                      const label =
                        f === 'all'
                          ? t('game_hub_editor:filter_all')
                          : f === 'lives'
                          ? `❤️ ${t('memory_game.lives_mode')}`
                          : `⏱ ${t('memory_game.timed_mode')}`;
                      const active = modeFilter === f;
                      return (
                        <TouchableOpacity
                          key={f}
                          style={[
                            styles.filterChip,
                            active
                              ? { backgroundColor: colors.tint, borderColor: colors.tint }
                              : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                          ]}
                          onPress={() => setModeFilter(f)}
                        >
                          <Text
                            style={[
                              styles.filterChipText,
                              { color: active ? colors.fireText : colors.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                {game.rows.map((row) => {
                  const isAll = row.key === null;
                  const stateKey = `${game.key}:${row.key ?? 'all'}`;
                  return (
                    <View
                      key={stateKey}
                      style={[
                        styles.resetRow,
                        { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                        isAll && { borderColor: '#EF444466' },
                      ]}
                    >
                      <Text
                        style={[styles.resetRowLabel, { color: isAll ? '#EF4444' : colors.text }]}
                        numberOfLines={1}
                      >
                        {isAll
                          ? t('game_hub_editor:reset_row_all', { game: t(row.labelKey) })
                          : t(row.labelKey)}
                      </Text>
                      <TouchableOpacity
                        style={styles.resetGo}
                        onPress={() => confirmScopedReset(game, row)}
                        disabled={resettingKey !== null}
                      >
                        {resettingKey === stateKey ? (
                          <ActivityIndicator size="small" color="#EF4444" />
                        ) : (
                          <Text style={styles.resetGoText}>{t('game_hub_editor:reset_btn')}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      {/* Danger zone */}
      <Text style={[styles.sectionLabel, { color: '#EF4444', marginTop: 14 }]}>
        {t('game_hub_editor:danger_zone')}
      </Text>
      <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
        {t('game_hub_editor:danger_desc')}
      </Text>
      <TouchableOpacity
        style={[styles.resetAllBtn, resettingAll && { opacity: 0.6 }]}
        onPress={handleResetAllScores}
        disabled={resettingAll}
      >
        {resettingAll ? (
          <ActivityIndicator size="small" color="#EF4444" />
        ) : (
          <>
            <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={16} color="#EF4444" />
            <Text style={styles.resetAllBtnText}>{t('game_hub_editor:reset_all_scores')}</Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('game_hub_editor:title')}
        eyebrow={t('game_hub_ui:eyebrow')}
        rightWide
        right={
          <HeaderNavMenu
            label={t('game_hub_ui:menu_pill')}
            iconIos="gearshape.fill"
            iconAndroid="settings"
            sheetTitle={t('game_hub_editor:title')}
            actions={[
              {
                key: 'user',
                label: t('game_hub_editor:menu_return'),
                iosIcon: 'gamecontroller.fill',
                androidIcon: 'sports-esports',
                onPress: () => router.replace('/game-hub'),
              },
              {
                key: 'rewards',
                label: t('game_hub_ui:menu_rewards'),
                iosIcon: 'star.fill',
                androidIcon: 'star',
                onPress: () => router.push('/rewards-and-reviews-editor'),
              },
              {
                key: 'reset',
                label: t('game_hub_ui:menu_reset'),
                iosIcon: 'arrow.counterclockwise',
                androidIcon: 'refresh',
                onPress: () => setActiveTab('boards'),
              },
            ]}
          />
        }
      />

      {/* Tab selector */}
      <View style={styles.segWrap}>
        <View style={[styles.segContainer, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          {(['setup', 'boards'] as EditorTab[]).map((tabKey) => {
            const active = activeTab === tabKey;
            return (
              <TouchableOpacity
                key={tabKey}
                style={[
                  styles.seg,
                  active && { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: StyleSheet.hairlineWidth + 0.5 },
                ]}
                onPress={() => setActiveTab(tabKey)}
              >
                <Text
                  style={[
                    styles.segText,
                    { color: active ? colors.text : colors.textSecondary },
                    active && { fontFamily: fonts.body.semibold },
                  ]}
                >
                  {tabKey === 'setup' ? t('game_hub_editor:tab_setup') : t('game_hub_editor:tab_boards')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'setup' ? renderSetupTab() : renderBoardsTab()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 60, gap: 10 },

  segWrap: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 12 },
  segContainer: {
    flexDirection: 'row',
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 4,
    gap: 4,
  },
  seg: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  segText: { fontFamily: fonts.body.medium, fontSize: 13.5 },

  // Cards
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 14,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 8 },
  cardTextCol: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: fonts.display.semibold, fontSize: 14.5, marginBottom: 3 },
  cardDesc: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16.5, marginBottom: 9 },
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPill: {
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countPillText: { fontFamily: fonts.mono.semibold, fontSize: 10.5 },

  // Switch rows
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginTop: 8,
  },
  switchDot: { width: 8, height: 8, borderRadius: 4 },
  switchLockBox: { width: 46, alignItems: 'center' },
  switchTextCol: { flex: 1, minWidth: 0 },
  switchLabel: { fontFamily: fonts.body.semibold, fontSize: 13 },
  switchSub: { fontFamily: fonts.body.regular, fontSize: 10, marginTop: 1 },

  // Manage row
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  manageText: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 13 },

  // Section labels
  sectionLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
  },
  sectionDesc: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 17, paddingHorizontal: 2 },

  // Lookup
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14.5, paddingVertical: 0, fontFamily: fonts.body.regular },
  noResults: { textAlign: 'center', fontSize: 13, marginTop: 4, fontStyle: 'italic' },
  userTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 11 },
  userAvatar: { width: 42, height: 42, borderRadius: 21 },
  userAvatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarInitial: { fontSize: 17, fontFamily: fonts.display.bold },
  userInfo: { flex: 1 },
  userName: { fontFamily: fonts.display.semibold, fontSize: 15.5 },
  userTotal: { fontFamily: fonts.mono.semibold, fontSize: 12, marginTop: 2 },
  scoreBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  scoreChip: {
    flexBasis: '31%',
    flexGrow: 1,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  scoreChipLabel: { fontSize: 9.5, fontFamily: fonts.body.semibold, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  scoreChipValue: { fontSize: 11, fontFamily: fonts.mono.semibold },
  testBanner: {
    backgroundColor: '#F59E0B20',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    alignItems: 'center',
  },
  testBannerText: { fontSize: 11, fontFamily: fonts.body.semibold, color: '#B45309' },
  userActions: { gap: 8 },
  testToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderRadius: 11,
    paddingVertical: 9,
  },
  testToggleText: { fontSize: 12.5, fontFamily: fonts.body.semibold },
  resetUserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 11,
    paddingVertical: 9,
    gap: 6,
  },
  resetUserBtnText: { color: '#EF4444', fontSize: 12.5, fontFamily: fonts.body.semibold },

  // Reset-by-game tiles
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 13,
  },
  gameRowOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  resetPanel: {
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderTopWidth: 0,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 2,
  },
  filterRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  filterChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  filterChipText: { fontSize: 11, fontFamily: fonts.body.semibold },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingLeft: 11,
    paddingRight: 6,
    paddingVertical: 6,
    marginTop: 8,
  },
  resetRowLabel: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 12.5 },
  resetGo: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: '#EF444480',
    backgroundColor: '#EF444414',
    paddingHorizontal: 13,
    paddingVertical: 6,
    minWidth: 64,
    alignItems: 'center',
  },
  resetGoText: { color: '#EF4444', fontSize: 11.5, fontFamily: fonts.body.semibold },

  // Danger zone
  resetAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 13,
    paddingVertical: 13,
  },
  resetAllBtnText: { color: '#EF4444', fontSize: 14, fontFamily: fonts.body.semibold },
});
