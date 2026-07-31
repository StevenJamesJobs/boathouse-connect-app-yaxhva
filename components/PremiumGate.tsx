import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';

// Centered gate body shared by the screen-level gates. Render inside the
// screen's own container, below its header. Two shapes:
//  - manager/owner sales gate: title + intro desc + benefit bullets + footer + Upgrade button
//  - employee "Feature Locked" gate: title + desc + footer joke, showButton={false}
// Base visuals are byte-cloned from the original weekly-quizzes gate block.
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
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={48} color={colors.textSecondary} />
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 16, textAlign: 'center' }}>
        {title ?? t('weekly_quizzes.premium_title')}
      </Text>
      <Text style={{ fontSize: 15, color: colors.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 22 }}>
        {desc}
      </Text>
      {!!bullets?.length && (
        <View style={{ alignSelf: 'stretch', marginTop: 16, gap: 10 }}>
          {bullets.map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={16}
                color={colors.primary}
                style={{ marginTop: 2 }}
              />
              <Text style={{ flex: 1, fontSize: 14, color: colors.textSecondary, marginLeft: 8, lineHeight: 20 }}>
                {b}
              </Text>
            </View>
          ))}
        </View>
      )}
      {!!footer && (
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 16, textAlign: 'center', lineHeight: 19, fontStyle: 'italic' }}>
          {footer}
        </Text>
      )}
      {showButton && (
        <TouchableOpacity
          style={{ backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12, marginTop: 24 }}
          onPress={() => router.push('/subscription-management' as any)}
        >
          <Text style={{ color: colors.fireText, fontSize: 16, fontWeight: '700' }}>
            {buttonLabel ?? t('weekly_quizzes.premium_upgrade_btn')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
