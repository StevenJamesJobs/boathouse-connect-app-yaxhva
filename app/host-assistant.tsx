
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import HeaderNavButton from '@/components/HeaderNavButton';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import ProgressRing from '@/components/ProgressRing';
import { supabase } from '@/app/integrations/supabase/client';
import { fonts } from '@/constants/fonts';
import { appleGreen } from '@/constants/Colors';

// The s74 hub shape (Steve): checklist progress rings on top (the Board Mix
// tile language, three across), then the training sections — banner-aware.

interface HostSectionCard {
  id: string;
  title: string;
  title_es: string | null;
  card_subtitle: string | null;
  card_subtitle_es: string | null;
  card_image_url: string | null;
  card_image_shape: string;
  icon: string | null;
}

interface ChecklistStat {
  done: number;
  total: number;
}

// iOS SF Symbol → Android MaterialIcons glyph for section card icons.
const ANDROID_ICON: Record<string, string> = {
  'graduationcap.fill': 'school',
  'book.fill': 'menu-book',
  'calendar': 'event',
  'star.fill': 'star',
  'link': 'link',
};

const EMPTY_STAT: ChecklistStat = { done: 0, total: 0 };

export default function HostAssistantScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [sections, setSections] = useState<HostSectionCard[]>([]);
  const [tileCounts, setTileCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<{ opening: ChecklistStat; running: ChecklistStat; closing: ChecklistStat }>({
    opening: EMPTY_STAT, running: EMPTY_STAT, closing: EMPTY_STAT,
  });

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const [sectionsR, openItems, runItems, closeItems, progress] = await Promise.all([
        supabase.rpc('get_host_sections', { p_actor_id: user.id }),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: false, p_checklist_type: 'opening' }),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: false, p_checklist_type: 'running_side_work' }),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: false, p_checklist_type: 'closing' }),
        supabase.rpc('get_my_checklist_progress', { p_actor_id: user.id, p_bartender: false, p_date: today }),
      ]);

      const rows = (sectionsR.data as HostSectionCard[]) || [];
      setSections(rows);

      const doneIds = new Set(
        (progress.data || []).filter((p: any) => p.completed).map((p: any) => p.checklist_item_id)
      );
      const stat = (items: any[] | null | undefined): ChecklistStat => ({
        done: (items || []).filter((i) => doneIds.has(i.id)).length,
        total: (items || []).length,
      });
      setStats({
        opening: stat(openItems.data),
        running: stat(runItems.data),
        closing: stat(closeItems.data),
      });

      // Tile counts per section — small N, so per-section fetches are fine.
      const counts = await Promise.all(
        rows.map((s) => supabase.rpc('get_host_section_tiles', { p_actor_id: user.id, p_section_id: s.id }))
      );
      const countMap: Record<string, number> = {};
      rows.forEach((s, i) => { countMap[s.id] = (counts[i].data || []).length; });
      setTileCounts(countMap);
    } catch (e) {
      // The hub is a launcher first — a failed stats fetch must never block it.
      console.error('Error loading host hub:', e);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pct = (x: ChecklistStat) => (x.total > 0 ? Math.round((x.done / x.total) * 100) : 0);

  // Pure client clock: mornings point at Opening, evenings at Closing.
  const openingIsNow = new Date().getHours() < 16;

  const zlabel = (label: string) => (
    <View style={styles.zlabelRow}>
      <Text style={[styles.zlabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.zlabelLine, { backgroundColor: colors.border + '55' }]} />
    </View>
  );

  const ringTile = (opts: {
    iconIos: string; iconAndroid: string; name: string; a11y: string; now: boolean;
    stat: ChecklistStat; route: string;
  }) => {
    const p = pct(opts.stat);
    // All done = the rewarding green (Steve, s74 smoke).
    const ringColor = p >= 100 ? appleGreen : colors.primary;
    return (
      <TouchableOpacity
        style={[
          styles.ringTile,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          !opts.now && styles.ringTileOff,
        ]}
        onPress={() => router.push(opts.route as any)}
        activeOpacity={0.7}
        accessibilityLabel={opts.a11y}
      >
        <View style={styles.ringTileTop}>
          <IconSymbol ios_icon_name={opts.iconIos} android_material_icon_name={opts.iconAndroid} size={15} color={colors.primary} />
          {opts.now && (
            <View style={[styles.nowPill, { backgroundColor: colors.primary }]}>
              <Text style={[styles.nowPillText, { color: colors.fireText }]}>{t('bartender_assistant.now_pill').toUpperCase()}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.ringTileName, { color: colors.text }]} numberOfLines={1}>{opts.name}</Text>
        <View style={styles.ringTileFoot}>
          <ProgressRing
            pct={p}
            size={44}
            stroke={4.5}
            color={ringColor}
            trackColor={colors.glassBorder}
          >
            <Text style={[styles.ringLabel, { color: p >= 100 ? appleGreen : p > 0 ? colors.primary : colors.textSecondary }]}>
              {p}%
            </Text>
          </ProgressRing>
          <Text style={[styles.statBig, { color: colors.text }]}>{opts.stat.done}/{opts.stat.total}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Staff-facing copy says "items" — "tiles" stays editor jargon (Steve).
  const countPill = (id: string) =>
    tileCounts[id] !== undefined ? (
      <Text style={[styles.countText, { color: colors.textSecondary }]} numberOfLines={1}>
        {t('host_assistant.items_count', { count: tileCounts[id] })}
      </Text>
    ) : null;

  const sectionCard = (section: HostSectionCard) => {
    const title = getLocalizedField(section, 'title', language);
    const subtitle = getLocalizedField(section, 'card_subtitle', language);
    const open = () => router.push(`/host-section?id=${section.id}` as any);

    // Banner shape + an image = the edge-to-edge card (the Menu Items Banner
    // language). Square (or no image yet) keeps the compact row.
    if (section.card_image_shape === 'banner' && section.card_image_url) {
      return (
        <TouchableOpacity
          key={section.id}
          style={[styles.bannerCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
          onPress={open}
          activeOpacity={0.85}
        >
          <StorageImage source={{ uri: section.card_image_url }} style={styles.bannerImage} resizeMode="cover" />
          <View style={styles.bannerBar}>
            <View style={styles.bannerBarText}>
              <Text style={[styles.sectionCardTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
              {!!subtitle && (
                <Text style={[styles.sectionCardDescription, { color: colors.textSecondary }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>
            {countPill(section.id)}
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={18} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={section.id}
        style={[styles.rowCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
        onPress={open}
        activeOpacity={0.7}
      >
        {section.card_image_url ? (
          <StorageImage source={{ uri: section.card_image_url }} style={styles.rowThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.rowThumb, styles.rowIconChip, { backgroundColor: colors.primary + '21' }]}>
            <IconSymbol
              ios_icon_name={section.icon || 'square.grid.2x2.fill'}
              android_material_icon_name={(section.icon && ANDROID_ICON[section.icon]) || 'apps'}
              size={22}
              color={colors.primary}
            />
          </View>
        )}
        <View style={styles.rowCardText}>
          <Text style={[styles.sectionCardTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          {!!subtitle && (
            <Text style={[styles.sectionCardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
              {subtitle}
            </Text>
          )}
          {countPill(section.id)}
        </View>
        <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('host_assistant.title')}
        rightWide={isManagerOrOwner(user)}
        right={isManagerOrOwner(user) ? (
          <HeaderNavButton
            label={t('common:to_editor')}
            iconIos="pencil"
            iconAndroid="edit"
            onPress={() => router.replace('/host-assistant-editor')}
          />
        ) : undefined}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* ── Checklist rings ── */}
        {zlabel(t('host_assistant.checklists'))}
        <View style={styles.tileRow}>
          {ringTile({
            iconIos: 'sunrise.fill', iconAndroid: 'wb-sunny',
            name: t('host_assistant.opening_short'),
            a11y: t('host_assistant.opening_checklist'),
            now: openingIsNow, stat: stats.opening, route: '/opening-checklist',
          })}
          {ringTile({
            iconIos: 'clock.fill', iconAndroid: 'schedule',
            name: t('host_assistant.running_short'),
            a11y: t('host_assistant.running_side_work'),
            now: false, stat: stats.running, route: '/running-side-work-checklist',
          })}
          {ringTile({
            iconIos: 'moon.fill', iconAndroid: 'nightlight',
            name: t('host_assistant.closing_short'),
            a11y: t('host_assistant.closing_checklist'),
            now: !openingIsNow, stat: stats.closing, route: '/closing-checklist',
          })}
        </View>

        {/* ── Training sections (OpenTable Academy + custom) ── */}
        {sections.length > 0 && (
          <>
            {zlabel(t('host_assistant.sections_label'))}
            {sections.map(sectionCard)}
          </>
        )}
      </ScrollView>
      <BottomNavBar activeTab="tools" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  zlabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 10,
    marginHorizontal: 2,
  },
  zlabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10.5,
    letterSpacing: 1.4,
    flexShrink: 1,
  },
  zlabelLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  // Checklist ring tiles — three across, so a tighter vertical layout than the
  // bartender pair (name on its own line, no "done today" caption).
  tileRow: {
    flexDirection: 'row',
    gap: 9,
  },
  ringTile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  ringTileOff: {
    opacity: 0.78,
  },
  ringTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
    minHeight: 16,
  },
  ringTileName: {
    fontFamily: fonts.display.semibold,
    fontSize: 12.5,
    marginBottom: 9,
  },
  nowPill: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  nowPillText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 7.5,
    letterSpacing: 0.6,
  },
  ringTileFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ringLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
  },
  statBig: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    flexShrink: 1,
  },
  // Section cards
  bannerCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    overflow: 'hidden',
    marginBottom: 12,
  },
  bannerImage: {
    width: '100%',
    height: 150,
  },
  bannerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerBarText: {
    flex: 1,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    padding: 13,
    marginBottom: 10,
  },
  rowThumb: {
    width: 46,
    height: 46,
    borderRadius: 12,
  },
  rowIconChip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCardText: {
    flex: 1,
  },
  sectionCardTitle: {
    fontFamily: fonts.display.semibold,
    fontSize: 15,
    marginBottom: 2,
  },
  sectionCardDescription: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    lineHeight: 17,
  },
  countText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    marginTop: 3,
  },
});
