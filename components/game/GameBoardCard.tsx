import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

/**
 * The board card that expands under a selected GameSquareTile (s75 Arcade
 * Shelf, s76 H2 bottom row): description → that category's top 3 → then one
 * split row: the viewer's own line as a stat block with Play beside it.
 * Purely presentational; the screen owns fetching and expansion state.
 *
 * Quick play (s76 Hub·A): pass `playSetupLine` to render the remembered setup
 * as a mono sub-line under Play (the button then launches straight in) and
 * `onChangeSetup` for the ⚙ chip that reopens the picker. Omit both for the
 * first-run / plain state where Play itself opens the picker.
 */
export interface GameBoardRow {
  user_id: string;
  name: string;
  profile_picture_url: string | null;
  score: number;
}

interface GameBoardCardProps {
  /** Game/category accent — icon chip, scores, and the Play fill. */
  accent: string;
  iosIcon: string;
  androidIcon: string;
  title: string;
  desc?: string;
  /** null = board still loading. */
  rows: GameBoardRow[] | null;
  emptyText: string;
  youLabel: string;
  /** Pre-formatted value ("1,240 · 6 games" / "—"). */
  youValue: string;
  playLabel: string;
  onPlay: () => void;
  /** Remembered setup, pre-formatted ("HARD · TIMED") — enables quick play. */
  playSetupLine?: string;
  /** Renders the ⚙ chip that reopens the picker sheet. */
  onChangeSetup?: () => void;
  onRowPress?: (userId: string) => void;
}

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

export default function GameBoardCard({
  accent,
  iosIcon,
  androidIcon,
  title,
  desc,
  rows,
  emptyText,
  youLabel,
  youValue,
  playLabel,
  onPlay,
  playSetupLine,
  onChangeSetup,
  onRowPress,
}: GameBoardCardProps) {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      <View style={styles.topRow}>
        <View style={[styles.iconChip, { backgroundColor: accent + '26' }]}>
          <IconSymbol
            ios_icon_name={iosIcon as any}
            android_material_icon_name={androidIcon as any}
            size={18}
            color={accent}
          />
        </View>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {!!desc && (
        <Text style={[styles.desc, { color: colors.textSecondary }]}>{desc}</Text>
      )}

      {rows === null ? (
        <ActivityIndicator size="small" color={accent} style={styles.loading} />
      ) : rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>{emptyText}</Text>
      ) : (
        rows.slice(0, 3).map((row, i) => (
          <TouchableOpacity
            key={row.user_id}
            style={[styles.boardRow, { borderTopColor: colors.hairline }]}
            onPress={onRowPress ? () => onRowPress(row.user_id) : undefined}
            disabled={!onRowPress}
            activeOpacity={0.7}
          >
            <Text style={styles.medal}>{RANK_MEDALS[i]}</Text>
            {row.profile_picture_url ? (
              <StorageImage source={{ uri: row.profile_picture_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: accent + '2E' }]}>
                <Text style={[styles.avatarInitial, { color: accent }]}>
                  {(row.name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
              {row.name}
            </Text>
            <Text style={[styles.rowScore, { color: accent }]}>
              {row.score.toLocaleString()}
            </Text>
          </TouchableOpacity>
        ))
      )}

      {/* s76 H2 split row: stat block left, Play right (+ optional ⚙). */}
      <View style={styles.splitRow}>
        <View style={[styles.youMini, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text style={[styles.youLabel, { color: colors.textSecondary }]}>{youLabel}</Text>
          <Text style={[styles.youValue, { color: colors.text }]} numberOfLines={1}>
            {youValue}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.playBtn, { backgroundColor: accent }]}
          onPress={onPlay}
          activeOpacity={0.85}
        >
          <View style={styles.playMain}>
            <IconSymbol ios_icon_name="play.fill" android_material_icon_name="play-arrow" size={14} color="#FFFFFF" />
            <Text style={styles.playText}>{playLabel}</Text>
          </View>
          {!!playSetupLine && (
            <Text style={styles.playSetup} numberOfLines={1}>
              {playSetupLine}
            </Text>
          )}
        </TouchableOpacity>

        {!!onChangeSetup && (
          <TouchableOpacity
            style={[styles.gearChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
            onPress={onChangeSetup}
            activeOpacity={0.8}
            hitSlop={6}
          >
            <IconSymbol
              ios_icon_name="gearshape.fill"
              android_material_icon_name="settings"
              size={15}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 14,
    marginTop: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: fonts.display.semibold,
    fontSize: 16,
  },
  desc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  loading: { marginVertical: 14 },
  empty: {
    fontSize: 12.5,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 12,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  medal: { width: 24, textAlign: 'center', fontSize: 15 },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 12, fontFamily: fonts.body.semibold },
  rowName: { flex: 1, fontSize: 13, fontFamily: fonts.body.semibold },
  rowScore: { fontFamily: fonts.mono.semibold, fontSize: 13.5 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 8,
  },
  youMini: {
    flex: 1.15,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    justifyContent: 'center',
    gap: 2,
  },
  youLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  youValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
  },
  playBtn: {
    flex: 1.35,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  playMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  playText: {
    color: '#FFFFFF',
    fontFamily: fonts.body.semibold,
    fontSize: 14,
  },
  playSetup: {
    color: '#FFFFFF',
    opacity: 0.85,
    fontFamily: fonts.mono.semibold,
    fontSize: 9.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  gearChip: {
    width: 42,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
