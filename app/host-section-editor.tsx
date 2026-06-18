import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { uploadImageToBucket } from '@/utils/contentImages';
import CollapsibleSection from '@/components/CollapsibleSection';

const BUCKET = 'host-section-images';
const readB64 = (u: string) => FileSystem.readAsStringAsync(u, { encoding: FileSystem.EncodingType.Base64 });

interface Tile {
  id: string;
  title: string | null;
  image_url: string | null;
  image_shape: string;
  system_asset_key: string | null;
  link_url: string | null;
  link_description: string | null;
  display_order: number;
}

const SYSTEM_ASSETS: Record<string, any> = {
  opentable_beginner: require('@/assets/images/3fa03e2f-c4a8-41ca-95f3-e6a6692717a5.png'),
  opentable_intermediate: require('@/assets/images/8dc10702-2661-4729-958f-49df486b683a.png'),
  opentable_advanced: require('@/assets/images/397f7fca-5dec-495b-a06f-16f020c5873c.png'),
};

export default function HostSectionEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const colors = useThemeColors();
  const styles = createStyles(colors);

  const isNew = !id || id === 'new';
  const [sectionId, setSectionId] = useState<string | null>(isNew ? null : (id as string));
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Section form
  const [title, setTitle] = useState('');
  const [cardSubtitle, setCardSubtitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(null);
  const [cardImageShape, setCardImageShape] = useState<'square' | 'banner'>('square');
  const [icon, setIcon] = useState<string | null>(null);
  const [localCardUri, setLocalCardUri] = useState<string | null>(null);

  // Tiles
  const [tiles, setTiles] = useState<Tile[]>([]);

  // Tile modal
  const [tileModalVisible, setTileModalVisible] = useState(false);
  const [editingTile, setEditingTile] = useState<Tile | null>(null);
  const [tTitle, setTTitle] = useState('');
  const [tImageUrl, setTImageUrl] = useState<string | null>(null);
  const [tImageShape, setTImageShape] = useState<'square' | 'banner'>('banner');
  const [tLinkUrl, setTLinkUrl] = useState('');
  const [tLinkDesc, setTLinkDesc] = useState('');
  const [tLocalUri, setTLocalUri] = useState<string | null>(null);
  const [tSystemAsset, setTSystemAsset] = useState<string | null>(null);
  const [savingTile, setSavingTile] = useState(false);

  const loadTiles = useCallback(async (sid: string) => {
    const { data } = await (supabase
      .from('host_section_tiles' as any)
      .select('*')
      .eq('section_id', sid)
      .order('display_order', { ascending: true }) as any);
    setTiles((data as Tile[]) || []);
  }, []);

  const load = useCallback(async () => {
    if (isNew || !id) return;
    try {
      setLoading(true);
      const { data: s } = await (supabase.from('host_sections' as any).select('*').eq('id', id).single() as any);
      if (s) {
        setTitle(s.title || '');
        setCardSubtitle(s.card_subtitle || '');
        setInstructions(s.instructions || '');
        setCardImageUrl(s.card_image_url || null);
        setCardImageShape(s.card_image_shape === 'banner' ? 'banner' : 'square');
        setIcon(s.icon || null);
      }
      await loadTiles(id as string);
    } catch (e) {
      console.error('Error loading section:', e);
    } finally {
      setLoading(false);
    }
  }, [id, isNew, loadTiles]);

  useEffect(() => { load(); }, [load]);

  const pickImage = async (shape: 'square' | 'banner', onPicked: (uri: string) => void) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: shape === 'square' ? [1, 1] : [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) onPicked(result.assets[0].uri);
  };

  const saveSection = async () => {
    if (!title.trim()) { Alert.alert('Title required', 'Please enter a section title.'); return; }
    if (!user?.id || !organizationId) return;
    try {
      setSaving(true);
      let cardUrl = cardImageUrl;
      if (localCardUri) {
        const uploaded = await uploadImageToBucket(localCardUri, BUCKET, readB64);
        if (uploaded) cardUrl = uploaded;
      }
      if (sectionId) {
        const { error } = await supabase.rpc('update_host_section' as any, {
          p_actor_id: user.id, p_section_id: sectionId, p_title: title.trim(),
          p_card_subtitle: cardSubtitle.trim() || null, p_instructions: instructions.trim() || null,
          p_card_image_url: cardUrl || null, p_card_image_shape: cardImageShape, p_icon: icon || null,
          p_is_active: null,
        });
        if (error) throw error;
        setCardImageUrl(cardUrl || null);
        setLocalCardUri(null);
        Alert.alert('Saved', 'Section updated.');
      } else {
        const { data, error } = await supabase.rpc('create_host_section' as any, {
          p_actor_id: user.id, p_org_id: organizationId, p_title: title.trim(),
          p_card_subtitle: cardSubtitle.trim() || null, p_instructions: instructions.trim() || null,
          p_card_image_url: cardUrl || null, p_card_image_shape: cardImageShape, p_icon: icon || null,
        });
        if (error) throw error;
        setSectionId(data as string);
        setCardImageUrl(cardUrl || null);
        setLocalCardUri(null);
        Alert.alert('Created', 'Section created — you can now add tiles below.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save section.');
    } finally {
      setSaving(false);
    }
  };

  // ── Tile modal helpers ──
  const openAddTile = () => {
    setEditingTile(null);
    setTTitle(''); setTImageUrl(null); setTImageShape('banner');
    setTLinkUrl(''); setTLinkDesc(''); setTLocalUri(null); setTSystemAsset(null);
    setTileModalVisible(true);
  };
  const openEditTile = (tile: Tile) => {
    setEditingTile(tile);
    setTTitle(tile.title || ''); setTImageUrl(tile.image_url || null);
    setTImageShape(tile.image_shape === 'square' ? 'square' : 'banner');
    setTLinkUrl(tile.link_url || ''); setTLinkDesc(tile.link_description || '');
    setTLocalUri(null); setTSystemAsset(tile.system_asset_key || null);
    setTileModalVisible(true);
  };

  const saveTile = async () => {
    if (!user?.id || !sectionId) return;
    try {
      setSavingTile(true);
      let imgUrl = tImageUrl;
      if (tLocalUri) {
        const uploaded = await uploadImageToBucket(tLocalUri, BUCKET, readB64);
        if (uploaded) imgUrl = uploaded;
      }
      if (editingTile) {
        const { error } = await supabase.rpc('update_host_section_tile' as any, {
          p_actor_id: user.id, p_tile_id: editingTile.id, p_title: tTitle.trim() || null,
          p_image_url: imgUrl || null, p_image_shape: tImageShape,
          p_link_url: tLinkUrl.trim() || null, p_link_description: tLinkDesc.trim() || null,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('create_host_section_tile' as any, {
          p_actor_id: user.id, p_section_id: sectionId, p_title: tTitle.trim() || null,
          p_image_url: imgUrl || null, p_image_shape: tImageShape,
          p_link_url: tLinkUrl.trim() || null, p_link_description: tLinkDesc.trim() || null,
        });
        if (error) throw error;
      }
      setTileModalVisible(false);
      await loadTiles(sectionId);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save tile.');
    } finally {
      setSavingTile(false);
    }
  };

  const moveTile = async (index: number, dir: -1 | 1) => {
    if (!user?.id || !sectionId) return;
    const next = index + dir;
    if (next < 0 || next >= tiles.length) return;
    const reordered = [...tiles];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(next, 0, moved);
    setTiles(reordered);
    await supabase.rpc('reorder_host_section_tiles' as any, {
      p_actor_id: user.id, p_section_id: sectionId, p_ordered_ids: reordered.map((t) => t.id),
    });
  };

  const deleteTile = (tile: Tile) => {
    Alert.alert('Delete tile', 'Remove this tile?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          if (!user?.id || !sectionId) return;
          await supabase.rpc('delete_host_section_tile' as any, { p_actor_id: user.id, p_tile_id: tile.id });
          await loadTiles(sectionId);
        },
      },
    ]);
  };

  const tileActions = (tile: Tile, index: number) => {
    const opts = ['Edit', index > 0 ? 'Move Up' : null, index < tiles.length - 1 ? 'Move Down' : null, 'Delete', 'Cancel'].filter(Boolean) as string[];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: opts, destructiveButtonIndex: opts.indexOf('Delete'), cancelButtonIndex: opts.indexOf('Cancel') },
        (i) => {
          const choice = opts[i];
          if (choice === 'Edit') openEditTile(tile);
          else if (choice === 'Move Up') moveTile(index, -1);
          else if (choice === 'Move Down') moveTile(index, 1);
          else if (choice === 'Delete') deleteTile(tile);
        }
      );
    } else {
      Alert.alert(tile.title || 'Tile', undefined, [
        { text: 'Edit', onPress: () => openEditTile(tile) },
        ...(index > 0 ? [{ text: 'Move Up', onPress: () => moveTile(index, -1) }] : []),
        ...(index < tiles.length - 1 ? [{ text: 'Move Down', onPress: () => moveTile(index, 1) }] : []),
        { text: 'Delete', style: 'destructive' as const, onPress: () => deleteTile(tile) },
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  const tileThumb = (tile: Tile) => {
    if (tile.image_url) return { uri: tile.image_url };
    if (tile.system_asset_key && SYSTEM_ASSETS[tile.system_asset_key]) return SYSTEM_ASSETS[tile.system_asset_key];
    return null;
  };

  const ShapeToggle = ({ value, onChange }: { value: 'square' | 'banner'; onChange: (v: 'square' | 'banner') => void }) => (
    <View style={styles.shapeRow}>
      {(['square', 'banner'] as const).map((s) => (
        <TouchableOpacity
          key={s}
          style={[styles.shapeBtn, value === s && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          onPress={() => onChange(s)}
        >
          <Text style={[styles.shapeText, { color: value === s ? '#fff' : colors.text }]}>
            {s === 'square' ? 'Square' : 'Banner'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isNew && !sectionId ? 'New Section' : 'Edit Section'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Section details */}
        <CollapsibleSection title="Section Details" defaultExpanded iconIos="rectangle.stack.fill" iconAndroid="dashboard" iconColor={colors.primary} headerBackgroundColor={colors.card} headerTextColor={colors.text}>
          <Text style={styles.label}>Title *</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Resy Academy" placeholderTextColor={colors.textSecondary} />

          <Text style={styles.label}>Card Subtitle</Text>
          <TextInput style={styles.input} value={cardSubtitle} onChangeText={setCardSubtitle} placeholder="Short description shown on the card" placeholderTextColor={colors.textSecondary} />

          <Text style={styles.label}>Instructions (shown under “Hello, Name!”)</Text>
          <Text style={styles.hint}>One line per bullet point.</Text>
          <TextInput style={[styles.input, styles.multiline]} value={instructions} onChangeText={setInstructions} placeholder={'Log in to your account...\nComplete each course...'} placeholderTextColor={colors.textSecondary} multiline />

          <Text style={styles.label}>Card Image (optional)</Text>
          <ShapeToggle value={cardImageShape} onChange={setCardImageShape} />
          <TouchableOpacity style={styles.imagePick} onPress={() => pickImage(cardImageShape, setLocalCardUri)}>
            {localCardUri || cardImageUrl ? (
              <Image source={{ uri: localCardUri || cardImageUrl || '' }} style={cardImageShape === 'square' ? styles.thumbSquare : styles.thumbBanner} resizeMode="cover" />
            ) : (
              <View style={[styles.imagePlaceholder, cardImageShape === 'square' ? styles.thumbSquare : styles.thumbBanner]}>
                <IconSymbol ios_icon_name="photo.fill" android_material_icon_name="image" size={28} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>Add image</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={saveSection} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{sectionId ? 'Save Section' : 'Create Section'}</Text>}
          </TouchableOpacity>
        </CollapsibleSection>

        {/* Tiles */}
        {sectionId ? (
          <View style={styles.tilesCard}>
            <View style={styles.tilesHeader}>
              <Text style={styles.tilesTitle}>Tiles</Text>
              <TouchableOpacity style={styles.addTileBtn} onPress={openAddTile}>
                <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={18} color="#fff" />
                <Text style={styles.addTileText}>Add Tile</Text>
              </TouchableOpacity>
            </View>

            {tiles.length === 0 ? (
              <Text style={styles.hint}>No tiles yet. Add a tile that links to a website or app.</Text>
            ) : (
              tiles.map((tile, index) => {
                const src = tileThumb(tile);
                return (
                  <View key={tile.id} style={styles.tileRow}>
                    {src ? (
                      <Image source={src} style={styles.tileRowThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.tileRowThumb, styles.imagePlaceholderSmall]}>
                        <IconSymbol ios_icon_name="link" android_material_icon_name="link" size={18} color={colors.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tileRowTitle} numberOfLines={1}>{tile.title || '(untitled tile)'}</Text>
                      <Text style={styles.tileRowUrl} numberOfLines={1}>{tile.link_url || 'no link'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => tileActions(tile, index)} style={styles.meatball}>
                      <IconSymbol ios_icon_name="ellipsis" android_material_icon_name="more-horiz" size={20} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <Text style={[styles.hint, { paddingHorizontal: 20 }]}>Save the section first to add tiles.</Text>
        )}
      </ScrollView>

      {/* Tile add/edit modal */}
      <Modal visible={tileModalVisible} transparent animationType="slide" onRequestClose={() => setTileModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingTile ? 'Edit Tile' : 'Add Tile'}</Text>
              <TouchableOpacity onPress={() => setTileModalVisible(false)}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={28} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Title</Text>
              <TextInput style={styles.input} value={tTitle} onChangeText={setTTitle} placeholder="e.g. Beginner Course" placeholderTextColor={colors.textSecondary} />

              <Text style={styles.label}>Image</Text>
              <ShapeToggle value={tImageShape} onChange={setTImageShape} />
              <TouchableOpacity style={styles.imagePick} onPress={() => pickImage(tImageShape, (u) => { setTLocalUri(u); setTSystemAsset(null); })}>
                {tLocalUri || tImageUrl || (tSystemAsset && SYSTEM_ASSETS[tSystemAsset]) ? (
                  <Image
                    source={tLocalUri || tImageUrl ? { uri: tLocalUri || tImageUrl || '' } : SYSTEM_ASSETS[tSystemAsset || '']}
                    style={tImageShape === 'square' ? styles.thumbSquare : styles.thumbBanner}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.imagePlaceholder, tImageShape === 'square' ? styles.thumbSquare : styles.thumbBanner]}>
                    <IconSymbol ios_icon_name="photo.fill" android_material_icon_name="image" size={28} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>Add image</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.label}>Link URL</Text>
              <TextInput style={styles.input} value={tLinkUrl} onChangeText={setTLinkUrl} placeholder="https://..." placeholderTextColor={colors.textSecondary} autoCapitalize="none" keyboardType="url" />

              <Text style={styles.label}>Confirmation message (optional)</Text>
              <Text style={styles.hint}>Shown in a popup before the link opens.</Text>
              <TextInput style={[styles.input, styles.multiline]} value={tLinkDesc} onChangeText={setTLinkDesc} placeholder="You're about to leave the app and open..." placeholderTextColor={colors.textSecondary} multiline />

              <TouchableOpacity style={[styles.saveButton, savingTile && { opacity: 0.6 }]} onPress={saveTile} disabled={savingTile}>
                {savingTile ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{editingTile ? 'Save Tile' : 'Add Tile'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12,
    backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  scrollContent: { padding: 16, paddingBottom: 80 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 14, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  shapeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  shapeBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  shapeText: { fontSize: 14, fontWeight: '600' },
  imagePick: { marginTop: 4 },
  thumbSquare: { width: 100, height: 100, borderRadius: 10 },
  thumbBanner: { width: '100%', height: 140, borderRadius: 10 },
  imagePlaceholder: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: 10,
    backgroundColor: colors.card,
  },
  imagePlaceholderSmall: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '15' },
  imagePlaceholderSmallText: {},
  saveButton: {
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  tilesCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 16, marginTop: 16,
    boxShadow: '0px 2px 8px rgba(0,0,0,0.1)', elevation: 3,
  },
  tilesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  tilesTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  addTileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  addTileText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  tileRowThumb: { width: 48, height: 48, borderRadius: 8 },
  tileRowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  tileRowUrl: { fontSize: 12, color: colors.textSecondary },
  meatball: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text },
});
