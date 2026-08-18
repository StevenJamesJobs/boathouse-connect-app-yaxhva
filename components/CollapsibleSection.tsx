
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { IconSymbol } from './IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fonts } from '@/constants/fonts';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CollapsibleSectionProps {
  title: string;
  iconIos: string;
  iconAndroid: string;
  iconColor: string;
  headerBackgroundColor?: string;
  headerTextColor?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  contentBackgroundColor?: string;
  onViewAll?: () => void;
  /**
   * Glass-kit restyle (s73, cocktails editor first): surface fill + hairline
   * border, display-font header, smaller glyphs, no shadow — the FoldGroup
   * look, shadow-free so it sits inside a GlassSheet without blur-on-blur.
   * Opt-in; the pre-glass screens keep the legacy card look untouched. In
   * glass mode the three *Color background props are ignored.
   */
  glass?: boolean;
}

export default function CollapsibleSection({
  title,
  iconIos,
  iconAndroid,
  iconColor,
  headerBackgroundColor,
  headerTextColor,
  children,
  defaultExpanded = true,
  contentBackgroundColor,
  onViewAll,
  glass = false,
}: CollapsibleSectionProps) {
  const themeColors = useThemeColors();
  const resolvedContentBg = contentBackgroundColor ?? themeColors.card;
  const resolvedHeaderText = glass ? themeColors.text : (headerTextColor ?? themeColors.text);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  return (
    <View
      style={
        glass
          ? [styles.containerGlass, { backgroundColor: themeColors.surface, borderColor: themeColors.surfaceBorder }]
          : styles.container
      }
    >
      <View style={[glass ? styles.headerGlass : styles.header, !glass && { backgroundColor: headerBackgroundColor ?? themeColors.card }]}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={toggleExpanded}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name={iconIos}
            android_material_icon_name={iconAndroid}
            size={glass ? 18 : 24}
            color={iconColor}
          />
          <Text
            style={[glass ? styles.headerTitleGlass : styles.headerTitle, { color: resolvedHeaderText }]}
            numberOfLines={glass ? 1 : undefined}
          >
            {title}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {onViewAll && (
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={onViewAll}
              activeOpacity={0.7}
            >
              <Text style={[styles.viewAllText, { color: resolvedHeaderText }]}>View All</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={toggleExpanded} activeOpacity={0.7}>
            <IconSymbol
              ios_icon_name={isExpanded ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={isExpanded ? 'expand-less' : 'expand-more'}
              size={glass ? 16 : 24}
              color={glass ? themeColors.textSecondary : resolvedHeaderText}
            />
          </TouchableOpacity>
        </View>
      </View>
      {isExpanded && (
        <View style={[glass ? styles.contentGlass : styles.content, !glass && { backgroundColor: resolvedContentBg }]}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  // No own margin: the glass variant lives in gap-managed containers
  // (GlassSheet body gap 9) — a marginBottom here would double the rhythm.
  containerGlass: {
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  headerGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  headerTitleGlass: {
    fontFamily: fonts.display.semibold,
    fontSize: 15,
    marginLeft: 10,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewAllButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  contentGlass: {
    paddingHorizontal: 13,
    paddingBottom: 13,
  },
});
