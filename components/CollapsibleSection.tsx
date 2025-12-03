
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
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.header, { backgroundColor: headerBackgroundColor }]}
        onPress={toggleExpanded}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <IconSymbol
            ios_icon_name={iconIos}
            android_material_icon_name={iconAndroid}
            size={24}
            color={iconColor}
          />
          <Text style={[styles.headerTitle, { color: headerTextColor }]}>{title}</Text>
        </View>
        <IconSymbol
          ios_icon_name={isExpanded ? 'chevron.up' : 'chevron.down'}
          android_material_icon_name={isExpanded ? 'expand_less' : 'expand_more'}
          size={24}
          color={headerTextColor}
        />
      </TouchableOpacity>
      {isExpanded && <View style={styles.content}>{children}</View>}
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
  content: {
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
});
