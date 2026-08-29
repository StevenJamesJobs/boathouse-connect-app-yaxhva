// The quiz questions' category brain (s77 smoke round) — ONE place that knows
// how a question's category_label / source_table maps to a composer source
// pool and to a display label. Grown out of exam-editor because the play
// screen now wears the category chip too, and because the old editor-local
// mapping only knew 4 of the generator's 6 real source_table values — which
// is why Libations/Checklist questions lost their "Same category" regen
// option (Steve's smoke catch).

import type { QuizSource } from '@/utils/exam/questionGenerator';

export interface CategoryOption {
  /** EN-canonical value persisted into exam_questions.category_label. */
  label: string;
  /** Translates the DISPLAY only — stored data stays English. */
  labelKey: string;
  sourceTable: string | null;
  source: QuizSource;
}

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { label: 'Menu Items', labelKey: 'exam_editor.cat_menu_items', sourceTable: 'menu_items', source: 'menu' },
  { label: 'Wine Pairings', labelKey: 'exam_editor.cat_wine_pairings', sourceTable: 'wine_pairings', source: 'wine' },
  { label: 'Libation Recipes', labelKey: 'exam_editor.cat_libation_recipes', sourceTable: 'recipes', source: 'libations' },
  { label: 'Check List Items', labelKey: 'exam_editor.cat_checklist_items', sourceTable: 'checklist_items', source: 'checklists' },
  { label: 'Menu Category', labelKey: 'exam_editor.cat_menu_category', sourceTable: 'menu_category', source: 'menu' },
];

// EVERY source_table the generator actually writes (plus the two legacy
// values manual labels can reference), mapped to its composer pool.
const SOURCE_BY_TABLE: Record<string, QuizSource> = {
  menu_items: 'menu',
  menu_category: 'menu',
  wine_pairings: 'wine',
  recipes: 'libations',
  libation_recipes: 'libations',
  cocktails: 'cocktails',
  checklist_items: 'checklists',
  bartender_checklist_items: 'checklists',
};

// Display keys for tables the picker options don't cover 1:1.
const LABELKEY_BY_TABLE: Record<string, string> = {
  menu_items: 'exam_editor.cat_menu_items',
  menu_category: 'exam_editor.cat_menu_category',
  wine_pairings: 'exam_editor.cat_wine_pairings',
  recipes: 'exam_editor.cat_libation_recipes',
  libation_recipes: 'exam_editor.cat_libation_recipes',
  cocktails: 'exam_editor.src_cocktails',
  checklist_items: 'exam_editor.cat_checklist_items',
  bartender_checklist_items: 'exam_editor.cat_checklist_items',
};

interface CategorizableQuestion {
  category_label?: string | null;
  source_type: 'auto' | 'custom' | 'bonus';
  source_table?: string | null;
}

/** Which composer pool a question regenerates from ("Same category"). */
export function sourceForQuestion(q: Pick<CategorizableQuestion, 'category_label' | 'source_table'>): QuizSource | null {
  if (q.category_label) {
    const known = CATEGORY_OPTIONS.find((o) => o.label === q.category_label);
    if (known) return known.source;
    // A custom manager-typed label has no pool of its own — fall through to
    // the question's real source table.
  }
  return (q.source_table && SOURCE_BY_TABLE[q.source_table]) || null;
}

/**
 * The uppercase display label for a question's category chip (editor cards,
 * and now the play/preview hero). Manager-typed custom labels render as
 * typed; known labels/tables translate; unknown tables fall back to the slug.
 */
export function questionCategoryLabel(
  q: CategorizableQuestion,
  t: (key: string) => string,
): string {
  if (q.category_label) {
    const known = CATEGORY_OPTIONS.find((o) => o.label === q.category_label);
    return (known ? t(known.labelKey) : q.category_label).toUpperCase();
  }
  if (q.source_type === 'bonus') return t('exam_editor.source_bonus').toUpperCase();
  if (q.source_type === 'custom') return t('exam_editor.source_custom').toUpperCase();
  const byTable = q.source_table ? LABELKEY_BY_TABLE[q.source_table] : null;
  if (byTable) return t(byTable).toUpperCase();
  return (q.source_table || 'auto').replace(/_/g, ' ').toUpperCase();
}
