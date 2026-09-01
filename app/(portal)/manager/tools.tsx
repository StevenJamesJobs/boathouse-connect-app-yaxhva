/**
 * Manager Tools (s79 — the Tools Page wave, lockdown build). Same bones as the
 * employee page (that is the wave's point): header → Priority Hero → tinted
 * command tiles → the SAME AssistantRail. Manager differences: Quizzes routes
 * to the hub editor (premium-locked on base tier — locked, NOT hidden, the
 * manager-permissions grammar), and Rewards + Reviews takes the full-width
 * tile with the approvals pulse (the ONE owner of the approvals story — the
 * hero deliberately never duplicates it, Steve's r3 call).
 *
 * Manager hero ladder: new reviews (device-side detection, clears when acted
 * on) > fresh guides > the Today card. Premium never heroes.
 */
import React, { useMemo } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToolVisibility } from '@/hooks/useToolVisibility';
import { usePendingApprovals } from '@/hooks/usePendingApprovals';
import { useUnreadLeaderboardPasses } from '@/hooks/useUnreadLeaderboardPasses';
import { useToolsPageData, markReviewsSeen } from '@/hooks/useToolsPageData';
import PriorityHero, { PriorityCard } from '@/components/tools/PriorityHero';
import CommandTile from '@/components/tools/CommandTile';
import AssistantRail, { AssistantRailItem } from '@/components/tools/AssistantRail';
import { SectionRule } from '@/components/tools/ToolsBits';
import { FAMILY_ACCENTS } from '@/components/tools/toolsVisuals';
import { IconSymbol } from '@/components/IconSymbol';
import { fonts } from '@/constants/fonts';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = 16;
const GRID_GAP = 10;
const TILE_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

export default function ManagerToolsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const scheme = mode === 'dark' ? 'dark' : 'light';
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { hasPremium } = useSubscription();

  const { canSee } = useToolVisibility();
  const canSeeTips = canSee('check_outs');
  const { pendingCount } = usePendingApprovals();
  const { unreadCount: unreadPassCount } = useUnreadLeaderboardPasses();
  const data = useToolsPageData({ manager: true, includeTips: canSeeTips });

  const firstName = (user?.name || '').trim().split(/\s+/)[0];
  const quizLocked = !hasPremium;
  const goldAccent = FAMILY_ACCENTS.rewards[scheme];

  // ---- Priority Hero ladder (approvals live on the pulsing tile, never here) ----
  const heroCards = useMemo<PriorityCard[]>(() => {
    const cards: PriorityCard[] = [];
    if (data.reviews.newCount > 0) {
      cards.push({
        key: 'reviews',
        gradient: 'rewards',
        iosIcon: 'star.fill',
        androidIcon: 'star',
        eyebrow: t('manager_tools.rewards_reviews'),
        title: t('tools_page.hero_reviews_title', { count: data.reviews.newCount }),
        sub:
          data.reviews.avg !== null
            ? t('tools_page.hero_reviews_sub', { avg: data.reviews.avg.toFixed(1) })
            : '',
        onPress: () => {
          markReviewsSeen(data.reviews.count);
          router.push('/rewards-and-reviews-editor');
        },
      });
    }
    if (data.guides.newThisWeek > 0) {
      cards.push({
        key: 'guides',
        gradient: 'guides',
        iosIcon: 'book.fill',
        androidIcon: 'menu-book',
        eyebrow: t('manager_tools.guides_training'),
        title: t('tools_page.hero_guides_title', { count: data.guides.newThisWeek }),
        sub: t('tools_page.hero_guides_sub'),
        onPress: () => router.push('/guides-and-training'),
      });
    }
    const { announcements, specials, events } = data.todayCounts;
    if (announcements + specials + events > 0) {
      const parts: string[] = [];
      if (announcements > 0) parts.push(t('tools_page.today_ann', { count: announcements }));
      if (specials > 0) parts.push(t('tools_page.today_spec', { count: specials }));
      if (events > 0) parts.push(t('tools_page.today_ev', { count: events }));
      cards.push({
        key: 'today',
        gradient: 'slate',
        iosIcon: 'calendar',
        androidIcon: 'event',
        eyebrow: t('tools_page.hero_today_eyebrow', { org: organization?.name || '' }),
        title: t('tools_page.hero_today_title'),
        sub: parts.join(' · '),
        onPress: () => router.push('/(portal)/manager'),
      });
    }
    return cards;
  }, [data, organization?.name, router, t]);

  // ---- Assistants — the SAME rail employees get (O/M see every active one) ----
  const assistantItems = useMemo<AssistantRailItem[]>(() => {
    const items: AssistantRailItem[] = [];
    if (canSee('kitchen')) {
      items.push({
        key: 'kitchen',
        label: t('tools_page.assistant_kitchen'),
        iosIcon: 'flame.fill',
        androidIcon: 'local-fire-department',
        onPress: () => router.push('/kitchen-assistant'),
      });
    }
    if (canSee('bartender')) {
      items.push({
        key: 'bartender',
        label: t('tools_page.assistant_bar'),
        iosIcon: 'wineglass.fill',
        androidIcon: 'local-bar',
        onPress: () => router.push('/bartender-assistant'),
      });
    }
    if (canSee('host')) {
      items.push({
        key: 'host',
        label: t('tools_page.assistant_host'),
        iosIcon: 'person.2.fill',
        androidIcon: 'people',
        onPress: () => router.push('/host-assistant'),
      });
    }
    return items;
  }, [canSee, router, t]);

  const guidesSub =
    data.guides.newThisWeek > 0
      ? t('tools_page.guides_sub_fresh', { sets: data.guides.sets, fresh: data.guides.newThisWeek })
      : t('tools_page.guides_sub', { sets: data.guides.sets });

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.thead}>
          <Text style={[styles.eyebrow, { color: colors.tint }]} numberOfLines={1}>
            {(organization?.name || '').toUpperCase()}
          </Text>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {firstName ? t('tools_page.title_named', { name: firstName }) : t('manager_tools.title')}
          </Text>
        </View>

        <PriorityHero cards={heroCards} />

        <SectionRule label={t('tools_page.your_tools')} />
        <View style={styles.grid}>
          <CommandTile
            accent={colors.tint}
            iosIcon="book.fill"
            androidIcon="menu-book"
            title={t('manager_tools.guides_training')}
            big={t('tools_page.guides_big', { count: data.guides.count })}
            sub={guidesSub}
            width={TILE_WIDTH}
            onPress={() => router.push('/guides-and-training')}
          />
          <CommandTile
            accent={FAMILY_ACCENTS.game[scheme]}
            iosIcon="gamecontroller.fill"
            androidIcon="sports-esports"
            title={t('employee_tools.game_hub')}
            big={
              data.gameRank ? (
                <>
                  {t('tools_page.game_rank_prefix')}{' '}
                  <Text style={{ color: goldAccent }}>#{data.gameRank.rank}</Text>{' '}
                  {t('tools_page.game_rank_suffix', { total: data.gameRank.total })}
                </>
              ) : (
                t('tools_page.game_big_fallback')
              )
            }
            sub={data.gameRank ? t('tools_page.game_jump_sub') : t('tools_page.game_sub')}
            width={TILE_WIDTH}
            badgeCount={unreadPassCount}
            pulse={unreadPassCount > 0}
            onPress={() => router.push('/game-hub')}
          />
          <CommandTile
            accent={FAMILY_ACCENTS.quiz[scheme]}
            iosIcon="graduationcap.fill"
            androidIcon="school"
            title={t('quick_tools.weekly_quizzes')}
            big={quizLocked ? t('tools_page.premium_big') : t('tools_page.quiz_mgr_big', { count: data.quizLive })}
            sub={quizLocked ? t('tools_page.premium_quiz_sub') : t('tools_page.quiz_mgr_sub', { total: 3 })}
            width={TILE_WIDTH}
            locked={quizLocked}
            lockedAccent={goldAccent}
            onPress={() => router.push('/quiz-hub-editor')}
          />
          {canSeeTips && (
            <CommandTile
              accent={FAMILY_ACCENTS.tips[scheme]}
              iosIcon="dollarsign.circle.fill"
              androidIcon="calculate"
              title={t('tips_checkouts.title')}
              big={`$${Math.round(data.tips.weekTotal)}`}
              sub={
                data.tips.weekShifts > 0
                  ? t('tools_page.tips_sub', { count: data.tips.weekShifts })
                  : t('tools_page.tips_sub_empty')
              }
              width={TILE_WIDTH}
              onPress={() => router.push('/tips-and-checkouts')}
            />
          )}
          <CommandTile
            accent={goldAccent}
            iosIcon="gift.fill"
            androidIcon="card-giftcard"
            title={t('manager_tools.rewards_reviews')}
            big={
              pendingCount > 0
                ? t('tools_page.rewards_big_waiting', { count: pendingCount })
                : t('tools_page.rewards_big_clear')
            }
            sub={pendingCount > 0 ? t('tools_page.rewards_sub_waiting') : t('tools_page.rewards_sub_clear')}
            wide
            badgeCount={pendingCount}
            pulse={pendingCount > 0}
            rightBlock={
              <View style={styles.ratingBlock}>
                <View style={styles.ratingRow}>
                  <IconSymbol
                    ios_icon_name="star.fill"
                    android_material_icon_name="star"
                    size={13}
                    color={goldAccent}
                  />
                  <Text style={[styles.ratingValue, { color: goldAccent }]}>
                    {data.reviews.avg !== null ? data.reviews.avg.toFixed(1) : '—'}
                  </Text>
                </View>
                <Text style={[styles.ratingCount, { color: colors.textSecondary }]}>
                  {t('tools_page.reviews_right_sub', { count: data.reviews.count })}
                </Text>
              </View>
            }
            onPress={() => router.push('/rewards-and-reviews-editor')}
          />
        </View>

        {assistantItems.length > 0 && (
          <>
            <SectionRule label={t('tools_page.assistants')} />
            <AssistantRail items={assistantItems} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 8,
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 120,
  },
  thead: {
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 12,
  },
  eyebrow: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 1.7,
  },
  title: {
    fontFamily: fonts.display.bold,
    fontSize: 25,
    letterSpacing: -0.5,
    marginTop: 3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  ratingBlock: {
    alignItems: 'flex-end',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 15,
  },
  ratingCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8,
    marginTop: 2,
  },
});
