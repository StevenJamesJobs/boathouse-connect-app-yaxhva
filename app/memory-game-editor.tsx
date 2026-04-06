import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { supabase } from '@/app/integrations/supabase/client';
import { PlayMode } from '@/types/game';

interface WinePairing {
  id: string;
  wine: string;
  entree: string;
  hint: string | null;
  display_order: number;
  is_active: boolean;
}

type ScoreFilter = 'all' | PlayMode;

export default function MemoryGameEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [activeTab, setActiveTab] = useState<'pairings' | 'scoreboard'>('pairings');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [pairings, setPairings] = useState<WinePairing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newWine, setNewWine] = useState('');
  const [newEntree, setNewEntree] = useState('');
  const [newHint, setNewHint] = useState('');

  const fetchPairings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('wine_pairings' as any)
      .select('*')
      .order('display_order');
    if (!error && data) {
      setPairings(data as any[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPairings();
  }, [fetchPairings]);

  const handleAdd = async () => {
    if (!newWine.trim() || !newEntree.trim()) {
      Alert.alert(t('common.error'), t('memory_game_editor.fields_required'));
      return;
    }
    const nextOrder = pairings.length > 0 ? Math.max(...pairings.map(p => p.display_order)) + 1 : 1;
    const { error } = await (supabase.from('wine_pairings' as any) as any)
      .insert({
        wine: newWine.trim(),
        entree: newEntree.trim(),
        hint: newHint.trim() || null,
        display_order: nextOrder,
      });
    if (error) {
      Alert.alert(t('common.error'), error.message);
    } else {
      setNewWine('');
      setNewEntree('');
      setNewHint('');
      setShowAddForm(false);
      fetchPairings();
    }
  };

  const handleUpdate = async (pairing: WinePairing) => {
    const { error } = await (supabase.from('wine_pairings' as any) as any)
      .update({
        wine: pairing.wine,
        entree: pairing.entree,
        hint: pairing.hint,
      })
      .eq('id', pairing.id);
    if (error) {
      Alert.alert(t('common.error'), error.message);
    } else {
      setEditingId(null);
      fetchPairings();
    }
  };

  const handleDelete = (pairing: WinePairing) => {
    Alert.alert(
      t('common.delete'),
      t('memory_game_editor.delete_confirm', { wine: pairing.wine, entree: pairing.entree }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await supabase.from('wine_pairings' as any).delete().eq('id', pairing.id);
            fetchPairings();
          },
        },
      ]
    );
  };

  const handleToggleActive = async (pairing: WinePairing) => {
    await (supabase.from('wine_pairings' as any) as any)
      .update({ is_active: !pairing.is_active })
      .eq('id', pairing.id);
    fetchPairings();
  };

  const handleResetScoreboard = (mode?: string) => {
    const playModeFilter = scoreFilter !== 'all' ? scoreFilter : undefined;
    const filterLabel = playModeFilter
      ? ` (${playModeFilter === 'lives' ? t('memory_game.lives_mode') : t('memory_game.timed_mode')})`
      : '';
    const title = mode
      ? t('memory_game.reset_scores_mode') + filterLabel
      : t('memory_game.reset_scores');
    const message = t('memory_game.reset_scores_confirm');

    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: mode ? t('memory_game.reset_scores_mode') : t('memory_game.reset_scores_all'),
        style: 'destructive',
        onPress: async () => {
          try {
            await (supabase.rpc as any)('reset_game_scores', {
              p_game_mode: mode || null,
              p_play_mode: playModeFilter || null,
            });
            Alert.alert('', t('memory_game.reset_success'));
          } catch (e) {
            console.error('Error resetting scores:', e);
          }
        },
      },
    ]);
  };

  const renderPairingsTab = () => (
    <>
      {/* Info Card */}
      <View style={[styles.infoCard, { backgroundColor: colors.primary + '15' }]}>
        <IconSymbol ios_icon_name="info.circle.fill" android_material_icon_name="info" size={20} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.text }]}>
          {t('memory_game_editor.pairings_info')}
        </Text>
      </View>

      {/* Add Button */}
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: colors.highlight }]}
        onPress={() => setShowAddForm(!showAddForm)}
      >
        <IconSymbol
          ios_icon_name={showAddForm ? 'xmark' : 'plus'}
          android_material_icon_name={showAddForm ? 'close' : 'add'}
          size={20}
          color="#FFF"
        />
        <Text style={styles.addButtonText}>
          {showAddForm ? t('common.cancel') : t('memory_game_editor.add_pairing')}
        </Text>
      </TouchableOpacity>

      {/* Add Form */}
      {showAddForm && (
        <View style={[styles.formCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('memory_game_editor.wine_name')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            value={newWine}
            onChangeText={setNewWine}
            placeholder="e.g. Emblem Cabernet Sauvignon"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('memory_game_editor.entree_name')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            value={newEntree}
            onChangeText={setNewEntree}
            placeholder="e.g. NY Strip"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('memory_game_editor.hint_optional')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            value={newHint}
            onChangeText={setNewHint}
            placeholder="e.g. Bold tannins cut through fat"
            placeholderTextColor={colors.textSecondary}
          />
          <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.highlight }]} onPress={handleAdd}>
            <Text style={styles.saveButtonText}>{t('memory_game_editor.add_pairing')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pairings List */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        pairings.map((pairing) => (
          <View
            key={pairing.id}
            style={[
              styles.pairingCard,
              { backgroundColor: colors.card, opacity: pairing.is_active ? 1 : 0.5 },
            ]}
          >
            {editingId === pairing.id ? (
              <EditPairingForm
                pairing={pairing}
                colors={colors}
                t={t}
                onSave={handleUpdate}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <View style={styles.pairingContent}>
                  <View style={styles.pairingPair}>
                    <View style={[styles.pairingChip, { backgroundColor: '#8B0000' + '20' }]}>
                      <Text style={[styles.pairingChipLabel, { color: '#8B0000' }]}>Wine</Text>
                    </View>
                    <Text style={[styles.pairingText, { color: colors.text }]} numberOfLines={2}>
                      {pairing.wine}
                    </Text>
                  </View>
                  <IconSymbol ios_icon_name="arrow.right" android_material_icon_name="arrow-forward" size={16} color={colors.textSecondary} />
                  <View style={styles.pairingPair}>
                    <View style={[styles.pairingChip, { backgroundColor: colors.highlight + '20' }]}>
                      <Text style={[styles.pairingChipLabel, { color: colors.highlight }]}>Entree</Text>
                    </View>
                    <Text style={[styles.pairingText, { color: colors.text }]} numberOfLines={2}>
                      {pairing.entree}
                    </Text>
                  </View>
                </View>
                {pairing.hint && (
                  <Text style={[styles.hintText, { color: colors.textSecondary }]} numberOfLines={1}>
                    Hint: {pairing.hint}
                  </Text>
                )}
                <View style={styles.pairingActions}>
                  <TouchableOpacity onPress={() => handleToggleActive(pairing)} style={styles.actionButton}>
                    <IconSymbol
                      ios_icon_name={pairing.is_active ? 'eye.fill' : 'eye.slash.fill'}
                      android_material_icon_name={pairing.is_active ? 'visibility' : 'visibility-off'}
                      size={18}
                      color={pairing.is_active ? colors.highlight : colors.textSecondary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingId(pairing.id)} style={styles.actionButton}>
                    <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(pairing)} style={styles.actionButton}>
                    <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={18} color="#E74C3C" />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        ))
      )}

      <Text style={[styles.countText, { color: colors.textSecondary }]}>
        {pairings.filter(p => p.is_active).length} {t('memory_game_editor.active_pairings')}
      </Text>
    </>
  );

  const scoreFilters: { key: ScoreFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'lives', label: '❤️ ' + t('memory_game.lives_mode') },
    { key: 'timed', label: '⏱ ' + t('memory_game.timed_mode') },
  ];

  const renderScoreboardTab = () => (
    <>
      <View style={[styles.infoCard, { backgroundColor: '#E74C3C' + '15' }]}>
        <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={20} color="#E74C3C" />
        <Text style={[styles.infoText, { color: colors.text }]}>
          {t('memory_game_editor.scoreboard_info')}
        </Text>
      </View>

      {/* Score Filter Toggle */}
      <View style={[styles.scoreFilterContainer, { backgroundColor: colors.card }]}>
        {scoreFilters.map(sf => (
          <TouchableOpacity
            key={sf.key}
            style={[
              styles.scoreFilterTab,
              scoreFilter === sf.key && { backgroundColor: colors.primary, borderRadius: 8 },
            ]}
            onPress={() => setScoreFilter(sf.key)}
          >
            <Text
              style={[
                styles.scoreFilterText,
                { color: colors.textSecondary },
                scoreFilter === sf.key && { color: '#fff', fontWeight: '700' },
              ]}
            >
              {sf.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Reset by mode */}
      {[
        { mode: 'wine_pairings', label: t('memory_game.mode_wine_pairings'), icon: 'wineglass.fill', androidIcon: 'wine-bar' },
        { mode: 'ingredients_dishes', label: t('memory_game.mode_ingredients_dishes'), icon: 'fork.knife', androidIcon: 'restaurant' },
        { mode: 'cocktail_ingredients', label: t('memory_game.mode_cocktail_ingredients'), icon: 'cup.and.saucer.fill', androidIcon: 'local-bar' },
      ].map((item) => (
        <TouchableOpacity
          key={item.mode}
          style={[styles.scoreboardCard, { backgroundColor: colors.card }]}
          onPress={() => handleResetScoreboard(item.mode)}
        >
          <View style={styles.scoreboardContent}>
            <IconSymbol ios_icon_name={item.icon as any} android_material_icon_name={item.androidIcon as any} size={24} color={colors.primary} />
            <View style={styles.scoreboardText}>
              <Text style={[styles.scoreboardTitle, { color: colors.text }]}>{item.label}</Text>
              <Text style={[styles.scoreboardDesc, { color: colors.textSecondary }]}>
                {t('memory_game_editor.reset_mode_desc')}
              </Text>
            </View>
            <IconSymbol ios_icon_name="arrow.counterclockwise" android_material_icon_name="refresh" size={20} color="#E74C3C" />
          </View>
        </TouchableOpacity>
      ))}

      {/* Reset All */}
      <TouchableOpacity
        style={[styles.resetAllButton, { borderColor: '#E74C3C' }]}
        onPress={() => handleResetScoreboard()}
      >
        <IconSymbol ios_icon_name="trash.fill" android_material_icon_name="delete-forever" size={22} color="#E74C3C" />
        <Text style={[styles.resetAllText, { color: '#E74C3C' }]}>
          {t('memory_game.reset_scores_all')}
        </Text>
      </TouchableOpacity>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('memory_game_editor.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tab Selector */}
      <View style={styles.tabWrapper}>
        <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pairings' && { backgroundColor: colors.highlight }]}
            onPress={() => setActiveTab('pairings')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'pairings' && { color: colors.text }]}>
              {t('memory_game_editor.tab_wine_pairings')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'scoreboard' && { backgroundColor: colors.highlight }]}
            onPress={() => setActiveTab('scoreboard')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'scoreboard' && { color: colors.text }]}>
              {t('memory_game.scoreboard_management')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {activeTab === 'pairings' ? renderPairingsTab() : renderScoreboardTab()}
      </ScrollView>
      <BottomNavBar activeTab="manage" />
    </KeyboardAvoidingView>
  );
}

// Inline edit form for a pairing
function EditPairingForm({
  pairing,
  colors,
  t,
  onSave,
  onCancel,
}: {
  pairing: WinePairing;
  colors: any;
  t: any;
  onSave: (p: WinePairing) => void;
  onCancel: () => void;
}) {
  const [wine, setWine] = useState(pairing.wine);
  const [entree, setEntree] = useState(pairing.entree);
  const [hint, setHint] = useState(pairing.hint || '');

  return (
    <View>
      <TextInput
        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
        value={wine}
        onChangeText={setWine}
        placeholder={t('memory_game_editor.wine_name')}
        placeholderTextColor={colors.textSecondary}
      />
      <TextInput
        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
        value={entree}
        onChangeText={setEntree}
        placeholder={t('memory_game_editor.entree_name')}
        placeholderTextColor={colors.textSecondary}
      />
      <TextInput
        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
        value={hint}
        onChangeText={setHint}
        placeholder={t('memory_game_editor.hint_optional')}
        placeholderTextColor={colors.textSecondary}
      />
      <View style={styles.editActions}>
        <TouchableOpacity style={[styles.editButton, { backgroundColor: colors.textSecondary + '30' }]} onPress={onCancel}>
          <Text style={[styles.editButtonText, { color: colors.text }]}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.editButton, { backgroundColor: colors.highlight }]}
          onPress={() => onSave({ ...pairing, wine, entree, hint: hint || null })}
        >
          <Text style={styles.editButtonTextWhite}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>
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
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  placeholder: { width: 40 },
  tabWrapper: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  contentContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 16,
    gap: 8,
  },
  addButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  formCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  formLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 8,
  },
  saveButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  pairingCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  pairingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pairingPair: { flex: 1 },
  pairingChip: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 4,
  },
  pairingChipLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  pairingText: { fontSize: 14, fontWeight: '600' },
  hintText: { fontSize: 12, fontStyle: 'italic', marginTop: 6 },
  pairingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 4,
  },
  actionButton: { padding: 8 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  editButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editButtonText: { fontSize: 15, fontWeight: '600' },
  editButtonTextWhite: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  countText: { textAlign: 'center', fontSize: 13, marginTop: 12, fontStyle: 'italic' },
  scoreboardCard: {
    borderRadius: 12,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  scoreboardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  scoreboardText: { flex: 1 },
  scoreboardTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  scoreboardDesc: { fontSize: 12 },
  resetAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 16,
    gap: 10,
  },
  resetAllText: { fontSize: 16, fontWeight: '700' },
  scoreFilterContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  scoreFilterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  scoreFilterText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
