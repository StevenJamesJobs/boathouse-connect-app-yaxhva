import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { fonts } from '@/constants/fonts';
import type { ThemeColorSet } from '@/styles/commonStyles';
import { alpha } from '@/components/appearance/appearanceKit';

interface ThemePreviewProps {
  /** The colour set to paint with — a preset's light/dark set or a derived custom one. */
  palette: ThemeColorSet;
  /** Optional accessibility label ("Moonstone · Dark"). */
  label?: string;
}

/**
 * The honest miniature (mockup `.pv`): a mini hero card, seg, event card,
 * button pair and tab strip painted ENTIRELY from the palette passed in — never
 * the live theme — so previewing a non-active theme shows what you would get.
 */
export default function ThemePreview({ palette: p, label }: ThemePreviewProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const fullName = (user?.name || '').trim();
  const firstName = fullName.split(/\s+/)[0] || '';
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const tint18 = alpha(p.tint, 0.18);

  return (
    <View
      style={[styles.pv, { backgroundColor: p.background, borderColor: p.surfaceBorder }]}
      accessibilityLabel={label}
    >
      {/* Soft tint glow, top-right (mockup radial at 22%) — two diagonal fades. */}
      <View style={styles.glowWrap} pointerEvents="none">
        <LinearGradient
          colors={[alpha(p.tint, 0.22), 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.1, y: 1 }}
          style={styles.glowA}
        />
        <LinearGradient
          colors={[alpha(p.tint, 0.16), 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.25, y: 1 }}
          style={styles.glowB}
        />
      </View>

      {/* Mini hero card */}
      <View style={[styles.hero, { backgroundColor: p.glass, borderColor: p.glassBorder }]}>
        <Text style={[styles.greeting, { color: p.text }]} numberOfLines={1}>
          {t('appearance.preview_greeting')}
          {firstName ? (
            <>
              {', '}
              <Text style={{ color: p.tint }}>{firstName}</Text>
            </>
          ) : null}
        </Text>
        <View style={styles.heroRow}>
          <View style={[styles.avatar, { backgroundColor: p.thumbPlaceholder, borderColor: p.glassBorder }]}>
            <Text style={[styles.avatarText, { color: p.text }]}>{initials || '·'}</Text>
          </View>
          <Text style={[styles.heroName, { color: p.text }]} numberOfLines={1}>
            {fullName}
          </Text>
          <View style={[styles.chipBox, { backgroundColor: p.glass, borderColor: p.glassBorder }]}>
            <View style={[styles.chipDot, { backgroundColor: p.blue, borderColor: p.background }]} />
          </View>
          <View style={[styles.chipBox, { backgroundColor: p.glass, borderColor: p.glassBorder }]} />
        </View>
      </View>

      {/* Mini seg */}
      <View style={[styles.seg, { backgroundColor: p.glass, borderColor: p.glassBorder }]}>
        <View style={[styles.segItem, { backgroundColor: tint18 }]}>
          <Text style={[styles.segText, { color: p.tint }]} numberOfLines={1}>
            {t('appearance.preview_seg_schedule')}
          </Text>
        </View>
        <View style={styles.segItem}>
          <Text style={[styles.segText, { color: p.textSecondary }]} numberOfLines={1}>
            {t('appearance.preview_seg_today')}
          </Text>
        </View>
        <View style={styles.segItem}>
          <Text style={[styles.segText, { color: p.textSecondary }]} numberOfLines={1}>
            {t('appearance.preview_seg_events')}
          </Text>
        </View>
      </View>

      {/* Mini card */}
      <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.surfaceBorder }]}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, { color: p.text }]} numberOfLines={1}>
            {t('appearance.preview_card_title')}
          </Text>
          <View style={[styles.newPill, { backgroundColor: alpha(p.blue, 0.22) }]}>
            <Text style={[styles.newPillText, { color: p.blueText }]}>{t('appearance.preview_card_new')}</Text>
          </View>
        </View>
        <Text style={[styles.cardBody, { color: p.textSecondary }]} numberOfLines={2}>
          {t('appearance.preview_card_body')}
        </Text>
        <Text style={[styles.cardDate, { color: p.tint }]} numberOfLines={1}>
          {t('appearance.preview_card_date')}
        </Text>
      </View>

      {/* Mini buttons */}
      <View style={styles.buttons}>
        <View style={[styles.btn, { backgroundColor: p.glass, borderColor: p.glassBorder }]}>
          <Text style={[styles.btnText, { color: p.text }]}>{t('appearance.preview_btn_later')}</Text>
        </View>
        <View style={[styles.btn, { backgroundColor: p.tint, borderColor: p.tint }]}>
          <Text style={[styles.btnText, { color: p.fireText }]}>{t('appearance.preview_btn_save')}</Text>
        </View>
      </View>

      {/* Mini tab strip — 5 slots, first active */}
      <View style={[styles.tabs, { backgroundColor: p.glass, borderColor: p.glassBorder }]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.tab, i === 0 && { backgroundColor: tint18 }]}>
            <View
              style={[
                styles.tabDot,
                { backgroundColor: i === 0 ? p.tint : p.textSecondary, opacity: i === 0 ? 1 : 0.5 },
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pv: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    padding: 10,
    gap: 7,
  },
  glowWrap: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  glowA: { position: 'absolute', top: -60, right: -40, width: 180, height: 160, borderRadius: 90 },
  glowB: { position: 'absolute', top: -40, right: -20, width: 120, height: 110, borderRadius: 60 },
  hero: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 9, borderWidth: 1 },
  greeting: { fontFamily: fonts.display.bold, fontSize: 12.5, letterSpacing: -0.2 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.display.bold, fontSize: 8 },
  heroName: { flex: 1, fontFamily: fonts.body.semibold, fontSize: 9.5 },
  chipBox: { width: 22, height: 20, borderRadius: 7, borderWidth: 1 },
  chipDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  seg: { flexDirection: 'row', padding: 2, gap: 2, borderRadius: 8, borderWidth: 1 },
  segItem: { flex: 1, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: fonts.body.semibold, fontSize: 9 },
  card: { borderRadius: 11, padding: 9, borderWidth: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { flexShrink: 1, fontFamily: fonts.display.semibold, fontSize: 11.5 },
  newPill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  newPillText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardBody: { fontFamily: fonts.body.regular, fontSize: 9.5, lineHeight: 13, marginTop: 3 },
  cardDate: { fontFamily: fonts.mono.semibold, fontSize: 8.5, marginTop: 5 },
  buttons: { flexDirection: 'row', gap: 6 },
  btn: {
    flex: 1,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontFamily: fonts.body.semibold, fontSize: 10 },
  tabs: { flexDirection: 'row', padding: 3, gap: 3, borderRadius: 10, borderWidth: 1 },
  tab: { flex: 1, height: 18, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  tabDot: { width: 6, height: 6, borderRadius: 3 },
});
