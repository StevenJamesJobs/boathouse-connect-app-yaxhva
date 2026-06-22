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
import { IconSymbol } from '@/components/IconSymbol';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgJobTitles, OrgJobTitle } from '@/hooks/useOrgJobTitles';
import { supabase } from '@/app/integrations/supabase/client';

interface Props {
  colors: any;
}

export default function JobTitlesManager({ colors }: Props) {
  const { organizationId } = useOrganization();
  const { jobTitles, isLoading, refetch } = useOrgJobTitles();
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAddTitle = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    if (jobTitles.some(jt => jt.title.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Duplicate', 'This job title already exists.');
      return;
    }

    setAdding(true);
    try {
      const maxOrder = jobTitles.length > 0
        ? Math.max(...jobTitles.map(jt => jt.display_order))
        : 0;

      const { error } = await (supabase
        .from('organization_job_titles' as any)
        .insert({
          organization_id: organizationId,
          title: trimmed,
          display_order: maxOrder + 1,
          is_active: true,
        }) as any);

      if (error) throw error;
      setNewTitle('');
      await refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add title.');
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (item: OrgJobTitle) => {
    try {
      const { error } = await (supabase
        .from('organization_job_titles' as any)
        .update({ is_active: !item.is_active })
        .eq('id', item.id) as any);

      if (error) throw error;
      await refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update.');
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const current = jobTitles[index];
    const above = jobTitles[index - 1];
    try {
      await Promise.all([
        (supabase.from('organization_job_titles' as any)
          .update({ display_order: above.display_order })
          .eq('id', current.id) as any),
        (supabase.from('organization_job_titles' as any)
          .update({ display_order: current.display_order })
          .eq('id', above.id) as any),
      ]);
      await refetch();
    } catch {}
  };

  const handleDeleteTitle = (item: OrgJobTitle) => {
    Alert.alert(
      'Delete Title',
      `Remove "${item.title}" permanently? Employees with this title won't lose it, but it won't appear in the picker.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await (supabase
                .from('organization_job_titles' as any)
                .delete()
                .eq('id', item.id) as any);
              await refetch();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete.');
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
        <Text style={styles.sectionTitle}>Job Titles</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Job Titles</Text>
      <Text style={styles.hint}>
        Manage the job titles available when adding employees. Toggle off to hide from the picker.
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
          placeholder="New job title..."
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
