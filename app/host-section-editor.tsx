import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { brokerUploadImage, brokerUploadFile } from '@/utils/storageBroker';
import { getLocalizedField, saveTranslations } from '@/utils/translateContent';
import { useTranslationSection } from '@/components/TranslationSection';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassSheet from '@/components/GlassSheet';
import GlassActionSheet from '@/components/GlassActionSheet';
import { StorageImage } from '@/components/StorageImage';
import { translateServerError } from '@/utils/serverErrors';
import { fonts } from '@/constants/fonts';

// s74 rebuild (Steve's notes): compact add/edit-modal layout (thumb drop zone
// top-left, fields to the right), ES/EN translation on the section form AND the
// tile modal, tiles that can attach an uploaded file of any type or one already
// in Guides & Training (stored as the file's storage URL in link_url — the
// viewer detects it and opens via a signed read), Save at the bottom plus a
// belt-and-suspenders Save chip in the header.

interface Tile {
  id: string;
  title: string | null;
  title_es: string | null;
  image_url: string | null;
  image_shape: string;
  system_asset_key: string | null;
  link_url: string | null;
  file_url: string | null;
  link_description: string | null;
  link_description_es: string | null;
  display_order: number;
}

interface GuidePick {
  id: string;
  title: string;
  title_es: string | null;
  file_name: string;
  file_url: string;
}

// The tile's attachment slot: a freshly picked local file, a Guides & Training
// file, or the file already saved on the tile (file_url). Independent of the
// web link since s74b — a tile may carry both, and the viewer offers a choice.
type TileFile =
  | { kind: 'local'; uri: string; name: string; type: string }
  | { kind: 'guide'; url: string; name: string }
  | { kind: 'existing'; url: string; name: string };

const SYSTEM_ASSETS: Record<string, any> = {
  opentable_beginner: require('@/assets/images/3fa03e2f-c4a8-41ca-95f3-e6a6692717a5.png'),
  opentable_intermediate: require('@/assets/images/8dc10702-2661-4729-958f-49df486b683a.png'),
  opentable_advanced: require('@/assets/images/397f7fca-5dec-495b-a06f-16f020c5873c.png'),
};

// Broker file paths end in `{ts}_{safeName}` — show the human half.
function fileNameFromUrl(url: string): string {
  try {
    const tail = decodeURIComponent(url.split('?')[0].split('/').pop() || '');
    return tail.replace(/^\d+_/, '') || tail || 'file';
  } catch {
    return 'file';
  }
}

export default function HostSectionEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { t, i18n } = useTranslation();
  const { language } = useLanguage();
  const colors = useThemeColors();
  useRequireManagerRoute();
  const isSpanishAuthor = i18n.language === 'es';

  const isNew = !id || id === 'new';
  const [sectionId, setSectionId] = useState<string | null>(isNew ? null : (id as string));
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Section form (EN base + ES pair — the input binds the author's language)
  const [title, setTitle] = useState('');
  const [titleEs, setTitleEs] = useState('');
  const [cardSubtitle, setCardSubtitle] = useState('');
  const [cardSubtitleEs, setCardSubtitleEs] = useState('');
  const [instructions, setInstructions] = useState('');
  const [instructionsEs, setInstructionsEs] = useState('');
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(null);
  const [cardImageShape, setCardImageShape] = useState<'square' | 'banner'>('square');
  const [icon, setIcon] = useState<string | null>(null);
  const [localCardUri, setLocalCardUri] = useState<string | null>(null);
  const [storedSection, setStoredSection] = useState<Record<string, string | null> | null>(null);

  const sectionTranslation = useTranslationSection({
    fields: [
      {
        key: 'title',
        labelKey: 'translation_section:field_title',
        enValue: title,
        esValue: titleEs,
        setEnValue: setTitle,
        setEsValue: setTitleEs,
        enStored: storedSection ? storedSection.title : undefined,
        esStored: storedSection ? storedSection.title_es : undefined,
      },
      {
        key: 'card_subtitle',
        labelKey: 'host_section_editor.subtitle_label',
        enValue: cardSubtitle,
        esValue: cardSubtitleEs,
        setEnValue: setCardSubtitle,
        setEsValue: setCardSubtitleEs,
        enStored: storedSection ? storedSection.card_subtitle : undefined,
        esStored: storedSection ? storedSection.card_subtitle_es : undefined,
      },
      {
        key: 'instructions',
        labelKey: 'host_section_editor.instructions_label',
        enValue: instructions,
        esValue: instructionsEs,
        setEnValue: setInstructions,
        setEsValue: setInstructionsEs,
        multiline: true,
        enStored: storedSection ? storedSection.instructions : undefined,
        esStored: storedSection ? storedSection.instructions_es : undefined,
      },
    ],
    sessionKey: sectionId ? `edit:${sectionId}` : 'new-section',
    active: !loading,
  });

  // Tiles
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [actionTile, setActionTile] = useState<{ tile: Tile; index: number } | null>(null);

  // Tile modal
  const [tileModalVisible, setTileModalVisible] = useState(false);
  const [tileMode, setTileMode] = useState<'form' | 'guides'>('form');
  const [editingTile, setEditingTile] = useState<Tile | null>(null);
  const [tTitle, setTTitle] = useState('');
  const [tTitleEs, setTTitleEs] = useState('');
  const [tImageUrl, setTImageUrl] = useState<string | null>(null);
  const [tImageShape, setTImageShape] = useState<'square' | 'banner'>('banner');
  const [tLinkUrl, setTLinkUrl] = useState('');
  const [tLinkDesc, setTLinkDesc] = useState('');
  const [tLinkDescEs, setTLinkDescEs] = useState('');
  const [tLocalUri, setTLocalUri] = useState<string | null>(null);
  const [tSystemAsset, setTSystemAsset] = useState<string | null>(null);
  const [tFile, setTFile] = useState<TileFile | null>(null);
  const [savingTile, setSavingTile] = useState(false);
  const [guides, setGuides] = useState<GuidePick[]>([]);
  const [guidesLoaded, setGuidesLoaded] = useState(false);
  const addTileSessionRef = useRef(0);

  const tileTranslation = useTranslationSection({
    fields: [
      {
        key: 'title',
        labelKey: 'translation_section:field_title',
        enValue: tTitle,
        esValue: tTitleEs,
        setEnValue: setTTitle,
        setEsValue: setTTitleEs,
        enStored: editingTile ? editingTile.title : undefined,
        esStored: editingTile ? editingTile.title_es : undefined,
      },
      {
        key: 'link_description',
        labelKey: 'host_section_editor.confirm_label',
        enValue: tLinkDesc,
        esValue: tLinkDescEs,
        setEnValue: setTLinkDesc,
        setEsValue: setTLinkDescEs,
        multiline: true,
        enStored: editingTile ? editingTile.link_description : undefined,
        esStored: editingTile ? editingTile.link_description_es : undefined,
      },
    ],
    sessionKey: editingTile ? `edit:${editingTile.id}` : `new:${addTileSessionRef.current}`,
    active: tileModalVisible,
  });

  const loadTiles = useCallback(async (sid: string) => {
    if (!user?.id) return;
    const { data } = await supabase.rpc('get_host_section_tiles', { p_actor_id: user.id, p_section_id: sid });
    setTiles((data as Tile[]) || []);
  }, [user?.id]);

  const load = useCallback(async () => {
    // Userless early-out leaves the initial spinner up until auth hydrates;
    // the [user?.id] dep below retriggers load, which then clears it.
    if (isNew || !id || !user?.id) return;
    try {
      setLoading(true);
      const { data } = await supabase.rpc('get_host_sections', { p_actor_id: user.id, p_id: id });
      const s = data?.[0];
      if (s) {
        setTitle(s.title || '');
        setTitleEs(s.title_es || '');
        setCardSubtitle(s.card_subtitle || '');
        setCardSubtitleEs(s.card_subtitle_es || '');
        setInstructions(s.instructions || '');
        setInstructionsEs(s.instructions_es || '');
        setCardImageUrl(s.card_image_url || null);
        setCardImageShape(s.card_image_shape === 'banner' ? 'banner' : 'square');
        setIcon(s.icon || null);
        setStoredSection({
          title: s.title, title_es: s.title_es,
          card_subtitle: s.card_subtitle, card_subtitle_es: s.card_subtitle_es,
          instructions: s.instructions, instructions_es: s.instructions_es,
        });
      }
      await loadTiles(id as string);
    } catch (e) {
      console.error('Error loading section:', e);
    } finally {
      setLoading(false);
    }
  }, [id, isNew, loadTiles, user?.id]);

  useEffect(() => { load(); }, [load]);

  const pickImage = async (shape: 'square' | 'banner', onPicked: (uri: string) => void) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('host_section_editor.permission_title'), t('host_section_editor.permission_msg'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: shape === 'square' ? [1, 1] : [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) onPicked(result.assets[0].uri);
  };

  const saveSection = async () => {
    const authorTitle = isSpanishAuthor ? titleEs : title;
    if (!authorTitle.trim()) {
      Alert.alert(t('host_section_editor.title_required_title'), t('host_section_editor.title_required_msg'));
      return;
    }
    if (!user?.id || !organizationId) return;

    // Fill/refresh the other language per the staleness rules (may ask once).
    const resolved = await sectionTranslation.resolveOnSave();
    if (!resolved) return;

    try {
      setSaving(true);
      let cardUrl = cardImageUrl;
      if (localCardUri) {
        const uploaded = await brokerUploadImage('host_section_image', localCardUri, user.id);
        if (uploaded) cardUrl = uploaded;
      }
      const esPatch = {
        title_es: resolved.title.es,
        card_subtitle_es: resolved.card_subtitle.es,
        instructions_es: resolved.instructions.es,
      };
      if (sectionId) {
        const { error } = await supabase.rpc('update_host_section', {
          p_actor_id: user.id, p_section_id: sectionId, p_title: resolved.title.en.trim(),
          p_card_subtitle: resolved.card_subtitle.en.trim() || null,
          p_instructions: resolved.instructions.en.trim() || null,
          p_card_image_url: cardUrl || null, p_card_image_shape: cardImageShape, p_icon: icon || null,
          p_is_active: null,
        });
        if (error) throw error;
        await saveTranslations('host_sections', sectionId, esPatch, user.id, {
          clearBlank: ['title_es', 'card_subtitle_es', 'instructions_es'],
        });
        setCardImageUrl(cardUrl || null);
        setLocalCardUri(null);
        // Saved an existing section → back to the Host Assistant Editor (Steve,
        // s74 smoke round 1). Creation stays put so tiles can be added below.
        Alert.alert(t('host_section_editor.saved_title'), t('host_section_editor.saved_msg'), [
          { text: t('common:ok'), onPress: () => router.back() },
        ]);
      } else {
        const { data, error } = await supabase.rpc('create_host_section', {
          p_actor_id: user.id, p_org_id: organizationId, p_title: resolved.title.en.trim(),
          p_card_subtitle: resolved.card_subtitle.en.trim() || null,
          p_instructions: resolved.instructions.en.trim() || null,
          p_card_image_url: cardUrl || null, p_card_image_shape: cardImageShape, p_icon: icon || null,
        });
        if (error) throw error;
        const newId = data as string;
        setSectionId(newId);
        await saveTranslations('host_sections', newId, esPatch, user.id, {
          clearBlank: ['title_es', 'card_subtitle_es', 'instructions_es'],
        });
        setCardImageUrl(cardUrl || null);
        setLocalCardUri(null);
        Alert.alert(t('host_section_editor.created_title'), t('host_section_editor.created_msg'));
      }
    } catch (e: any) {
      Alert.alert(t('common:error'), translateServerError(e, t('host_section_editor.save_failed')));
    } finally {
      setSaving(false);
    }
  };

  // ── Tile modal helpers ──
  const openAddTile = () => {
    addTileSessionRef.current += 1;
    setEditingTile(null);
    setTTitle(''); setTTitleEs(''); setTImageUrl(null); setTImageShape('banner');
    setTLinkUrl(''); setTLinkDesc(''); setTLinkDescEs('');
    setTLocalUri(null); setTSystemAsset(null); setTFile(null);
    setTileMode('form');
    setTileModalVisible(true);
  };
  const openEditTile = (tile: Tile) => {
    setEditingTile(tile);
    setTTitle(tile.title || ''); setTTitleEs(tile.title_es || '');
    setTImageUrl(tile.image_url || null);
    setTImageShape(tile.image_shape === 'square' ? 'square' : 'banner');
    setTLinkDesc(tile.link_description || ''); setTLinkDescEs(tile.link_description_es || '');
    setTLocalUri(null); setTSystemAsset(tile.system_asset_key || null);
    setTLinkUrl(tile.link_url || '');
    setTFile(tile.file_url
      ? { kind: 'existing', url: tile.file_url, name: fileNameFromUrl(tile.file_url) }
      : null);
    setTileMode('form');
    setTileModalVisible(true);
  };

  const pickTileFile = async () => {
    try {
      // The broker's host_section_file gate accepts ANY type up to 50MB —
      // the picker list is the only filter (mirrors guide_file).
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const file = result.assets[0];
        setTFile({
          kind: 'local',
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream',
        });
      }
    } catch (e) {
      console.error('Error picking tile file:', e);
      Alert.alert(t('common:error'), t('host_section_editor.upload_failed'));
    }
  };

  const openGuidePicker = async () => {
    if (!guidesLoaded && user?.id) {
      const { data } = await supabase.rpc('get_guides', { p_actor_id: user.id });
      setGuides(((data as GuidePick[]) || []).filter((g) => !!g.file_url));
      setGuidesLoaded(true);
    }
    setTileMode('guides');
  };

  const saveTile = async () => {
    if (!user?.id || !sectionId) return;

    // Fill/refresh the other language per the staleness rules (may ask once).
    const resolved = await tileTranslation.resolveOnSave();
    if (!resolved) return;

    try {
      setSavingTile(true);
      let imgUrl = tImageUrl;
      if (tLocalUri) {
        const uploaded = await brokerUploadImage('host_section_image', tLocalUri, user.id);
        if (uploaded) imgUrl = uploaded;
      }

      // Link and file are independent slots since s74b — a tile may carry both.
      const rawLink = tLinkUrl.trim();
      // Prepend https:// when the entered link has no scheme, else it won't open (e.g. "kevahomes.com").
      const linkUrl = rawLink ? (/^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`) : null;
      let fileUrl: string | null = null;
      if (tFile) {
        if (tFile.kind === 'local') {
          const uploaded = await brokerUploadFile('host_section_file', tFile.uri, tFile.name, tFile.type, user.id);
          if (!uploaded) throw new Error('Upload failed');
          fileUrl = uploaded;
        } else {
          fileUrl = tFile.url;
        }
      }

      const esPatch = {
        title_es: resolved.title.es,
        link_description_es: resolved.link_description.es,
      };
      let tileId: string | null = null;
      if (editingTile) {
        const { error } = await supabase.rpc('update_host_section_tile', {
          p_actor_id: user.id, p_tile_id: editingTile.id, p_title: resolved.title.en.trim() || null,
          p_image_url: imgUrl || null, p_image_shape: tImageShape,
          p_link_url: linkUrl, p_link_description: resolved.link_description.en.trim() || null,
          // p_clear_file distinguishes "removed" from "unchanged" — a bare null
          // COALESCE-keeps server-side (old-client protection).
          p_file_url: fileUrl, p_clear_file: !fileUrl,
        });
        if (error) throw error;
        tileId = editingTile.id;
      } else {
        const { data, error } = await supabase.rpc('create_host_section_tile', {
          p_actor_id: user.id, p_section_id: sectionId, p_title: resolved.title.en.trim() || null,
          p_image_url: imgUrl || null, p_image_shape: tImageShape,
          p_link_url: linkUrl, p_link_description: resolved.link_description.en.trim() || null,
          p_file_url: fileUrl,
        });
        if (error) throw error;
        tileId = data as string;
      }
      if (tileId) {
        await saveTranslations('host_section_tiles', tileId, esPatch, user.id, {
          clearBlank: ['title_es', 'link_description_es'],
        });
      }
      setTileModalVisible(false);
      await loadTiles(sectionId);
    } catch (e: any) {
      Alert.alert(t('common:error'), translateServerError(e, t('host_section_editor.tile_save_failed')));
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
    await supabase.rpc('reorder_host_section_tiles', {
      p_actor_id: user.id, p_section_id: sectionId, p_ordered_ids: reordered.map((x) => x.id),
    });
  };

  const deleteTile = (tile: Tile) => {
    Alert.alert(
      t('host_section_editor.delete_tile_title'),
      t('host_section_editor.delete_tile_confirm'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'), style: 'destructive', onPress: async () => {
            if (!user?.id || !sectionId) return;
            await supabase.rpc('delete_host_section_tile', { p_actor_id: user.id, p_tile_id: tile.id });
            await loadTiles(sectionId);
          },
        },
      ]
    );
  };

  const tileThumb = (tile: Tile) => {
    if (tile.image_url) return { uri: tile.image_url };
    if (tile.system_asset_key && SYSTEM_ASSETS[tile.system_asset_key]) return SYSTEM_ASSETS[tile.system_asset_key];
    return null;
  };

  const ShapeToggle = ({ value, onChange }: { value: 'square' | 'banner'; onChange: (v: 'square' | 'banner') => void }) => (
    <View style={styles.shapeRow}>
      {(['square', 'banner'] as const).map((s) => {
        const selected = value === s;
        return (
          <TouchableOpacity
            key={s}
            style={[
              styles.shapeBtn,
              {
                backgroundColor: selected ? colors.primary + '2E' : colors.glass,
                borderColor: selected ? colors.primary + '6B' : colors.glassBorder,
              },
            ]}
            onPress={() => onChange(s)}
          >
            <Text style={[styles.shapeText, { color: selected ? colors.primary : colors.textSecondary }]}>
              {s === 'square' ? t('host_section_editor.shape_square') : t('host_section_editor.shape_banner')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const fieldLabel = (label: string, required?: boolean) => (
    <Text style={[styles.label, { color: colors.textSecondary }]}>
      {label.toUpperCase()}{required ? ' *' : ''}
    </Text>
  );

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.glass, color: colors.text, borderColor: colors.glassBorder },
  ];

  // Footer: Cancel (glass) / Save (primary) — the house pair.
  const sheetFooter = (
    <View style={styles.footerRow}>
      <TouchableOpacity
        style={[styles.footerBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
        onPress={() => setTileModalVisible(false)}
        disabled={savingTile}
        activeOpacity={0.8}
      >
        <Text style={[styles.footerBtnLabel, { color: colors.text }]}>{t('common:cancel')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerBtn, { backgroundColor: colors.primary, borderColor: colors.primary }, savingTile && { opacity: 0.6 }]}
        onPress={saveTile}
        disabled={savingTile}
        activeOpacity={0.8}
      >
        {savingTile ? (
          <ActivityIndicator color={colors.fireText} />
        ) : (
          <Text style={[styles.footerBtnLabel, { color: colors.fireText }]}>
            {editingTile ? t('host_section_editor.save_tile') : t('host_section_editor.add_tile')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AmbientGlow />
        <ScreenHeader title={t('host_section_editor.title_edit')} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AmbientGlow />
      <ScreenHeader
        title={isNew && !sectionId ? t('host_section_editor.title_new') : t('host_section_editor.title_edit')}
        rightWide
        right={
          <TouchableOpacity
            style={[styles.saveChip, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
            onPress={saveSection}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.fireText} />
            ) : (
              <>
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color={colors.fireText} />
                <Text style={[styles.saveChipText, { color: colors.fireText }]}>{t('common:save')}</Text>
              </>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* ── Section details ── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('host_section_editor.section_details')}</Text>

          {/* Thumb drop zone top-left, title + subtitle to the right */}
          <View style={styles.formTopRow}>
            <TouchableOpacity
              style={styles.thumbZoneWrap}
              onPress={() => pickImage(cardImageShape, setLocalCardUri)}
              activeOpacity={0.8}
            >
              {localCardUri || cardImageUrl ? (
                <StorageImage
                  source={{ uri: localCardUri || cardImageUrl || '' }}
                  style={[styles.thumbZone, { borderColor: colors.glassBorder }]}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.thumbZone, styles.thumbZoneEmpty, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
                  <IconSymbol ios_icon_name="photo.fill" android_material_icon_name="image" size={22} color={colors.textSecondary} />
                  <Text style={[styles.thumbZoneText, { color: colors.textSecondary }]}>
                    {t('host_section_editor.add_image')}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.formTopFields}>
              {fieldLabel(t('host_section_editor.title_label'), true)}
              <TextInput
                style={inputStyle}
                value={isSpanishAuthor ? titleEs : title}
                onChangeText={(v) => (isSpanishAuthor ? setTitleEs(v) : setTitle(v))}
                placeholder={t('host_section_editor.title_placeholder')}
                placeholderTextColor={colors.textSecondary}
              />
              {fieldLabel(t('host_section_editor.subtitle_label'))}
              <TextInput
                style={inputStyle}
                value={isSpanishAuthor ? cardSubtitleEs : cardSubtitle}
                onChangeText={(v) => (isSpanishAuthor ? setCardSubtitleEs(v) : setCardSubtitle(v))}
                placeholder={t('host_section_editor.subtitle_placeholder')}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <ShapeToggle value={cardImageShape} onChange={setCardImageShape} />

          {fieldLabel(t('host_section_editor.instructions_label'))}
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {t('host_section_editor.instructions_hint')}
          </Text>
          <TextInput
            style={[...inputStyle, styles.multiline]}
            value={isSpanishAuthor ? instructionsEs : instructions}
            onChangeText={(v) => (isSpanishAuthor ? setInstructionsEs(v) : setInstructions(v))}
            placeholder={t('host_section_editor.instructions_placeholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
          />

          <View style={styles.translationWrap}>{sectionTranslation.element}</View>
        </View>

        {/* ── Tiles ── */}
        {sectionId ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <View style={styles.tilesHeader}>
              <Text style={[styles.cardTitle, styles.tilesTitle, { color: colors.text }]}>
                {t('host_section_editor.tiles')}
              </Text>
              <TouchableOpacity
                style={[styles.addTileBtn, { backgroundColor: colors.primary + '2E', borderColor: colors.primary + '6B' }]}
                onPress={openAddTile}
              >
                <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={15} color={colors.primary} />
                <Text style={[styles.addTileText, { color: colors.primary }]}>{t('host_section_editor.add_tile')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.hint, styles.tilesDesc, { color: colors.textSecondary }]}>
              {t('host_section_editor.tiles_desc')}
            </Text>

            {tiles.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t('host_section_editor.no_tiles')}
              </Text>
            ) : (
              tiles.map((tile, index) => {
                const src = tileThumb(tile);
                const hasFile = !!tile.file_url;
                const targets = [
                  hasFile ? fileNameFromUrl(tile.file_url as string) : null,
                  tile.link_url,
                ].filter(Boolean).join(' · ');
                return (
                  <View key={tile.id} style={[styles.tileRow, { borderTopColor: colors.border + '55' }]}>
                    {src ? (
                      <StorageImage source={src} style={styles.tileRowThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.tileRowThumb, styles.tileRowThumbEmpty, { backgroundColor: colors.primary + '21' }]}>
                        <IconSymbol
                          ios_icon_name={hasFile ? 'doc.fill' : 'link'}
                          android_material_icon_name={hasFile ? 'description' : 'link'}
                          size={17}
                          color={colors.primary}
                        />
                      </View>
                    )}
                    <View style={styles.tileRowText}>
                      <Text style={[styles.tileRowTitle, { color: colors.text }]} numberOfLines={1}>
                        {getLocalizedField(tile, 'title', language) || t('host_section_editor.untitled_tile')}
                      </Text>
                      <Text style={[styles.tileRowUrl, { color: colors.textSecondary }]} numberOfLines={1}>
                        {targets || t('host_section_editor.no_link')}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setActionTile({ tile, index })} style={styles.meatball} hitSlop={6}>
                      <IconSymbol ios_icon_name="ellipsis" android_material_icon_name="more-horiz" size={19} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t('host_section_editor.save_first')}
          </Text>
        )}

        {/* Bottom save — the primary path (the header chip is the backup). */}
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
          onPress={saveSection}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={colors.fireText} />
          ) : (
            <Text style={[styles.saveButtonText, { color: colors.fireText }]}>
              {sectionId ? t('host_section_editor.save_section') : t('host_section_editor.create_section')}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* ── Tile add/edit sheet (form ⇄ guide picker via in-sheet mode swap —
            no nested Modal, so no teardown sequencing to get wrong) ── */}
      <GlassSheet
        visible={tileModalVisible}
        onClose={() => setTileModalVisible(false)}
        title={
          tileMode === 'guides'
            ? t('host_section_editor.pick_guide_title')
            : editingTile ? t('host_section_editor.edit_tile') : t('host_section_editor.add_tile')
        }
        headerAction={tileMode === 'guides' ? (
          <TouchableOpacity onPress={() => setTileMode('form')} hitSlop={8}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={20} color={colors.primary} />
          </TouchableOpacity>
        ) : undefined}
        footer={tileMode === 'form' ? sheetFooter : undefined}
      >
        {tileMode === 'guides' ? (
          <>
            {guides.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t('host_section_editor.no_guides')}
              </Text>
            ) : (
              guides.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.guideRow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
                  onPress={() => {
                    setTFile({ kind: 'guide', url: g.file_url, name: g.file_name || fileNameFromUrl(g.file_url) });
                    setTileMode('form');
                  }}
                >
                  <IconSymbol ios_icon_name="doc.fill" android_material_icon_name="description" size={18} color={colors.primary} />
                  <View style={styles.guideRowText}>
                    <Text style={[styles.guideRowTitle, { color: colors.text }]} numberOfLines={1}>
                      {getLocalizedField(g, 'title', language)}
                    </Text>
                    <Text style={[styles.guideRowFile, { color: colors.textSecondary }]} numberOfLines={1}>
                      {g.file_name}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        ) : (
          <>
            {/* Thumb drop zone left, title to the right */}
            <View style={styles.formTopRow}>
              <TouchableOpacity
                style={styles.thumbZoneWrap}
                onPress={() => pickImage(tImageShape, (u) => { setTLocalUri(u); setTSystemAsset(null); })}
                activeOpacity={0.8}
              >
                {tLocalUri || tImageUrl || (tSystemAsset && SYSTEM_ASSETS[tSystemAsset]) ? (
                  <StorageImage
                    source={tLocalUri || tImageUrl ? { uri: tLocalUri || tImageUrl || '' } : SYSTEM_ASSETS[tSystemAsset || '']}
                    style={[styles.thumbZone, { borderColor: colors.glassBorder }]}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.thumbZone, styles.thumbZoneEmpty, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
                    <IconSymbol ios_icon_name="photo.fill" android_material_icon_name="image" size={22} color={colors.textSecondary} />
                    <Text style={[styles.thumbZoneText, { color: colors.textSecondary }]}>
                      {t('host_section_editor.add_image')}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.formTopFields}>
                {fieldLabel(t('host_section_editor.tile_image_label'))}
                <ShapeToggle value={tImageShape} onChange={setTImageShape} />
                {fieldLabel(t('host_section_editor.title_label'))}
                <TextInput
                  style={inputStyle}
                  value={isSpanishAuthor ? tTitleEs : tTitle}
                  onChangeText={(v) => (isSpanishAuthor ? setTTitleEs(v) : setTTitle(v))}
                  placeholder={t('host_section_editor.tile_title_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            {/* Link and attached file are independent (Steve, s74 smoke round 1):
                a tile may carry both — the viewer then offers a choice. */}
            {fieldLabel(t('host_section_editor.link_label'))}
            <TextInput
              style={inputStyle}
              value={tLinkUrl}
              onChangeText={setTLinkUrl}
              placeholder="https://..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="url"
            />

            {fieldLabel(t('host_section_editor.attach_label'))}
            {tFile ? (
              <View style={[styles.fileChip, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '42' }]}>
                <IconSymbol ios_icon_name="doc.fill" android_material_icon_name="description" size={16} color={colors.primary} />
                <Text style={[styles.fileChipName, { color: colors.text }]} numberOfLines={1}>{tFile.name}</Text>
                <TouchableOpacity
                  onPress={() => setTFile(null)}
                  hitSlop={10}
                  accessibilityLabel={t('host_section_editor.remove_file')}
                >
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={19} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.attachRow}>
                <TouchableOpacity
                  style={[styles.attachBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                  onPress={pickTileFile}
                >
                  <IconSymbol ios_icon_name="arrow.up.doc.fill" android_material_icon_name="upload-file" size={16} color={colors.primary} />
                  <Text style={[styles.attachBtnText, { color: colors.text }]} numberOfLines={1}>
                    {t('host_section_editor.upload_file')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.attachBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                  onPress={openGuidePicker}
                >
                  <IconSymbol ios_icon_name="book.fill" android_material_icon_name="menu-book" size={16} color={colors.primary} />
                  <Text style={[styles.attachBtnText, { color: colors.text }]} numberOfLines={1}>
                    {t('host_section_editor.from_guides')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {fieldLabel(t('host_section_editor.confirm_label'))}
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {t('host_section_editor.confirm_hint')}
            </Text>
            <TextInput
              style={[...inputStyle, styles.multiline]}
              value={isSpanishAuthor ? tLinkDescEs : tLinkDesc}
              onChangeText={(v) => (isSpanishAuthor ? setTLinkDescEs(v) : setTLinkDesc(v))}
              placeholder={t('host_section_editor.confirm_placeholder')}
              placeholderTextColor={colors.textSecondary}
              multiline
            />

            <View style={styles.translationWrap}>{tileTranslation.element}</View>
          </>
        )}
      </GlassSheet>

      {/* Tile overflow actions */}
      <GlassActionSheet
        visible={!!actionTile}
        onClose={() => setActionTile(null)}
        title={(actionTile && getLocalizedField(actionTile.tile, 'title', language)) || t('host_section_editor.untitled_tile')}
        actions={actionTile ? [
          {
            key: 'edit',
            label: t('common:edit'),
            iosIcon: 'pencil',
            androidIcon: 'edit',
            onPress: () => openEditTile(actionTile.tile),
          },
          {
            key: 'up',
            label: t('host_assistant_editor.move_up'),
            iosIcon: 'arrow.up',
            androidIcon: 'arrow-upward',
            disabled: actionTile.index === 0,
            onPress: () => moveTile(actionTile.index, -1),
          },
          {
            key: 'down',
            label: t('host_assistant_editor.move_down'),
            iosIcon: 'arrow.down',
            androidIcon: 'arrow-downward',
            disabled: actionTile.index >= tiles.length - 1,
            onPress: () => moveTile(actionTile.index, 1),
          },
          {
            key: 'delete',
            label: t('common:delete'),
            iosIcon: 'trash',
            androidIcon: 'delete',
            destructive: true,
            onPress: () => deleteTile(actionTile.tile),
          },
        ] : []}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 90 },
  saveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    minWidth: 62,
    justifyContent: 'center',
  },
  saveChipText: {
    fontFamily: fonts.body.semibold,
    fontSize: 13,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 14,
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: fonts.display.semibold,
    fontSize: 16,
    marginBottom: 12,
  },
  formTopRow: {
    flexDirection: 'row',
    gap: 12,
  },
  thumbZoneWrap: {
    alignSelf: 'flex-start',
  },
  thumbZone: {
    width: 92,
    height: 92,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  thumbZoneEmpty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  thumbZoneText: {
    fontFamily: fonts.body.medium,
    fontSize: 10,
  },
  formTopFields: {
    flex: 1,
  },
  label: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    marginTop: 11,
    marginBottom: 6,
  },
  hint: {
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 7,
  },
  input: {
    minHeight: 43,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: fonts.body.regular,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  shapeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 11,
  },
  shapeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
  },
  shapeText: {
    fontFamily: fonts.body.semibold,
    fontSize: 12.5,
  },
  translationWrap: {
    marginTop: 13,
  },
  tilesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tilesTitle: {
    marginBottom: 0,
    flexShrink: 1,
  },
  addTileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  addTileText: {
    fontFamily: fonts.body.semibold,
    fontSize: 12.5,
  },
  tilesDesc: {
    marginTop: 8,
    marginBottom: 4,
  },
  emptyText: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 14,
  },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  tileRowThumb: {
    width: 44,
    height: 44,
    borderRadius: 11,
  },
  tileRowThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileRowText: {
    flex: 1,
  },
  tileRowTitle: {
    fontFamily: fonts.body.semibold,
    fontSize: 14,
  },
  tileRowUrl: {
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    marginTop: 2,
  },
  meatball: {
    padding: 8,
  },
  saveButton: {
    borderRadius: 13,
    minHeight: 49,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  saveButtonText: {
    fontFamily: fonts.body.semibold,
    fontSize: 15.5,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 11,
    paddingTop: 12,
  },
  footerBtn: {
    flex: 1,
    height: 47,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  footerBtnLabel: {
    fontFamily: fonts.body.semibold,
    fontSize: 15,
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  fileChipName: {
    flex: 1,
    fontFamily: fonts.body.semibold,
    fontSize: 13.5,
  },
  attachRow: {
    flexDirection: 'row',
    gap: 9,
  },
  attachBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingVertical: 11,
    paddingHorizontal: 8,
  },
  attachBtnText: {
    fontFamily: fonts.body.semibold,
    fontSize: 12.5,
    flexShrink: 1,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  guideRowText: {
    flex: 1,
  },
  guideRowTitle: {
    fontFamily: fonts.body.semibold,
    fontSize: 14,
  },
  guideRowFile: {
    fontFamily: fonts.mono.medium,
    fontSize: 10.5,
    marginTop: 2,
  },
});
