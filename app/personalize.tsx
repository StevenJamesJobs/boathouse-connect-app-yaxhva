/**
 * Make it yours (s86) — the stand-alone first-run theme picker. The portal layout sends a
 * signed-in user here ONCE, on a device that has never reached a dashboard and never walked
 * a theme step (a manager-added employee's first sign-in, or an existing user on a new
 * phone). Self-signup joiners and owners pick inside their flows (join step 4 / wizard
 * step 4) and never see this page. MyResto only.
 *
 * The picker writes straight to ThemeContext, so the page is its own preview; both exits
 * mark the device as personalized and hand over to the role's portal.
 */
import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import AppearanceBody from '@/components/appearance/AppearanceBody';
import { markPersonalized } from '@/utils/deviceFlags';
import { OnbScreen, Hero, CtaButton, LinkRow } from '@/components/onboarding/OnboardingKit';

export default function PersonalizeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const finish = async () => {
    await markPersonalized();
    if (user?.role === 'manager' || user?.role === 'owner') {
      router.replace('/(portal)/manager');
    } else {
      router.replace('/(portal)/employee');
    }
  };

  return (
    <OnbScreen>
      <Hero iosIcon="paintpalette.fill" androidIcon="palette" tone="pop" title={t('personalize.title')} subtitle={t('personalize.subtitle')} />
      <AppearanceBody showTags={false} />
      <CtaButton label={t('personalize.save')} onPress={finish} />
      <LinkRow label={t('personalize.skip')} onPress={finish} />
    </OnbScreen>
  );
}
