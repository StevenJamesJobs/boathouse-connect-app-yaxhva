import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/GlassCard';
import { IconSymbol } from '@/components/IconSymbol';
import { fonts } from '@/constants/fonts';
import { useThemeColors } from '@/hooks/useThemeColors';
import { translateTextsDetailed } from '@/utils/translateContent';

/**
 * The hybrid bilingual authoring section (Session 61 design, Steve's shape):
 * the host form's primary inputs are bound to the AUTHOR's device language,
 * this section renders one reactive Translate button + a read-only preview of
 * the OTHER language + a pencil modal to hand-edit that translation.
 *
 * Staleness contract ("auto-refresh + one-tap ask"):
 *  - a Translate-button tap always overwrites the other side (explicit action);
 *  - resolveOnSave() fills an empty other side automatically, silently
 *    re-translates a machine-owned translation when the source changed, asks
 *    once (Keep current / Update) before touching a pre-existing translation
 *    that might be hand-tuned, and never replaces a pencil-edit made this
 *    session;
 *  - emptying a field that still has text on the other side asks once (Clear
 *    both / Keep the other) — without that, the blank side was simply skipped
 *    and the next open machine-translated the survivor straight back into it,
 *    so a clear could never stick;
 *  - when the author side is empty but the other side has content (item
 *    authored in the other language), the author side auto-fills on open so
 *    the form is never blank — persisted only if the manager saves.
 */
export interface BilingualFieldSpec {
  key: string;
  /** i18n key for the field label in the preview + pencil modal. */
  labelKey: string;
  enValue: string;
  esValue: string;
  setEnValue: (v: string) => void;
  setEsValue: (v: string) => void;
  multiline?: boolean;
  /** Shown in the preview/pencil modal but never machine-translated (e.g. menu location). */
  noMachine?: boolean;
  /**
   * OPTIONAL raw stored column values, straight off the row — nullable, NOT
   * collapsed to ''. They are the only way to tell "never authored" (NULL)
   * from "deliberately cleared" ('') apart, which is what makes a clear stay
   * true across sessions (see `wasCleared`). Omit them and behavior is exactly
   * as shipped: both read as "never authored".
   */
  enStored?: string | null;
  esStored?: string | null;
}

export interface ResolvedPair {
  en: string;
  es: string;
}

interface UseTranslationSectionOpts {
  fields: BilingualFieldSpec[];
  /** Changes on every modal open: item id for edits, a fresh token for adds. */
  sessionKey: string;
  /** Host modal visibility — gates auto-fill-on-open and state snapshots. */
  active: boolean;
}

export interface TranslationSectionApi {
  element: React.ReactElement;
  /**
   * Runs the staleness rules (fill / silent refresh / one-tap ask / clear),
   * performs any needed translation in ONE edge-fn call, pushes results into
   * the host state, and returns the final {en, es} value per field key for
   * persisting.
   * Returns NULL when the save must abort: a fill toward English failed
   * (translate service down), the modal session changed mid-resolve (closed
   * or reopened — prevents cross-item and blank writes), or a second Save
   * re-entered while one was in flight (double-tap). Callers abort on null;
   * other failures degrade gracefully (ES display falls back to EN).
   *
   * A pair may legitimately come back with a side set to '' (a confirmed
   * clear). Do NOT re-collapse it to null on the way out — pass it to
   * saveTranslations with that field named in `opts.clearBlank`, or the RPC's
   * COALESCE keeps the old text and the clear is lost.
   */
  resolveOnSave: () => Promise<Record<string, ResolvedPair> | null>;
}

export function useTranslationSection(opts: UseTranslationSectionOpts): TranslationSectionApi {
  const { fields, sessionKey, active } = opts;
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const isSpanish = i18n.language === 'es';

  const [translating, setTranslating] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [pencilOpen, setPencilOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);

  // valuesRef is the authoritative "latest known" value store: refreshed from
  // props every render AND written synchronously whenever this hook writes to
  // host state, so save-time reads never race React's async state commits.
  const valuesRef = useRef<Record<string, ResolvedPair>>({});
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  // Session tracking (reset on every modal open via sessionKey)
  const initialAuthorRef = useRef<Record<string, string>>({});
  const machineWroteRef = useRef<Record<string, string>>({});
  const handEditedRef = useRef<Set<string>>(new Set());
  const autoFillPromiseRef = useRef<Promise<void> | null>(null);
  const translatePromiseRef = useRef<Promise<void> | null>(null);
  // Re-entry latch: a second Save while resolveOnSave is in flight resolves
  // to null (the editor aborts), so a double-tap cannot double-insert.
  const resolvingRef = useRef(false);
  // Monotonic session token: async continuations (auto-fill, translate press,
  // resolveOnSave) capture it and abort if the modal session changed — the
  // epoch also advances on CLOSE, so a save can never outlive its modal.
  const sessionEpochRef = useRef(0);

  // Render-phase ref sync (idempotent by design — keep it that way). Also
  // lazily baselines fields that JOIN mid-session (menu wine fields after a
  // category switch) so they never diff against an undefined initial and
  // fire a spurious save-time prompt.
  fields.forEach((f) => {
    valuesRef.current[f.key] = { en: f.enValue, es: f.esValue };
    if (active && !(f.key in initialAuthorRef.current)) {
      initialAuthorRef.current[f.key] = isSpanish ? f.esValue : f.enValue;
    }
  });

  const readPair = (f: BilingualFieldSpec): ResolvedPair =>
    valuesRef.current[f.key] ?? { en: f.enValue, es: f.esValue };
  const authorOf = (f: BilingualFieldSpec) => (isSpanish ? readPair(f).es : readPair(f).en);
  const otherOf = (f: BilingualFieldSpec) => (isSpanish ? readPair(f).en : readPair(f).es);
  const setAuthor = (f: BilingualFieldSpec, v: string) => {
    const pair = readPair(f);
    valuesRef.current[f.key] = isSpanish ? { ...pair, es: v } : { ...pair, en: v };
    if (isSpanish) f.setEsValue(v);
    else f.setEnValue(v);
  };
  const setOther = (f: BilingualFieldSpec, v: string) => {
    const pair = readPair(f);
    valuesRef.current[f.key] = isSpanish ? { ...pair, en: v } : { ...pair, es: v };
    if (isSpanish) f.setEnValue(v);
    else f.setEsValue(v);
  };
  const authorLang = isSpanish ? 'es' : 'en';
  const otherLang = isSpanish ? 'en' : 'es';

  /**
   * Did the manager deliberately empty THIS side in an earlier session?
   * '' means yes (the save wrote an empty string over the column), NULL means
   * the side was simply never authored. A cleared side is off-limits to every
   * machine write — the auto-fill on open and the fill bucket on save — or the
   * translator immediately puts the text back and the clear undoes itself.
   * Callers that don't pass the raw stored value get the shipped behavior.
   */
  const wasCleared = (f: BilingualFieldSpec, lang: 'en' | 'es') => {
    const stored = lang === 'es' ? f.esStored : f.enStored;
    return typeof stored === 'string' && !stored.trim();
  };

  /**
   * Whether a persisted clear on the OTHER side still stands. It does only
   * while the author side is untouched: the moment the manager types new
   * content the old intent is stale, and honoring it forever would strand the
   * other language — no machine write would ever reach it again, while the
   * preview kept insisting there was nothing to translate over a full field.
   */
  const clearStands = (f: BilingualFieldSpec) =>
    wasCleared(f, otherLang) && authorOf(f) === (initialAuthorRef.current[f.key] ?? '');

  useEffect(() => {
    if (!active) {
      // Closing the modal invalidates the session: any continuation still in
      // flight (auto-fill, press-translate, resolveOnSave) must drop its
      // writes, and a pending save resolves to null.
      sessionEpochRef.current += 1;
      autoFillPromiseRef.current = null;
      translatePromiseRef.current = null;
      return;
    }
    // New session: invalidate in-flight continuations from the previous one
    // and reset per-session tracking + busy flags.
    sessionEpochRef.current += 1;
    const epoch = sessionEpochRef.current;
    autoFillPromiseRef.current = null;
    translatePromiseRef.current = null;
    setAutoFilling(false);
    setTranslating(false);
    setExpanded(false);
    const fs = fieldsRef.current;
    const initials: Record<string, string> = {};
    fs.forEach((f) => {
      initials[f.key] = authorOf(f);
    });
    initialAuthorRef.current = initials;
    machineWroteRef.current = {};
    handEditedRef.current = new Set();

    // Auto-fill the author side when the item was authored in the other
    // language — unless the author side was deliberately cleared, in which case
    // refilling it is exactly the bug this guard exists to stop.
    const needsFill = fs.filter(
      (f) =>
        !f.noMachine && !authorOf(f).trim() && otherOf(f).trim() && !wasCleared(f, authorLang)
    );
    if (needsFill.length === 0) return;
    setAutoFilling(true);
    let run: Promise<void> | null = null;
    run = (async () => {
      try {
        const res = await translateTextsDetailed(
          needsFill.map((f) => otherOf(f)),
          authorLang,
          otherLang
        );
        if (epoch !== sessionEpochRef.current) return; // stale session — drop
        if (res.ok) {
          needsFill.forEach((f, i) => {
            if (authorOf(f).trim()) return; // manager typed meanwhile — never clobber
            const value = res.translations[i] || '';
            setAuthor(f, value);
            initialAuthorRef.current[f.key] = value;
          });
        }
      } finally {
        if (epoch === sessionEpochRef.current) setAutoFilling(false);
        if (autoFillPromiseRef.current === run) autoFillPromiseRef.current = null;
      }
    })();
    autoFillPromiseRef.current = run;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, active]);

  const handleTranslatePress = async () => {
    const targets = fieldsRef.current.filter((f) => !f.noMachine && authorOf(f).trim());
    if (targets.length === 0) {
      Alert.alert(t('common:error'), t('translation_section:no_content_to_translate'));
      return;
    }
    const epoch = sessionEpochRef.current;
    setTranslating(true);
    let run: Promise<void> | null = null;
    run = (async () => {
      try {
        const res = await translateTextsDetailed(
          targets.map((f) => authorOf(f)),
          otherLang,
          authorLang
        );
        if (epoch !== sessionEpochRef.current) return; // stale session — drop
        if (!res.ok) {
          Alert.alert(t('common:error'), t('translation_section:translate_failed'));
          return;
        }
        targets.forEach((f, i) => {
          const value = res.translations[i] || '';
          setOther(f, value);
          machineWroteRef.current[f.key] = value;
          handEditedRef.current.delete(f.key);
        });
      } finally {
        if (epoch === sessionEpochRef.current) setTranslating(false);
        if (translatePromiseRef.current === run) translatePromiseRef.current = null;
      }
    })();
    translatePromiseRef.current = run;
    await run;
  };

  const confirmRefresh = (): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        t('translation_section:update_prompt_title'),
        isSpanish
          ? t('translation_section:update_prompt_msg_en')
          : t('translation_section:update_prompt_msg_es'),
        [
          { text: t('translation_section:keep_btn'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('translation_section:update_btn'), onPress: () => resolve(true) },
        ],
        { cancelable: false }
      );
    });

  const confirmClear = (): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        t('translation_section:clear_prompt_title'),
        isSpanish
          ? t('translation_section:clear_prompt_msg_en')
          : t('translation_section:clear_prompt_msg_es'),
        [
          {
            text: t('translation_section:clear_keep_btn'),
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: t('translation_section:clear_both_btn'),
            style: 'destructive',
            onPress: () => resolve(true),
          },
        ],
        { cancelable: false }
      );
    });

  const resolveOnSave = async (): Promise<Record<string, ResolvedPair> | null> => {
    // Re-entry latch: a second Save during an in-flight resolve aborts.
    if (resolvingRef.current) return null;
    resolvingRef.current = true;
    setResolving(true);
    const epoch = sessionEpochRef.current;
    try {
      // Let any in-flight press-translate / auto-fill land first so the
      // buckets see settled values (and their alerts precede ours).
      if (translatePromiseRef.current) {
        await translatePromiseRef.current;
      }
      if (autoFillPromiseRef.current) {
        await autoFillPromiseRef.current;
      }
      if (epoch !== sessionEpochRef.current) return null; // session changed — abort

      const fs = fieldsRef.current;
      const fill: BilingualFieldSpec[] = [];
      const refresh: BilingualFieldSpec[] = [];
      const ask: BilingualFieldSpec[] = [];
      const clear: BilingualFieldSpec[] = [];

      fs.forEach((f) => {
        if (f.noMachine) return;
        const author = authorOf(f);
        const other = otherOf(f);
        const initial = initialAuthorRef.current[f.key] || '';
        const authorChanged = author !== initialAuthorRef.current[f.key];
        const handEdited = handEditedRef.current.has(f.key);
        const machineOwned =
          machineWroteRef.current[f.key] !== undefined && other === machineWroteRef.current[f.key];
        if (!author.trim()) {
          // Emptied in THIS session while the other side still has text: the
          // clear only sticks if the other side goes with it, so ask once.
          //
          // OPT-IN ONLY (enStored/esStored present). A caller that does not
          // pass them also does not pass saveTranslations' `clearBlank`, so its
          // blank _es goes over as null and the RPC's COALESCE keeps the old
          // text — the prompt would prove a lie, and worse: "Clear Both" blanks
          // the OTHER side, which for those callers is the base column their
          // own RPC assigns directly. The manager would confirm a clear and get
          // the exact inverse — base column destroyed, translation surviving.
          //
          // Gated too on the field having HELD content: one that merely OPENED
          // blank (auto-fill failed, or it joined mid-session) is not a clear.
          // `machineWrote`/`handEdited` cover the type-it-then-delete-it case,
          // where the baseline is blank but this session did author the other
          // side — leaving that ungated would orphan the translation and let
          // auto-fill refill from it, the very loop this exists to close.
          const optedIn = f.enStored !== undefined || f.esStored !== undefined;
          const heldContent =
            initial.trim() ||
            machineWroteRef.current[f.key] !== undefined ||
            handEditedRef.current.has(f.key);
          if (optedIn && heldContent && other.trim()) clear.push(f);
          return;
        }
        if (!other.trim()) {
          // A this-session pencil-clear is a deliberate hand edit — honor it.
          // So is a clear an earlier session persisted as '' — but only while
          // the author side still holds what it opened with (see clearStands).
          if (!handEdited && !clearStands(f)) fill.push(f);
        } else if (authorChanged && !handEdited) {
          if (machineOwned) {
            refresh.push(f);
          } else {
            ask.push(f);
          }
        }
      });

      if (ask.length > 0) {
        const approved = await confirmRefresh();
        if (epoch !== sessionEpochRef.current) return null; // session changed — abort
        if (approved) refresh.push(...ask);
      }

      if (clear.length > 0) {
        // ONE prompt for every emptied field — Steve's shape: confirm the same
        // clear on the other language, or keep it as a one-language entry.
        const clearBoth = await confirmClear();
        if (epoch !== sessionEpochRef.current) return null; // session changed — abort
        if (clearBoth) clear.forEach((f) => setOther(f, ''));
      }

      const toTranslate = [...fill, ...refresh];
      if (toTranslate.length > 0) {
        const res = await translateTextsDetailed(
          toTranslate.map((f) => authorOf(f)),
          otherLang,
          authorLang
        );
        if (epoch !== sessionEpochRef.current) return null; // session changed — abort
        if (res.ok) {
          toTranslate.forEach((f, i) => {
            const value = res.translations[i] || '';
            setOther(f, value);
            machineWroteRef.current[f.key] = value;
          });
        } else {
          Alert.alert(t('common:error'), t('translation_section:translate_failed'));
          // A failed FILL toward English would persist empty base columns that
          // EN readers see raw (display never falls back EN→_es). Abort the
          // save; the manager can retry or pencil the English in manually. A
          // failed fill toward Spanish keeps shipped behavior (ES display
          // falls back to EN), and a failed refresh keeps the old text.
          if (fill.length > 0 && otherLang === 'en') {
            return null;
          }
        }
      }

      if (epoch !== sessionEpochRef.current) return null; // final guard before composing
      // Catch-all: never persist a blank English base column for a field the
      // author filled — covers a pencil-cleared EN side and a translator
      // returning empty for non-empty input (EN display has no fallback).
      //
      // A clear that STANDS is exempt. Without that exemption an English
      // manager clearing a description and keeping the Spanish would lock the
      // guide: every later save from a Spanish device sees a filled author side
      // against a deliberately-empty English one, fails this check, and aborts
      // — so the category could never be changed again. Once the author types
      // something new, clearStands goes false, the fill bucket restores the
      // English, and this guard is back in force.
      if (otherLang === 'en') {
        const missingEn = fs.some(
          (f) => !f.noMachine && authorOf(f).trim() && !otherOf(f).trim() && !clearStands(f)
        );
        if (missingEn) {
          Alert.alert(t('common:error'), t('translation_section:en_required'));
          return null;
        }
      }
      const result: Record<string, ResolvedPair> = {};
      fs.forEach((f) => {
        const pair = readPair(f);
        result[f.key] = { en: pair.en, es: pair.es };
      });
      return result;
    } finally {
      resolvingRef.current = false;
      setResolving(false);
    }
  };

  const openPencil = () => {
    const next: Record<string, string> = {};
    fieldsRef.current.forEach((f) => {
      next[f.key] = otherOf(f);
    });
    setDrafts(next);
    setPencilOpen(true);
  };

  const savePencil = () => {
    fieldsRef.current.forEach((f) => {
      const draft = drafts[f.key] ?? '';
      const changed = draft !== otherOf(f);
      if (changed) {
        setOther(f, draft);
      }
      const matchesMachine =
        machineWroteRef.current[f.key] !== undefined && draft === machineWroteRef.current[f.key];
      if (matchesMachine) {
        handEditedRef.current.delete(f.key);
      } else if (changed) {
        handEditedRef.current.add(f.key);
      }
    });
    setPencilOpen(false);
  };

  const otherLangName = isSpanish ? t('translation_section:lang_en') : t('translation_section:lang_es');
  const sectionTitle = isSpanish
    ? t('translation_section:section_title_en')
    : t('translation_section:section_title_es');
  const busy = translating || autoFilling || resolving;

  // Completeness reads the OTHER side of every machine-translatable field, so
  // a manager can see at a glance whether the item ships bilingual — without
  // expanding the section.
  const machineFields = fields.filter((f) => !f.noMachine);
  const doneCount = machineFields.filter((f) => otherOf(f).trim()).length;

  const element = (
    <View>
      <View
        style={[
          sectionStyles.container,
          { backgroundColor: colors.primary + '12', borderColor: colors.primary + '42' },
        ]}
      >
        <TouchableOpacity
          style={sectionStyles.headerRow}
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityLabel={sectionTitle}
        >
          <Text style={[sectionStyles.previewTitle, { color: colors.primary }]} numberOfLines={1}>
            {sectionTitle}
          </Text>
          <View style={sectionStyles.headerRight}>
            {busy && <ActivityIndicator size="small" color={colors.primary} />}
            {machineFields.length > 0 && (
              <Text style={[sectionStyles.completeness, { color: colors.textSecondary }]}>
                {t('translation_section:completeness', {
                  done: doneCount,
                  total: machineFields.length,
                })}
              </Text>
            )}
            <IconSymbol
              ios_icon_name={expanded ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={expanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={colors.primary}
            />
          </View>
        </TouchableOpacity>
        {expanded && (
        <View style={sectionStyles.body}>
        <TouchableOpacity
          style={[
            sectionStyles.translateButton,
            { backgroundColor: colors.primary + '2E', borderColor: colors.primary + '6B' },
          ]}
          onPress={handleTranslatePress}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[sectionStyles.translateButtonText, { color: colors.primary }]}>
              {isSpanish
                ? t('translation_section:translate_to_en')
                : t('translation_section:translate_to_es')}
            </Text>
          )}
        </TouchableOpacity>

        <View style={sectionStyles.pencilRow}>
          <TouchableOpacity
            onPress={openPencil}
            disabled={busy}
            // 18pt glyph + 14 hitSlop = a 46pt target; hitSlop 8 left it at 34.
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityLabel={t('translation_section:edit_translation')}
          >
            <IconSymbol
              ios_icon_name="pencil"
              android_material_icon_name="edit"
              size={18}
              color={busy ? colors.textSecondary + '66' : colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
        {fields.map((f) => (
          <View
            key={f.key}
            style={[
              sectionStyles.previewField,
              { backgroundColor: colors.glass, borderColor: colors.glassBorder },
            ]}
          >
            {fields.length > 1 && (
              <Text style={[sectionStyles.previewLabel, { color: colors.textSecondary }]}>
                {t(f.labelKey)}
              </Text>
            )}
            {f.esValue.trim() || f.enValue.trim() ? (
              otherOf(f).trim() ? (
                <Text
                  style={[sectionStyles.previewText, { color: colors.text }]}
                  numberOfLines={f.multiline ? 3 : 1}
                >
                  {otherOf(f)}
                </Text>
              ) : (
                <Text style={[sectionStyles.previewEmpty, { color: colors.textSecondary }]}>
                  {/* A deliberately cleared side will NOT be refilled on save,
                      so never promise a translation that can't come. */}
                  {f.noMachine || clearStands(f)
                    ? t('translation_section:empty_preview')
                    : t('translation_section:will_translate_on_save')}
                </Text>
              )
            ) : (
              <Text style={[sectionStyles.previewEmpty, { color: colors.textSecondary }]}>
                {t('translation_section:empty_preview')}
              </Text>
            )}
          </View>
        ))}
        </View>
        )}
      </View>

      <Modal
        visible={pencilOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPencilOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={sectionStyles.pencilOverlay}
        >
          <GlassCard variant="glass" radius={20} intensity={32} style={sectionStyles.pencilCard}>
            <View style={sectionStyles.pencilHeader}>
              <Text style={[sectionStyles.pencilTitle, { color: colors.text }]} numberOfLines={1}>
                {t('translation_section:edit_translation')}
              </Text>
              <Text style={[sectionStyles.pencilLang, { color: colors.primary }]}>
                {otherLangName}
              </Text>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={sectionStyles.pencilScroll}
            >
              {fields.map((f) => (
                <View key={f.key} style={sectionStyles.pencilField}>
                  <Text style={[sectionStyles.previewLabel, { color: colors.textSecondary }]}>
                    {t(f.labelKey)}
                  </Text>
                  <TextInput
                    style={[
                      sectionStyles.pencilInput,
                      { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.text },
                      f.multiline && sectionStyles.pencilInputMultiline,
                    ]}
                    value={drafts[f.key] ?? ''}
                    onChangeText={(text) => setDrafts((prev) => ({ ...prev, [f.key]: text }))}
                    multiline={!!f.multiline}
                    numberOfLines={f.multiline ? 4 : 1}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={sectionStyles.pencilButtons}>
              <TouchableOpacity
                style={[
                  sectionStyles.pencilButton,
                  { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                ]}
                onPress={() => setPencilOpen(false)}
              >
                <Text style={[sectionStyles.pencilButtonText, { color: colors.text }]}>
                  {t('common:cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  sectionStyles.pencilButton,
                  { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={savePencil}
              >
                <Text style={[sectionStyles.pencilButtonText, { color: colors.fireText }]}>
                  {t('common:save')}
                </Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );

  return { element, resolveOnSave };
}

const sectionStyles = StyleSheet.create({
  container: {
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  body: {
    marginTop: 10,
  },
  // minHeight, not a fixed height: swapping the label for the spinner can't
  // jitter the row, and a long ES label wraps instead of clipping.
  translateButton: {
    minHeight: 38,
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  translateButtonText: {
    fontFamily: fonts.body.semibold,
    fontSize: 13,
  },
  pencilRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 2,
  },
  // flexShrink:1 (RN defaults it to 0) + numberOfLines: the title now shares a
  // space-between row with the completeness badge, so a long ES title has to
  // ellipsize rather than push the chevron off the row.
  previewTitle: {
    flexShrink: 1,
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  completeness: {
    fontFamily: fonts.mono.medium,
    fontSize: 9.5,
  },
  previewField: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  previewLabel: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  previewText: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  previewEmpty: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    fontStyle: 'italic',
  },
  pencilOverlay: {
    flex: 1,
    // Same scrim as the shared GlassSheet, so the pencil dims its host modal
    // exactly like every other sheet in the app.
    backgroundColor: 'rgba(6,10,18,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  pencilCard: {
    padding: 16,
    maxHeight: '80%',
  },
  pencilHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  pencilTitle: {
    flexShrink: 1,
    fontFamily: fonts.display.bold,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  pencilLang: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  pencilScroll: {
    flexGrow: 0,
  },
  pencilField: {
    marginBottom: 12,
  },
  pencilInput: {
    minHeight: 46,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body.regular,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  pencilInputMultiline: {
    height: 100,
    textAlignVertical: 'top',
  },
  pencilButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 10,
  },
  pencilButton: {
    minHeight: 44,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  pencilButtonText: {
    fontFamily: fonts.body.semibold,
    fontSize: 14,
  },
});
