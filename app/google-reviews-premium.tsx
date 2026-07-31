import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useSubscription } from '@/contexts/SubscriptionContext';
import PremiumGate from '@/components/PremiumGate';

// Sales-copy lock screen for Automatic Google Reviews. The feature itself
// lives inside the rewards editor and the Manage Rating tile, so this
// mini-route exists only to pitch it on base tier — premium users who land
// here are bounced to the rewards & reviews editor.
export default function GoogleReviewsPremiumScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { hasPremium } = useSubscription();

  if (hasPremium) {
    return <Redirect href={'/rewards-and-reviews-editor' as any} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.card,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40 }}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
          {t('rewards_reviews_editor:gr_premium_screen_title')}
        </Text>
        <View style={{ width: 40 }} />
      </View>
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
