import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';

export interface QuestionReviewEntry {
  id: string;
  question_order: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  is_bonus: boolean;
  bonus_bucks_value?: number | null;
  user_answer: string | null;
  is_correct: boolean;
  question_image_url?: string | null;
  question_text_es?: string | null;
  option_a_es?: string | null;
  option_b_es?: string | null;
  option_c_es?: string | null;
  option_d_es?: string | null;
}

interface Props {
  questions: QuestionReviewEntry[];
}

export default function QuestionReviewList({ questions }: Props) {
  const colors = useThemeColors();
  const { i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';

  return (
    <>
      {questions.map((q) => (
        <View
          key={q.id}
          style={[
            styles.reviewCard,
            { backgroundColor: colors.card },
            q.is_bonus && { borderWidth: 2, borderColor: '#F59E0B' },
          ]}
        >
          <View style={styles.reviewHeader}>
            <View style={styles.reviewHeaderLeft}>
              <View
                style={[
                  styles.resultBadge,
                  { backgroundColor: q.is_correct ? '#10B98120' : '#EF444420' },
                ]}
              >
                <IconSymbol
                  ios_icon_name={q.is_correct ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                  android_material_icon_name={q.is_correct ? 'check-circle' : 'cancel'}
                  size={18}
                  color={q.is_correct ? '#10B981' : '#EF4444'}
                />
                <Text
                  style={[
                    styles.resultBadgeText,
                    { color: q.is_correct ? '#10B981' : '#EF4444' },
                  ]}
                >
                  {q.is_correct
                    ? isSpanish ? 'Correcto' : 'Correct'
                    : isSpanish ? 'Incorrecto' : 'Wrong'}
                </Text>
              </View>
              {q.is_bonus && (
                <View style={[styles.bonusChip, { backgroundColor: '#F59E0B20' }]}>
                  <Text style={styles.bonusChipText}>BONUS</Text>
                </View>
              )}
            </View>
            <Text style={[styles.reviewQuestionNum, { color: colors.textSecondary }]}>
              Q{q.question_order}
            </Text>
          </View>

          {q.question_image_url && (
            <Image
              source={{ uri: q.question_image_url }}
              style={styles.reviewQuestionImage}
              resizeMode="cover"
            />
          )}
          <Text style={[styles.reviewQuestionText, { color: colors.text }]}>
            {isSpanish && q.question_text_es ? q.question_text_es : q.question_text}
          </Text>

          {(['A', 'B', 'C', 'D'] as const).map((letter) => {
            const optionKey = `option_${letter.toLowerCase()}` as keyof QuestionReviewEntry;
            const optionKeyEs = `${optionKey}_es` as keyof QuestionReviewEntry;
            const optionText =
              isSpanish && q[optionKeyEs]
                ? (q[optionKeyEs] as string)
                : (q[optionKey] as string);
            const isCorrectAnswer = q.correct_option === letter;
            const isUserAnswer = q.user_answer === letter;

            let rowBg = 'transparent';
            let rowTextColor = colors.text;
            let icon: React.ReactNode = null;

            if (isCorrectAnswer) {
              rowBg = '#10B98110';
              rowTextColor = '#10B981';
              icon = (
                <IconSymbol
                  ios_icon_name="checkmark.circle.fill"
                  android_material_icon_name="check-circle"
                  size={16}
                  color="#10B981"
                />
              );
            }
            if (isUserAnswer && !isCorrectAnswer) {
              rowBg = '#EF444410';
              rowTextColor = '#EF4444';
              icon = (
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={16}
                  color="#EF4444"
                />
              );
            }

            return (
              <View key={letter} style={[styles.reviewOption, { backgroundColor: rowBg }]}>
                <Text style={[styles.reviewOptionLetter, { color: rowTextColor }]}>
                  {letter}.
                </Text>
                <Text
                  style={[styles.reviewOptionText, { color: rowTextColor }]}
                  numberOfLines={2}
                >
                  {optionText}
                </Text>
                {icon}
                {isUserAnswer && (
                  <Text style={[styles.yourAnswerTag, { color: rowTextColor }]}>
                    {isSpanish ? 'Tu respuesta' : 'Your answer'}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  reviewCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  resultBadgeText: { fontSize: 12, fontWeight: '700' },
  bonusChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  bonusChipText: { color: '#F59E0B', fontSize: 10, fontWeight: '800' },
  reviewQuestionNum: { fontSize: 13, fontWeight: '600' },
  reviewQuestionText: { fontSize: 15, fontWeight: '600', marginBottom: 10, lineHeight: 21 },
  reviewQuestionImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: '#00000010',
  },
  reviewOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 6,
  },
  reviewOptionLetter: { fontSize: 13, width: 18, fontWeight: '600' },
  reviewOptionText: { flex: 1, fontSize: 13 },
  yourAnswerTag: { fontSize: 10, fontWeight: '700', fontStyle: 'italic' },
});
