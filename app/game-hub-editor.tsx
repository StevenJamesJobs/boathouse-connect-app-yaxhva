/**
 * Game Hub Editor
 * Manager landing screen linking to Memory Game Editor and Word Search Editor.
 * Includes Reset All, and Employee Score Lookup.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import HeaderNavButton from '@/components/HeaderNavButton';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgDirectory } from '@/utils/orgDirectory';

interface EditorCard {
  titleKey: string;
  descKey: string;
  iosIcon: string;
  androidIcon: string;
  route: string;
  color: string;
}

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

const EDITOR_CARDS: EditorCard[] = [
  {
    titleKey: 'game_hub_editor:memory_editor_title',
    descKey: 'game_hub_editor:memory_editor_desc',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    route: '/memory-game-editor',
    color: '#6366F1',
  },
  {
    titleKey: 'game_hub_editor:ws_editor_title',
    descKey: 'game_hub_editor:ws_editor_desc',
    iosIcon: 'textformat.abc',
    androidIcon: 'spellcheck',
    route: '/word-search-editor',
    color: '#10B981',
  },
  {
    titleKey: 'game_hub_editor:pt_editor_title',
    descKey: 'game_hub_editor:pt_editor_desc',
    iosIcon: 'photo.fill',
    androidIcon: 'photo-camera',
    route: '/picture-this-editor',
    color: '#EC4899',
  },
];

export default function GameHubEditorScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();
  const { organizationId, organization, refreshOrganization } = useOrganization();
  const { user } = useAuth();
  const authActorId = user?.id; // stable actor id — the search-result render loops shadow `user`
  const [resettingAll, setResettingAll] = useState(false);

  // "Use sample game data" toggle — see utils/game/gameSource.ts. ON = games
  // draw from the Boathouse sample org; OFF = the org's own menu only.
  const [useSampleData, setUseSampleData] = useState(organization.games_use_sample_data);
  const [savingSample, setSavingSample] = useState(false);
  useEffect(() => {
    setUseSampleData(organization.games_use_sample_data);
  }, [organization.games_use_sample_data]);

  const handleToggleSampleData = async (value: boolean) => {
    setUseSampleData(value); // optimistic
    setSavingSample(true);
    try {
      const { error } = await (supabase
        .from('organizations') as any)
        .update({ games_use_sample_data: value })
        .eq('id', organizationId);
      if (error) throw error;
      await refreshOrganization();
    } catch (err) {
      console.error('[GameHubEditor] toggle sample data error:', err);
      setUseSampleData(!value); // revert
      Alert.alert(t('game_hub_editor:error'), t('game_hub_editor:sample_data_error'));
    } finally {
      setSavingSample(false);
    }
  };

  // Employee Lookup state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserScoreResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [togglingTestId, setTogglingTestId] = useState<string | null>(null);

  const handleToggleTestUser = async (user: UserScoreResult) => {
    const willBeTest = !user.is_test_user;
    Alert.alert(
      willBeTest
        ? t('game_hub_editor:test_modal_title_mark', { name: user.name })
        : t('game_hub_editor:test_modal_title_unmark', { name: user.name }),
      willBeTest
        ? t('game_hub_editor:test_modal_msg_mark')
        : t('game_hub_editor:test_modal_msg_unmark'),
      [
        { text: t('game_hub_editor:cancel'), style: 'cancel' },
        {
          text: willBeTest ? t('game_hub_editor:mark_btn') : t('game_hub_editor:unmark_btn'),
          style: willBeTest ? 'default' : 'destructive',
          onPress: async () => {
            setTogglingTestId(user.user_id);
            try {
              const { error } = await supabase.rpc('set_user_test_flag', {
                p_user_id: user.user_id,
                p_is_test: willBeTest,
                p_organization_id: organizationId,
                p_actor_id: authActorId,
              });
              if (error) throw error;
              setSearchResults(prev => prev.map(r =>
                r.user_id === user.user_id ? { ...r, is_test_user: willBeTest } : r,
              ));
            } catch (err) {
              console.error('[GameHubEditor] toggle test user error:', err);
              Alert.alert(t('game_hub_editor:error'), t('game_hub_editor:test_flag_error'));
            } finally {
              setTogglingTestId(null);
            }
          },
        },
      ],
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
            setResettingAll(true);
            try {
              // Use SECURITY DEFINER RPCs (bypasses RLS)
              const { error: err1 } = await supabase.rpc('reset_game_scores', {
                p_game_mode: null,
                p_play_mode: null,
                p_organization_id: organizationId,
              });
              if (err1) {
                console.error('Error resetting game scores:', err1);
                throw err1;
              }

              const { error: err2 } = await supabase.rpc('reset_word_search_scores', {
                p_category: null,
                p_organization_id: organizationId,
              });
              if (err2) {
                console.error('Error resetting word search scores:', err2);
                throw err2;
              }

              const { error: err3 } = await supabase.rpc('reset_picture_this_scores', {
                p_category: null,
                p_difficulty: null,
                p_organization_id: organizationId,
              });
              if (err3) {
                console.error('Error resetting picture this scores:', err3);
                throw err3;
              }

              Alert.alert(t('game_hub_editor:done'), t('game_hub_editor:all_reset_msg'));
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

  // Live search — debounce typing by 250ms, then run the lookup automatically.
  // Empty query clears results.
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    const t = setTimeout(() => {
      handleSearchUser(trimmed);
    }, 250);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleSearchUser = async (queryArg?: string) => {
    const query = (queryArg ?? searchQuery).trim();
    if (!query) return;

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
        setSearchResults([]);
        setSearching(false);
        return;
      }

      // Get scores for each user
      const results: UserScoreResult[] = [];
      for (const user of users) {
        // Memory game scores
        const { data: memoryScores } = await (supabase
          .from('game_scores') as any)
          .select('score')
          .eq('user_id', user.id)
          .eq('completed', true);

        // Word search scores
        const { data: wsScores } = await (supabase
          .from('word_search_scores') as any)
          .select('score')
          .eq('user_id', user.id)
          .eq('completed', true);

        // Picture This scores
        const { data: ptScores } = await (supabase
          .from('picture_this_scores') as any)
          .select('score')
          .eq('user_id', user.id)
          .eq('completed', true);

        const memoryTotal = (memoryScores || []).reduce((sum: number, s: any) => sum + s.score, 0);
        const wsTotal = (wsScores || []).reduce((sum: number, s: any) => sum + s.score, 0);
        const ptTotal = (ptScores || []).reduce((sum: number, s: any) => sum + s.score, 0);

        results.push({
          user_id: user.id,
          name: user.name,
          profile_picture_url: user.profile_picture_url,
          memory_score: memoryTotal,
          memory_games: (memoryScores || []).length,
          word_search_score: wsTotal,
          word_search_games: (wsScores || []).length,
          picture_this_score: ptTotal,
          picture_this_games: (ptScores || []).length,
          total_score: memoryTotal + wsTotal + ptTotal,
          is_test_user: !!user.is_test_user,
        });
      }

      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    }
    setSearching(false);
  };

  const handleResetUserScores = (user: UserScoreResult) => {
    Alert.alert(
      t('game_hub_editor:reset_all_modal_title'),
      t('game_hub_editor:reset_all_modal_msg'),
      [
        { text: t('game_hub_editor:cancel'), style: 'cancel' },
        {
          text: t('game_hub_editor:reset_everything_btn'),
          style: 'destructive',
          onPress: async () => {
            setResettingUserId(user.user_id);
            try {
              const { error: memError } = await (supabase
                .from('game_scores') as any)
                .delete()
                .eq('user_id', user.user_id);

              const { error: wsError } = await (supabase
                .from('word_search_scores') as any)
                .delete()
                .eq('user_id', user.user_id);

              const { error: ptError } = await (supabase
                .from('picture_this_scores') as any)
                .delete()
                .eq('user_id', user.user_id);

              if (memError || wsError || ptError) {
                console.error('Direct delete failed, errors:', memError, wsError, ptError);
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="chevron-left"
            size={22}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>{t('game_hub_editor:title')}</Text>
        <HeaderNavButton label={t('common:to_user')} iconIos="person.fill" iconAndroid="person" onPress={() => router.replace('/game-hub')} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('game_hub_editor:subtitle')}
        </Text>

        {/* Sample game data toggle */}
        <View style={[styles.sampleCard, { backgroundColor: colors.card }]}>
          <View style={styles.sampleTextCol}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('game_hub_editor:sample_data_title')}
            </Text>
            <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
              {t('game_hub_editor:sample_data_desc')}
            </Text>
            <Text style={[styles.sampleLabel, { color: colors.text }]}>
              {t('game_hub_editor:sample_data_label')}
            </Text>
          </View>
          {savingSample ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Switch
              value={useSampleData}
              onValueChange={handleToggleSampleData}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          )}
        </View>

        {/* Employee Score Lookup — placed FIRST so keyboard can't bury results */}
        <View style={styles.lookupSectionTop}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('game_hub_editor:lookup_title')}</Text>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            {t('game_hub_editor:lookup_desc')}
          </Text>

          <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={20} color={colors.textSecondary} />
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
            <TouchableOpacity onPress={() => handleSearchUser()} disabled={searching}>
              {searching ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <IconSymbol ios_icon_name="arrow.right.circle.fill" android_material_icon_name="search" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>

          {/* Search Results */}
          {hasSearched && searchResults.length === 0 && !searching && (
            <Text style={[styles.noResults, { color: colors.textSecondary }]}>{t('game_hub_editor:no_employees')}</Text>
          )}

          {searchResults.map(user => (
            <View key={user.user_id} style={[styles.userCard, { backgroundColor: colors.card }]}>
              <View style={styles.userTop}>
                {user.profile_picture_url ? (
                  <Image source={{ uri: user.profile_picture_url }} style={styles.userAvatar} />
                ) : (
                  <View style={[styles.userAvatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={[styles.userAvatarInitial, { color: colors.primary }]}>
                      {user.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.userInfo}>
                  <Text style={[styles.userName, { color: colors.text }]}>{user.name}</Text>
                  <Text style={[styles.userTotal, { color: colors.primary }]}>
                    {t('game_hub_editor:total_label', { total: user.total_score.toLocaleString() })}
                  </Text>
                </View>
              </View>

              <View style={styles.scoreBreakdown}>
                <View style={[styles.scoreChip, { backgroundColor: '#6366F1' + '15' }]}>
                  <Text style={[styles.scoreChipLabel, { color: '#6366F1' }]}>{t('game_hub_editor:chip_memory')}</Text>
                  <Text style={[styles.scoreChipValue, { color: '#6366F1' }]}>
                    {user.memory_score.toLocaleString()} ({user.memory_games})
                  </Text>
                </View>
                <View style={[styles.scoreChip, { backgroundColor: '#10B981' + '15' }]}>
                  <Text style={[styles.scoreChipLabel, { color: '#10B981' }]}>{t('game_hub_editor:chip_word_search')}</Text>
                  <Text style={[styles.scoreChipValue, { color: '#10B981' }]}>
                    {user.word_search_score.toLocaleString()} ({user.word_search_games})
                  </Text>
                </View>
                <View style={[styles.scoreChip, { backgroundColor: '#EC4899' + '15' }]}>
                  <Text style={[styles.scoreChipLabel, { color: '#EC4899' }]}>{t('game_hub_editor:chip_picture_this')}</Text>
                  <Text style={[styles.scoreChipValue, { color: '#EC4899' }]}>
                    {user.picture_this_score.toLocaleString()} ({user.picture_this_games})
                  </Text>
                </View>
              </View>

              {user.is_test_user && (
                <View style={styles.testBanner}>
                  <Text style={styles.testBannerText}>{t('game_hub_editor:test_user_excluded')}</Text>
                </View>
              )}

              <View style={styles.userActions}>
                <TouchableOpacity
                  style={[
                    styles.testToggleBtn,
                    user.is_test_user
                      ? { borderColor: '#F59E0B', backgroundColor: '#F59E0B15' }
                      : { borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                  onPress={() => handleToggleTestUser(user)}
                  disabled={togglingTestId === user.user_id}
                >
                  {togglingTestId === user.user_id ? (
                    <ActivityIndicator size="small" color="#F59E0B" />
                  ) : (
                    <Text style={[
                      styles.testToggleText,
                      { color: user.is_test_user ? '#F59E0B' : colors.textSecondary },
                    ]}>
                      🧪 {user.is_test_user ? t('game_hub_editor:test_user_on') : t('game_hub_editor:mark_test_user')}
                    </Text>
                  )}
                </TouchableOpacity>

                {(user.memory_games > 0 || user.word_search_games > 0 || user.picture_this_games > 0) && (
                  <TouchableOpacity
                    style={[styles.resetUserBtn, { borderColor: '#EF4444' }]}
                    onPress={() => handleResetUserScores(user)}
                    disabled={resettingUserId === user.user_id}
                  >
                    {resettingUserId === user.user_id ? (
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
        </View>

        {/* Game Editors */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>{t('game_hub_editor:game_editors_section')}</Text>
        {EDITOR_CARDS.map((card) => (
          <TouchableOpacity
            key={card.route}
            style={[styles.card, { backgroundColor: colors.card }]}
            onPress={() => router.push(card.route as any)}
            activeOpacity={0.75}
          >
            <View style={[styles.iconContainer, { backgroundColor: card.color + '18' }]}>
              <IconSymbol
                ios_icon_name={card.iosIcon as any}
                android_material_icon_name={card.androidIcon as any}
                size={30}
                color={card.color}
              />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t(card.titleKey)}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{t(card.descKey)}</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        ))}

        {/* Reset All Scores */}
        <View style={[styles.resetSection, { borderTopColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('game_hub_editor:danger_zone')}</Text>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            {t('game_hub_editor:danger_desc')}
          </Text>
          <TouchableOpacity
            style={[styles.resetAllBtn, resettingAll && { opacity: 0.6 }]}
            onPress={handleResetAllScores}
            disabled={resettingAll}
          >
            {resettingAll ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.resetAllBtnText}>{t('game_hub_editor:reset_all_scores')}</Text>
            )}
          </TouchableOpacity>
        </View>
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
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    boxShadow: '0px 2px 10px rgba(0,0,0,0.12)',
    elevation: 3,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardDesc: { fontSize: 12, lineHeight: 17 },

  // Sample game data toggle
  sampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    boxShadow: '0px 2px 8px rgba(0,0,0,0.1)',
    elevation: 3,
  },
  sampleTextCol: { flex: 1, gap: 4 },
  sampleLabel: { fontSize: 13, fontWeight: '600', marginTop: 2 },

  // Employee Score Lookup (now placed at top of screen — no top divider)
  lookupSectionTop: {
    gap: 10,
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionDesc: { fontSize: 13, lineHeight: 18 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  noResults: { textAlign: 'center', fontSize: 14, marginTop: 8 },
  userCard: {
    borderRadius: 14,
    padding: 14,
    boxShadow: '0px 2px 8px rgba(0,0,0,0.1)',
    elevation: 3,
  },
  userTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarInitial: { fontSize: 20, fontWeight: 'bold' },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '700' },
  userTotal: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  scoreBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  scoreChip: {
    flexBasis: '31%',
    flexGrow: 1,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  scoreChipLabel: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
  scoreChipValue: { fontSize: 11, fontWeight: '600' },
  testBanner: {
    backgroundColor: '#F59E0B20',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    alignItems: 'center',
  },
  testBannerText: { fontSize: 11, fontWeight: '700', color: '#B45309' },
  userActions: { gap: 8 },
  testToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 8,
  },
  testToggleText: { fontSize: 13, fontWeight: '700' },
  resetUserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 8,
    gap: 6,
  },
  resetUserBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },

  // Reset All
  resetSection: {
    marginTop: 10,
    paddingTop: 20,
    borderTopWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  resetAllBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  resetAllBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
