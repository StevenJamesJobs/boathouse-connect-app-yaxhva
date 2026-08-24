
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import { fonts } from '@/constants/fonts';

interface GridItem {
  id: string;
  label: string;
  iosIcon: string;
  androidIcon: string;
  route: string;
}

export default function AssistantEditorsScreen() {
  useRequireManagerRoute();
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();

  // Server Assistant retired s74 (legacy dead page) — three role editors remain.
  const items: GridItem[] = [
    { id: 'bartender', label: t('manager_manage.grid_bartender'), iosIcon: 'wineglass.fill', androidIcon: 'local-bar', route: '/bartender-assistant-editor' },
    { id: 'host', label: t('manager_manage.grid_host'), iosIcon: 'person.2.fill', androidIcon: 'people', route: '/host-assistant-editor' },
    { id: 'kitchen', label: t('manager_manage.grid_kitchen'), iosIcon: 'flame.fill', androidIcon: 'local-fire-department', route: '/kitchen-assistant-editor' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={t('manager_manage.assistant_editors_title')} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.gridContainer}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.gridItem, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconChip, { backgroundColor: colors.primary + '21' }]}>
                <IconSymbol
                  ios_icon_name={item.iosIcon as any}
                  android_material_icon_name={item.androidIcon as any}
                  size={26}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.gridLabel, { color: colors.text }]} numberOfLines={2}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <BottomNavBar activeTab="manage" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    // Three across on every width: percentage basis + the wrap gap.
    flexBasis: '31%',
    flexGrow: 1,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChip: {
    width: 50,
    height: 50,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },
  gridLabel: {
    fontFamily: fonts.display.semibold,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
});
