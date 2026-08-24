
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { StorageImage } from '@/components/StorageImage';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalizedField } from '@/utils/translateContent';
import { supabase } from '@/app/integrations/supabase/client';
import HeaderNavButton from '@/components/HeaderNavButton';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import ProgressRing from '@/components/ProgressRing';
import GlassActionSheet from '@/components/GlassActionSheet';
import { useRequireManagerRoute } from '@/hooks/useRequireManagerRoute';
import { fonts } from '@/constants/fonts';
import { appleGreen } from '@/constants/Colors';

// Mirrors the user hub (Steve, s74): checklist rings on top (routing to the
// editors), then the sections manager rendered as the same banner-aware cards
// with editor affordances (eye toggle + meatball).

interface SectionRow {
  id: string;
  title: string;
  title_es: string | null;
  card_subtitle: string | null;
  card_subtitle_es: string | null;
  instructions: string | null;
  card_image_url: string | null;
  card_image_shape: string | null;
  icon: string | null;
  is_active: boolean;
  display_order: number;
}

interface ChecklistStat {
  done: number;
  total: number;
}

const ANDROID_ICON: Record<string, string> = {
  'graduationcap.fill': 'school',
  'book.fill': 'menu-book',
  'calendar': 'event',
  'star.fill': 'star',
  'link': 'link',
};

const EMPTY_STAT: ChecklistStat = { done: 0, total: 0 };

export default function HostAssistantEditorScreen() {
  useRequireManagerRoute();
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { language } = useLanguage();
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [tileCounts, setTileCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<{ opening: ChecklistStat; running: ChecklistStat; closing: ChecklistStat }>({
    opening: EMPTY_STAT, running: EMPTY_STAT, closing: EMPTY_STAT,
  });
  const [actionTarget, setActionTarget] = useState<{ section: SectionRow; index: number } | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const [sectionsR, openItems, runItems, closeItems, progress] = await Promise.all([
        supabase.rpc('get_host_sections', { p_actor_id: user.id, p_include_inactive: true }),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: false, p_checklist_type: 'opening' }),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: false, p_checklist_type: 'running_side_work' }),
        supabase.rpc('get_checklist_items', { p_actor_id: user.id, p_bartender: false, p_checklist_type: 'closing' }),
        supabase.rpc('get_my_checklist_progress', { p_actor_id: user.id, p_bartender: false, p_date: today }),
      ]);

      const rows = (sectionsR.data as SectionRow[]) || [];
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

      const counts = await Promise.all(
        rows.map((s) => supabase.rpc('get_host_section_tiles', { p_actor_id: user.id, p_section_id: s.id }))
      );
      const countMap: Record<string, number> = {};
      rows.forEach((s, i) => { countMap[s.id] = (counts[i].data || []).length; });
      setTileCounts(countMap);
    } catch (e) {
      console.error('Error loading host editor hub:', e);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pct = (x: ChecklistStat) => (x.total > 0 ? Math.round((x.done / x.total) * 100) : 0);
  const openingIsNow = new Date().getHours() < 16;

  const toggleActive = async (section: SectionRow) => {
    if (!user?.id) return;
    setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, is_active: !s.is_active } : s)));
    await supabase.rpc('update_host_section', {
      p_actor_id: user.id, p_section_id: section.id, p_title: section.title,
      p_card_subtitle: section.card_subtitle, p_instructions: section.instructions,
      p_card_image_url: section.card_image_url, p_card_image_shape: section.card_image_shape || 'square',
      p_icon: section.icon, p_is_active: !section.is_active,
    });
  };

  const moveSection = async (index: number, dir: -1 | 1) => {
    if (!user?.id || !organizationId) return;
    const next = index + dir;
    if (next < 0 || next >= sections.length) return;
    const reordered = [...sections];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(next, 0, moved);
    setSections(reordered);
    await supabase.rpc('reorder_host_sections', {
      p_actor_id: user.id, p_org_id: organizationId, p_ordered_ids: reordered.map((s) => s.id),
    });
  };

  const deleteSection = (section: SectionRow) => {
    Alert.alert(
      t('host_assistant_editor.delete_section_title'),
      t('host_assistant_editor.delete_section_confirm', { title: section.title }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'), style: 'destructive', onPress: async () => {
            if (!user?.id) return;
            await supabase.rpc('delete_host_section', { p_actor_id: user.id, p_section_id: section.id });
            await load();
          },
        },
      ]
    );
  };

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
          <View style={styles.ringTileTopRight}>
            {opts.now && (
              <View style={[styles.nowPill, { backgroundColor: colors.primary }]}>
                <Text style={[styles.nowPillText, { color: colors.fireText }]}>{t('bartender_assistant.now_pill').toUpperCase()}</Text>
              </View>
            )}
            <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={12} color={colors.textSecondary} />
          </View>
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

  const editorChips = (section: SectionRow, index: number) => (
    <View style={styles.editorChips}>
      <TouchableOpacity onPress={() => toggleActive(section)} style={styles.rowIconBtn} hitSlop={6}>
        <IconSymbol
          ios_icon_name={section.is_active ? 'eye.fill' : 'eye.slash.fill'}
          android_material_icon_name={section.is_active ? 'visibility' : 'visibility-off'}
          size={19} color={section.is_active ? colors.primary : colors.textSecondary}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setActionTarget({ section, index })} style={styles.rowIconBtn} hitSlop={6}>
        <IconSymbol ios_icon_name="ellipsis" android_material_icon_name="more-horiz" size={19} color={colors.text} />
      </TouchableOpacity>
    </View>
  );

  const countText = (id: string) =>
    tileCounts[id] !== undefined ? (
      <Text style={[styles.countText, { color: colors.textSecondary }]} numberOfLines={1}>
        {t('host_assistant.tiles_count', { count: tileCounts[id] })}
      </Text>
    ) : null;

  const sectionCard = (section: SectionRow, index: number) => {
    const title = getLocalizedField(section, 'title', language);
    const subtitle = getLocalizedField(section, 'card_subtitle', language);
    const open = () => router.push(`/host-section-editor?id=${section.id}` as any);
    const dimmed = !section.is_active;

    if (section.card_image_shape === 'banner' && section.card_image_url) {
      return (
        <TouchableOpacity
          key={section.id}
          style={[
            styles.bannerCard,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
            dimmed && styles.dimmed,
          ]}
          onPress={open}
          activeOpacity={0.85}
        >
          <StorageImage source={{ uri: section.card_image_url }} style={styles.bannerImage} resizeMode="cover" />
          <View style={styles.bannerBar}>
            <View style={styles.bannerBarText}>
              <View style={styles.titleLine}>
                <Text style={[styles.sectionCardTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
                {dimmed && (
                  <Text style={[styles.hiddenBadge, { color: colors.textSecondary }]}>
                    {t('host_assistant_editor.hidden')}
                  </Text>
                )}
              </View>
              {countText(section.id)}
            </View>
            {editorChips(section, index)}
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={section.id}
        style={[
          styles.rowCard,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          dimmed && styles.dimmed,
        ]}
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
          <View style={styles.titleLine}>
            <Text style={[styles.sectionCardTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            {dimmed && (
              <Text style={[styles.hiddenBadge, { color: colors.textSecondary }]}>
                {t('host_assistant_editor.hidden')}
              </Text>
            )}
          </View>
          {!!subtitle && (
            <Text style={[styles.sectionCardDescription, { color: colors.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
          {countText(section.id)}
        </View>
        {editorChips(section, index)}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('host_assistant_editor.title')}
        rightWide
        right={
          <HeaderNavButton
            label={t('common:to_user')}
            iconIos="person.fill"
            iconAndroid="person"
            onPress={() => router.replace('/host-assistant')}
          />
        }
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* ── Checklist editors (rings mirror the user hub) ── */}
        {zlabel(t('host_assistant_editor.checklists_editor'))}
        <View style={styles.tileRow}>
          {ringTile({
            iconIos: 'sunrise.fill', iconAndroid: 'wb-sunny',
            name: t('host_assistant.opening_short'),
            a11y: t('host_assistant_editor.opening_checklist_editor'),
            now: openingIsNow, stat: stats.opening, route: '/opening-checklist-editor',
          })}
          {ringTile({
            iconIos: 'clock.fill', iconAndroid: 'schedule',
            name: t('host_assistant.running_short'),
            a11y: t('host_assistant_editor.running_side_work_editor'),
            now: false, stat: stats.running, route: '/running-side-work-editor',
          })}
          {ringTile({
            iconIos: 'moon.fill', iconAndroid: 'nightlight',
            name: t('host_assistant.closing_short'),
            a11y: t('host_assistant_editor.closing_checklist_editor'),
            now: !openingIsNow, stat: stats.closing, route: '/closing-checklist-editor',
          })}
        </View>

        {/* ── Sections manager — Add lives up top beside the label (Steve, s74 smoke) ── */}
        <View style={styles.zlabelRow}>
          <Text style={[styles.zlabel, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('host_assistant_editor.sections').toUpperCase()}
          </Text>
          <View style={[styles.zlabelLine, { backgroundColor: colors.border + '55' }]} />
          <TouchableOpacity
            style={[styles.addChip, { backgroundColor: colors.primary + '2E', borderColor: colors.primary + '6B' }]}
            onPress={() => router.push('/host-section-editor?id=new' as any)}
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={13} color={colors.primary} />
            <Text style={[styles.addChipText, { color: colors.primary }]}>{t('host_assistant_editor.add_section')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('host_assistant_editor.sections_desc')}
        </Text>

        {sections.map(sectionCard)}
      </ScrollView>

      {/* Section overflow actions */}
      <GlassActionSheet
        visible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget ? getLocalizedField(actionTarget.section, 'title', language) : ''}
        actions={actionTarget ? [
          {
            key: 'edit',
            label: t('common:edit'),
            iosIcon: 'pencil',
            androidIcon: 'edit',
            onPress: () => router.push(`/host-section-editor?id=${actionTarget.section.id}` as any),
          },
          {
            key: 'up',
            label: t('host_assistant_editor.move_up'),
            iosIcon: 'arrow.up',
            androidIcon: 'arrow-upward',
            disabled: actionTarget.index === 0,
            onPress: () => moveSection(actionTarget.index, -1),
          },
          {
            key: 'down',
            label: t('host_assistant_editor.move_down'),
            iosIcon: 'arrow.down',
            androidIcon: 'arrow-downward',
            disabled: actionTarget.index >= sections.length - 1,
            onPress: () => moveSection(actionTarget.index, 1),
          },
          {
            key: 'toggle',
            label: actionTarget.section.is_active ? t('host_assistant_editor.hide') : t('host_assistant_editor.show'),
            iosIcon: actionTarget.section.is_active ? 'eye.slash.fill' : 'eye.fill',
            androidIcon: actionTarget.section.is_active ? 'visibility-off' : 'visibility',
            onPress: () => toggleActive(actionTarget.section),
          },
          {
            key: 'delete',
            label: t('common:delete'),
            iosIcon: 'trash',
            androidIcon: 'delete',
            destructive: true,
            onPress: () => deleteSection(actionTarget.section),
          },
        ] : []}
      />

      <BottomNavBar activeTab="manage" />
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
  hint: {
    fontFamily: fonts.body.regular,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 11,
    marginHorizontal: 2,
  },
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
  ringTileTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
  // Section cards (banner-aware, mirroring the user hub)
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
    gap: 6,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 8,
  },
  bannerBarText: {
    flex: 1,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingVertical: 11,
    paddingLeft: 13,
    paddingRight: 4,
    marginBottom: 10,
  },
  dimmed: {
    opacity: 0.55,
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
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionCardTitle: {
    fontFamily: fonts.display.semibold,
    fontSize: 15,
    marginBottom: 2,
    flexShrink: 1,
  },
  hiddenBadge: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
  editorChips: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIconBtn: {
    padding: 8,
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  addChipText: {
    fontFamily: fonts.body.semibold,
    fontSize: 11.5,
  },
});
