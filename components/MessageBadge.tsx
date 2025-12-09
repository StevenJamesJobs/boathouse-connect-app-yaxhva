
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface MessageBadgeProps {
  count: number;
  size?: 'small' | 'medium' | 'large';
}

export function MessageBadge({ count, size = 'medium' }: MessageBadgeProps) {
  if (count === 0) return null;

  const sizeStyles = {
    small: { minWidth: 16, height: 16, borderRadius: 8 },
    medium: { minWidth: 20, height: 20, borderRadius: 10 },
    large: { minWidth: 24, height: 24, borderRadius: 12 },
  };

  const textSizeStyles = {
    small: { fontSize: 10 },
    medium: { fontSize: 12 },
    large: { fontSize: 14 },
  };

  return (
    <View style={[styles.badge, sizeStyles[size]]}>
      <Text style={[styles.badgeText, textSizeStyles[size]]}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#E74C3C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
