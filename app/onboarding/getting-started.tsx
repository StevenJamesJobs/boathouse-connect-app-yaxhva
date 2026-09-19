/**
 * Getting Started (s86, mockup O-1) — the owner path's "here's what you'll need" page:
 * one glass list with hairlines, quiet discs, Optional pills and the mono Google example.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import GlassCard from '@/components/GlassCard';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';
import {
  OnbScreen,
  TopBar,
  Hero,
  Disc,
  Pill,
  CtaButton,
  LinkRow,
  useOnbAccents,
} from '@/components/onboarding/OnboardingKit';

export default function GettingStartedScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const a = useOnbAccents();

  // Literal t() calls per item so the i18n harvester sees every key.
  const items = [
    {
      ios: 'building.2.fill',
      android: 'store',
      title: t('onboarding.gs_org_info'),
      sub: t('onboarding.gs_org_info_sub'),
      optional: false,
      example: null as string | null,
    },
    {
      ios: 'mappin.circle.fill',
      android: 'place',
      title: t('onboarding.gs_location'),
      sub: t('onboarding.gs_location_sub'),
      optional: false,
      example: null as string | null,
    },
    {
      ios: 'doc.text.fill',
      android: 'description',
      title: t('onboarding.gs_menu'),
      sub: t('onboarding.gs_menu_sub'),
      optional: true,
      example: null as string | null,
    },
    {
      ios: 'mappin.and.ellipse',
      android: 'map',
      title: t('onboarding.gs_gmaps'),
      sub: t('onboarding.gs_gmaps_sub'),
      optional: true,
      example: t('onboarding.gs_gmaps_example'),
    },
  ];

  return (
    <OnbScreen header={<TopBar onBack={() => router.back()} eyebrow={t('onboarding.owner_setup')} />}>
      <Hero align="left" title={t('onboarding.getting_started_title')} subtitle={t('onboarding.getting_started_intro')} />

      {/* "Here's what you'll need" — one glass list */}
      <GlassCard variant="glass" radius={18} style={styles.list}>
        {items.map((item, i) => (
          <View key={item.title} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.hairline }]}>
            <Disc small>
              <IconSymbol ios_icon_name={item.ios} android_material_icon_name={item.android} size={17} color={a.quiet} />
            </Disc>
            <View style={styles.rowBody}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                {item.optional && <Pill label={t('onboarding.gs_optional')} />}
              </View>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>{item.sub}</Text>
              {item.example ? <Text style={[styles.example, { color: colors.textSecondary }]}>{item.example}</Text> : null}
            </View>
          </View>
        ))}
      </GlassCard>

      <Text style={[styles.footnote, { color: colors.textSecondary }]}>{t('onboarding.gs_footnote')}</Text>

      {/* Continue → owner account creation */}
      <CtaButton label={t('onboarding.continue')} onPress={() => router.push('/onboarding/signup')} />

      <LinkRow back label={t('welcome.back_to_welcome')} onPress={() => router.replace('/welcome')} />
    </OnbScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 13 },
  rowBody: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  title: { fontFamily: fonts.body.semibold, fontSize: 14, flexShrink: 1 },
  sub: { fontFamily: fonts.body.regular, fontSize: 12, lineHeight: 16, marginTop: 2 },
  example: { fontFamily: fonts.mono.medium, fontSize: 10, lineHeight: 15, marginTop: 5, opacity: 0.85 },
  footnote: { fontFamily: fonts.body.regular, fontSize: 11, lineHeight: 15, textAlign: 'center' },
});
