
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

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CollapsibleSectionProps {
  title: string;
  iconIos: string;
  iconAndroid: string;
  iconColor: string;
  headerBackgroundColor: string;
  headerTextColor: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  contentBackgroundColor?: string;
  onViewAll?: () => void;
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
  contentBackgroundColor = '#FFFFFF',
  onViewAll,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: headerBackgroundColor }]}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={toggleExpanded}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name={iconIos}
            android_material_icon_name={iconAndroid}
            size={24}
            color={iconColor}
          />
          <Text style={[styles.headerTitle, { color: headerTextColor }]}>{title}</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {onViewAll && (
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={onViewAll}
              activeOpacity={0.7}
            >
              <Text style={[styles.viewAllText, { color: headerTextColor }]}>View All</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={toggleExpanded} activeOpacity={0.7}>
            <IconSymbol
              ios_icon_name={isExpanded ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={isExpanded ? 'expand_less' : 'expand_more'}
              size={24}
              color={headerTextColor}
            />
          </TouchableOpacity>
        </View>
      </View>
      {isExpanded && (
        <View style={[styles.content, { backgroundColor: contentBackgroundColor }]}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
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
});
