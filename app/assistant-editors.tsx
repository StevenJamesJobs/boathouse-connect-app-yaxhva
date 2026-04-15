
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = 16;
const GRID_GAP = 12;
const NUM_COLUMNS = 3;
const ITEM_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

interface GridItem {
  id: string;
  label: string;
  iosIcon: string;
  androidIcon: string;
  route: string;
}

export default function AssistantEditorsScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();

  const items: GridItem[] = [
    { id: 'server', label: t('manager_manage.grid_server'), iosIcon: 'tray.full.fill', androidIcon: 'room-service', route: '/server-assistant-editor' },
    { id: 'bartender', label: t('manager_manage.grid_bartender'), iosIcon: 'wineglass.fill', androidIcon: 'local-bar', route: '/bartender-assistant-editor' },
    { id: 'host', label: t('manager_manage.grid_host'), iosIcon: 'person.2.fill', androidIcon: 'people', route: '/host-assistant-editor' },
    { id: 'kitchen', label: t('manager_manage.grid_kitchen'), iosIcon: 'flame.fill', androidIcon: 'local-fire-department', route: '/kitchen-assistant-editor' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('manager_manage.assistant_editors_title')}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.gridContainer}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.gridItem, { backgroundColor: colors.card, width: ITEM_WIDTH }]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: colors.primary + '15' }]}>
                <IconSymbol
                  ios_icon_name={item.iosIcon as any}
                  android_material_icon_name={item.androidIcon as any}
                  size={28}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    paddingTop: 24,
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 100,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridItem: {
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)',
    elevation: 3,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  gridLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
});
