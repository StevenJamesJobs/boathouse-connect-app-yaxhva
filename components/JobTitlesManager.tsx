import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgJobTitles, OrgJobTitle } from '@/hooks/useOrgJobTitles';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';

interface Props {
  colors: any;
}

export default function JobTitlesManager({ colors }: Props) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const { jobTitles, isLoading, refetch } = useOrgJobTitles();
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

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

  const handleMoveUp = async (index: number) => {
    if (index === 0 || !user?.id) return;
    try {
      const reordered = [...jobTitles];
      [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
      await supabase.rpc('reorder_org_job_titles', {
        p_actor_id: user.id,
        p_ordered_ids: reordered.map(j => j.id),
      });
      await refetch();
    } catch {}
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

  if (isLoading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('onboarding:step1_title', 'Job Titles')}</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('onboarding:step1_title', 'Job Titles')}</Text>
      <Text style={styles.hint}>
        {t('org_settings.job_titles_hint', 'Manage the job titles available when adding employees. Toggle off to hide from the picker.')}
      </Text>

      {jobTitles.map((item, index) => (
        <View key={item.id} style={styles.titleRow}>
          <TouchableOpacity
            onPress={() => handleMoveUp(index)}
            disabled={index === 0}
            style={styles.reorderButton}
          >
            <IconSymbol
              ios_icon_name="chevron.up"
              android_material_icon_name="expand-less"
              size={18}
              color={index === 0 ? colors.border : colors.textSecondary}
            />
          </TouchableOpacity>
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
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={item.is_active ? colors.primary : colors.textSecondary}
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
      ))}

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
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    section: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    hint: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 12,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + '40',
    },
    reorderButton: {
      padding: 4,
      marginRight: 8,
    },
    titleText: {
      flex: 1,
      fontSize: 15,
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
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    addButton: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
