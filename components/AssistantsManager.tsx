import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgJobTitles } from '@/hooks/useOrgJobTitles';
import { supabase } from '@/app/integrations/supabase/client';

interface OrgAssistant {
  id: string;
  assistant_key: string;
  display_name: string | null;
  is_active: boolean;
}

interface TitleMapping {
  assistant_key: string;
  job_title: string;
}

const ASSISTANT_INFO: Record<string, { label: string; description: string }> = {
  server: { label: 'Server Assistant', description: 'Server opening/closing checklists, sidework guides' },
  bartender: { label: 'Bartender Assistant', description: 'Bar checklists, cocktail recipes, binder' },
  host: { label: 'Host Assistant', description: 'Seating charts, reservation guides' },
  kitchen: { label: 'Kitchen Assistant', description: 'Kitchen prep lists, station guides' },
  check_outs: { label: 'Check Outs Calculator', description: 'End-of-shift checkout calculator' },
};

interface Props {
  colors: any;
}

export default function AssistantsManager({ colors }: Props) {
  const { organizationId } = useOrganization();
  const { activeJobTitles } = useOrgJobTitles();
  const [assistants, setAssistants] = useState<OrgAssistant[]>([]);
  const [mappings, setMappings] = useState<TitleMapping[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    if (!organizationId) return;
    setIsLoading(true);

    const [assistantsRes, mappingsRes] = await Promise.all([
      (supabase
        .from('organization_assistants' as any)
        .select('id, assistant_key, display_name, is_active')
        .eq('organization_id', organizationId)
        .order('assistant_key', { ascending: true }) as any),
      (supabase
        .from('job_title_assistants' as any)
        .select('assistant_key, job_title')
        .eq('organization_id', organizationId) as any),
    ]);

    if (!assistantsRes.error && assistantsRes.data) setAssistants(assistantsRes.data);
    if (!mappingsRes.error && mappingsRes.data) setMappings(mappingsRes.data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [organizationId]);

  const handleToggle = async (item: OrgAssistant) => {
    try {
      const { error } = await (supabase
        .from('organization_assistants' as any)
        .update({ is_active: !item.is_active })
        .eq('id', item.id) as any);

      if (error) throw error;
      setAssistants(prev =>
        prev.map(a => a.id === item.id ? { ...a, is_active: !a.is_active } : a)
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update.');
    }
  };

  const titleHasAccess = (assistantKey: string, jobTitle: string) =>
    mappings.some(m => m.assistant_key === assistantKey && m.job_title === jobTitle);

  const handleToggleTitle = async (assistantKey: string, jobTitle: string) => {
    const hasAccess = titleHasAccess(assistantKey, jobTitle);

    try {
      if (hasAccess) {
        const { error } = await (supabase
          .from('job_title_assistants' as any)
          .delete()
          .eq('organization_id', organizationId)
          .eq('assistant_key', assistantKey)
          .eq('job_title', jobTitle) as any);
        if (error) throw error;
        setMappings(prev => prev.filter(m =>
          !(m.assistant_key === assistantKey && m.job_title === jobTitle)
        ));
      } else {
        const { error } = await (supabase
          .from('job_title_assistants' as any)
          .insert({
            organization_id: organizationId,
            assistant_key: assistantKey,
            job_title: jobTitle,
          }) as any);
        if (error) throw error;
        setMappings(prev => [...prev, { assistant_key: assistantKey, job_title: jobTitle }]);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update access.');
    }
  };

  const styles = createStyles(colors);

  if (isLoading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tools & Assistants</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Tools & Assistants</Text>
      <Text style={styles.hint}>
        Toggle tools on/off, then tap a tool to configure which job titles can access it.
      </Text>

      {assistants.map(item => {
        const info = ASSISTANT_INFO[item.assistant_key] || {
          label: item.display_name || item.assistant_key,
          description: '',
        };
        const isExpanded = expandedKey === item.assistant_key;
        const assignedCount = mappings.filter(m => m.assistant_key === item.assistant_key).length;

        return (
          <View key={item.id}>
            <TouchableOpacity
              style={styles.assistantRow}
              onPress={() => setExpandedKey(isExpanded ? null : item.assistant_key)}
              activeOpacity={0.7}
            >
              <View style={styles.chevronWrap}>
                <IconSymbol
                  ios_icon_name={isExpanded ? 'chevron.down' : 'chevron.right'}
                  android_material_icon_name={isExpanded ? 'expand-more' : 'chevron-right'}
                  size={16}
                  color={colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.assistantName,
                    !item.is_active && { opacity: 0.4 },
                  ]}
                >
                  {item.display_name || info.label}
                </Text>
                <Text style={styles.assistantDesc}>
                  {info.description}
                  {assignedCount > 0 ? ` · ${assignedCount} title${assignedCount !== 1 ? 's' : ''}` : ''}
                </Text>
              </View>
              <Switch
                value={item.is_active}
                onValueChange={() => handleToggle(item)}
                trackColor={{ false: colors.border, true: colors.primary + '80' }}
                thumbColor={item.is_active ? colors.primary : colors.textSecondary}
              />
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.titlesList}>
                <Text style={styles.titlesHeader}>Who can access this tool?</Text>
                {activeJobTitles.map(title => {
                  const checked = titleHasAccess(item.assistant_key, title);
                  return (
                    <TouchableOpacity
                      key={title}
                      style={styles.titleCheckRow}
                      onPress={() => handleToggleTitle(item.assistant_key, title)}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        styles.checkbox,
                        checked && { backgroundColor: colors.primary, borderColor: colors.primary },
                        !checked && { borderColor: colors.border },
                      ]}>
                        {checked && (
                          <IconSymbol
                            ios_icon_name="checkmark"
                            android_material_icon_name="check"
                            size={14}
                            color={colors.fireText}
                          />
                        )}
                      </View>
                      <Text style={styles.titleCheckLabel}>{title}</Text>
                    </TouchableOpacity>
                  );
                })}
                {activeJobTitles.length === 0 && (
                  <Text style={styles.emptyText}>No active job titles. Add some above first.</Text>
                )}
              </View>
            )}
          </View>
        );
      })}

      {assistants.length === 0 && (
        <Text style={styles.emptyText}>No assistants configured for this organization.</Text>
      )}
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
    assistantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + '40',
    },
    chevronWrap: {
      width: 24,
      alignItems: 'center',
      marginRight: 4,
    },
    assistantName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    assistantDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    titlesList: {
      paddingLeft: 28,
      paddingVertical: 8,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + '40',
    },
    titlesHeader: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    titleCheckRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    titleCheckLabel: {
      fontSize: 14,
      color: colors.text,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontStyle: 'italic',
      textAlign: 'center',
      paddingVertical: 16,
    },
  });
}
