import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getExamTypeName } from '@/utils/exam/questionGenerator';

interface UndismissedResult {
  id: string;
  exam_id: string;
  bucks_awarded: number;
  exam_type: string;
}

export default function ExamRewardBlurb() {
  const colors = useThemeColors();
  const { user } = useAuth();
  const [result, setResult] = useState<UndismissedResult | null>(null);

  useEffect(() => {
    fetchUndismissedResult();
  }, [user?.id]);

  const fetchUndismissedResult = async () => {
    if (!user?.id) return;

    try {
      // Get user's recent exam results
      const { data: results, error: resultsError } = await (supabase
        .from('exam_results' as any) as any)
        .select('id, exam_id, bucks_awarded')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false })
        .limit(5);

      if (resultsError || !results || results.length === 0) return;

      // Check which ones are already dismissed
      const resultIds = results.map((r: any) => r.id);
      const { data: dismissals } = await (supabase
        .from('exam_reward_dismissals' as any) as any)
        .select('exam_result_id')
        .eq('user_id', user.id)
        .in('exam_result_id', resultIds);

      const dismissedIds = new Set((dismissals || []).map((d: any) => d.exam_result_id));

      // Find the most recent undismissed result
      const undismissed = results.find((r: any) => !dismissedIds.has(r.id));
      if (!undismissed) {
        setResult(null);
        return;
      }

      // Get the exam type
      const { data: examData } = await (supabase
        .from('exams' as any) as any)
        .select('exam_type')
        .eq('id', undismissed.exam_id)
        .single();

      if (examData) {
        setResult({
          id: undismissed.id,
          exam_id: undismissed.exam_id,
          bucks_awarded: undismissed.bucks_awarded,
          exam_type: examData.exam_type,
        });
      }
    } catch (err) {
      console.error('Error fetching exam reward blurb:', err);
    }
  };

  const handleDismiss = async () => {
    if (!user?.id || !result) return;

    try {
      await (supabase.from('exam_reward_dismissals' as any) as any).insert({
        user_id: user.id,
        exam_result_id: result.id,
      });
    } catch (err) {
      console.error('Error dismissing exam reward:', err);
    }

    setResult(null);
  };

  if (!result || result.bucks_awarded <= 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: '#10B98120' }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: '#10B981' }]}>
          <IconSymbol ios_icon_name="dollarsign.circle.fill" android_material_icon_name="attach-money" size={20} color="#FFF" />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: '#10B981' }]}>Quiz Reward!</Text>
          <Text style={[styles.description, { color: colors.text }]}>
            You earned ${result.bucks_awarded} from your {getExamTypeName(result.exam_type as any)} Weekly Quiz
          </Text>
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
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  dismissButton: {
    padding: 8,
  },
});
