import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassSheet from '@/components/GlassSheet';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import type { OrgDirectoryRow } from '@/utils/orgDirectory';
import { Avatar } from './AvatarStack';
import { msgHue } from './messageVisuals';
import { titlesOf } from './useThreadPeople';
import { groupActiveIds, type RecipientGroup, type RecipientSelection } from './RecipientChips';

/** A quick-select group as offered by the sheet (before any dropping). */
export interface RecipientGroupDef {
  key: string;
  title: string;
  memberIds: string[];
  /** The users glyph on the chip (All staff). */
  icon?: boolean;
}

interface RecipientsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Active members minus self, sorted by name. */
  people: OrgDirectoryRow[];
  groups: RecipientGroupDef[];
  initial: RecipientSelection;
  onDone: (selection: RecipientSelection) => void;
}

const ALL_KEY = 'all';

/**
 * "Add recipients" (R2). Quick-select chips multi-select and stay open; a
 * chosen group's people sit under a group header ("Bartenders · 6 · all
 * added"), the rest under "Everyone else". A person in two chosen groups shows
 * in both with ONE shared check — the later row dimmed with "also in X".
 * Tapping a row toggles the person everywhere (a recipient list is a set);
 * a dropped member keeps the chip on and turns its header into "k added".
 */
export default function RecipientsSheet({ visible, onClose, people, groups, initial, onDone }: RecipientsSheetProps) {
  const { t } = useTranslation('compose');
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const azure = msgHue('group', isDark);

  const [on, setOn] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  // Re-seed from the To row every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    const nextOn = new Set(initial.groups.map((g) => g.key));
    const nextChecked = new Set<string>();
    initial.groups.forEach((g) => groupActiveIds(g).forEach((id) => nextChecked.add(id)));
    initial.people.forEach((id) => nextChecked.add(id));
    setOn(nextOn);
    setChecked(nextChecked);
    setQuery('');
  }, [visible, initial]);

  const q = query.trim().toLowerCase();
  const matches = (p: OrgDirectoryRow) =>
    !q || p.name.toLowerCase().includes(q) || titlesOf(p).toLowerCase().includes(q);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p] as const)), [people]);
  const onGroups = useMemo(() => groups.filter((g) => on.has(g.key)), [groups, on]);
  const inChosen = useMemo(() => {
    const s = new Set<string>();
    onGroups.forEach((g) => g.memberIds.forEach((id) => s.add(id)));
    return s;
  }, [onGroups]);

  const toggleChip = (g: RecipientGroupDef) => {
    const nextOn = new Set(on);
    const nextChecked = new Set(checked);
    if (nextOn.has(g.key)) {
      nextOn.delete(g.key);
      // Members leave with the chip unless another chosen group still holds them.
      const still = new Set<string>();
      groups.filter((x) => nextOn.has(x.key)).forEach((x) => x.memberIds.forEach((id) => still.add(id)));
      g.memberIds.forEach((id) => {
        if (!still.has(id)) nextChecked.delete(id);
      });
    } else {
      nextOn.add(g.key);
      g.memberIds.forEach((id) => nextChecked.add(id));
    }
    setOn(nextOn);
    setChecked(nextChecked);
  };

  const togglePerson = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commit = () => {
    const outGroups: RecipientGroup[] = onGroups
      .map((g) => ({
        key: g.key,
        title: g.title,
        memberIds: g.memberIds,
        dropped: new Set(g.memberIds.filter((id) => !checked.has(id))),
      }))
      .filter((g) => groupActiveIds(g).length > 0);
    const outPeople = Array.from(checked).filter((id) => !inChosen.has(id) && byId.has(id));
    onDone({ groups: outGroups, people: outPeople });
  };

  const renderRow = (p: OrgDirectoryRow, dupOf: string | null) => {
    const isOn = checked.has(p.id);
    return (
      <Pressable
        key={`${dupOf ?? 'main'}:${p.id}`}
        onPress={() => togglePerson(p.id)}
        style={[
          styles.prow,
          {
            backgroundColor: colors.glass,
            borderColor: isOn ? hexToRgba(colors.tint, 0.45) : colors.glassBorder,
            opacity: dupOf ? 0.62 : 1,
          },
        ]}
      >
        <Avatar person={p} size={34} />
        <View style={styles.bd}>
          <Text style={[styles.l1, { color: colors.text }]} numberOfLines={1}>
            {p.name}
          </Text>
          {dupOf ? (
            <Text style={[styles.also, { color: azure }]} numberOfLines={1}>
              {t('also_in', { group: dupOf })}
            </Text>
          ) : (
            <Text style={[styles.l2, { color: colors.textSecondary }]} numberOfLines={1}>
              {titlesOf(p) || t('no_job_title')}
            </Text>
          )}
        </View>
        <View
          style={[
            styles.ck,
            isOn ? { backgroundColor: colors.tint, borderColor: colors.tint } : { borderColor: colors.glassBorder },
          ]}
        >
          {isOn && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={13} color={colors.fireText} />}
        </View>
      </Pressable>
    );
  };

  const groupHeader = (title: string, right: string | null, muted = false) => (
    <View style={styles.ghead}>
      <Text style={[styles.gheadEyebrow, { color: muted ? colors.textSecondary : azure }]} numberOfLines={1}>
        {title}
      </Text>
      {!!right && <Text style={[styles.gheadN, { color: colors.textSecondary }]}>{right}</Text>}
      <View style={[styles.ln, { backgroundColor: colors.hairline }]} />
    </View>
  );

  const everyoneElse = people.filter((p) => !inChosen.has(p.id) && matches(p));
  const visibleChips = groups.filter((g) => !q || g.title.toLowerCase().includes(q) || on.has(g.key));

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title={t('recipients_title')}
      subtitle={t('recipients_subtitle')}
      scroll={false}
      footer={
        <View style={styles.foot}>
          <Pressable onPress={commit} style={[styles.fbtn, { backgroundColor: colors.tint, borderColor: colors.tint }]}>
            <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={colors.fireText} />
            <Text style={[styles.fbtnLabel, { color: colors.fireText }]}>{t('add_recipients', { count: checked.size })}</Text>
          </Pressable>
        </View>
      }
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.search, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={17} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search_placeholder')}
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.text }]}
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={16} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        <Text style={[styles.psub, { color: colors.tint }]}>{t('quick_select')}</Text>
        <View style={styles.chipwrap}>
          {visibleChips.map((g) => {
            const isOn = on.has(g.key);
            return (
              <Pressable
                key={g.key}
                onPress={() => toggleChip(g)}
                style={[
                  styles.chip,
                  isOn
                    ? { backgroundColor: hexToRgba(colors.tint, 0.16), borderColor: hexToRgba(colors.tint, 0.4) }
                    : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                ]}
              >
                {(isOn || g.icon || g.key === ALL_KEY) && (
                  <IconSymbol
                    ios_icon_name={isOn ? 'checkmark' : 'person.2.fill'}
                    android_material_icon_name={isOn ? 'check' : 'group'}
                    size={13}
                    color={isOn ? colors.tint : colors.textSecondary}
                  />
                )}
                <Text style={[styles.chipLabel, { color: isOn ? colors.tint : colors.text }]} numberOfLines={1}>
                  {g.title}
                </Text>
                <Text style={[styles.chipN, { color: isOn ? colors.tint : colors.textSecondary }, isOn && { opacity: 0.85 }]}>
                  {g.memberIds.length}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {onGroups.map((g, gi) => {
          const members = g.memberIds.map((id) => byId.get(id)).filter((p): p is OrgDirectoryRow => !!p && matches(p));
          if (members.length === 0) return null;
          const n = g.memberIds.length;
          const k = g.memberIds.filter((id) => checked.has(id)).length;
          const right = `${n} · ${k === n ? t('all_added') : t('k_added', { count: k })}`;
          return (
            <View key={g.key} style={styles.section}>
              {groupHeader(g.title, right)}
              {members.map((p) => {
                const earlier = onGroups.slice(0, gi).find((x) => x.memberIds.includes(p.id));
                return renderRow(p, earlier ? earlier.title : null);
              })}
            </View>
          );
        })}

        {everyoneElse.length > 0 && (
          <View style={styles.section}>
            {groupHeader(onGroups.length > 0 ? t('everyone_else') : t('people'), null, true)}
            {everyoneElse.map((p) => renderRow(p, null))}
          </View>
        )}

        {everyoneElse.length === 0 && onGroups.every((g) => !g.memberIds.some((id) => { const p = byId.get(id); return !!p && matches(p); })) && (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('no_users_found')}</Text>
        )}
      </ScrollView>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { gap: 9, paddingBottom: 4 },
  search: {
    minHeight: 43,
    borderRadius: 13,
    paddingHorizontal: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, fontFamily: fonts.body.regular, fontSize: 14, paddingVertical: 10 },
  psub: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.3, textTransform: 'uppercase', paddingTop: 2 },
  chipwrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipLabel: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  chipN: { fontFamily: fonts.mono.medium, fontSize: 10 },
  section: { gap: 9 },
  ghead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, paddingHorizontal: 2 },
  gheadEyebrow: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', flexShrink: 1 },
  gheadN: { fontFamily: fonts.mono.medium, fontSize: 9 },
  ln: { flex: 1, height: StyleSheet.hairlineWidth + 0.5 },
  prow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  bd: { flex: 1, minWidth: 0 },
  l1: { fontFamily: fonts.body.semibold, fontSize: 14 },
  l2: { fontFamily: fonts.body.regular, fontSize: 11.5, marginTop: 1 },
  also: { fontFamily: fonts.mono.medium, fontSize: 10, letterSpacing: 0.3, marginTop: 1 },
  ck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fonts.body.regular, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  foot: { flexDirection: 'row', paddingTop: 12 },
  fbtn: {
    flex: 1,
    height: 47,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  fbtnLabel: { fontFamily: fonts.body.semibold, fontSize: 15 },
});
