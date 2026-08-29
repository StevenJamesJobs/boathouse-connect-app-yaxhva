/**
 * QuizComposer — the s77 generator (GEN·FINAL, tuned by Steve's smoke round):
 * B's dials living directly on the page under C's gradient count console.
 * Every dial maps to real generator structure (GenerateOptions): sources →
 * template pools, the PHOTO SLIDER → the exact reserved picture-slot count
 * ("X of Y questions · Z%"), difficulty → the ingredient tiers; the $ value
 * is the quiz-level default (plain number — the multi-quiz split story lives
 * on the editor's Rewards line) and the time limit seeds update_exam_settings.
 *
 * Smoke-round changes: defaults 5 questions / 2:00, the photo tabs became a
 * real slider, the whole value field focuses its input, and Generate first
 * opens a CONFIRM sheet laying out every choice — because photo ratio and
 * difficulty can't be changed after generation.
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import GlassSheet from '@/components/GlassSheet';
import ShineButton from '@/components/quiz/ShineButton';
import { QUIZ_VISUALS } from '@/components/quiz/quizVisuals';
import { formatTime } from '@/utils/exam/examEngine';
import type {
  ExamType,
  QuizDifficulty,
  QuizSource,
} from '@/utils/exam/questionGenerator';
import { getExamTypeName } from '@/utils/exam/questionGenerator';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

export interface ComposerResult {
  count: number;
  sources: QuizSource[];
  /** Exact picture-question slots to reserve (the slider). */
  photoCount: number;
  difficulty: QuizDifficulty;
  /** null = the $1 base; 0 = explicit no-reward quiz. Splits for multi-quiz staff. */
  defaultBucksValue: number | null;
  timeLimitSeconds: number;
}

interface QuizComposerProps {
  examType: ExamType;
  currencyName: string;
  generating: boolean;
  onGenerate: (result: ComposerResult) => void;
  onStartBlank: (result: ComposerResult) => void;
}

const TIME_PRESETS = [60, 105, 120, 180, 240, 300, 360, 420, 480, 0];

/** Which source chips a role's composer offers (mirrors the generator gates). */
function sourcesForType(examType: ExamType): QuizSource[] {
  if (examType === 'server') return ['menu', 'wine', 'libations', 'cocktails'];
  if (examType === 'bartender') return ['menu', 'wine', 'libations', 'cocktails', 'checklists'];
  return ['menu', 'checklists'];
}

const SOURCE_LABEL_KEYS: Record<QuizSource, string> = {
  menu: 'exam_editor.src_menu',
  wine: 'exam_editor.src_wine',
  libations: 'exam_editor.src_libations',
  cocktails: 'exam_editor.src_cocktails',
  checklists: 'exam_editor.src_checklists',
};

export default function QuizComposer({
  examType,
  currencyName,
  generating,
  onGenerate,
  onStartBlank,
}: QuizComposerProps) {
  const { t, i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';
  const colors = useThemeColors();
  const visual = QUIZ_VISUALS[examType];

  const available = useMemo(() => sourcesForType(examType), [examType]);

  const [count, setCount] = useState(5);
  const [countText, setCountText] = useState('5');
  const [sources, setSources] = useState<QuizSource[]>(available);
  const [photoCount, setPhotoCount] = useState(1);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('mixed');
  const [valueText, setValueText] = useState('1');
  const [timeLimit, setTimeLimit] = useState(120);
  const [showTimeSheet, setShowTimeSheet] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const valueInputRef = useRef<TextInput>(null);

  const commitCount = (next: number) => {
    const clamped = Math.max(1, Math.min(100, next));
    setCount(clamped);
    setCountText(String(clamped));
    setPhotoCount((p) => Math.min(p, clamped));
  };

  const toggleSource = (s: QuizSource) => {
    setSources((prev) => {
      if (prev.includes(s)) {
        // At least one source stays on — a zero-source quiz can't generate.
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== s);
      }
      return [...prev, s];
    });
  };

  const parsedValue = (): number | null => {
    const trimmed = valueText.trim();
    if (trimmed === '') return null;
    const n = parseInt(trimmed, 10);
    return Number.isNaN(n) ? null : Math.max(0, n);
  };

  const result = (): ComposerResult => ({
    count,
    sources,
    photoCount,
    difficulty,
    defaultBucksValue: parsedValue(),
    timeLimitSeconds: timeLimit,
  });

  // ── The photo slider (no dependency — track + thumb on a PanResponder) ──
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const countRef = useRef(count);
  countRef.current = count;

  const valueFromX = (x: number) => {
    const w = trackWidthRef.current;
    if (w <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, x / w));
    return Math.round(ratio * countRef.current);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setPhotoCount(valueFromX(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setPhotoCount(valueFromX(e.nativeEvent.locationX)),
    }),
  ).current;

  const photoPct = count > 0 ? Math.round((photoCount / count) * 100) : 0;
  const thumbLeft = count > 0 && trackWidth > 0 ? (photoCount / count) * trackWidth : 0;

  const seg = (
    options: { key: string; label: string }[],
    value: string,
    onPick: (key: string) => void,
  ) => (
    <View style={[styles.seg, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      {options.map((opt) => {
        const on = opt.key === value;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.segItem, on && { backgroundColor: visual.accent }]}
            onPress={() => onPick(opt.key)}
            activeOpacity={0.75}
          >
            <Text
              style={[styles.segText, { color: on ? '#FFFFFF' : colors.textSecondary }]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const sect = (label: string) => (
    <View style={styles.sect}>
      <Text style={[styles.sectLabel, { color: colors.textSecondary }]}>{label.toUpperCase()}</Text>
      <View style={[styles.sectLine, { backgroundColor: colors.hairline }]} />
    </View>
  );

  const confirmRow = (label: string, value: string) => (
    <View key={label} style={[styles.confirmRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <Text style={[styles.confirmLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.confirmValue, { color: colors.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );

  return (
    <View>
      {/* ── The count console ─────────────────────────────────────────── */}
      <View style={styles.console}>
        <LinearGradient
          colors={[visual.console[0], visual.console[1], visual.console[2]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.consoleLabel}>
          {t('exam_editor.composer_title', { type: getExamTypeName(examType, isSpanish) }).toUpperCase()}
        </Text>
        <View style={styles.countRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => commitCount(count - 1)}
            activeOpacity={0.7}
          >
            <Text style={styles.stepText}>−</Text>
          </TouchableOpacity>
          <View style={styles.countMid}>
            <TextInput
              style={styles.countInput}
              value={countText}
              onChangeText={setCountText}
              onEndEditing={() => {
                const n = parseInt(countText, 10);
                commitCount(Number.isNaN(n) ? count : n);
              }}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
            />
            <Text style={styles.countHint}>{t('exam_editor.composer_count_hint').toUpperCase()}</Text>
          </View>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => commitCount(count + 1)}
            activeOpacity={0.7}
          >
            <Text style={styles.stepText}>＋</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Sources ───────────────────────────────────────────────────── */}
      {sect(t('exam_editor.composer_sources'))}
      <View style={styles.mixRow}>
        {available.map((s) => {
          const on = sources.includes(s);
          return (
            <TouchableOpacity
              key={s}
              style={[
                styles.mix,
                { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                on && { backgroundColor: visual.accent + '18', borderColor: visual.accent + '73' },
              ]}
              onPress={() => toggleSource(s)}
              activeOpacity={0.75}
            >
              <IconSymbol
                ios_icon_name={on ? 'checkmark' : 'plus'}
                android_material_icon_name={on ? 'check' : 'add'}
                size={11}
                color={on ? visual.accent : colors.textSecondary}
              />
              <Text style={[styles.mixText, { color: on ? visual.accent : colors.textSecondary }]}>
                {t(SOURCE_LABEL_KEYS[s])}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Photo questions — the slider ──────────────────────────────── */}
      {sect(t('exam_editor.composer_photos'))}
      <Text style={[styles.photoReadout, { color: visual.accent }]}>
        {t('exam_editor.photos_of', { x: photoCount, y: count, pct: photoPct })}
      </Text>
      <View
        style={styles.sliderHit}
        onLayout={(e) => {
          trackWidthRef.current = e.nativeEvent.layout.width;
          setTrackWidth(e.nativeEvent.layout.width);
        }}
        {...pan.panHandlers}
      >
        <View style={[styles.sliderTrack, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={[styles.sliderFill, { width: thumbLeft, backgroundColor: visual.accent }]} />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.sliderThumb,
            { left: Math.max(0, Math.min(trackWidth - 22, thumbLeft - 11)), backgroundColor: visual.accent },
          ]}
        />
      </View>
      <Text style={[styles.photoHint, { color: colors.textSecondary }]}>
        {t('exam_editor.photos_hint')}
      </Text>

      {/* ── Difficulty ────────────────────────────────────────────────── */}
      {sect(t('exam_editor.composer_difficulty'))}
      {seg(
        [
          { key: 'standard', label: t('exam_editor.diff_standard') },
          { key: 'mixed', label: t('exam_editor.diff_mixed') },
          { key: 'advanced', label: t('exam_editor.diff_advanced') },
        ],
        difficulty,
        (k) => setDifficulty(k as QuizDifficulty),
      )}

      {/* ── Value & time ──────────────────────────────────────────────── */}
      {sect(t('exam_editor.composer_value_time'))}
      <View style={styles.inline2}>
        <TouchableOpacity
          style={[styles.valField, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          onPress={() => valueInputRef.current?.focus()}
          activeOpacity={0.85}
        >
          <IconSymbol ios_icon_name="dollarsign.circle" android_material_icon_name="attach-money" size={14} color={visual.accent} />
          <TextInput
            ref={valueInputRef}
            style={[styles.valInput, { color: visual.accent }]}
            value={valueText}
            onChangeText={(v) => setValueText(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="1"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={[styles.valHint, { color: colors.textSecondary }]}>
            {t('exam_editor.value_hint', { currency: currencyName })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.valField, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          onPress={() => setShowTimeSheet(true)}
          activeOpacity={0.75}
        >
          <IconSymbol ios_icon_name="timer" android_material_icon_name="timer" size={14} color={visual.accent} />
          <Text style={[styles.valInput, { color: visual.accent }]}>
            {timeLimit === 0 ? '∞' : formatTime(timeLimit)}
          </Text>
          <Text style={[styles.valHint, { color: colors.textSecondary }]}>
            {t('exam_editor.time_limit')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── CTAs ──────────────────────────────────────────────────────── */}
      <ShineButton
        label={t('exam_editor.generate_btn', { count })}
        gradient={visual.gradient}
        iosIcon="wand.and.stars"
        androidIcon="auto-awesome"
        loading={generating}
        onPress={() => setShowConfirm(true)}
        style={styles.generate}
      />
      <TouchableOpacity
        style={[styles.blankBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
        onPress={() => onStartBlank(result())}
        disabled={generating}
        activeOpacity={0.75}
      >
        <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={13} color={colors.text} />
        <Text style={[styles.blankText, { color: colors.text }]}>{t('exam_editor.start_blank')}</Text>
      </TouchableOpacity>

      {/* Confirm-the-details sheet — photo ratio and difficulty can't change
          after generation, so the choices get one last look (smoke round). */}
      <GlassSheet
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        title={t('exam_editor.confirm_title')}
      >
        {confirmRow(t('exam_editor.composer_count_label'), String(count))}
        {confirmRow(
          t('exam_editor.composer_sources'),
          sources.map((s) => t(SOURCE_LABEL_KEYS[s])).join(' · '),
        )}
        {confirmRow(
          t('exam_editor.composer_photos'),
          t('exam_editor.photos_of', { x: photoCount, y: count, pct: photoPct }),
        )}
        {confirmRow(
          t('exam_editor.composer_difficulty'),
          t(`exam_editor.diff_${difficulty}`),
        )}
        {confirmRow(t('exam_editor.per_correct'), `$${parsedValue() ?? 1}`)}
        {confirmRow(
          t('exam_editor.time_limit'),
          timeLimit === 0 ? t('exam_editor.no_limit') : formatTime(timeLimit),
        )}
        <ShineButton
          label={t('exam_editor.generate_btn', { count })}
          gradient={visual.gradient}
          iosIcon="wand.and.stars"
          androidIcon="auto-awesome"
          onPress={() => {
            setShowConfirm(false);
            onGenerate(result());
          }}
          style={{ marginTop: 12 }}
        />
        <TouchableOpacity style={styles.confirmBack} onPress={() => setShowConfirm(false)}>
          <Text style={[styles.confirmBackText, { color: colors.textSecondary }]}>{t('common.back')}</Text>
        </TouchableOpacity>
      </GlassSheet>

      {/* Time-limit picker sheet */}
      <GlassSheet
        visible={showTimeSheet}
        onClose={() => setShowTimeSheet(false)}
        title={t('exam_editor.time_limit')}
      >
        <View style={styles.presetWrap}>
          {TIME_PRESETS.map((secs) => {
            const on = timeLimit === secs;
            return (
              <TouchableOpacity
                key={secs}
                style={[
                  styles.preset,
                  { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                  on && { backgroundColor: visual.accent, borderColor: visual.accent },
                ]}
                onPress={() => {
                  setTimeLimit(secs);
                  setShowTimeSheet(false);
                }}
              >
                <Text style={[styles.presetText, { color: on ? '#FFFFFF' : colors.text }]}>
                  {secs === 0 ? '∞' : formatTime(secs)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </GlassSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fixed-dark console — literals by design (the ember rule).
  console: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    boxShadow: '0 10px 26px -14px rgba(0,0,0,0.55)',
  },
  consoleLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 1.6,
    color: 'rgba(255,255,255,0.72)',
    marginBottom: 8,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  stepText: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', marginTop: -2 },
  countMid: { alignItems: 'center' },
  countInput: {
    fontFamily: fonts.mono.semibold,
    fontSize: 42,
    color: '#FFFFFF',
    textAlign: 'center',
    minWidth: 86,
    paddingVertical: 0,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderBottomColor: 'rgba(255,255,255,0.35)',
  },
  countHint: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8,
    letterSpacing: 1.3,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 6,
  },
  sect: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 15, marginBottom: 8, paddingHorizontal: 2 },
  sectLabel: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 1.4 },
  sectLine: { flex: 1, height: StyleSheet.hairlineWidth },
  mixRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  mix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  mixText: { fontFamily: fonts.body.semibold, fontSize: 11.5 },
  // The photo slider
  photoReadout: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sliderHit: {
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  sliderTrack: {
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sliderFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  sliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
  },
  photoHint: {
    fontFamily: fonts.body.regular,
    fontSize: 9.5,
    lineHeight: 13,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  seg: { flexDirection: 'row', borderRadius: 11, borderWidth: 1, padding: 3 },
  segItem: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', paddingHorizontal: 2 },
  segText: { fontFamily: fonts.body.semibold, fontSize: 10.5 },
  inline2: { flexDirection: 'row', gap: 8 },
  valField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    minHeight: 46,
  },
  valInput: {
    fontFamily: fonts.mono.semibold,
    fontSize: 14.5,
    paddingVertical: 0,
    minWidth: 34,
  },
  valHint: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.body.regular,
    fontSize: 9,
    lineHeight: 12,
  },
  generate: { marginTop: 15, marginBottom: 8 },
  blankBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 11,
  },
  blankText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  preset: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  presetText: { fontFamily: fonts.mono.semibold, fontSize: 12.5 },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  confirmLabel: { fontFamily: fonts.mono.semibold, fontSize: 8.5, letterSpacing: 0.9, width: 108 },
  confirmValue: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 12.5, textAlign: 'right' },
  confirmBack: { alignItems: 'center', paddingVertical: 12 },
  confirmBackText: { fontFamily: fonts.body.regular, fontSize: 13 },
});
