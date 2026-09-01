/**
 * HouseDefaultsSheet (s79 presets phase) — the O/M "Checkout defaults" editor
 * behind the Tips & Checkouts header gear: house declare %, and the tip-out
 * position list (which positions, their ORDER — drag — and per-position %).
 *
 * Semantics it writes for (Steve's lockdown): these values SEED EVERY
 * CHECKOUT for everyone in the org; a server's day-of edits last one checkout
 * and the house baseline returns on the next. Saving remounts the calculator
 * via the page's onSaved so the new baseline is live immediately.
 *
 * Mechanics per the rulebook: the drag list rides a nested
 * GestureHandlerRootView with EXPLICIT sizing (default flex:1 collapses to
 * zero inside a content-sized sheet — the s73 Libations bite), the sheet body
 * has scroll={false} (the list owns scrolling), and the percent wheel is
 * NESTED inside this open sheet (direct-launch over an open modal is the
 * proven pattern; deferred launches are for CLOSING sheets).
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import ShineButton from '@/components/quiz/ShineButton';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgJobTitles } from '@/hooks/useOrgJobTitles';
import { useTipsAccent } from '@/components/tips/useTipsAccent';
import PercentWheelSheet from '@/components/tips/PercentWheelSheet';
import { TIPS_VISUALS } from '@/components/tips/tipsVisuals';
import { formatPct, type TipOutLine } from '@/utils/tips/checkoutMath';
import { fetchHouseDefaults, saveHouseDefaults } from '@/utils/tips/houseDefaults';
import { DEFAULT_DECLARE_PCT } from '@/utils/tips/checkoutPrefs';
import { fonts } from '@/constants/fonts';

/** '12.5' → 0.125; null on empty/invalid/out-of-range. */
function parseDeclare(text: string): number | null {
  const value = parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100) / 10000;
}

function trimPctText(pct: number): string {
  return String(Math.round(pct * 10000) / 100);
}

interface RowItem extends TipOutLine {
  key: string;
}

export default function HouseDefaultsSheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  /** Fires after a successful save — the page remounts the calculator. */
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const accent = useTipsAccent();
  const { user } = useAuth();
  const { activeJobTitles } = useOrgJobTitles();

  const [declareText, setDeclareText] = useState('12');
  const [rows, setRows] = useState<RowItem[]>([]);
  const [addText, setAddText] = useState('');
  const [wheelFor, setWheelFor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest titles via a ref so the load effect below does NOT depend on the
  // hook's array identity — with it in the deps, a background titles refetch
  // re-ran the load MID-EDIT and wiped the user's changes back to the seed
  // (the s79 punch bug: what then got saved was the seed, not the edits).
  const titlesRef = useRef(activeJobTitles);
  useEffect(() => {
    titlesRef.current = activeJobTitles;
  }, [activeJobTitles]);

  // Loads exactly ONCE per open (closed→open transition); an org with no
  // house defaults yet starts from the canonical trio (org casing when a
  // matching title exists) + 12%.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current || !user?.id) return;
    wasOpenRef.current = true;
    let alive = true;
    setError(null);
    fetchHouseDefaults(user.id).then((house) => {
      if (!alive) return;
      if (house) {
        setDeclareText(trimPctText(house.declarePct));
        setRows(house.tipOuts.map((line, i) => ({ ...line, key: `${i}-${line.title}` })));
      } else {
        const seed = (want: string, canonical: string, pct: number): RowItem => {
          const match = titlesRef.current.find((title) => title.toLowerCase().includes(want));
          return { title: match ?? canonical, pct, key: canonical };
        };
        setDeclareText(trimPctText(DEFAULT_DECLARE_PCT));
        setRows([
          seed('busser', 'Busser', 0.035),
          seed('runner', 'Runner', 0.01),
          seed('bartender', 'Bartender', 0.02),
        ]);
      }
    });
    return () => {
      alive = false;
    };
  }, [visible, user?.id]);

  const addPosition = () => {
    const title = addText.trim();
    if (!title) return;
    setRows((prev) => [...prev, { title, pct: 0, key: `${Date.now()}-${title}` }]);
    setAddText('');
  };

  const save = async () => {
    if (!user?.id || saving) return;
    const declarePct = parseDeclare(declareText);
    if (declarePct === null) {
      setError(t('tips_checkouts.house_error_declare'));
      return;
    }
    const tipOuts = rows.map((row) => ({ title: row.title.trim(), pct: row.pct }));
    if (tipOuts.some((line) => line.title.length === 0)) {
      setError(t('tips_checkouts.house_error_positions'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveHouseDefaults(user.id, { declarePct, tipOuts });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || t('tips_checkouts.house_error_generic'));
    } finally {
      setSaving(false);
    }
  };

  const renderRow = ({ item, drag, isActive, getIndex }: RenderItemParams<RowItem>) => (
    <ScaleDecorator>
      <View
        style={[
          styles.posRow,
          { backgroundColor: colors.glass, borderColor: colors.glassBorder },
          isActive && { borderColor: accent },
        ]}
      >
        <TouchableOpacity onLongPress={drag} delayLongPress={120} hitSlop={8} style={styles.grabber}>
          <IconSymbol
            ios_icon_name="line.3.horizontal"
            android_material_icon_name="drag-handle"
            size={16}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        <Text style={[styles.posTitle, { color: colors.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <TouchableOpacity
          onPress={() => setWheelFor(getIndex() ?? null)}
          hitSlop={6}
          style={[styles.pctChip, { borderColor: colors.glassBorder }]}
        >
          <Text style={[styles.pctChipText, { color: accent }]}>{formatPct(item.pct)}</Text>
          <IconSymbol
            ios_icon_name="chevron.up.chevron.down"
            android_material_icon_name="unfold-more"
            size={12}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setRows((prev) => prev.filter((row) => row.key !== item.key))}
          hitSlop={8}
        >
          <IconSymbol
            ios_icon_name="xmark.circle.fill"
            android_material_icon_name="cancel"
            size={17}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </ScaleDecorator>
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('tips_checkouts.house_title')}
      subtitle={t('tips_checkouts.house_subtitle')}
      scroll={false}
      footer={
        <View>
          {!!error && (
            <Text style={[styles.error, { color: '#EF4444' }]} numberOfLines={2}>
              {error}
            </Text>
          )}
          <ShineButton
            label={t('tips_checkouts.house_save')}
            gradient={[TIPS_VISUALS.gradient[0], TIPS_VISUALS.gradient[1]]}
            iosIcon="checkmark.circle.fill"
            androidIcon="check-circle"
            onPress={save}
            loading={saving}
          />
        </View>
      }
    >
      <Text style={[styles.blurb, { color: colors.textSecondary }]}>
        {t('tips_checkouts.house_blurb')}
      </Text>

      <Text style={[styles.fieldLabel, { color: colors.text }]}>
        {t('tips_checkouts.house_declare_label')}
      </Text>
      <View style={[styles.declareRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <TextInput
          value={declareText}
          onChangeText={setDeclareText}
          keyboardType="decimal-pad"
          style={[styles.declareInput, { color: colors.text }]}
          placeholder="12"
          placeholderTextColor={colors.textSecondary}
          maxLength={5}
        />
        <Text style={[styles.declareSign, { color: colors.textSecondary }]}>%</Text>
      </View>

      <View style={styles.posHead}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>
          {t('tips_checkouts.house_positions_label')}
        </Text>
        <Text style={[styles.posHint, { color: colors.textSecondary }]} numberOfLines={1}>
          {t('tips_checkouts.house_positions_hint')}
        </Text>
      </View>
      {/* Explicit sizing on the nested root — its default flex:1 collapses to
          ZERO height inside a content-sized sheet body (the s73 bite). */}
      <GestureHandlerRootView style={styles.dragWrap}>
        <DraggableFlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={renderRow}
          onDragEnd={({ data }) => setRows(data)}
          showsVerticalScrollIndicator={false}
        />
      </GestureHandlerRootView>

      <View style={[styles.addRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <TextInput
          value={addText}
          onChangeText={setAddText}
          onSubmitEditing={addPosition}
          returnKeyType="done"
          placeholder={t('tips_checkouts.house_add_placeholder')}
          placeholderTextColor={colors.textSecondary}
          style={[styles.addInput, { color: colors.text }]}
          maxLength={40}
        />
        <TouchableOpacity onPress={addPosition} hitSlop={8}>
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add-circle"
            size={22}
            color={accent}
          />
        </TouchableOpacity>
      </View>

      {wheelFor !== null && rows[wheelFor] && (
        <PercentWheelSheet
          visible
          title={rows[wheelFor].title}
          initialPct={rows[wheelFor].pct}
          onClose={() => setWheelFor(null)}
          onSelect={(pct) => {
            setRows((prev) => prev.map((row, i) => (i === wheelFor ? { ...row, pct } : row)));
            setWheelFor(null);
          }}
        />
      )}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  blurb: {
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: fonts.body.semibold,
    fontSize: 12.5,
    marginBottom: 6,
  },
  declareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  declareInput: {
    flex: 1,
    fontFamily: fonts.mono.semibold,
    fontSize: 16,
    padding: 0,
  },
  declareSign: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
  },
  posHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  posHint: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  dragWrap: {
    maxHeight: 320,
    flexShrink: 1,
  },
  posRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 13,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 7,
  },
  grabber: {
    paddingRight: 2,
  },
  posTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.body.semibold,
    fontSize: 13,
  },
  pctChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  pctChipText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  addInput: {
    flex: 1,
    fontFamily: fonts.body.semibold,
    fontSize: 13,
    padding: 0,
  },
  error: {
    fontSize: 11.5,
    marginBottom: 8,
    textAlign: 'center',
  },
});
