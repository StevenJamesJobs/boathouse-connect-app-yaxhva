import React from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useSubscription } from '@/contexts/SubscriptionContext';
import PremiumGate from '@/components/PremiumGate';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';

// Sales-copy lock screen for Automatic Google Reviews. The feature itself
// lives inside the rewards editor and the Manage Rating tile, so this
// mini-route exists only to pitch it on base tier — premium users who land
// here are bounced to the rewards & reviews editor.
export default function GoogleReviewsPremiumScreen() {
  useRequireManagerRoute();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { hasPremium } = useSubscription();

  if (hasPremium) {
    return <Redirect href={'/rewards-and-reviews-editor' as any} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AmbientGlow />
      <ScreenHeader title={t('rewards_reviews_editor:gr_premium_screen_title')} />
      <PremiumGate
        desc={t('rewards_reviews_editor:gr_premium_desc')}
        bullets={[
          t('rewards_reviews_editor:gr_premium_b1'),
          t('rewards_reviews_editor:gr_premium_b2'),
          t('rewards_reviews_editor:gr_premium_b3'),
        ]}
        footer={t('rewards_reviews_editor:gr_premium_footer')}
      />
    </View>
  );
}
