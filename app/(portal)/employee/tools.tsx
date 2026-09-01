/**
 * Employee Tools (s79 — the Tools Page wave, lockdown build). The page reads
 * top-down: local glass header → Priority Hero (the rotisserie — ONE thing
 * now) → tinted command tiles (live line each, whole face navigates, family
 * pulse on waiting badges) → the shared AssistantRail (same band O/M get —
 * the wave's unification fix; the old page mixed assistants into the grid).
 *
 * Employee hero ladder: due quiz > leaderboard pass > the close-out window
 * (evening, tips visible, nothing settled today) > fresh guides > the Today
 * card (announcements/specials/events → the Welcome page). Premium never
 * heroes. Empty ladder = no hero at all.
 */
import React, { useMemo } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToolVisibility } from '@/hooks/useToolVisibility';
import { useUnreadQuizzes } from '@/hooks/useUnreadQuizzes';
import { useUnreadLeaderboardPasses } from '@/hooks/useUnreadLeaderboardPasses';
import { useToolsPageData } from '@/hooks/useToolsPageData';
import { hasAnyQuizEligibleRole } from '@/app/weekly-quizzes';
import PriorityHero, { PriorityCard } from '@/components/tools/PriorityHero';
import CommandTile from '@/components/tools/CommandTile';
import AssistantRail, { AssistantRailItem } from '@/components/tools/AssistantRail';
import { SectionRule } from '@/components/tools/ToolsBits';
import { FAMILY_ACCENTS } from '@/components/tools/toolsVisuals';
import { fonts } from '@/constants/fonts';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = 16;
const GRID_GAP = 10;
const TILE_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

export default function EmployeeToolsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { mode } = useAppTheme();
  const scheme = mode === 'dark' ? 'dark' : 'light';
  const { user } = useAuth();
  const { organization } = useOrganization();

  const { canSee } = useToolVisibility();
  const canSeeQuizzes = hasAnyQuizEligibleRole(user?.jobTitles || []);
  const canSeeTips = canSee('check_outs');
  const { unreadCount: unreadQuizCount } = useUnreadQuizzes();
  const { unreadCount: unreadPassCount } = useUnreadLeaderboardPasses();
  const data = useToolsPageData({ manager: false, includeTips: canSeeTips });

  const firstName = (user?.name || '').trim().split(/\s+/)[0];

  // ---- Priority Hero ladder ----
  const heroCards = useMemo<PriorityCard[]>(() => {
    const cards: PriorityCard[] = [];
    if (canSeeQuizzes && unreadQuizCount > 0) {
      cards.push({
        key: 'quiz',
        gradient: 'quiz',
        iosIcon: 'graduationcap.fill',
        androidIcon: 'school',
        eyebrow: t('employee_tools.weekly_quizzes'),
        title: t('tools_page.hero_quiz_title', { count: unreadQuizCount }),
        sub: t('tools_page.hero_quiz_sub'),
        onPress: () => router.push('/weekly-quizzes'),
      });
    }
    if (unreadPassCount > 0) {
      cards.push({
        key: 'pass',
        gradient: 'game',
        iosIcon: 'trophy.fill',
        androidIcon: 'emoji-events',
        eyebrow: t('employee_tools.game_hub'),
        title: t('tools_page.hero_pass_title'),
        sub: t('tools_page.hero_pass_sub'),
        onPress: () => router.push('/game-hub'),
      });
    }
    if (canSeeTips && new Date().getHours() >= 16 && !data.tips.hasEntryToday) {
      cards.push({
        key: 'closeout',
        gradient: 'tips',
        iosIcon: 'dollarsign.circle.fill',
        androidIcon: 'calculate',
        eyebrow: t('tips_checkouts.title'),
        title: t('tools_page.hero_closeout_title'),
        sub:
          data.tips.weekTotal > 0
            ? t('tools_page.hero_closeout_sub', { amount: `$${Math.round(data.tips.weekTotal)}` })
            : t('tools_page.hero_closeout_sub_fresh'),
        onPress: () => router.push('/tips-and-checkouts'),
      });
    }
    if (data.guides.newThisWeek > 0) {
      cards.push({
        key: 'guides',
        gradient: 'guides',
        iosIcon: 'book.fill',
        androidIcon: 'menu-book',
        eyebrow: t('employee_tools.guides_training'),
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
        onPress: () => router.push('/(portal)/employee'),
      });
    }
    return cards;
  }, [canSeeQuizzes, unreadQuizCount, unreadPassCount, canSeeTips, data, organization?.name, router, t]);

  // ---- Assistants (shared band; membership from the same visibility rules) ----
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
            {firstName ? t('tools_page.title_named', { name: firstName }) : t('employee_tools.title')}
          </Text>
        </View>

        <PriorityHero cards={heroCards} />

        <SectionRule label={t('tools_page.your_tools')} />
        <View style={styles.grid}>
          <CommandTile
            accent={colors.tint}
            iosIcon="book.fill"
            androidIcon="menu-book"
            title={t('employee_tools.guides_training')}
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
              unreadPassCount > 0 ? (
                t('tools_page.game_passed_big')
              ) : data.gameRank ? (
                <>
                  {t('tools_page.game_rank_prefix')}{' '}
                  <Text style={{ color: FAMILY_ACCENTS.rewards[scheme] }}>
                    #{data.gameRank.rank}
                  </Text>{' '}
                  {t('tools_page.game_rank_suffix', { total: data.gameRank.total })}
                </>
              ) : (
                t('tools_page.game_big_fallback')
              )
            }
            sub={
              unreadPassCount > 0
                ? t('tools_page.game_passed_sub')
                : data.gameRank
                ? t('tools_page.game_jump_sub')
                : t('tools_page.game_sub')
            }
            width={TILE_WIDTH}
            badgeCount={unreadPassCount}
            pulse={unreadPassCount > 0}
            onPress={() => router.push('/game-hub')}
          />
          {canSeeQuizzes && (
            <CommandTile
              accent={FAMILY_ACCENTS.quiz[scheme]}
              iosIcon="graduationcap.fill"
              androidIcon="school"
              title={t('employee_tools.weekly_quizzes')}
              big={t('tools_page.quiz_big', { count: unreadQuizCount })}
              sub={t('tools_page.quiz_sub')}
              width={TILE_WIDTH}
              badgeCount={unreadQuizCount}
              pulse={unreadQuizCount > 0}
              onPress={() => router.push('/weekly-quizzes')}
            />
          )}
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
});
