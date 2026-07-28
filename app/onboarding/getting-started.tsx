import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { splashColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function GettingStartedScreen() {
  const router = useRouter();
  const { t } = useTranslation();

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
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerContainer}>
          <Text style={styles.title}>{t('onboarding.getting_started_title')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.getting_started_intro')}</Text>
        </View>

        {/* "Here's what you'll need" checklist */}
        {items.map((item) => (
          <View key={item.title} style={styles.itemCard}>
            <View style={styles.itemIconCircle}>
              <IconSymbol
                ios_icon_name={item.ios}
                android_material_icon_name={item.android}
                size={22}
                color={splashColors.primary}
              />
            </View>
            <View style={styles.itemBody}>
              <View style={styles.itemTitleRow}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                {item.optional && (
                  <View style={styles.optionalChip}>
                    <Text style={styles.optionalChipText}>{t('onboarding.gs_optional')}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.itemSub}>{item.sub}</Text>
              {item.example ? (
                <Text style={styles.itemExample}>{item.example}</Text>
              ) : null}
            </View>
          </View>
        ))}

        <Text style={styles.footnote}>{t('onboarding.gs_footnote')}</Text>

        {/* Continue → owner account creation */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/onboarding/signup')}
        >
          <Text style={styles.primaryButtonText}>{t('onboarding.continue')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backLink}
          onPress={() => router.replace('/login')}
        >
          <Text style={styles.backLinkText}>{t('join.back_to_login')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: splashColors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  headerContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: splashColors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: splashColors.textSecondary,
    lineHeight: 22,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 14,
    marginBottom: 12,
  },
  itemIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: splashColors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: splashColors.text,
  },
  optionalChip: {
    backgroundColor: '#EDF5FA',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  optionalChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: splashColors.primary,
  },
  itemSub: {
    fontSize: 13,
    color: splashColors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  itemExample: {
    fontSize: 12,
    color: splashColors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  footnote: {
    fontSize: 13,
    color: splashColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: splashColors.primary,
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 8px rgba(44, 95, 141, 0.2)',
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  backLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  backLinkText: {
    fontSize: 15,
    fontWeight: '500',
    color: splashColors.primary,
  },
});
