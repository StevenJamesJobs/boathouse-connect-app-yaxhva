import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import {
  themePalettes,
  THEME_PALETTE_IDS,
  ThemePaletteId,
  ThemeMode,
} from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function AppearanceScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { palette, mode, setPalette, setMode } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleModeToggle = (newMode: ThemeMode) => {
    setMode(newMode);
  };

  const handlePaletteSelect = (id: ThemePaletteId) => {
    setPalette(id);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 12 }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('appearance.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Light / Dark Toggle */}
      <View style={[styles.modeToggleContainer, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={[
            styles.modeButton,
            mode === 'light' && [styles.modeButtonActive, { backgroundColor: colors.primary }],
          ]}
          onPress={() => handleModeToggle('light')}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="sun.max.fill"
            android_material_icon_name="light-mode"
            size={20}
            color={mode === 'light' ? '#FFFFFF' : colors.textSecondary}
          />
          <Text
            style={[
              styles.modeButtonText,
              { color: mode === 'light' ? '#FFFFFF' : colors.textSecondary },
            ]}
          >
            {t('appearance.light_mode')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modeButton,
            mode === 'dark' && [styles.modeButtonActive, { backgroundColor: colors.primary }],
          ]}
          onPress={() => handleModeToggle('dark')}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="moon.fill"
            android_material_icon_name="dark-mode"
            size={20}
            color={mode === 'dark' ? '#FFFFFF' : colors.textSecondary}
          />
          <Text
            style={[
              styles.modeButtonText,
              { color: mode === 'dark' ? '#FFFFFF' : colors.textSecondary },
            ]}
          >
            {t('appearance.dark_mode')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Theme Palette Grid */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {t('appearance.select_theme')}
      </Text>

      <View style={styles.paletteGrid}>
        {THEME_PALETTE_IDS.map((id) => {
          const pal = themePalettes[id];
          const isSelected = palette === id;
          const previewColors = pal[mode];

          return (
            <TouchableOpacity
              key={id}
              style={[
                styles.paletteCard,
                { backgroundColor: colors.card },
                isSelected && { borderColor: colors.primary, borderWidth: 2 },
              ]}
              onPress={() => handlePaletteSelect(id)}
              activeOpacity={0.7}
            >
              {/* Color preview bar */}
              <View style={styles.previewBar}>
                <View style={[styles.previewSwatch, { backgroundColor: previewColors.primary, flex: 2 }]} />
                <View style={[styles.previewSwatch, { backgroundColor: previewColors.primaryLight, flex: 1.5 }]} />
                <View style={[styles.previewSwatch, { backgroundColor: previewColors.highlight, flex: 1 }]} />
                <View style={[styles.previewSwatch, { backgroundColor: previewColors.background, flex: 1 }]} />
              </View>

              {/* Mini mockup */}
              <View style={[styles.miniMockup, { backgroundColor: previewColors.background }]}>
                <View style={[styles.mockupHeader, { backgroundColor: previewColors.primary }]} />
                <View style={styles.mockupBody}>
                  <View style={[styles.mockupCard, { backgroundColor: previewColors.card }]}>
                    <View style={[styles.mockupLine, { backgroundColor: previewColors.text, width: '60%' }]} />
                    <View style={[styles.mockupLine, { backgroundColor: previewColors.textSecondary, width: '80%' }]} />
                  </View>
                </View>
              </View>

              {/* Label row */}
              <View style={styles.paletteLabelRow}>
                <Text
                  style={[
                    styles.paletteName,
                    { color: colors.text },
                    isSelected && { color: colors.primary, fontWeight: '700' },
                  ]}
                >
                  {t(`appearance.theme_${id}`)}
                </Text>
                {isSelected && (
                  <IconSymbol
                    ios_icon_name="checkmark.circle.fill"
                    android_material_icon_name="check-circle"
                    size={18}
                    color={colors.primary}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Live Preview Card */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {t('appearance.preview')}
      </Text>
      <View style={[styles.livePreview, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={[styles.previewHeaderBar, { backgroundColor: colors.primary }]}>
          <Text style={styles.previewHeaderText}>
            {t(`appearance.theme_${palette}`)}
          </Text>
        </View>
        <View style={styles.previewContent}>
          <View style={[styles.previewCardItem, { backgroundColor: colors.card }]}>
            <View style={[styles.previewDot, { backgroundColor: colors.primary }]} />
            <View style={styles.previewTextBlock}>
              <Text style={[styles.previewTitle, { color: colors.text }]}>
                {t('settings.title')}
              </Text>
              <Text style={[styles.previewSubtext, { color: colors.textSecondary }]}>
                {t('settings.appearance_desc')}
              </Text>
            </View>
          </View>
          <View style={[styles.previewCardItem, { backgroundColor: colors.card }]}>
            <View style={[styles.previewDot, { backgroundColor: colors.accent }]} />
            <View style={styles.previewTextBlock}>
              <Text style={[styles.previewTitle, { color: colors.text }]}>
                {t('common.messages')}
              </Text>
              <Text style={[styles.previewSubtext, { color: colors.textSecondary }]}>
                {t('profile.no_new_messages')}
              </Text>
            </View>
          </View>
        </View>
        <View style={[styles.previewTabBar, { backgroundColor: colors.tabBarBackground }]}>
          <View style={[styles.previewTabDot, { backgroundColor: colors.tabBarActive }]} />
          <View style={[styles.previewTabDot, { backgroundColor: colors.tabBarInactive }]} />
          <View style={[styles.previewTabDot, { backgroundColor: colors.tabBarInactive }]} />
          <View style={[styles.previewTabDot, { backgroundColor: colors.tabBarInactive }]} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginRight: 40,
  },
  headerSpacer: {
    width: 40,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  modeButtonActive: {},
  modeButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
  },
  paletteCard: {
    width: '47%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    boxShadow: '0px 2px 6px rgba(0,0,0,0.08)',
    elevation: 2,
  },
  previewBar: {
    flexDirection: 'row',
    height: 8,
  },
  previewSwatch: {
    height: '100%',
  },
  miniMockup: {
    height: 72,
    padding: 6,
  },
  mockupHeader: {
    height: 12,
    borderRadius: 3,
    marginBottom: 6,
  },
  mockupBody: {
    flex: 1,
  },
  mockupCard: {
    flex: 1,
    borderRadius: 4,
    padding: 6,
    justifyContent: 'center',
    gap: 4,
  },
  mockupLine: {
    height: 4,
    borderRadius: 2,
    opacity: 0.6,
  },
  paletteLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  paletteName: {
    fontSize: 13,
    fontWeight: '600',
  },
  livePreview: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 20,
  },
  previewHeaderBar: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  previewHeaderText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  previewContent: {
    padding: 12,
    gap: 8,
  },
  previewCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  previewDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  previewTextBlock: {
    flex: 1,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  previewSubtext: {
    fontSize: 11,
    marginTop: 2,
  },
  previewTabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  previewTabDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});
