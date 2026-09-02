import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet, { useSheetHandoff } from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

export interface GuidePick {
  id: string;
  title: string;
  category: string;
  file_name: string;
}

interface GuidePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  actorId: string;
  onPick: (guide: GuidePick) => void;
}

type Row = { type: 'header'; key: string; label: string } | { type: 'guide'; key: string; guide: GuidePick };

/**
 * "From Guides & Training" — a real picker sheet (search + grouped list)
 * replacing the 300pt nested-scroll list the three old forms embedded inside
 * their own scrolling Modal. Groups by the guide's stored category name: those
 * are org data (custom categories included), rendered as-is.
 */
export default function GuidePickerSheet({ visible, onClose, actorId, onPick }: GuidePickerSheetProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { defer, onDismiss } = useSheetHandoff(onClose);
  const [guides, setGuides] = useState<GuidePick[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setQuery('');
    supabase
      .rpc('get_guides', { p_actor_id: actorId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Error loading guides for picker:', error);
          setGuides([]);
        } else {
          setGuides(
            (data || []).map((g: any) => ({
              id: g.id,
              title: g.title,
              category: g.category ?? '',
              file_name: g.file_name ?? '',
            }))
          );
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, actorId]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? guides.filter(
          (g) =>
            g.title.toLowerCase().includes(q) ||
            g.category.toLowerCase().includes(q) ||
            g.file_name.toLowerCase().includes(q)
        )
      : guides;
    const byCat = new Map<string, GuidePick[]>();
    for (const g of filtered) {
      const list = byCat.get(g.category) ?? [];
      list.push(g);
      byCat.set(g.category, list);
    }
    const out: Row[] = [];
    for (const [cat, list] of byCat) {
      out.push({ type: 'header', key: `h-${cat}`, label: cat || t('content_editor.uncategorized') });
      for (const g of list) out.push({ type: 'guide', key: g.id, guide: g });
    }
    return out;
  }, [guides, query, t]);

  return (
    <GlassSheet visible={visible} onClose={onClose} onDismiss={onDismiss} title={t('content_editor.pick_guide_title')} scroll={false}>
      <View style={styles.search}>
        <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('content_editor.pick_guide_search')}
          placeholderTextColor={colors.textSecondary}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={18} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('content_editor.pick_guide_empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <Text style={styles.header}>{item.label}</Text>
            ) : (
              <Pressable style={styles.row} onPress={() => defer(() => onPick(item.guide))}>
                <IconSymbol ios_icon_name="doc.text.fill" android_material_icon_name="description" size={18} color={colors.primary} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.guide.title}
                  </Text>
                  {!!item.guide.file_name && (
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.guide.file_name}
                    </Text>
                  )}
                </View>
                <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={14} color={colors.textSecondary} />
              </Pressable>
            )
          }
        />
      )}
    </GlassSheet>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 43,
      borderRadius: 13,
      paddingHorizontal: 13,
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    searchInput: { flex: 1, fontFamily: fonts.body.regular, fontSize: 14, color: colors.text, padding: 0 },
    // The list is the sheet's scroller: shrinkable viewport, explicit cap so the
    // sheet never grows past the 88% GlassSheet ceiling with the search pinned.
    list: { flexGrow: 0, flexShrink: 1, maxHeight: 420 },
    listContent: { gap: 6, paddingBottom: 4 },
    header: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9.5,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      marginTop: 8,
      marginBottom: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 13,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { fontFamily: fonts.display.semibold, fontSize: 14, color: colors.text },
    rowMeta: { fontFamily: fonts.mono.medium, fontSize: 9.5, color: colors.textSecondary, marginTop: 1 },
    center: { paddingVertical: 28, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body.regular, fontSize: 13, color: colors.textSecondary },
  });
