/**
 * Game Hub Editor
 * Manager landing screen linking to Memory Game Editor and Word Search Editor.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

interface EditorCard {
  title: string;
  description: string;
  iosIcon: string;
  androidIcon: string;
  route: string;
  color: string;
}

const EDITOR_CARDS: EditorCard[] = [
  {
    title: 'Menu Memory Game Editor',
    description: 'Manage wine pairings, game content, and reset leaderboards',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    route: '/memory-game-editor',
    color: '#6366F1',
  },
  {
    title: 'Word Search Editor',
    description: 'Reset word search leaderboards by category or all at once',
    iosIcon: 'textformat.abc',
    androidIcon: 'spellcheck',
    route: '/word-search-editor',
    color: '#10B981',
  },
];

export default function GameHubEditorScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const [resettingAll, setResettingAll] = useState(false);

  const handleResetAllScores = () => {
    Alert.alert(
      '⚠️ Reset ALL Game Scores',
      'This will permanently delete every score for both Menu Memory Game and Word Search across all players. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            setResettingAll(true);
            try {
              // Delete all memory game scores
              const { error: memoryError } = await supabase
                .from('game_scores')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');
              // Delete all word search scores
              const { error: wsError } = await supabase
                .from('word_search_scores')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');

              if (memoryError || wsError) {
                Alert.alert('Error', 'Failed to reset some scores. Try again.');
              } else {
                Alert.alert('✅ Done', 'All game scores have been reset.');
              }
            } catch {
              Alert.alert('Error', 'Something went wrong. Try again.');
            } finally {
              setResettingAll(false);
            }
          },
        },
      ]
    );
  };

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>🎮 Game Hub Editor</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Manage game content and leaderboards for all staff games.
        </Text>

        {EDITOR_CARDS.map((card) => (
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

        {/* Reset All Scores */}
        <View style={[styles.resetSection, { borderTopColor: colors.border }]}>
          <Text style={[styles.resetSectionTitle, { color: colors.text }]}>⚠️ Danger Zone</Text>
          <Text style={[styles.resetSectionDesc, { color: colors.textSecondary }]}>
            Reset all scores across both games for every player.
          </Text>
          <TouchableOpacity
            style={[styles.resetAllBtn, resettingAll && { opacity: 0.6 }]}
            onPress={handleResetAllScores}
            disabled={resettingAll}
          >
            {resettingAll ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.resetAllBtnText}>Reset All Game Scores</Text>
            )}
          </TouchableOpacity>
        </View>
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
  resetSection: {
    marginTop: 10,
    paddingTop: 20,
    borderTopWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  resetSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  resetSectionDesc: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 4,
  },
  resetAllBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  resetAllBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
