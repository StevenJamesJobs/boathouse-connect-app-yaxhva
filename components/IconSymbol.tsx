
// This file is a fallback for using MaterialIcons on Android and web.

import React from "react";
import { SymbolWeight } from "expo-symbols";
import {
  OpaqueColorValue,
  StyleProp,
  TextStyle,
  ViewStyle,
  Text,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

// Map of common icon names to ensure they work on Android
const ICON_MAP: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  // Weather icons
  'cloud.sun': 'wb-cloudy',
  'cloud.sun.fill': 'wb-cloudy',
  'cloud.rain': 'cloud',
  'cloud.rain.fill': 'cloud',
  'sun.max': 'wb-sunny',
  'sun.max.fill': 'wb-sunny',
  
  // Chevrons and arrows
  'chevron.up': 'expand-less',
  'chevron.down': 'expand-more',
  'chevron.left': 'chevron-left',
  'chevron.right': 'chevron-right',
  'arrow.left': 'arrow-back',
  'arrow.right': 'arrow-forward',
  'arrow.up': 'arrow-upward',
  'arrow.down': 'arrow-downward',
  
  // Menu and navigation
  'line.3.horizontal': 'menu',
  'line.horizontal.3': 'menu',
  'list.bullet': 'list',
  
  // Filter
  'line.3.horizontal.decrease.circle': 'filter-list',
  'slider.horizontal.3': 'tune',
  
  // Plus and add
  'plus': 'add',
  'plus.circle': 'add-circle',
  'plus.circle.fill': 'add-circle',
  
  // Key and security
  'key': 'vpn-key',
  'key.fill': 'vpn-key',
  'lock': 'lock',
  'lock.fill': 'lock',
  
  // Messages and communication
  'envelope': 'email',
  'envelope.fill': 'email',
  'paperplane': 'send',
  'paperplane.fill': 'send',
  'bubble.left.and.bubble.right': 'forum',
  'bubble.left.and.bubble.right.fill': 'forum',
  
  // Search
  'magnifyingglass': 'search',
  
  // Close and cancel
  'xmark': 'close',
  'xmark.circle': 'cancel',
  'xmark.circle.fill': 'cancel',
  
  // Check and done
  'checkmark': 'check',
  'checkmark.circle': 'check-circle',
  'checkmark.circle.fill': 'check-circle',
  
  // Delete and trash
  'trash': 'delete',
  'trash.fill': 'delete',
  
  // Images and media
  'photo': 'image',
  'photo.fill': 'image',
  'camera': 'camera-alt',
  'camera.fill': 'camera-alt',
  
  // Error and warning
  'exclamationmark.triangle': 'warning',
  'exclamationmark.triangle.fill': 'warning',
  'exclamationmark.circle': 'error',
  'exclamationmark.circle.fill': 'error',
  
  // Info
  'info.circle': 'info',
  'info.circle.fill': 'info',
  
  // Settings
  'gearshape': 'settings',
  'gearshape.fill': 'settings',
  
  // Book and guides
  'book': 'menu-book',
  'book.fill': 'menu-book',
  
  // Calculator
  'calculator': 'calculate',
  'calculator.fill': 'calculate',
  
  // Feedback
  'feedback': 'feedback',
  
  // Restaurant and food
  'fork.knife': 'restaurant',
  'fork.knife.circle': 'restaurant-menu',
  
  // Tray and inbox
  'tray': 'inbox',
  'tray.fill': 'inbox',
};

/**
 * An icon component that uses native SFSymbols on iOS, and MaterialIcons on Android and web. 
 * This ensures a consistent look across platforms, and optimal resource usage.
 *
 * Icon `name`s are based on SFSymbols and require manual mapping to MaterialIcons.
 */
export function IconSymbol({
  ios_icon_name = undefined,
  android_material_icon_name,
  size = 24,
  color,
  style,
}: {
  ios_icon_name?: string | undefined;
  android_material_icon_name: keyof typeof MaterialIcons.glyphMap | string;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  // Try to map iOS icon name to Android if android_material_icon_name is not provided or is the same as iOS
  let iconName = android_material_icon_name;
  
  // If the android icon name looks like an iOS icon name (contains dots), try to map it
  if (typeof iconName === 'string' && iconName.includes('.') && ICON_MAP[iconName]) {
    iconName = ICON_MAP[iconName];
  }
  
  // Check if the icon exists in MaterialIcons
  const iconExists = iconName in MaterialIcons.glyphMap;
  
  if (!iconExists) {
    console.warn(`Icon "${iconName}" not found in MaterialIcons. Using fallback.`);
    // Use a generic icon as fallback
    iconName = 'help-outline';
  }

  return (
    <MaterialIcons
      color={color}
      size={size}
      name={iconName as keyof typeof MaterialIcons.glyphMap}
      style={style as StyleProp<TextStyle>}
    />
  );
}
