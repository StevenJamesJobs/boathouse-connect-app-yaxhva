import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/app/integrations/supabase/client';

// Built-in images for the seeded OpenTable Academy tiles (keyed by system_asset_key).
const SYSTEM_ASSETS: Record<string, any> = {
  opentable_beginner: require('@/assets/images/3fa03e2f-c4a8-41ca-95f3-e6a6692717a5.png'),
  opentable_intermediate: require('@/assets/images/8dc10702-2661-4729-958f-49df486b683a.png'),
  opentable_advanced: require('@/assets/images/397f7fca-5dec-495b-a06f-16f020c5873c.png'),
};

interface HostSection {
  id: string;
  title: string;
  instructions: string | null;
}

interface HostTile {
  id: string;
  title: string | null;
  image_url: string | null;
  image_shape: string;
  system_asset_key: string | null;
  link_url: string | null;
  link_description: string | null;
}

function tileImageSource(tile: HostTile) {
  if (tile.image_url) return { uri: tile.image_url };
  if (tile.system_asset_key && SYSTEM_ASSETS[tile.system_asset_key]) {
    return SYSTEM_ASSETS[tile.system_asset_key];
  }
  return null;
}

export default function HostSectionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();

  const [section, setSection] = useState<HostSection | null>(null);
  const [tiles, setTiles] = useState<HostTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingTile, setPendingTile] = useState<HostTile | null>(null);

  const userName = user?.name || 'there';

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const { data: s } = await (supabase.from('host_sections' as any).select('*').eq('id', id).single() as any);
      const { data: t } = await (supabase
        .from('host_section_tiles' as any)
        .select('*')
        .eq('section_id', id)
        .order('display_order', { ascending: true }) as any);
      setSection(s as HostSection);
      setTiles((t as HostTile[]) || []);
    } catch (e) {
      console.error('Error loading host section:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const openLink = async (url: string | null) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else console.error('Cannot open URL:', url);
    } catch (e) {
      console.error('Error opening URL:', e);
    }
  };

  const handleTilePress = (tile: HostTile) => {
    if (!tile.link_url) return;
    if (tile.link_description && tile.link_description.trim()) {
      setPendingTile(tile);
    } else {
      openLink(tile.link_url);
    }
  };

  const confirmOpen = () => {
    const url = pendingTile?.link_url || null;
    setPendingTile(null);
    openLink(url);
  };

  const instructionLines = (section?.instructions || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {section?.title || ''}
        </Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {/* Welcome blurb + instructions */}
          {(instructionLines.length > 0) && (
            <View style={[styles.blurbCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.welcomeText, { color: colors.text }]}>Hello {userName}!</Text>
              <View style={styles.bulletContainer}>
                {instructionLines.map((line, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
                    <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{line}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Tiles */}
          <View style={styles.tilesContainer}>
            {tiles.map((tile) => {
              const src = tileImageSource(tile);
              const tappable = !!tile.link_url;
              if (tile.image_shape === 'square') {
                return (
                  <TouchableOpacity
                    key={tile.id}
                    style={[styles.squareRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => handleTilePress(tile)}
                    activeOpacity={tappable ? 0.7 : 1}
                  >
                    {src ? (
                      <Image source={src} style={styles.squareThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.squareThumb, styles.squarePlaceholder, { backgroundColor: colors.primary + '15' }]}>
                        <IconSymbol ios_icon_name="link" android_material_icon_name="link" size={24} color={colors.primary} />
                      </View>
                    )}
                    <Text style={[styles.squareTitle, { color: colors.text }]} numberOfLines={2}>
                      {tile.title || ''}
                    </Text>
                    {tappable && (
                      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                );
              }
              // banner shape
              return (
                <TouchableOpacity
                  key={tile.id}
                  style={styles.bannerTile}
                  onPress={() => handleTilePress(tile)}
                  activeOpacity={tappable ? 0.85 : 1}
                >
                  {src ? (
                    <Image source={src} style={styles.bannerImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.bannerImage, styles.bannerPlaceholder, { backgroundColor: colors.primary + '15' }]}>
                      <IconSymbol ios_icon_name="link" android_material_icon_name="link" size={32} color={colors.primary} />
                    </View>
                  )}
                  {!!tile.title && (
                    <View style={[styles.bannerTitleBar, { backgroundColor: colors.card }]}>
                      <Text style={[styles.bannerTitleText, { color: colors.text }]} numberOfLines={1}>{tile.title}</Text>
                      {tappable && (
                        <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={18} color={colors.textSecondary} />
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Link confirmation popup */}
      <Modal visible={!!pendingTile} transparent animationType="fade" onRequestClose={() => setPendingTile(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {pendingTile?.title || 'Open Link'}
            </Text>
            {!!pendingTile?.link_description && (
              <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
                {pendingTile.link_description}
              </Text>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => setPendingTile(null)}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={confirmOpen}
              >
                <Text style={[styles.modalButtonText, { color: colors.fireText }]}>Open Link</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerTitle: { fontSize: 20, fontWeight: 'bold', flex: 1, textAlign: 'center' },
  placeholder: { width: 40 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },
  contentContainer: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 100 },
  blurbCard: {
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  welcomeText: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  bulletContainer: { gap: 16 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start' },
  bullet: { fontSize: 20, fontWeight: 'bold', marginRight: 12, marginTop: 2 },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 22 },
  tilesContainer: { gap: 20 },
  bannerTile: {
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 5,
  },
  bannerImage: { width: '100%', height: 200 },
  bannerPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  bannerTitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bannerTitleText: { fontSize: 16, fontWeight: '700', flex: 1 },
  squareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 14,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  squareThumb: { width: 72, height: 72, borderRadius: 10 },
  squarePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  squareTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalCard: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0px 4px 20px rgba(0,0,0,0.3)',
    elevation: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  modalDesc: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalButtonText: { fontSize: 15, fontWeight: '700' },
});
