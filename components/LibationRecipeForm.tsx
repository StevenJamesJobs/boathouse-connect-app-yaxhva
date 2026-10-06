import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import CollapsibleSection from '@/components/CollapsibleSection';
import SimpleSelectPicker, { SelectField } from '@/components/SimpleSelectPicker';
import GlasswareIconPicker from '@/components/GlasswareIconPicker';
import RichTextToolbar from '@/components/RichTextToolbar';
import ProcedureResizeHandle from '@/components/ProcedureResizeHandle';
import MultiImageField from '@/components/MultiImageField';
import { GlassToggle } from '@/components/content/FormKit';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { CocktailSubOption } from '@/utils/menuCategoryLabels';
import type { UploadPurpose } from '@/utils/storageBroker';
import { fonts } from '@/constants/fonts';

/**
 * LibationRecipeForm — ONE form for a Menu 1 / Menu 2 libation recipe (s90).
 * Hosts: the two libation editors' add/edit sheets and the Libations AI
 * Upload review's "Review Recipe" sheet. The host owns the draft (`draft` +
 * `onChange(patch)`), the save, the translation section and the delete queue;
 * this file owns the field grammar: Recipe Basics (photos · name · category ·
 * price · Featured) → Recipe (glassware · garnish · ingredients) → Procedure.
 *
 * s90 rules: the PRICE and every ingredient AMOUNT are optional (Steve — a
 * scanned sheet often carries neither); the name is the only required field,
 * and the host decides whether a category is (the editors require one).
 */
// A type alias, not an interface: object-literal types carry an implicit index
// signature, so the rows pass straight into the RPCs' `Json` params.
export type IngredientRow = { amount: string; ingredient: string };

export interface LibationRecipeDraft {
  name: string;
  price: string;
  /** '' | FEATURED_SENTINEL | a Libations subcategory id | an `extraSubOptions` id. */
  subcategoryId: string;
  isFeatured: boolean;
  glassware: string;
  garnish: string;
  ingredients: IngredientRow[];
  procedure: string;
  procedureEs: string;
  images: string[];
}

// The category picker's "Featured" choice (s73): a recipe on the Featured
// shelf alone — no menu subcategory, stored as subcategory_id NULL + the legacy
// category string 'Featured' + is_featured true.
export const FEATURED_SENTINEL = '__featured__';

export const emptyLibationDraft = (): LibationRecipeDraft => ({
  name: '',
  price: '',
  subcategoryId: '',
  isFeatured: false,
  glassware: '',
  garnish: '',
  ingredients: [{ amount: '', ingredient: '' }],
  procedure: '',
  procedureEs: '',
  images: [],
});

/** The rows the host saves: named ingredients only, amounts may be blank. */
export function cleanIngredients(rows: IngredientRow[]): IngredientRow[] {
  return rows
    .map((r) => ({ amount: (r.amount || '').trim(), ingredient: (r.ingredient || '').trim() }))
    .filter((r) => r.ingredient);
}

export interface LibationRecipeFormProps {
  draft: LibationRecipeDraft;
  onChange: (patch: Partial<LibationRecipeDraft>) => void;
  /** The book's recipe-fed Libations subcategories (cocktailFedSubOptions). */
  subOptions: CocktailSubOption[];
  /** Extra category choices listed AFTER the subs (the review's new sections). */
  extraSubOptions?: { id: string; label: string }[];
  /** Broker purpose + bucket for the photo strip. */
  imagePurpose: UploadPurpose;
  imageBucket: string;
  /** A removed photo — the host deletes it after a successful save. */
  onImageRemoved?: (url: string) => void;
  /** The device language authors the primary procedure input (s61 hybrid). */
  isSpanishAuthor: boolean;
  /** The host's TranslationSection element (editors only). */
  translationElement?: React.ReactNode;
}

export default function LibationRecipeForm({
  draft,
  onChange,
  subOptions,
  extraSubOptions = [],
  imagePurpose,
  imageBucket,
  onImageRemoved,
  isSpanishAuthor,
  translationElement,
}: LibationRecipeFormProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const procedureInputRef = useRef<TextInput>(null);
  const [procedureSelection, setProcedureSelection] = useState({ start: 0, end: 0 });
  const [subPickerOpen, setSubPickerOpen] = useState(false);
  const [procH, setProcH] = useState(120);
  const [procDragH, setProcDragH] = useState(0);

  const featuredLabel = t('libation_recipes.featured');
  const categoryValue =
    draft.subcategoryId === FEATURED_SENTINEL
      ? featuredLabel
      : subOptions.find((o) => o.id === draft.subcategoryId)?.label
        || extraSubOptions.find((o) => o.id === draft.subcategoryId)?.label
        || '';
  const pickerOptions = [featuredLabel, ...subOptions.map((o) => o.label), ...extraSubOptions.map((o) => o.label)];

  const updateIngredient = (index: number, field: 'amount' | 'ingredient', value: string) => {
    const next = draft.ingredients.map((r, i) => (i === index ? { ...r, [field]: value } : r));
    onChange({ ingredients: next });
  };
  const addIngredient = () => onChange({ ingredients: [...draft.ingredients, { amount: '', ingredient: '' }] });
  const removeIngredient = (index: number) => {
    const next = draft.ingredients.filter((_, i) => i !== index);
    onChange({ ingredients: next.length > 0 ? next : [{ amount: '', ingredient: '' }] });
  };

  const inputStyle = [styles.formInput, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }];
  const procedureValue = isSpanishAuthor ? draft.procedureEs : draft.procedure;
  const setProcedureValue = (v: string) => onChange(isSpanishAuthor ? { procedureEs: v } : { procedure: v });

  return (
    <>
      {/* ── Section 1: Recipe Basics (open) ── */}
      <CollapsibleSection
        glass
        title={t('libation_editor.section_basics')}
        iconIos="wineglass.fill"
        iconAndroid="local-bar"
        iconColor={colors.primary}
        defaultExpanded
      >
        <View style={styles.formField}>
          <MultiImageField
            images={draft.images}
            onChange={(images) => onChange({ images })}
            onRemove={onImageRemoved}
            purpose={imagePurpose}
            bucket={imageBucket}
          />
        </View>

        <View style={styles.formField}>
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('libation_editor.recipe_name_label')}</Text>
          <TextInput
            style={inputStyle}
            value={draft.name}
            onChangeText={(name) => onChange({ name })}
            placeholder={t('libation_editor.recipe_name_placeholder')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* Subcategory (dropdown, Featured first) + Price (optional, s90) */}
        <View style={styles.twoColRow}>
          <View style={styles.twoColLeft}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('libation_editor.category_label')}</Text>
            <SelectField value={categoryValue} placeholder={t('libation_editor.select_category')} onPress={() => setSubPickerOpen(true)} />
            {subOptions.length === 0 && extraSubOptions.length === 0 && (
              <Text style={[styles.pickerEmptyHint, { color: colors.textSecondary }]}>{t('libation_editor.no_cocktail_subs')}</Text>
            )}
          </View>
          <View style={styles.twoColRight}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
              {t('libation_editor.price_optional_label')}
              <Text style={styles.optional}>{'  '}{t('libation_editor.optional')}</Text>
            </Text>
            <TextInput
              style={inputStyle}
              value={draft.price}
              onChangeText={(price) => onChange({ price })}
              placeholder={t('libation_editor.price_placeholder')}
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        {/* Featured — locked ON when the category itself is Featured. */}
        <View style={[styles.featuredRow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <View style={styles.featuredTextWrap}>
            <Text style={[styles.featuredLabel, { color: colors.text }]}>{t('libation_editor.featured_label')}</Text>
            <Text style={[styles.featuredHint, { color: colors.textSecondary }]}>{t('libation_editor.featured_hint')}</Text>
          </View>
          <GlassToggle
            value={draft.subcategoryId === FEATURED_SENTINEL ? true : draft.isFeatured}
            onValueChange={(isFeatured) => onChange({ isFeatured })}
            disabled={draft.subcategoryId === FEATURED_SENTINEL}
          />
        </View>
      </CollapsibleSection>

      {/* ── Section 2: Recipe (collapsed) ── */}
      <CollapsibleSection
        glass
        title={t('libation_editor.section_recipe')}
        iconIos="list.bullet"
        iconAndroid="format-list-bulleted"
        iconColor={colors.primary}
        defaultExpanded={false}
      >
        <View style={styles.formField}>
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
            {t('libation_editor.glassware_label')}
            <Text style={styles.optional}>{'  '}{t('libation_editor.optional')}</Text>
          </Text>
          <GlasswareIconPicker
            value={draft.glassware}
            onChange={(glassware) => onChange({ glassware })}
            title={t('libation_editor.select_glassware')}
            placeholder={t('libation_editor.select_glassware')}
            customLabel={t('common.custom_option')}
            customPlaceholder={t('libation_editor.custom_glassware_placeholder')}
          />
        </View>
        <View style={styles.formField}>
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
            {t('libation_editor.garnish_label')}
            <Text style={styles.optional}>{'  '}{t('libation_editor.optional')}</Text>
          </Text>
          <TextInput
            style={inputStyle}
            value={draft.garnish}
            onChangeText={(garnish) => onChange({ garnish })}
            placeholder={t('libation_editor.garnish_placeholder')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>
        <View style={styles.formField}>
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
            {t('libation_editor.ingredients_label')}
            <Text style={styles.optional}>{'  '}{t('libation_editor.amounts_optional')}</Text>
          </Text>
          {draft.ingredients.map((ingredient, index) => (
            <View key={index} style={styles.ingredientRow}>
              <TextInput
                style={[...inputStyle, styles.ingredientAmount]}
                value={ingredient.amount}
                onChangeText={(value) => updateIngredient(index, 'amount', value)}
                placeholder={t('libation_editor.amount_placeholder')}
                placeholderTextColor={colors.textSecondary}
              />
              <TextInput
                style={[...inputStyle, styles.ingredientName]}
                value={ingredient.ingredient}
                onChangeText={(value) => updateIngredient(index, 'ingredient', value)}
                placeholder={t('libation_editor.ingredient_placeholder')}
                placeholderTextColor={colors.textSecondary}
              />
              {draft.ingredients.length > 1 && (
                <TouchableOpacity style={styles.removeIngredientButton} onPress={() => removeIngredient(index)}>
                  <IconSymbol ios_icon_name="minus.circle.fill" android_material_icon_name="remove-circle" size={24} color={TRASH_RED} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
            <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={20} color={colors.primary} />
            <Text style={[styles.addIngredientText, { color: colors.primary }]}>{t('libation_editor.add_ingredient')}</Text>
          </TouchableOpacity>
        </View>
      </CollapsibleSection>

      {/* ── Section 3: Procedure (collapsed) ── */}
      <CollapsibleSection
        glass
        title={t('libation_editor.section_procedure')}
        iconIos="list.number"
        iconAndroid="format-list-numbered"
        iconColor={colors.primary}
        defaultExpanded={false}
      >
        <View style={styles.formField}>
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
            {t('libation_editor.procedure_label')}
            <Text style={styles.optional}>{'  '}{t('libation_editor.optional')}</Text>
          </Text>
          <RichTextToolbar
            text={procedureValue}
            onChangeText={setProcedureValue}
            selection={procedureSelection}
            onSelectionChange={setProcedureSelection}
            textInputRef={procedureInputRef}
            accentColor={colors.primary}
            backgroundColor={colors.surface}
            textColor={colors.text}
          />
          <View>
            <TextInput
              ref={procedureInputRef}
              style={[...inputStyle, styles.textArea, { minHeight: Math.max(120, procDragH), paddingBottom: 22 }]}
              value={procedureValue}
              onChangeText={setProcedureValue}
              placeholder={t('libation_editor.procedure_placeholder')}
              placeholderTextColor={colors.textSecondary}
              multiline
              scrollEnabled={false}
              onContentSizeChange={(e) => setProcH(e.nativeEvent.contentSize.height)}
              onSelectionChange={(e) => setProcedureSelection(e.nativeEvent.selection)}
            />
            <ProcedureResizeHandle height={Math.max(120, procH, procDragH)} onResize={setProcDragH} />
          </View>
        </View>
        {!!translationElement && <View style={styles.formField}>{translationElement}</View>}
      </CollapsibleSection>

      {/* Nested INSIDE the sheet's Modal tree so iOS can present it above the
          open sheet (a sibling Modal would be silently dropped). */}
      <SimpleSelectPicker
        visible={subPickerOpen}
        title={t('libation_editor.select_category')}
        options={pickerOptions}
        value={categoryValue}
        onSelect={(label) => {
          // A real subcategory wins a name collision with "Featured".
          const opt = subOptions.find((o) => o.label === label);
          const extra = extraSubOptions.find((o) => o.label === label);
          if (opt) onChange({ subcategoryId: opt.id });
          else if (extra) onChange({ subcategoryId: extra.id });
          else if (label === featuredLabel) onChange({ subcategoryId: FEATURED_SENTINEL });
        }}
        onClose={() => setSubPickerOpen(false)}
      />
    </>
  );
}

const TRASH_RED = '#E53935';

const styles = StyleSheet.create({
  formField: { marginBottom: 14 },
  formLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  optional: { fontFamily: fonts.mono.medium, fontSize: 9, letterSpacing: 0.4, textTransform: 'none', opacity: 0.8 },
  formInput: {
    minHeight: 43,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: fonts.body.regular,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  twoColRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  twoColLeft: { flex: 3 },
  twoColRight: { flex: 2 },
  pickerEmptyHint: { fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 17, paddingVertical: 12 },
  featuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  featuredTextWrap: { flex: 1 },
  featuredLabel: { fontFamily: fonts.display.semibold, fontSize: 14 },
  featuredHint: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  ingredientAmount: { flex: 1 },
  ingredientName: { flex: 2 },
  removeIngredientButton: { padding: 4 },
  addIngredientButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  addIngredientText: { fontFamily: fonts.body.semibold, fontSize: 13 },
});
