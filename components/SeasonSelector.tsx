import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';
import { menuIconAndroid } from '@/constants/menuIcons';

export type Season = 'winter' | 'summer';

interface SeasonSelectorProps {
  selectedSeason: Season;
  onSeasonChange: (season: Season) => void;
  menu1Label?: string;
  menu2Label?: string;
  menu1Icon?: string;
  menu2Icon?: string;
}

export default function SeasonSelector({
  selectedSeason,
  onSeasonChange,
  menu1Label,
  menu2Label,
  menu1Icon,
  menu2Icon,
}: SeasonSelectorProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <TouchableOpacity
        style={[styles.segment, selectedSeason === 'winter' && { backgroundColor: colors.highlight }]}
        onPress={() => onSeasonChange('winter')}
        activeOpacity={0.7}
      >
        <IconSymbol
          ios_icon_name={menu1Icon || 'snowflake'}
          android_material_icon_name={menuIconAndroid(menu1Icon || 'snowflake')}
          size={16} color={selectedSeason === 'winter' ? colors.primary : colors.textSecondary}
        />
        <Text style={[styles.label, { color: selectedSeason === 'winter' ? colors.text : colors.textSecondary }]}>
          {menu1Label || t('season_selector.winter')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.segment, selectedSeason === 'summer' && { backgroundColor: colors.highlight }]}
        onPress={() => onSeasonChange('summer')}
        activeOpacity={0.7}
      >
        <IconSymbol
          ios_icon_name={menu2Icon || 'sun.max.fill'}
          android_material_icon_name={menuIconAndroid(menu2Icon || 'sun.max.fill')}
          size={16} color={selectedSeason === 'summer' ? colors.primary : colors.textSecondary}
        />
        <Text style={[styles.label, { color: selectedSeason === 'summer' ? colors.text : colors.textSecondary }]}>
          {menu2Label || t('season_selector.summer')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});
