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
import { IconSymbol } from '@/components/IconSymbol';
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
   * Runs the staleness rules (fill / silent refresh / one-tap ask), performs
   * any needed translation in ONE edge-fn call, pushes results into the host
   * state, and returns the final {en, es} value per field key for persisting.
   * Returns NULL when the save must abort: a fill toward English failed
   * (translate service down), the modal session changed mid-resolve (closed
   * or reopened — prevents cross-item and blank writes), or a second Save
   * re-entered while one was in flight (double-tap). Callers abort on null;
   * other failures degrade gracefully (ES display falls back to EN).
   */
  resolveOnSave: () => Promise<Record<string, ResolvedPair> | null>;
}

export function useTranslationSection(opts: UseTranslationSectionOpts): TranslationSectionApi {
  const { fields, sessionKey, active } = opts;
  const { t, i18n } = useTranslation();
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

    // Auto-fill the author side when the item was authored in the other language.
    const needsFill = fs.filter((f) => !f.noMachine && !authorOf(f).trim() && otherOf(f).trim());
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

      fs.forEach((f) => {
        if (f.noMachine) return;
        const author = authorOf(f);
        const other = otherOf(f);
        if (!author.trim()) return;
        const authorChanged = author !== initialAuthorRef.current[f.key];
        const handEdited = handEditedRef.current.has(f.key);
        const machineOwned =
          machineWroteRef.current[f.key] !== undefined && other === machineWroteRef.current[f.key];
        if (!other.trim()) {
          // A this-session pencil-clear is a deliberate hand edit — honor it.
          if (!handEdited) fill.push(f);
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
      if (otherLang === 'en') {
        const missingEn = fs.some((f) => !f.noMachine && authorOf(f).trim() && !otherOf(f).trim());
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

  const element = (
    <View>
      <View style={sectionStyles.container}>
        <TouchableOpacity
          style={sectionStyles.headerRow}
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityLabel={sectionTitle}
        >
          <Text style={sectionStyles.previewTitle}>{sectionTitle}</Text>
          <View style={sectionStyles.headerRight}>
            {busy && <ActivityIndicator size="small" color="#3498DB" />}
            <IconSymbol
              ios_icon_name={expanded ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={expanded ? 'expand-less' : 'expand-more'}
              size={20}
              color="#2C6E9E"
            />
          </View>
        </TouchableOpacity>
        {expanded && (
        <View style={sectionStyles.body}>
        <TouchableOpacity
          style={sectionStyles.translateButton}
          onPress={handleTranslatePress}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={sectionStyles.translateButtonText}>
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
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={t('translation_section:edit_translation')}
          >
            <IconSymbol
              ios_icon_name="pencil"
              android_material_icon_name="edit"
              size={18}
              color={busy ? '#A8C6DD' : '#3498DB'}
            />
          </TouchableOpacity>
        </View>
        {fields.map((f) => (
          <View key={f.key} style={sectionStyles.previewField}>
            {fields.length > 1 && (
              <Text style={sectionStyles.previewLabel}>{t(f.labelKey)}</Text>
            )}
            {f.esValue.trim() || f.enValue.trim() ? (
              otherOf(f).trim() ? (
                <Text
                  style={sectionStyles.previewText}
                  numberOfLines={f.multiline ? 3 : 1}
                >
                  {otherOf(f)}
                </Text>
              ) : (
                <Text style={sectionStyles.previewEmpty}>
                  {f.noMachine
                    ? t('translation_section:empty_preview')
                    : t('translation_section:will_translate_on_save')}
                </Text>
              )
            ) : (
              <Text style={sectionStyles.previewEmpty}>
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
          <View style={sectionStyles.pencilCard}>
            <View style={sectionStyles.pencilHeader}>
              <Text style={sectionStyles.pencilTitle}>
                {t('translation_section:edit_translation')}
              </Text>
              <Text style={sectionStyles.pencilLang}>{otherLangName}</Text>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={sectionStyles.pencilScroll}
            >
              {fields.map((f) => (
                <View key={f.key} style={sectionStyles.pencilField}>
                  <Text style={sectionStyles.previewLabel}>{t(f.labelKey)}</Text>
                  <TextInput
                    style={[sectionStyles.pencilInput, f.multiline && sectionStyles.pencilInputMultiline]}
                    value={drafts[f.key] ?? ''}
                    onChangeText={(text) => setDrafts((prev) => ({ ...prev, [f.key]: text }))}
                    placeholderTextColor="#999999"
                    multiline={!!f.multiline}
                    numberOfLines={f.multiline ? 4 : 1}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={sectionStyles.pencilButtons}>
              <TouchableOpacity
                style={[sectionStyles.pencilButton, sectionStyles.pencilCancel]}
                onPress={() => setPencilOpen(false)}
              >
                <Text style={sectionStyles.pencilCancelText}>{t('common:cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[sectionStyles.pencilButton, sectionStyles.pencilSave]}
                onPress={savePencil}
              >
                <Text style={sectionStyles.pencilSaveText}>{t('common:save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );

  return { element, resolveOnSave };
}

const sectionStyles = StyleSheet.create({
  translateButton: {
    backgroundColor: '#3498DB',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  translateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  container: {
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D0E8FF',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  body: {
    marginTop: 10,
  },
  pencilRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    marginBottom: 2,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C6E9E',
  },
  previewField: {
    marginTop: 6,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5A7A94',
    marginBottom: 2,
  },
  previewText: {
    fontSize: 14,
    color: '#1A1A1A',
  },
  previewEmpty: {
    fontSize: 13,
    color: '#8AA4B8',
    fontStyle: 'italic',
  },
  pencilOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  pencilCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    maxHeight: '80%',
  },
  pencilHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pencilTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  pencilLang: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3498DB',
  },
  pencilScroll: {
    flexGrow: 0,
  },
  pencilField: {
    marginBottom: 12,
  },
  pencilInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    color: '#1A1A1A',
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
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  pencilCancel: {
    backgroundColor: '#F0F0F0',
  },
  pencilCancelText: {
    color: '#555555',
    fontSize: 14,
    fontWeight: '600',
  },
  pencilSave: {
    backgroundColor: '#3498DB',
  },
  pencilSaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
