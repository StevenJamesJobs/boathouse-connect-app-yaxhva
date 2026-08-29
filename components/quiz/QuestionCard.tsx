/**
 * QuestionCard — the editor's question card, glassed (s77): Q# in the role
 * accent, the tappable category chip (caret while editable), the $ value chip
 * (per-question override, else the quiz default), the ↻ ✎ 🗑 action chips,
 * optional photo, and the options list with the correct answer washed green.
 * Bonus questions go gold end to end. Pure presentation — the editor owns
 * every handler and passes the resolved category display label.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

const GOLD = '#F59E0B';
const OK = '#10B981';
const BAD = '#EF4444';

export interface EditorQuestion {
  id: string;
  question_order: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  is_bonus: boolean;
  bonus_bucks_value: number | null;
  bucks_value: number | null;
  category_label: string | null;
  source_type: 'auto' | 'custom' | 'bonus';
  source_table: string | null;
  question_image_url?: string | null;
  question_text_es?: string | null;
  option_a_es?: string | null;
  option_b_es?: string | null;
  option_c_es?: string | null;
  option_d_es?: string | null;
}

interface QuestionCardProps {
  question: EditorQuestion;
  /** Resolved uppercase category/source display label. */
  categoryLabel: string;
  accent: string;
  /** Quiz-level default; shown on cards without a per-question override. */
  defaultBucksValue: number | null;
  editable: boolean;
  /** Live view: dimmed, chips hidden — questions are locked while live. */
  locked?: boolean;
  refreshing?: boolean;
  isSpanish: boolean;
  onPressCategory?: () => void;
  onRefresh?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function QuestionCard({
  question: q,
  categoryLabel,
  accent,
  defaultBucksValue,
  editable,
  locked,
  refreshing,
  isSpanish,
  onPressCategory,
  onRefresh,
  onEdit,
  onDelete,
}: QuestionCardProps) {
  const colors = useThemeColors();
  const chipColor = q.is_bonus ? GOLD : accent;

  const shownValue = q.is_bonus
    ? q.bonus_bucks_value
    : typeof q.bucks_value === 'number'
      ? q.bucks_value
      : defaultBucksValue;

  const questionText = isSpanish && q.question_text_es ? q.question_text_es : q.question_text;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        q.is_bonus && { backgroundColor: GOLD + '0F', borderColor: GOLD + '73' },
        locked && { opacity: 0.72 },
      ]}
    >
      <View style={styles.head}>
        <Text style={[styles.qnum, { color: chipColor }]}>
          {q.is_bonus ? '★' : `Q${q.question_order}`}
        </Text>
        <TouchableOpacity
          style={[styles.catChip, { backgroundColor: chipColor + '1C', borderColor: chipColor + '4D' }]}
          onPress={onPressCategory}
          disabled={!editable || q.is_bonus || !onPressCategory}
          activeOpacity={0.7}
        >
          <Text style={[styles.catChipText, { color: chipColor }]} numberOfLines={1}>
            {categoryLabel}
          </Text>
          {editable && !q.is_bonus && (
            <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={9} color={chipColor} />
          )}
        </TouchableOpacity>
        {typeof shownValue === 'number' && (
          <View style={[styles.valChip, { backgroundColor: chipColor + '1C', borderColor: chipColor + '4D' }]}>
            <Text style={[styles.valChipText, { color: chipColor }]}>${shownValue}</Text>
          </View>
        )}
        {editable && (
          <View style={styles.actions}>
            {q.source_type === 'auto' && onRefresh && (
              <TouchableOpacity
                style={[styles.actionChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                onPress={onRefresh}
                disabled={refreshing}
              >
                {refreshing ? (
                  <ActivityIndicator size={12} color={accent} />
                ) : (
                  <IconSymbol ios_icon_name="arrow.clockwise" android_material_icon_name="refresh" size={12} color={accent} />
                )}
              </TouchableOpacity>
            )}
            {onEdit && (
              <TouchableOpacity
                style={[styles.actionChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                onPress={onEdit}
              >
                <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={[styles.actionChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                onPress={onDelete}
              >
                <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={12} color={BAD} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {q.question_image_url && (
        <StorageImage
          source={{ uri: q.question_image_url }}
          style={styles.image}
          resizeMode="cover"
        />
      )}
      <Text style={[styles.text, { color: colors.text }]}>{questionText}</Text>

      <View style={styles.options}>
        {(['A', 'B', 'C', 'D'] as const).map((letter) => {
          const esKey = `option_${letter.toLowerCase()}_es` as keyof EditorQuestion;
          const enKey = `option_${letter.toLowerCase()}` as keyof EditorQuestion;
          const optionEs = q[esKey] as string | null | undefined;
          const optionText = isSpanish && optionEs ? optionEs : (q[enKey] as string);
          const isCorrect = q.correct_option === letter;
          return (
            <View key={letter} style={[styles.option, isCorrect && { backgroundColor: OK + '14' }]}>
              <Text style={[styles.optionLetter, { color: isCorrect ? OK : colors.textSecondary }]}>
                {letter}
              </Text>
              <Text
                style={[
                  styles.optionText,
                  { color: isCorrect ? OK : colors.text },
                  isCorrect && { fontFamily: fonts.body.semibold },
                ]}
              >
                {optionText}
              </Text>
              {isCorrect && (
                <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={15} color={OK} />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  qnum: { fontFamily: fonts.mono.semibold, fontSize: 12.5 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 1,
  },
  catChipText: { fontFamily: fonts.mono.semibold, fontSize: 8, letterSpacing: 0.7 },
  valChip: {
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  valChipText: { fontFamily: fonts.mono.semibold, fontSize: 9 },
  actions: { marginLeft: 'auto', flexDirection: 'row', gap: 4 },
  actionChip: {
    width: 27,
    height: 27,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    marginBottom: 9,
    backgroundColor: '#00000010',
  },
  text: {
    fontFamily: fonts.body.semibold,
    fontSize: 13.5,
    lineHeight: 19,
    marginBottom: 9,
  },
  options: { gap: 3 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  optionLetter: { fontFamily: fonts.mono.semibold, fontSize: 11, width: 14 },
  optionText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 17 },
});
