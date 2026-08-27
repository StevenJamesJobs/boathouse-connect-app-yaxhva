/**
 * GameResults — the s76 shared results surface (R3 → round-4 split header):
 * profile photo/monogram + title + score + optional delta chip on the left,
 * category · difficulty · mode + rank movement + the chase line on the right;
 * then the stat box, the game's review folds (children), and the action
 * stack. Confetti (the dual-corner GameConfetti) fires only when `celebrate`
 * — full wins and personal bests, Steve's rule.
 *
 * Purely presentational: the play screen resolves title/delta/standing and
 * owns the modal's visibility. ResultsFold is the collapsible review section
 * primitive (misses expanded first, per the lockdown).
 */

import React, { ReactNode, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { LinearGradient } from 'expo-linear-gradient';
import GameConfetti from '@/components/game/GameConfetti';
import { GAME_VISUALS, BONUS_GOLD } from '@/components/game/gameVisuals';
import { fonts } from '@/constants/fonts';

type GameKey = keyof typeof GAME_VISUALS;

export interface ResultStatRow {
  label: string;
  value: string;
  /** Optional value color override (bonus gold, success green…). */
  color?: string;
}

interface GameResultsProps {
  visible: boolean;
  game: GameKey;
  title: string;
  score: number;
  /** "Food · Hard · Lives" — mono meta under the right column's top. */
  meta: string;
  /** Small chip under the score ("+340 vs best" / "+1,240 banked"). */
  deltaChip?: string;
  rankBefore?: number | null;
  rankAfter?: number | null;
  /** Chase line: gap to the next rank, 'top' at #1, null/undefined hides it. */
  chase?: { gapPts: number; toRank: number } | 'top' | null;
  /** Mono board caption ("FOOD MENU BOARD"). */
  boardLabel?: string;
  celebrate: boolean;
  statRows: ResultStatRow[];
  saving?: boolean;
  children?: ReactNode;
  playAgainLabel: string;
  onPlayAgain: () => void;
  viewBoardLabel: string;
  onViewBoard: () => void;
  /** "Back to {game}" — the game's own page. */
  backLabel: string;
  onBack: () => void;
  /** Back to the main Game Hub (label lives here, shared). */
  onGameHub: () => void;
  /** Extra primary-style action right after Play Again (Next Level). */
  extraAction?: { label: string; onPress: () => void };
}

export default function GameResults({
  visible,
  game,
  title,
  score,
  meta,
  deltaChip,
  rankBefore,
  rankAfter,
  chase,
  boardLabel,
  celebrate,
  statRows,
  saving,
  children,
  playAgainLabel,
  onPlayAgain,
  viewBoardLabel,
  onViewBoard,
  backLabel,
  onBack,
  onGameHub,
  extraAction,
}: GameResultsProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { user } = useAuth();
  const visual = GAME_VISUALS[game];

  const rankImproved =
    rankBefore != null && rankAfter != null && rankAfter < rankBefore;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onBack}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Split header ─────────────────────────────────────────── */}
            <View style={styles.split}>
              <View style={styles.avatarRing}>
                <LinearGradient
                  colors={[visual.gradient[0], visual.gradient[1]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                {user?.profilePictureUrl ? (
                  <StorageImage source={{ uri: user.profilePictureUrl }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarInitial}>
                    {(user?.name || '?').charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>

              <View style={styles.lcol}>
                <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                <Text style={[styles.score, { color: visual.accent }]}>
                  {score.toLocaleString()}
                </Text>
                {!!deltaChip && (
                  <View style={styles.deltaChip}>
                    <Text style={styles.deltaText}>{deltaChip}</Text>
                  </View>
                )}
              </View>

              <View style={styles.rcol}>
                <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {meta}
                </Text>

                {rankImproved ? (
                  <View style={styles.rankLine}>
                    <Text style={[styles.rankOld, { color: colors.textSecondary }]}>
                      #{rankBefore}
                    </Text>
                    <IconSymbol
                      ios_icon_name="arrow.up"
                      android_material_icon_name="arrow-upward"
                      size={12}
                      color="#10B981"
                    />
                    <Text style={styles.rankNew}>#{rankAfter}</Text>
                  </View>
                ) : rankAfter != null ? (
                  <View style={styles.rankLine}>
                    <Text style={[styles.rankYoure, { color: colors.text }]}>
                      {t('game_results:youre')}
                    </Text>
                    <Text style={styles.rankNew}>#{rankAfter}</Text>
                  </View>
                ) : null}

                {chase === 'top' ? (
                  <Text style={[styles.chase, { color: colors.textSecondary }]}>
                    <Text style={{ color: BONUS_GOLD }}>{t('game_results:top_of_board')}</Text>
                  </Text>
                ) : chase ? (
                  <Text style={[styles.chase, { color: colors.textSecondary }]}>
                    <Text style={{ color: colors.tint }}>
                      {t('game_results:chase_pts', { pts: chase.gapPts.toLocaleString() })}
                    </Text>
                    {' '}{t('game_results:chase_to')}{' '}
                    <Text style={{ color: colors.tint }}>#{chase.toRank}</Text>
                  </Text>
                ) : null}

                {!!boardLabel && (
                  <Text style={[styles.boardLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                    {boardLabel}
                  </Text>
                )}
              </View>
            </View>

            {/* ── Stats box ────────────────────────────────────────────── */}
            {statRows.length > 0 && (
              <View style={[styles.statBox, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                {statRows.map((row, i) => (
                  <View key={i} style={styles.statRow}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                    <Text style={[styles.statValue, { color: row.color ?? colors.text }]}>
                      {row.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {saving && (
              <View style={styles.savingRow}>
                <ActivityIndicator size="small" color={visual.accent} />
                <Text style={[styles.savingText, { color: colors.textSecondary }]}>
                  {t('game_results:saving')}
                </Text>
              </View>
            )}

            {/* ── Review folds (game-specific) ─────────────────────────── */}
            {children}

            {/* ── Actions — Play Again · (Next Level) · Back to game ·
                Back to Game Hub · View Leaderboard LAST (Steve's order). ── */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: visual.accent }]}
                onPress={onPlayAgain}
                activeOpacity={0.85}
              >
                <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="replay" size={16} color="#FFFFFF" />
                <Text style={styles.actionText}>{playAgainLabel}</Text>
              </TouchableOpacity>

              {!!extraAction && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: visual.gradient[0] }]}
                  onPress={extraAction.onPress}
                  activeOpacity={0.85}
                >
                  <IconSymbol ios_icon_name="arrow.right" android_material_icon_name="arrow-forward" size={16} color="#FFFFFF" />
                  <Text style={styles.actionText}>{extraAction.label}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.quietBtn, { borderColor: colors.glassBorder }]}
                onPress={onBack}
                activeOpacity={0.8}
              >
                <Text style={[styles.quietText, { color: colors.text }]}>{backLabel}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quietBtn, { borderColor: colors.glassBorder }]}
                onPress={onGameHub}
                activeOpacity={0.8}
              >
                <Text style={[styles.quietText, { color: colors.text }]}>
                  {t('game_results:back_to_game_hub')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.goldBtn]}
                onPress={onViewBoard}
                activeOpacity={0.85}
              >
                <IconSymbol ios_icon_name="trophy.fill" android_material_icon_name="emoji-events" size={16} color={BONUS_GOLD} />
                <Text style={[styles.actionText, { color: BONUS_GOLD }]}>{viewBoardLabel}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Celebration over everything — wins and personal bests only. */}
        {celebrate && <GameConfetti visual={visual} />}
      </View>
    </Modal>
  );
}

/** Collapsible review section — misses expanded first per the lockdown. */
export function ResultsFold({
  iconIos,
  iconAndroid,
  iconColor,
  title,
  count,
  initiallyOpen,
  children,
}: {
  iconIos: string;
  iconAndroid: string;
  iconColor: string;
  title: string;
  count: number | string;
  initiallyOpen?: boolean;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(!!initiallyOpen);
  return (
    <View style={[styles.fold, { backgroundColor: colors.glass, borderColor: colors.surfaceBorder }]}>
      <TouchableOpacity style={styles.foldHead} onPress={() => setOpen((v) => !v)} activeOpacity={0.75}>
        <IconSymbol ios_icon_name={iconIos as any} android_material_icon_name={iconAndroid as any} size={14} color={iconColor} />
        <Text style={[styles.foldTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.foldCount, { color: colors.textSecondary }]}>{count}</Text>
        <IconSymbol
          ios_icon_name={open ? 'chevron.up' : 'chevron.down'}
          android_material_icon_name={open ? 'expand-less' : 'expand-more'}
          size={14}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {open && children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 14,
  },
  card: {
    borderRadius: 20,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 18,
  },
  split: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatarRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: {
    fontFamily: fonts.display.bold,
    fontSize: 17,
    color: '#FFFFFF',
  },
  lcol: { flex: 1.15, minWidth: 0 },
  title: {
    fontFamily: fonts.display.bold,
    fontSize: 16.5,
    lineHeight: 19,
  },
  score: {
    fontFamily: fonts.mono.semibold,
    fontSize: 24,
    marginTop: 3,
  },
  deltaChip: {
    alignSelf: 'flex-start',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 4,
  },
  deltaText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9.5,
    color: '#10B981',
  },
  rcol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    gap: 5,
  },
  meta: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  rankLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankOld: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11.5,
    textDecorationLine: 'line-through',
  },
  rankYoure: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
  },
  rankNew: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    color: BONUS_GOLD,
  },
  chase: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
  },
  boardLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statBox: {
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 13,
    paddingVertical: 6,
    marginBottom: 10,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  statLabel: { fontSize: 12.5 },
  statValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12.5,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  savingText: { fontSize: 12 },
  fold: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    marginBottom: 8,
    overflow: 'hidden',
  },
  foldHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  foldTitle: {
    flex: 1,
    fontFamily: fonts.body.semibold,
    fontSize: 12.5,
  },
  foldCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
  },
  actions: {
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
  },
  goldBtn: {
    backgroundColor: 'rgba(245,158,11,0.16)',
  },
  actionText: {
    color: '#FFFFFF',
    fontFamily: fonts.body.semibold,
    fontSize: 14,
  },
  quietBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  quietText: {
    fontFamily: fonts.body.semibold,
    fontSize: 13.5,
  },
});
