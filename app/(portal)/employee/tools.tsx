
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

// ─── Grid layout constants (matching Manage page) ────────────────────────────
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

export default function EmployeeToolsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const colors = useThemeColors();

  // Get job titles array from user
  const jobTitles = user?.jobTitles || [];

  // Role-based visibility checks
  const canSeeServerAssistant = jobTitles.includes('Server') ||
                                jobTitles.includes('Lead Server') ||
                                jobTitles.includes('Manager');

  const canSeeBarAssistant = jobTitles.includes('Bartender') ||
                             jobTitles.includes('Manager') ||
                             jobTitles.includes('Lead Server') ||
                             jobTitles.includes('Banquet Captain');

  const canSeeHostAssistant = jobTitles.includes('Host') || jobTitles.includes('Manager');

  const canSeeKitchenAssistant = jobTitles.includes('Busser') ||
                                 jobTitles.includes('Chef') ||
                                 jobTitles.includes('Kitchen') ||
                                 jobTitles.includes('Manager') ||
                                 jobTitles.includes('Runner');

  // ─── Section data ───────────────────────────────────────────────────────────

  const guidesItems: GridItem[] = [
    { id: 'guides-training', label: t('employee_tools.guides_training'), iosIcon: 'book.fill', androidIcon: 'menu-book', route: '/guides-and-training' },
  ];

  const gameHubItems: GridItem[] = [
    { id: 'memory-game', label: t('employee_tools.memory_game'), iosIcon: 'gamecontroller.fill', androidIcon: 'sports-esports', route: '/menu-memory-game' },
    { id: 'word-search', label: 'Word Search', iosIcon: 'textformat.abc', androidIcon: 'spellcheck', route: '/word-search-game' },
  ];

  const assistantItems: GridItem[] = [];
  if (canSeeServerAssistant) {
    assistantItems.push({ id: 'server', label: t('employee_tools.server_assistant'), iosIcon: 'tray.full.fill', androidIcon: 'room-service', route: '/server-assistant' });
  }
  if (canSeeBarAssistant) {
    assistantItems.push({ id: 'bartender', label: t('employee_tools.bartender_assistant'), iosIcon: 'wineglass.fill', androidIcon: 'local-bar', route: '/bartender-assistant' });
  }
  if (canSeeHostAssistant) {
    assistantItems.push({ id: 'host', label: t('employee_tools.host_assistant'), iosIcon: 'person.2.fill', androidIcon: 'people', route: '/host-assistant' });
  }
  if (canSeeKitchenAssistant) {
    assistantItems.push({ id: 'kitchen', label: t('employee_tools.kitchen_assistant'), iosIcon: 'flame.fill', androidIcon: 'local-fire-department', route: '/kitchen-assistant' });
  }

  // ─── Grid rendering ─────────────────────────────────────────────────────────

  const renderGridItem = (item: GridItem) => (
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
  );

  const renderSection = (
    title: string,
    icon: { ios: string; android: string },
    items: GridItem[],
    isFirst?: boolean
  ) => {
    if (items.length === 0) return null;
    return (
      <View style={[styles.section, !isFirst && { marginTop: 20 }]}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconContainer, { backgroundColor: colors.primary + '12' }]}>
            <IconSymbol
              ios_icon_name={icon.ios as any}
              android_material_icon_name={icon.android as any}
              size={16}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        </View>
        <View style={styles.gridContainer}>
          {items.map(renderGridItem)}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* User's Name Header */}
      <View style={[styles.nameHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.nameHeaderText, { color: colors.text }]}>{user?.name}&apos;s Tools</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* 1. Guides & Training */}
        {renderSection(
          t('employee_tools.guides_training'),
          { ios: 'book.fill', android: 'menu-book' },
          guidesItems,
          true
        )}

        {/* 2. Game Hub */}
        {renderSection(
          '🎮 Game Hub',
          { ios: 'gamecontroller.fill', android: 'sports-esports' },
          gameHubItems
        )}

        {/* 3. Assistants */}
        {renderSection(
          'Assistants',
          { ios: 'wrench.and.screwdriver.fill', android: 'build' },
          assistantItems
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  nameHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  nameHeaderText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 16,
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 100,
  },
  // ─── Sections ─────────────────────────────────────────────────────────────
  section: {},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  // ─── Grid ──────────────────────────────────────────────────────────────────
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
