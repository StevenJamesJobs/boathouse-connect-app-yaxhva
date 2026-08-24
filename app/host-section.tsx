import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import { resolveForOpen } from '@/utils/storageResolver';
import { supabase } from '@/app/integrations/supabase/client';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import GlassCard from '@/components/GlassCard';
import { useSheetHandoff } from '@/components/GlassSheet';
import { fonts } from '@/constants/fonts';

// Built-in images for the seeded OpenTable Academy tiles (keyed by system_asset_key).
const SYSTEM_ASSETS: Record<string, any> = {
  opentable_beginner: require('@/assets/images/3fa03e2f-c4a8-41ca-95f3-e6a6692717a5.png'),
  opentable_intermediate: require('@/assets/images/8dc10702-2661-4729-958f-49df486b683a.png'),
  opentable_advanced: require('@/assets/images/397f7fca-5dec-495b-a06f-16f020c5873c.png'),
};

interface HostSection {
  id: string;
  title: string;
  title_es: string | null;
  instructions: string | null;
  instructions_es: string | null;
}

interface HostTile {
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
}

function tileImageSource(tile: HostTile) {
  if (tile.image_url) return { uri: tile.image_url };
  if (tile.system_asset_key && SYSTEM_ASSETS[tile.system_asset_key]) {
    return SYSTEM_ASSETS[tile.system_asset_key];
  }
  return null;
}

// s74b: link and file are independent slots — a tile may carry both, and the
// confirmation popup then offers the choice.
const hasFile = (tile: HostTile) => !!tile.file_url;
const hasLink = (tile: HostTile) => !!tile.link_url;

export default function HostSectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const colors = useThemeColors();

  const [section, setSection] = useState<HostSection | null>(null);
  const [tiles, setTiles] = useState<HostTile[]>([]);
  const [loading, setLoading] = useState(true);
  // Visibility and data are SEPARATE on purpose: nulling the tile on close made
  // the popup's content swap to its fallback ("Open Link", two buttons) while
  // the Modal was still fading out — the s74 round-2 "ghost second prompt".
  // The tile data simply persists through the fade; the next open overwrites it.
  const [pendingTile, setPendingTile] = useState<HostTile | null>(null);
  const [promptVisible, setPromptVisible] = useState(false);

  const userName = user?.name || 'there';

  const load = useCallback(async () => {
    if (!id || !user?.id) return;
    try {
      setLoading(true);
      const { data: s } = await supabase.rpc('get_host_sections', { p_actor_id: user.id, p_id: id });
      const { data: rows } = await supabase.rpc('get_host_section_tiles', { p_actor_id: user.id, p_section_id: id });
      setSection((s?.[0]) as HostSection);
      setTiles((rows as HostTile[]) || []);
    } catch (e) {
      console.error('Error loading host section:', e);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => { load(); }, [load]);

  // The popup opens an SFSafariViewController (openBrowserAsync) — presenting
  // one while the Modal is still dismissing gets silently DROPPED by UIKit
  // (the s74 smoke "Open File does nothing" bug), so every open from the popup
  // goes through the sheet-handoff defer/onDismiss pair.
  const { defer, onDismiss } = useSheetHandoff(() => setPromptVisible(false));

  const openFile = async (url: string) => {
    try {
      // The guides pattern: sign-read (file tier) → in-app browser.
      await WebBrowser.openBrowserAsync(await resolveForOpen(url, { tier: 'file' }));
    } catch (e) {
      console.error('Error opening tile file:', e);
    }
  };

  const openLink = async (url: string) => {
    try {
      // Prepend https:// for legacy tiles saved before the editor's scheme guard (e.g. "kevahomes.com").
      const openUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const supported = await Linking.canOpenURL(openUrl);
      if (supported) await Linking.openURL(openUrl);
      else console.error('Cannot open URL:', openUrl);
    } catch (e) {
      console.error('Error opening tile link:', e);
    }
  };

  const handleTilePress = (tile: HostTile) => {
    const file = hasFile(tile);
    const link = hasLink(tile);
    if (!file && !link) return;
    const confirmMsg = getLocalizedField(tile, 'link_description', language);
    // Both targets → always ask which one; a single target asks only when a
    // confirmation message is set.
    if ((file && link) || (confirmMsg && confirmMsg.trim())) {
      setPendingTile(tile);
      setPromptVisible(true);
    } else if (file) {
      openFile(tile.file_url as string);
    } else {
      openLink(tile.link_url as string);
    }
  };

  const instructionLines = (section ? getLocalizedField(section, 'instructions', language) : '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader title={section ? getLocalizedField(section, 'title', language) : ''} />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {/* Welcome blurb + instructions */}
          {(instructionLines.length > 0) && (
            <View style={[styles.blurbCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
              <Text style={[styles.welcomeText, { color: colors.text }]}>
                {t('host_section.hello', { name: userName })}
              </Text>
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
              const tappable = hasFile(tile) || hasLink(tile);
              const title = getLocalizedField(tile, 'title', language);
              const trailingIcon = tappable ? (
                <IconSymbol
                  ios_icon_name={hasFile(tile) ? 'doc.fill' : 'chevron.right'}
                  android_material_icon_name={hasFile(tile) ? 'description' : 'chevron-right'}
                  size={18}
                  color={colors.textSecondary}
                />
              ) : null;

              if (tile.image_shape === 'square') {
                return (
                  <TouchableOpacity
                    key={tile.id}
                    style={[styles.squareRow, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
                    onPress={() => handleTilePress(tile)}
                    activeOpacity={tappable ? 0.7 : 1}
                  >
                    {src ? (
                      <StorageImage source={src} style={styles.squareThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.squareThumb, styles.squarePlaceholder, { backgroundColor: colors.primary + '21' }]}>
                        <IconSymbol
                          ios_icon_name={hasFile(tile) ? 'doc.fill' : 'link'}
                          android_material_icon_name={hasFile(tile) ? 'description' : 'link'}
                          size={22}
                          color={colors.primary}
                        />
                      </View>
                    )}
                    <Text style={[styles.squareTitle, { color: colors.text }]} numberOfLines={2}>
                      {title}
                    </Text>
                    {trailingIcon}
                  </TouchableOpacity>
                );
              }
              // banner shape
              return (
                <TouchableOpacity
                  key={tile.id}
                  style={[styles.bannerTile, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
                  onPress={() => handleTilePress(tile)}
                  activeOpacity={tappable ? 0.85 : 1}
                >
                  {src ? (
                    <StorageImage source={src} style={styles.bannerImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.bannerImage, styles.bannerPlaceholder, { backgroundColor: colors.primary + '21' }]}>
                      <IconSymbol
                        ios_icon_name={hasFile(tile) ? 'doc.fill' : 'link'}
                        android_material_icon_name={hasFile(tile) ? 'description' : 'link'}
                        size={30}
                        color={colors.primary}
                      />
                    </View>
                  )}
                  {!!title && (
                    <View style={styles.bannerTitleBar}>
                      <Text style={[styles.bannerTitleText, { color: colors.text }]} numberOfLines={1}>{title}</Text>
                      {trailingIcon}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Link/file confirmation popup. Actions run via defer(): the browser /
          link presentation must wait until this Modal has finished dismissing. */}
      <Modal
        visible={promptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPromptVisible(false)}
        onDismiss={onDismiss}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <GlassCard variant="glass" radius={20} intensity={32} style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={2}>
              {(pendingTile && getLocalizedField(pendingTile, 'title', language)) ||
                (pendingTile && hasFile(pendingTile)
                  ? t('host_section.open_file')
                  : t('host_section.open_link'))}
            </Text>
            {!!pendingTile && !!getLocalizedField(pendingTile, 'link_description', language).trim() && (
              <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
                {getLocalizedField(pendingTile, 'link_description', language)}
              </Text>
            )}
            {pendingTile && hasFile(pendingTile) && hasLink(pendingTile) ? (
              // Both targets → the choice, stacked. flex:0 overrides the shared
              // button style's flex:1, which is for the ROW layout — in this
              // content-sized column it collapsed the stack and the card's
              // overflow:hidden clipped the Cancel button (s74 round 2).
              <View style={styles.modalStack}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonStacked, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => { const url = pendingTile.link_url as string; defer(() => openLink(url)); }}
                >
                  <Text style={[styles.modalButtonText, { color: colors.fireText }]}>{t('host_section.open_link')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonStacked, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => { const url = pendingTile.file_url as string; defer(() => openFile(url)); }}
                >
                  <Text style={[styles.modalButtonText, { color: colors.fireText }]}>{t('host_section.open_file')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonStacked, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                  onPress={() => setPromptVisible(false)}
                >
                  <Text style={[styles.modalButtonText, { color: colors.text }]}>{t('common:cancel')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                  onPress={() => setPromptVisible(false)}
                >
                  <Text style={[styles.modalButtonText, { color: colors.text }]}>{t('common:cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => {
                    if (!pendingTile) return;
                    if (hasFile(pendingTile)) {
                      const url = pendingTile.file_url as string;
                      defer(() => openFile(url));
                    } else {
                      const url = pendingTile.link_url as string;
                      defer(() => openLink(url));
                    }
                  }}
                >
                  <Text style={[styles.modalButtonText, { color: colors.fireText }]}>
                    {pendingTile && hasFile(pendingTile) ? t('host_section.open_file') : t('host_section.open_link')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </GlassCard>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },
  contentContainer: { paddingHorizontal: 16, paddingBottom: 100 },
  blurbCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 18,
    marginBottom: 18,
  },
  welcomeText: {
    fontFamily: fonts.display.bold,
    fontSize: 20,
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  bulletContainer: { gap: 12 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start' },
  bullet: {
    fontFamily: fonts.body.semibold,
    fontSize: 16,
    marginRight: 11,
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    lineHeight: 20,
  },
  tilesContainer: { gap: 14 },
  bannerTile: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    overflow: 'hidden',
  },
  bannerImage: { width: '100%', height: 180 },
  bannerPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  bannerTitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerTitleText: {
    flex: 1,
    fontFamily: fonts.display.semibold,
    fontSize: 15,
  },
  squareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 12,
    gap: 13,
  },
  squareThumb: { width: 64, height: 64, borderRadius: 12 },
  squarePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  squareTitle: {
    flex: 1,
    fontFamily: fonts.display.semibold,
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6,10,18,0.55)',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: {
    padding: 20,
  },
  modalTitle: {
    fontFamily: fonts.display.bold,
    fontSize: 17,
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  modalDesc: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalStack: { gap: 9 },
  // Overrides modalButton's flex:1 (row-layout sizing) inside the column stack.
  modalButtonStacked: { flex: 0, alignSelf: 'stretch' },
  modalButton: {
    flex: 1,
    minHeight: 45,
    paddingVertical: 12,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    fontFamily: fonts.body.semibold,
    fontSize: 14.5,
  },
});
