/**
 * ExamRewardBlurb — the Rewards-tab "Quiz Reward!" greeting. s77 smoke-3
 * rework: a member with MULTIPLE fresh quiz rewards used to get them one at a
 * time (dismiss → another appears → dismiss…). Now every undismissed reward
 * shows at once — one card, one row per quiz, one dismiss clears them all.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getExamTypeName, type ExamType } from '@/utils/exam/questionGenerator';
import { refreshAllUnreadQuizReward } from '@/hooks/useUnreadQuizReward';
import { fonts } from '@/constants/fonts';

interface UndismissedReward {
  id: string;
  exam_id: string;
  bucks_awarded: number;
  exam_type: string;
}

export default function ExamRewardBlurb() {
  const { t, i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';
  const colors = useThemeColors();
  const { user } = useAuth();
  const [rewards, setRewards] = useState<UndismissedReward[]>([]);

  useEffect(() => {
    fetchUndismissedRewards();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchUndismissedRewards = async () => {
    if (!user?.id) return;

    try {
      const { data: results, error: resultsError } = await supabase.rpc('get_my_recent_exam_results', {
        p_actor_id: user.id,
        p_limit: 5,
      });
      if (resultsError || !results || results.length === 0) return;

      const resultIds = results.map((r) => r.id);
      const { data: dismissals } = await supabase.rpc('get_my_exam_reward_dismissals', {
        p_actor_id: user.id,
        p_result_ids: resultIds,
      });
      const dismissedIds = new Set((dismissals || []).map((d) => d.exam_result_id));

      // EVERY undismissed paying reward, not just the newest.
      const undismissed = results.filter((r) => !dismissedIds.has(r.id) && r.bucks_awarded > 0);
      if (undismissed.length === 0) {
        setRewards([]);
        return;
      }

      const withTypes = await Promise.all(
        undismissed.map(async (r) => {
          const { data: examRows } = await supabase.rpc('get_exam', {
            p_actor_id: user.id, p_exam_id: r.exam_id,
          });
          return {
            id: r.id,
            exam_id: r.exam_id,
            bucks_awarded: r.bucks_awarded,
            exam_type: examRows?.[0]?.exam_type ?? 'server',
          };
        }),
      );
      setRewards(withTypes);
    } catch (err) {
      console.error('Error fetching exam reward blurb:', err);
    }
  };

  const handleDismiss = async () => {
    if (!user?.id || rewards.length === 0) return;

    try {
      await Promise.all(
        rewards.map((r) =>
          supabase.rpc('dismiss_exam_reward', {
            p_actor_id: user.id, p_exam_result_id: r.id,
          }),
        ),
      );
      // Clear the Rewards-tab badge for these rewards.
      refreshAllUnreadQuizReward();
    } catch (err) {
      console.error('Error dismissing exam rewards:', err);
    }

    setRewards([]);
  };

  if (rewards.length === 0) return null;

  const multi = rewards.length > 1;

  return (
    <View style={[styles.container, { backgroundColor: '#10B98120' }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: '#10B981' }]}>
          <IconSymbol ios_icon_name="dollarsign.circle.fill" android_material_icon_name="attach-money" size={20} color="#FFF" />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: '#10B981' }]}>
            {multi ? t('weekly_quizzes.reward_blurb_title_multi') : t('weekly_quizzes.reward_blurb_title')}
          </Text>
          {multi ? (
            rewards.map((r) => (
              <Text key={r.id} style={[styles.rewardRow, { color: colors.text }]}>
                {t('weekly_quizzes.type_quiz_title', { type: getExamTypeName(r.exam_type as ExamType, isSpanish) })}
                <Text style={styles.rewardAmount}>  +${r.bucks_awarded}</Text>
              </Text>
            ))
          ) : (
            <Text style={[styles.description, { color: colors.text }]}>
              {t('weekly_quizzes.reward_blurb_desc', {
                amount: rewards[0].bucks_awarded,
                type: getExamTypeName(rewards[0].exam_type as ExamType, isSpanish),
              })}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={handleDismiss} style={styles.dismissButton}>
          <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.body.semibold,
    fontSize: 14,
    marginBottom: 2,
  },
  description: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  rewardRow: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    lineHeight: 19,
  },
  rewardAmount: {
    fontFamily: fonts.mono.semibold,
    color: '#10B981',
  },
  dismissButton: {
    padding: 8,
  },
});
