/**
 * Wine & Entree Pairings Editor — extracted from the old Memory Game Editor
 * (s75): the pairings CRUD that feeds the Memory Game's Wine & Entree mode,
 * now one tap from the Game Hub Editor's Setup tab. The user-side visibility
 * switch for the mode lives back on that tab; this page only manages content.
 */

import React, { useCallback, useEffect, useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';
import { IconSymbol } from '@/components/IconSymbol';
import PremiumGate from '@/components/PremiumGate';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import { CATEGORY_VISUALS } from '@/components/game/gameVisuals';
import { fonts } from '@/constants/fonts';

interface WinePairing {
  id: string;
  wine: string;
  entree: string;
  hint: string | null;
  display_order: number;
  is_active: boolean;
}

export default function WinePairingsEditorScreen() {
  useRequireManagerRoute();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { hasPremium } = useSubscription();

  const [pairings, setPairings] = useState<WinePairing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newWine, setNewWine] = useState('');
  const [newEntree, setNewEntree] = useState('');
  const [newHint, setNewHint] = useState('');

  const fetchPairings = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // Manager tool: include inactive pairings so the active/inactive toggle can reactivate them.
    const { data, error } = await supabase.rpc('get_wine_pairings', {
      p_actor_id: user.id,
      p_include_inactive: true,
    });
    if (!error && data) {
      setPairings(data);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchPairings();
  }, [fetchPairings]);

  const handleAdd = async () => {
    if (!user?.id) return;
    if (!newWine.trim() || !newEntree.trim()) {
      Alert.alert(t('common.error'), t('wine_pairings_editor:fields_required'));
      return;
    }
    const { error } = await supabase.rpc('insert_wine_pairing', {
      p_user_id: user.id,
      p_wine: newWine.trim(),
      p_entree: newEntree.trim(),
      p_hint: newHint.trim() || undefined,
    });
    if (error) {
      Alert.alert(t('common.error'), translateServerError(error));
    } else {
      setNewWine('');
      setNewEntree('');
      setNewHint('');
      setShowAddForm(false);
      fetchPairings();
    }
  };

  const handleUpdate = async (pairing: WinePairing) => {
    if (!user?.id) return;
    const { error } = await supabase.rpc('update_wine_pairing', {
      p_user_id: user.id,
      p_pairing_id: pairing.id,
      p_wine: pairing.wine,
      p_entree: pairing.entree,
      p_hint: pairing.hint ?? undefined,
    });
    if (error) {
      Alert.alert(t('common.error'), translateServerError(error));
    } else {
      setEditingId(null);
      fetchPairings();
    }
  };

  const handleDelete = (pairing: WinePairing) => {
    Alert.alert(
      t('common.delete'),
      t('wine_pairings_editor:delete_confirm', { wine: pairing.wine, entree: pairing.entree }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            await supabase.rpc('delete_wine_pairing', { p_user_id: user.id, p_pairing_id: pairing.id });
            fetchPairings();
          },
        },
      ]
    );
  };

  const handleToggleActive = async (pairing: WinePairing) => {
    if (!user?.id) return;
    await supabase.rpc('set_wine_pairing_active', {
      p_user_id: user.id,
      p_pairing_id: pairing.id,
      p_is_active: !pairing.is_active,
    });
    fetchPairings();
  };

  if (!hasPremium) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('memory_game.mode_wine_pairings')} eyebrow={t('game_hub_editor:title')} />
        <PremiumGate
          desc={t('game_hub_ui:premium_intro')}
          bullets={[t('game_hub_ui:premium_b1'), t('game_hub_ui:premium_b2')]}
          footer={t('game_hub_ui:premium_footer')}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AmbientGlow />
      <ScreenHeader title={t('memory_game.mode_wine_pairings')} eyebrow={t('game_hub_editor:title')} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Info — the blurb rides along from the old Memory editor tab */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <IconSymbol ios_icon_name="info.circle.fill" android_material_icon_name="info" size={18} color={colors.tint} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('wine_pairings_editor:info')}
          </Text>
        </View>

        {/* Add button */}
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          onPress={() => setShowAddForm(!showAddForm)}
          activeOpacity={0.75}
        >
          <IconSymbol
            ios_icon_name={showAddForm ? 'xmark' : 'plus'}
            android_material_icon_name={showAddForm ? 'close' : 'add'}
            size={17}
            color={colors.tint}
          />
          <Text style={[styles.addButtonText, { color: colors.text }]}>
            {showAddForm ? t('common.cancel') : t('wine_pairings_editor:add_pairing')}
          </Text>
        </TouchableOpacity>

        {/* Add form */}
        {showAddForm && (
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('wine_pairings_editor:wine_name')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
              value={newWine}
              onChangeText={setNewWine}
              placeholder="e.g. Emblem Cabernet Sauvignon"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('wine_pairings_editor:entree_name')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
              value={newEntree}
              onChangeText={setNewEntree}
              placeholder="e.g. NY Strip"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('wine_pairings_editor:hint_optional')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
              value={newHint}
              onChangeText={setNewHint}
              placeholder="e.g. Bold tannins cut through fat"
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.tint }]} onPress={handleAdd}>
              <Text style={[styles.saveButtonText, { color: colors.fireText }]}>
                {t('wine_pairings_editor:add_pairing')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Pairings list */}
        {loading ? (
          <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 40 }} />
        ) : (
          pairings.map((pairing) => (
            <View
              key={pairing.id}
              style={[
                styles.pairingCard,
                { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, opacity: pairing.is_active ? 1 : 0.5 },
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
                      <View style={[styles.pairingChip, { backgroundColor: CATEGORY_VISUALS.wine.accent + '20' }]}>
                        <Text style={[styles.pairingChipLabel, { color: CATEGORY_VISUALS.wine.accent }]}>
                          {t('wine_pairings_editor:chip_wine')}
                        </Text>
                      </View>
                      <Text style={[styles.pairingText, { color: colors.text }]} numberOfLines={2}>
                        {pairing.wine}
                      </Text>
                    </View>
                    <IconSymbol ios_icon_name="arrow.right" android_material_icon_name="arrow-forward" size={15} color={colors.textSecondary} />
                    <View style={styles.pairingPair}>
                      <View style={[styles.pairingChip, { backgroundColor: CATEGORY_VISUALS.food.accent + '20' }]}>
                        <Text style={[styles.pairingChipLabel, { color: CATEGORY_VISUALS.food.accent }]}>
                          {t('wine_pairings_editor:chip_entree')}
                        </Text>
                      </View>
                      <Text style={[styles.pairingText, { color: colors.text }]} numberOfLines={2}>
                        {pairing.entree}
                      </Text>
                    </View>
                  </View>
                  {pairing.hint && (
                    <Text style={[styles.hintText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {t('wine_pairings_editor:hint_prefix', { hint: pairing.hint })}
                    </Text>
                  )}
                  <View style={styles.pairingActions}>
                    <TouchableOpacity onPress={() => handleToggleActive(pairing)} style={styles.actionButton}>
                      <IconSymbol
                        ios_icon_name={pairing.is_active ? 'eye.fill' : 'eye.slash.fill'}
                        android_material_icon_name={pairing.is_active ? 'visibility' : 'visibility-off'}
                        size={18}
                        color={pairing.is_active ? colors.tint : colors.textSecondary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditingId(pairing.id)} style={styles.actionButton}>
                      <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={18} color={colors.text} />
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
          {pairings.filter((p) => p.is_active).length} {t('wine_pairings_editor:active_pairings')}
        </Text>
      </ScrollView>
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
        style={[styles.input, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
        value={wine}
        onChangeText={setWine}
        placeholder={t('wine_pairings_editor:wine_name')}
        placeholderTextColor={colors.textSecondary}
      />
      <TextInput
        style={[styles.input, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
        value={entree}
        onChangeText={setEntree}
        placeholder={t('wine_pairings_editor:entree_name')}
        placeholderTextColor={colors.textSecondary}
      />
      <TextInput
        style={[styles.input, { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder }]}
        value={hint}
        onChangeText={setHint}
        placeholder={t('wine_pairings_editor:hint_optional')}
        placeholderTextColor={colors.textSecondary}
      />
      <View style={styles.editActions}>
        <TouchableOpacity
          style={[styles.editButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: StyleSheet.hairlineWidth + 0.5 }]}
          onPress={onCancel}
        >
          <Text style={[styles.editButtonText, { color: colors.text }]}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.editButton, { backgroundColor: colors.tint }]}
          onPress={() => onSave({ ...pairing, wine, entree, hint: hint || null })}
        >
          <Text style={[styles.editButtonText, { color: colors.fireText }]}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 60 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 14,
    marginBottom: 12,
  },
  infoText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 12.5, lineHeight: 18 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingVertical: 13,
    marginBottom: 12,
  },
  addButtonText: { fontFamily: fonts.body.semibold, fontSize: 14.5 },
  formCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 14,
    marginBottom: 12,
  },
  formLabel: { fontFamily: fonts.body.semibold, fontSize: 12, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14.5,
    marginBottom: 8,
    fontFamily: fonts.body.regular,
  },
  saveButton: {
    borderRadius: 11,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: { fontFamily: fonts.body.semibold, fontSize: 14.5 },
  pairingCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 13,
    marginBottom: 10,
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
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 4,
  },
  pairingChipLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  pairingText: { fontFamily: fonts.body.semibold, fontSize: 13.5 },
  hintText: { fontFamily: fonts.body.regular, fontSize: 11.5, fontStyle: 'italic', marginTop: 6 },
  pairingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 4,
  },
  actionButton: { padding: 8 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  editButton: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editButtonText: { fontFamily: fonts.body.semibold, fontSize: 14 },
  countText: {
    textAlign: 'center',
    fontFamily: fonts.mono.semibold,
    fontSize: 11.5,
    marginTop: 10,
  },
});
