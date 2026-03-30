/**
 * Game Hub
 * Player-facing hub screen with cards for Memory Game and Word Search.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';

interface GameCard {
  title: string;
  description: string;
  iosIcon: string;
  androidIcon: string;
  route: string;
  color: string;
}

const GAME_CARDS: GameCard[] = [
  {
    title: 'Menu Memory Game',
    description: 'Match wine pairings, ingredients & dishes, and cocktails across multiple difficulty levels',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    route: '/menu-memory-game',
    color: '#6366F1',
  },
  {
    title: 'Word Search',
    description: 'Find hidden menu items, ingredients, and specials in word search puzzles',
    iosIcon: 'textformat.abc',
    androidIcon: 'spellcheck',
    route: '/word-search-game',
    color: '#10B981',
  },
];

export default function GameHubScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="chevron-left"
            size={22}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Game Hub</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Test your knowledge of the menu with fun, interactive games.
        </Text>

        {GAME_CARDS.map((card) => (
          <TouchableOpacity
            key={card.route}
            style={[styles.card, { backgroundColor: colors.card }]}
            onPress={() => router.push(card.route as any)}
            activeOpacity={0.75}
          >
            <View style={[styles.iconContainer, { backgroundColor: card.color + '18' }]}>
              <IconSymbol
                ios_icon_name={card.iosIcon as any}
                android_material_icon_name={card.androidIcon as any}
                size={30}
                color={card.color}
              />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{card.title}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{card.description}</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        ))}

        {/* Leaderboard Card */}
        <TouchableOpacity
          style={[styles.leaderboardCard, { backgroundColor: colors.card }]}
          onPress={() => router.push('/master-leaderboard')}
          activeOpacity={0.75}
        >
          <View style={[styles.iconContainer, { backgroundColor: '#F59E0B18' }]}>
            <Text style={styles.trophyIcon}>🏆</Text>
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Leaderboard</Text>
            <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>See who's on top across all games</Text>
          </View>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={18}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    boxShadow: '0px 2px 10px rgba(0,0,0,0.12)',
    elevation: 3,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardDesc: { fontSize: 12, lineHeight: 17 },
  leaderboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginTop: 6,
    boxShadow: '0px 2px 10px rgba(0,0,0,0.12)',
    elevation: 3,
  },
  trophyIcon: {
    fontSize: 28,
  },
});
