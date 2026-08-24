
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderNavButton from '@/components/HeaderNavButton';
import { fonts } from '@/constants/fonts';

// Placeholder editor hub (Steve, s74): the full Kitchen Assistant build-out
// comes in a later wave — this pass is the glass reskin only.
const SECTIONS = [
  { key: 'main', iconIos: 'book.pages', iconAndroid: 'menu-book', titleKey: 'kitchen_assistant_editor.main_menu_recipes_editor', descKey: 'kitchen_assistant_editor.main_menu_recipes_editor_desc' },
  { key: 'banquet', iconIos: 'person.3.fill', iconAndroid: 'groups', titleKey: 'kitchen_assistant_editor.banquet_recipes_editor', descKey: 'kitchen_assistant_editor.banquet_recipes_editor_desc' },
  { key: 'buffet', iconIos: 'list.clipboard.fill', iconAndroid: 'list-alt', titleKey: 'kitchen_assistant_editor.buffet_recipes_editor', descKey: 'kitchen_assistant_editor.buffet_recipes_editor_desc' },
] as const;

export default function KitchenAssistantEditorScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('kitchen_assistant_editor.title')}
        rightWide
        right={
          <HeaderNavButton
            label={t('common:to_user')}
            iconIos="person.fill"
            iconAndroid="person"
            onPress={() => router.replace('/kitchen-assistant')}
          />
        }
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {SECTIONS.map((s) => (
          <View
            key={s.key}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
          >
            <View style={[styles.iconChip, { backgroundColor: colors.primary + '21' }]}>
              <IconSymbol ios_icon_name={s.iconIos} android_material_icon_name={s.iconAndroid} size={20} color={colors.primary} />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t(s.titleKey)}</Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{t(s.descKey)}</Text>
            </View>
            <View style={[styles.soonPill, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <Text style={[styles.soonPillText, { color: colors.textSecondary }]}>
                {t('kitchen_assistant.coming_soon').toUpperCase()}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <BottomNavBar activeTab="manage" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 14,
    marginBottom: 10,
  },
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: fonts.display.semibold,
    fontSize: 15,
    marginBottom: 3,
  },
  cardDescription: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    lineHeight: 17,
  },
  soonPill: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  soonPillText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 8.5,
    letterSpacing: 0.8,
  },
});
