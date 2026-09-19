/**
 * You're All Set! (s86, mockup F-1) — the owner's finish line. The success tick sits LEFT of
 * the title (a row, not a centered hero) so the join code, the two bullets and the gold trial
 * card fit with barely a scroll. Share's message carries the one web link that forwards to the
 * right store (LEGAL.appUrl).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import { IconSymbol } from '@/components/IconSymbol';
import GlassCard from '@/components/GlassCard';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { LEGAL } from '@/config/legal';
import {
  OnbScreen,
  OnboardingDock,
  Disc,
  GhostButton,
  InfoBlurb,
  Bullet,
  B,
  Pill,
  useOnbAccents,
} from '@/components/onboarding/OnboardingKit';

export default function JoinCodeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const a = useOnbAccents();
  const { organization } = useOrganization();
  const { user } = useAuth();

  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>(organization.name);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchCode() {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        // Member-gated: get_org returns the caller's own org (join_code included).
        const { data, error } = await supabase.rpc('get_org', { p_actor_id: user.id });
        const row: any = Array.isArray(data) ? data[0] : data;

        if (error) {
          console.error('[JoinCode] Fetch error:', error);
        } else if (row) {
          setJoinCode(row.join_code);
          setOrgName(row.name || organization.name);
        }
      } catch (err) {
        console.error('[JoinCode] Unexpected error:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleCopy = async () => {
    if (!joinCode) return;
    await Clipboard.setStringAsync(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!joinCode) return;
    try {
      await Share.share({
        message: t('onboarding.share_message', { orgName, joinCode, appUrl: LEGAL.appUrl }),
      });
    } catch (err) {
      console.error('[JoinCode] Share error:', err);
    }
  };

  const handleGoToDashboard = () => {
    router.replace('/(portal)/manager');
  };

  const openTutorials = () => {
    WebBrowser.openBrowserAsync(LEGAL.tutorialsUrl).catch(() => {});
  };

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  const gold = a.isDark ? '#F59E0B' : '#B45309';
  const trialFeatures = [
    t('onboarding.trial_feature_1'),
    t('onboarding.trial_feature_2'),
    t('onboarding.trial_feature_3'),
    t('onboarding.trial_feature_4'),
    t('onboarding.trial_feature_5'),
  ];

  return (
    <OnbScreen
      contentStyle={styles.content}
      dock={<OnboardingDock nextLabel={t('onboarding.go_to_dashboard')} onNext={handleGoToDashboard} />}
    >
      {/* Header row — tick left of the title */}
      <View style={styles.head}>
        <Disc tone="ok" style={styles.disc}>
          <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={28} color={a.ok} />
        </Disc>
        <View style={styles.headText}>
          <Text style={[styles.title, { color: colors.text }]}>{t('onboarding.join_all_set_title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('onboarding.join_code_ready', { orgName })}</Text>
        </View>
      </View>

      {/* Join code */}
      <GlassCard variant="glass" radius={18} style={styles.codeCard}>
        <View style={styles.codeTop}>
          <Text style={[styles.eyebrow, { color: a.quiet }]} numberOfLines={1}>{t('onboarding.join_code_title')}</Text>
          {organization.allow_self_signup && <Pill tone="ok" label={t('onboarding.self_signup_on')} />}
        </View>
        <Text style={[styles.code, { color: colors.text }]} selectable adjustsFontSizeToFit numberOfLines={1}>
          {joinCode || '----'}
        </Text>
        <View style={styles.btnRow}>
          <GhostButton
            label={copied ? t('onboarding.copied') : t('onboarding.copy_code')}
            iosIcon={copied ? 'checkmark' : 'doc.on.doc'}
            androidIcon={copied ? 'check' : 'content-copy'}
            onPress={handleCopy}
            style={styles.codeBtn}
          />
          <GhostButton
            label={t('onboarding.share')}
            iosIcon="square.and.arrow.up"
            androidIcon="share"
            onPress={handleShare}
            style={styles.codeBtn}
          />
        </View>
      </GlassCard>

      {/* The two bullets */}
      <InfoBlurb>
        <Bullet>
          <B>{t('onboarding.join_code_instructions_lead')}</B> {t('onboarding.join_code_instructions')}
        </Bullet>
        <Bullet>
          {t('onboarding.tutorials_note')}{' '}
          <Text style={{ fontFamily: fonts.body.semibold, color: a.pop }} onPress={openTutorials} accessibilityRole="link">
            {LEGAL.tutorialsHost}
          </Text>
        </Bullet>
      </InfoBlurb>

      {/* Premium trial */}
      <View style={[styles.trial, { backgroundColor: hexToRgba(gold, 0.08), borderColor: hexToRgba(gold, 0.34) }]}>
        <View style={styles.trialHead}>
          <IconSymbol ios_icon_name="crown.fill" android_material_icon_name="workspace-premium" size={17} color={gold} />
          <Text style={[styles.trialTitle, { color: colors.text }]}>{t('onboarding.trial_title')}</Text>
        </View>
        <Text style={[styles.trialNote, { color: colors.textSecondary, marginTop: -3 }]}>{t('onboarding.trial_body')}</Text>
        <View style={styles.feats}>
          {trialFeatures.map((f, i) => (
            <View key={f} style={styles.featRow}>
              <IconSymbol
                ios_icon_name="checkmark"
                android_material_icon_name="check"
                size={13}
                color={i === trialFeatures.length - 1 ? a.ok : gold}
                style={{ marginTop: 2 }}
              />
              <Text style={[styles.featText, { color: colors.text }]}>{f}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.trialNote, { color: colors.textSecondary }]}>{t('onboarding.trial_footer')}</Text>
      </View>
    </OnbScreen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 22 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingTop: 6, paddingHorizontal: 2 },
  disc: { width: 58, height: 58, borderRadius: 20, marginBottom: 0 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.display.bold, fontSize: 23, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 17, marginTop: 2 },

  codeCard: { padding: 13, gap: 11 },
  codeTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { flex: 1, fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' },
  code: { fontFamily: fonts.mono.semibold, fontSize: 30, letterSpacing: 3, textAlign: 'center', paddingTop: 4 },
  btnRow: { flexDirection: 'row', gap: 10 },
  codeBtn: { flex: 1, height: 42 },

  trial: { borderRadius: 18, borderWidth: 1, padding: 13, gap: 8 },
  trialHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trialTitle: { flex: 1, fontFamily: fonts.display.semibold, fontSize: 15 },
  trialNote: { fontFamily: fonts.body.regular, fontSize: 11, lineHeight: 15 },
  feats: { gap: 6 },
  featRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  featText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 17 },
});
