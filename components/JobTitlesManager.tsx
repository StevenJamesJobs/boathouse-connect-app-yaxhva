import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { NestableDraggableFlatList, ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgJobTitles, OrgJobTitle } from '@/hooks/useOrgJobTitles';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';
import { fonts } from '@/constants/fonts';

interface Props {
  colors: any;
  /** Render bare content (no card, no title) — the host's fold group provides
      the chrome. Non-embedded keeps the legacy standalone card. NOTE: the
      titles render in a NestableDraggableFlatList, so the HOST's vertical
      scroller must be a NestableScrollContainer (org-settings' Jobs & Tools
      page is) or the drag gesture fights the outer scroll. */
  embedded?: boolean;
  /** Reports the job-title count once loaded (the host's fold badge). */
  onCountChange?: (n: number) => void;
}

export default function JobTitlesManager({ colors, embedded, onCountChange }: Props) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const { jobTitles, isLoading, refetch } = useOrgJobTitles();
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  // Local order for the draggable list: optimistic during a drag, re-synced
  // from the hook whenever the server list changes (add/delete/refetch).
  const [localTitles, setLocalTitles] = useState<OrgJobTitle[]>([]);
  useEffect(() => {
    setLocalTitles(jobTitles);
  }, [jobTitles]);

  useEffect(() => {
    if (!isLoading) onCountChange?.(jobTitles.length);
  }, [isLoading, jobTitles.length, onCountChange]);

  const handleAddTitle = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    if (jobTitles.some(jt => jt.title.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert(
        t('onboarding:duplicate_title', 'Duplicate'),
        t('org_settings.job_title_exists', 'This job title already exists.'),
      );
      return;
    }

    if (!user?.id) return;
    setAdding(true);
    try {
      const { error } = await supabase.rpc('add_org_job_title', {
        p_actor_id: user.id,
        p_title: trimmed,
      });

      if (error) throw error;
      setNewTitle('');
      await refetch();
    } catch (err: any) {
      Alert.alert(t('common:error'), translateServerError(err, t('org_settings.add_title_failed', 'Failed to add title.')));
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (item: OrgJobTitle) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase.rpc('set_org_job_title_active', {
        p_actor_id: user.id,
        p_id: item.id,
        p_is_active: !item.is_active,
      });

      if (error) throw error;
      await refetch();
    } catch (err: any) {
      Alert.alert(t('common:error'), translateServerError(err, t('org_settings.update_failed', 'Failed to update.')));
    }
  };

  // Drag-to-reorder (Steve's s70 smoke ask — the one-step-per-tap arrows were
  // tedious): commit the dropped order optimistically and persist the full id
  // list. SUCCESS DOES NOT REFETCH (the s69 menu-editor pattern): the RPC
  // writes exactly the order we hold, and a refetch would raise isLoading and
  // unmount the draggable list — which, mid-another-drag, strands the outer
  // NestableScrollContainer with scrolling disabled (the library re-enables it
  // only from its own onDragEnd). Refetch only to restore server truth on error.
  const handleDragEnd = async ({ from, to, data }: { from: number; to: number; data: OrgJobTitle[] }) => {
    if (from === to) return;
    setLocalTitles(data);
    if (!user?.id) return;
    try {
      const { error } = await supabase.rpc('reorder_org_job_titles', {
        p_actor_id: user.id,
        p_ordered_ids: data.map(j => j.id),
      });
      if (error) throw error;
    } catch (err: any) {
      Alert.alert(t('common:error'), translateServerError(err, t('org_settings.update_failed', 'Failed to update.')));
      await refetch();
    }
  };

  const handleDeleteTitle = (item: OrgJobTitle) => {
    Alert.alert(
      t('org_settings.delete_title_title', 'Delete Title'),
      t('org_settings.delete_title_msg', {
        title: item.title,
        defaultValue: 'Remove "{{title}}" permanently? Employees with this title won\'t lose it, but it won\'t appear in the picker.',
      }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            try {
              await supabase.rpc('delete_org_job_title', {
                p_actor_id: user.id,
                p_id: item.id,
              });
              await refetch();
            } catch (err: any) {
              Alert.alert(t('common:error'), translateServerError(err, t('org_settings.delete_title_failed', 'Failed to delete.')));
            }
          },
        },
      ]
    );
  };

  const styles = createStyles(colors);

  // Spinner ONLY on the empty initial load: refetches (toggle/add/delete) keep
  // the list mounted while fresh data swaps in. Unmounting the draggable list
  // mid-refetch is what stranded the outer scroll (see handleDragEnd note).
  if (isLoading && localTitles.length === 0) {
    if (embedded) {
      return <ActivityIndicator color={colors.primary} style={{ paddingVertical: 16 }} />;
    }
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('onboarding:step1_title', 'Job Titles')}</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const body = (
    <>
      <Text style={styles.hint}>
        {t('org_settings.job_titles_hint', 'Manage the job titles available when adding employees. Toggle off to hide from the picker.')}
      </Text>

      <NestableDraggableFlatList
        data={localTitles}
        keyExtractor={(j) => j.id}
        onDragEnd={handleDragEnd}
        renderItem={({ item, drag, isActive }: RenderItemParams<OrgJobTitle>) => (
          <ScaleDecorator>
            <View style={[styles.titleRow, isActive && styles.titleRowActive]}>
              {/* Grabber: long-press to lift, drag to reorder (the menu-editor
                  grip pattern; drag activates from this surface only). */}
              <Pressable onLongPress={drag} disabled={isActive} hitSlop={6} style={styles.grabber}>
                <IconSymbol
                  ios_icon_name="line.3.horizontal"
                  android_material_icon_name="drag-handle"
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
              <Text
                style={[
                  styles.titleText,
                  !item.is_active && { opacity: 0.4, textDecorationLine: 'line-through' },
                ]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              <Switch
                value={item.is_active}
                onValueChange={() => handleToggleActive(item)}
                trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
                thumbColor={colors.card}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
              <TouchableOpacity
                onPress={() => handleDeleteTitle(item)}
                style={styles.deleteButton}
              >
                <IconSymbol
                  ios_icon_name="trash"
                  android_material_icon_name="delete"
                  size={16}
                  color="#E53935"
                />
              </TouchableOpacity>
            </View>
          </ScaleDecorator>
        )}
      />

      {/* Add New Title */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder={t('org_settings.job_title_ph', 'New job title...')}
          placeholderTextColor={colors.textSecondary}
          onSubmitEditing={handleAddTitle}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addButton, !newTitle.trim() && { opacity: 0.4 }]}
          onPress={handleAddTitle}
          disabled={!newTitle.trim() || adding}
        >
          {adding ? (
            <ActivityIndicator size="small" color={colors.fireText} />
          ) : (
            <IconSymbol
              ios_icon_name="plus"
              android_material_icon_name="add"
              size={20}
              color={colors.fireText}
            />
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  if (embedded) {
    return <View>{body}</View>;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('onboarding:step1_title', 'Job Titles')}</Text>
      {body}
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    // Standalone (non-embedded) fallback chrome — the org-settings fold is the
    // live path and supplies its own.
    section: {
      backgroundColor: colors.surface,
      borderRadius: 17,
      padding: 16,
      marginBottom: 16,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.surfaceBorder,
    },
    sectionTitle: {
      fontFamily: fonts.display.semibold,
      fontSize: 15.5,
      color: colors.text,
      marginBottom: 4,
    },
    hint: {
      fontFamily: fonts.body.regular,
      fontSize: 11.5,
      lineHeight: 15,
      color: colors.textSecondary,
      marginBottom: 10,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    titleRowActive: {
      opacity: 0.92,
      backgroundColor: colors.glass,
      borderRadius: 10,
      borderBottomWidth: 0,
    },
    grabber: {
      width: 26,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      marginRight: 6,
    },
    titleText: {
      flex: 1,
      fontFamily: fonts.body.medium,
      fontSize: 14,
      color: colors.text,
    },
    deleteButton: {
      padding: 6,
      marginLeft: 4,
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      gap: 8,
    },
    addInput: {
      flex: 1,
      backgroundColor: colors.glass,
      borderRadius: 13,
      paddingHorizontal: 13,
      paddingVertical: 10,
      minHeight: 43,
      fontFamily: fonts.body.regular,
      fontSize: 14,
      color: colors.text,
      borderWidth: StyleSheet.hairlineWidth + 0.5,
      borderColor: colors.glassBorder,
    },
    addButton: {
      width: 43,
      height: 43,
      borderRadius: 13,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
