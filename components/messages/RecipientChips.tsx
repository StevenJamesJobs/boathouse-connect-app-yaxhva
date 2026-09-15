import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useIsDarkTheme } from '@/components/content/useIsDarkTheme';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import { Avatar, type AvatarPerson } from './AvatarStack';
import { msgHue } from './messageVisuals';
import { firstNameOf } from './useThreadPeople';

/** A quick-select group as it lives in the To row: everyone with that title, minus the dropped. */
export interface RecipientGroup {
  key: string;
  title: string;
  memberIds: string[];
  dropped: Set<string>;
}

export interface RecipientSelection {
  groups: RecipientGroup[];
  people: string[];
}

export const EMPTY_SELECTION: RecipientSelection = { groups: [], people: [] };

export function groupActiveIds(g: RecipientGroup): string[] {
  return g.memberIds.filter((id) => !g.dropped.has(id));
}

/** The send list: union of every group's remaining members + the people, de-duplicated, in order. */
export function recipientIdsOf(sel: RecipientSelection): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  sel.groups.forEach((g) => groupActiveIds(g).forEach(push));
  sel.people.forEach(push);
  return out;
}

interface RecipientChipsProps {
  selection: RecipientSelection;
  personOf: (id: string) => AvatarPerson;
  onChange: (next: RecipientSelection) => void;
  /** The dashed "+ Add" chip → RecipientsSheet. */
  onAdd: () => void;
}

/**
 * The To row (C-B): a glass row with the mono "TO" eyebrow, azure group chips
 * ("Bartenders · 6", tap = expand its name list beneath the row, where each
 * person can be dropped), tint person chips (22pt avatar + name + ✕) and the
 * dashed "+ Add" chip.
 */
export default function RecipientChips({ selection, personOf, onChange, onAdd }: RecipientChipsProps) {
  const { t } = useTranslation('compose');
  const colors = useThemeColors();
  const isDark = useIsDarkTheme();
  const azure = msgHue('group', isDark);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const dropFromGroup = (key: string, id: string) => {
    const groups = selection.groups
      .map((g) => {
        if (g.key !== key) return g;
        const dropped = new Set(g.dropped);
        dropped.add(id);
        return { ...g, dropped };
      })
      // A group with nobody left in it leaves the row.
      .filter((g) => groupActiveIds(g).length > 0);
    onChange({ ...selection, groups });
  };

  const removeGroup = (key: string) => {
    onChange({ ...selection, groups: selection.groups.filter((g) => g.key !== key) });
  };

  const removePerson = (id: string) => {
    onChange({ ...selection, people: selection.people.filter((p) => p !== id) });
  };

  const chipLabel = (g: RecipientGroup) => {
    const n = g.memberIds.length;
    const k = groupActiveIds(g).length;
    return `${g.title} · ${k === n ? n : t('k_of_n', { count: k, total: n })}`;
  };

  return (
    <View>
      <View style={[styles.row, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <Text style={[styles.k, { color: colors.textSecondary }]}>{t('to_eyebrow')}</Text>

        {selection.groups.map((g) => {
          const open = expanded.has(g.key);
          return (
            <Pressable
              key={g.key}
              onPress={() => toggleExpanded(g.key)}
              style={[
                styles.rc,
                styles.rcGroup,
                { backgroundColor: hexToRgba(azure, 0.14), borderColor: hexToRgba(azure, 0.32) },
              ]}
            >
              <IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="group" size={12} color={azure} />
              <Text style={[styles.rcLabel, { color: colors.text }]} numberOfLines={1}>
                {chipLabel(g)}
              </Text>
              <IconSymbol
                ios_icon_name={open ? 'chevron.up' : 'chevron.down'}
                android_material_icon_name={open ? 'expand-less' : 'expand-more'}
                size={13}
                color={colors.textSecondary}
              />
            </Pressable>
          );
        })}

        {selection.people.map((id) => {
          const p = personOf(id);
          return (
            <View
              key={id}
              style={[
                styles.rc,
                { backgroundColor: hexToRgba(colors.tint, 0.14), borderColor: hexToRgba(colors.tint, 0.3) },
              ]}
            >
              <Avatar person={p} size={22} />
              <Text style={[styles.rcLabel, { color: colors.text }]} numberOfLines={1}>
                {p.name}
              </Text>
              <Pressable onPress={() => removePerson(id)} hitSlop={8}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={12} color={colors.textSecondary} />
              </Pressable>
            </View>
          );
        })}

        <Pressable
          onPress={onAdd}
          style={[styles.rc, styles.rcAdd, { backgroundColor: colors.glass, borderColor: hexToRgba(colors.tint, 0.5) }]}
        >
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={12} color={colors.tint} />
          <Text style={[styles.rcLabel, { color: colors.tint }]}>{t('add_chip')}</Text>
        </Pressable>
      </View>

      {selection.groups
        .filter((g) => expanded.has(g.key))
        .map((g) => {
          const active = groupActiveIds(g);
          return (
            <View key={g.key} style={[styles.grpx, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
              <View style={styles.grpxHead}>
                <IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="group" size={13} color={azure} />
                <Text style={[styles.grpxTitle, { color: colors.text }]} numberOfLines={1}>
                  {g.title}
                </Text>
                <Text style={[styles.grpxEyebrow, { color: colors.textSecondary }]} numberOfLines={1}>
                  {t('group_people_hint', { count: active.length })}
                </Text>
                <Pressable onPress={() => removeGroup(g.key)} hitSlop={8} style={styles.grpxRemove}>
                  <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={13} color={colors.textSecondary} />
                </Pressable>
              </View>
              <View style={styles.names}>
                {active.map((id) => {
                  const p = personOf(id);
                  return (
                    <Pressable
                      key={id}
                      onPress={() => dropFromGroup(g.key, id)}
                      style={[styles.name, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                    >
                      <Avatar person={p} size={16} />
                      <Text style={[styles.nameLabel, { color: colors.text }]} numberOfLines={1}>
                        {firstNameOf(p.name) || p.name}
                      </Text>
                      <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={11} color={colors.textSecondary} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    minHeight: 43,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  k: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginRight: 2,
  },
  rc: {
    height: 28,
    paddingLeft: 5,
    paddingRight: 9,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  rcGroup: { paddingLeft: 8 },
  rcAdd: { paddingLeft: 8, borderStyle: 'dashed' },
  rcLabel: { fontFamily: fonts.body.semibold, fontSize: 12, flexShrink: 1 },
  grpx: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    gap: 6,
  },
  grpxHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grpxTitle: { fontFamily: fonts.body.semibold, fontSize: 12, flexShrink: 1 },
  grpxEyebrow: {
    marginLeft: 'auto',
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  grpxRemove: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  names: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  name: {
    height: 24,
    paddingLeft: 4,
    paddingRight: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  nameLabel: { fontFamily: fonts.body.semibold, fontSize: 11 },
});
