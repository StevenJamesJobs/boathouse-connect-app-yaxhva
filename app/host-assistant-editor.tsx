
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';
import HeaderNavButton from '@/components/HeaderNavButton';

interface SectionRow {
  id: string;
  title: string;
  card_subtitle: string | null;
  instructions: string | null;
  card_image_url: string | null;
  card_image_shape: string | null;
  icon: string | null;
  is_active: boolean;
  display_order: number;
}

export default function HostAssistantEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [sections, setSections] = useState<SectionRow[]>([]);

  const loadSections = useCallback(async () => {
    if (!organizationId) return;
    const { data } = await (supabase
      .from('host_sections' as any)
      .select('*')
      .eq('organization_id', organizationId)
      .order('display_order', { ascending: true }) as any);
    setSections((data as SectionRow[]) || []);
  }, [organizationId]);

  useFocusEffect(useCallback(() => { loadSections(); }, [loadSections]));

  const toggleActive = async (section: SectionRow) => {
    if (!user?.id) return;
    setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, is_active: !s.is_active } : s)));
    await supabase.rpc('update_host_section' as any, {
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
    await supabase.rpc('reorder_host_sections' as any, {
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
            await supabase.rpc('delete_host_section' as any, { p_actor_id: user.id, p_section_id: section.id });
            await loadSections();
          },
        },
      ]
    );
  };

  const sectionActions = (section: SectionRow, index: number) => {
    const opts = [
      t('common:edit'),
      index > 0 ? t('host_assistant_editor.move_up') : null,
      index < sections.length - 1 ? t('host_assistant_editor.move_down') : null,
      section.is_active ? t('host_assistant_editor.hide') : t('host_assistant_editor.show'),
      t('common:delete'),
      t('common:cancel'),
    ].filter(Boolean) as string[];
    const handle = (choice: string) => {
      if (choice === t('common:edit')) router.push(`/host-section-editor?id=${section.id}` as any);
      else if (choice === t('host_assistant_editor.move_up')) moveSection(index, -1);
      else if (choice === t('host_assistant_editor.move_down')) moveSection(index, 1);
      else if (choice === t('host_assistant_editor.hide') || choice === t('host_assistant_editor.show')) toggleActive(section);
      else if (choice === t('common:delete')) deleteSection(section);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: opts, destructiveButtonIndex: opts.indexOf(t('common:delete')), cancelButtonIndex: opts.indexOf(t('common:cancel')) },
        (i) => handle(opts[i])
      );
    } else {
      Alert.alert(section.title, undefined, [
        ...opts.filter((o) => o !== t('common:cancel')).map((o) => ({
          text: o,
          style: (o === t('common:delete') ? 'destructive' : 'default') as 'destructive' | 'default',
          onPress: () => handle(o),
        })),
        { text: t('common:cancel'), style: 'cancel' as const },
      ]);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('host_assistant_editor.title')}</Text>
        <HeaderNavButton
          label={t('common:user')}
          iconIos="person.fill"
          iconAndroid="person"
          onPress={() => router.push('/host-assistant')}
        />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Sections Manager */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <IconSymbol ios_icon_name="rectangle.stack.fill" android_material_icon_name="dashboard" size={32} color={colors.primary} />
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('host_assistant_editor.sections')}</Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                {t('host_assistant_editor.sections_desc')}
              </Text>
            </View>
          </View>

          {sections.map((section, index) => (
            <View key={section.id} style={[styles.sectionRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TouchableOpacity style={styles.sectionRowMain} onPress={() => router.push(`/host-section-editor?id=${section.id}` as any)}>
                <Text style={[styles.sectionRowTitle, { color: colors.text }]} numberOfLines={1}>{section.title}</Text>
                {!section.is_active && (
                  <Text style={[styles.hiddenBadge, { color: colors.textSecondary }]}>{t('host_assistant_editor.hidden')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleActive(section)} style={styles.rowIconBtn}>
                <IconSymbol
                  ios_icon_name={section.is_active ? 'eye.fill' : 'eye.slash.fill'}
                  android_material_icon_name={section.is_active ? 'visibility' : 'visibility-off'}
                  size={20} color={section.is_active ? colors.primary : colors.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => sectionActions(section, index)} style={styles.rowIconBtn}>
                <IconSymbol ios_icon_name="ellipsis" android_material_icon_name="more-horiz" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.addButton, { borderColor: colors.primary }]}
            onPress={() => router.push('/host-section-editor?id=new' as any)}
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={18} color={colors.primary} />
            <Text style={[styles.addButtonText, { color: colors.primary }]}>{t('host_assistant_editor.add_section')}</Text>
          </TouchableOpacity>
        </View>

        {/* Checklists Editor Section */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <IconSymbol ios_icon_name="checklist" android_material_icon_name="checklist" size={32} color={colors.primary} />
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('host_assistant_editor.checklists_editor')}</Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                {t('host_assistant_editor.checklists_editor_desc')}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/opening-checklist-editor')}
          >
            <View style={styles.subCardContent}>
              <IconSymbol ios_icon_name="sunrise.fill" android_material_icon_name="wb-sunny" size={24} color={colors.primary} />
              <Text style={[styles.subCardText, { color: colors.text }]}>{t('host_assistant_editor.opening_checklist_editor')}</Text>
            </View>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/running-side-work-editor')}
          >
            <View style={styles.subCardContent}>
              <IconSymbol ios_icon_name="clock.fill" android_material_icon_name="schedule" size={24} color={colors.primary} />
              <Text style={[styles.subCardText, { color: colors.text }]}>{t('host_assistant_editor.running_side_work_editor')}</Text>
            </View>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/closing-checklist-editor')}
          >
            <View style={styles.subCardContent}>
              <IconSymbol ios_icon_name="moon.fill" android_material_icon_name="nightlight" size={24} color={colors.primary} />
              <Text style={[styles.subCardText, { color: colors.text }]}>{t('host_assistant_editor.closing_checklist_editor')}</Text>
            </View>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </ScrollView>
      <BottomNavBar activeTab="manage" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, borderBottomWidth: 1,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  placeholder: { width: 40 },
  scrollView: { flex: 1 },
  contentContainer: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 100 },
  card: {
    borderRadius: 16, padding: 20, marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)', elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  cardHeaderText: { flex: 1, marginLeft: 16 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  cardDescription: { fontSize: 14 },
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 14, marginTop: 12, borderWidth: 1,
  },
  sectionRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionRowTitle: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  hiddenBadge: { fontSize: 11, fontStyle: 'italic' },
  rowIconBtn: { padding: 8 },
  addButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 12, marginTop: 14,
  },
  addButtonText: { fontSize: 15, fontWeight: '700' },
  subCardButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 8, paddingVertical: 14, paddingHorizontal: 16, marginTop: 12, borderWidth: 1,
  },
  subCardContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  subCardText: { fontSize: 15, fontWeight: '600' },
});
