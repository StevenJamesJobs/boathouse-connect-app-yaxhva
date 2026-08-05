import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import GlassCard from '@/components/GlassCard';
import { fonts } from '@/constants/fonts';

// Centered gate body shared by the screen-level gates. Render inside the
// screen's own container, below its header. Two shapes:
//  - manager/owner sales gate: title + intro desc + benefit bullets + footer + Upgrade button
//  - employee "Feature Locked" gate: title + desc + footer joke, showButton={false}
// Glass idiom (s65): a centred GlassCard variant="glass", tinted lock chip,
// mono eyebrow, Bricolage title, full-width CTA. The glow belongs to the
// SCREEN — each host renders <AmbientGlow /> at its own root, so this must
// NOT render one too (two stacked gradients read visibly darker). The
// ScrollView is load-bearing — the 5-bullet schedule gates clipped their
// CTA off-screen on SE-class devices. Props are unchanged on purpose.
export default function PremiumGate({
  desc,
  title,
  buttonLabel,
  bullets,
  footer,
  showButton = true,
}: {
  desc: string;
  title?: string;
  buttonLabel?: string;
  bullets?: string[];
  footer?: string;
  showButton?: boolean;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard variant="glass" radius={22} intensity={28} style={styles.card}>
          <View
            style={[
              styles.lockChip,
              { backgroundColor: colors.tint + '1C', borderColor: colors.tint + '52' },
            ]}
          >
            <IconSymbol
              ios_icon_name="lock.fill"
              android_material_icon_name="lock"
              size={26}
              color={colors.tint}
            />
          </View>
          {showButton && (
            <Text style={[styles.eyebrow, { color: colors.tint }]}>
              {t('common.premium_badge')}
            </Text>
          )}
          <Text style={[styles.title, !showButton && styles.titleNoEyebrow, { color: colors.text }]}>
            {title ?? t('weekly_quizzes.premium_title')}
          </Text>
          <Text style={[styles.desc, { color: colors.textSecondary }]}>{desc}</Text>
          {!!bullets?.length && (
            <View style={styles.bullets}>
              {bullets.map((b, i) => (
                <View key={i} style={styles.bulletRow}>
                  <IconSymbol
                    ios_icon_name="checkmark.circle.fill"
                    android_material_icon_name="check-circle"
                    size={15}
                    color={colors.tint}
                    style={styles.bulletIcon}
                  />
                  <Text style={[styles.bulletText, { color: colors.text }]}>{b}</Text>
                </View>
              ))}
            </View>
          )}
          {!!footer && (
            <Text style={[styles.footer, { color: colors.textSecondary }]}>{footer}</Text>
          )}
          {showButton && (
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              onPress={() => router.push('/subscription-management')}
            >
              <Text style={[styles.ctaText, { color: colors.fireText }]}>
                {buttonLabel ?? t('weekly_quizzes.premium_upgrade_btn')}
              </Text>
            </TouchableOpacity>
          )}
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  // flexGrow + center = vertically centred when it fits, scrollable when it doesn't.
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 26 },
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', padding: 22, alignItems: 'center' },
  lockChip: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  eyebrow: { fontFamily: fonts.mono.semibold, fontSize: 9.5, letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 14 },
  title: { fontFamily: fonts.display.bold, fontSize: 20, letterSpacing: -0.3, textAlign: 'center', marginTop: 6 },
  // The employee variant hides the eyebrow, so the title carries its own gap.
  titleNoEyebrow: { marginTop: 16 },
  desc: { fontFamily: fonts.body.regular, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  bullets: { alignSelf: 'stretch', marginTop: 18, gap: 12 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start' },
  bulletIcon: { marginTop: 2 },
  bulletText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 13, lineHeight: 19, marginLeft: 9, opacity: 0.92 },
  footer: { fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 17, fontStyle: 'italic', textAlign: 'center', marginTop: 18, paddingHorizontal: 4 },
  cta: { alignSelf: 'stretch', height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  ctaText: { fontFamily: fonts.display.bold, fontSize: 15 },
});
