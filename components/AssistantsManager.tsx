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
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';

interface OrgAssistant {
  id: string;
  assistant_key: string;
  display_name: string | null;
  is_active: boolean;
}

const ASSISTANT_ICONS: Record<string, { label: string; description: string }> = {
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
  const [assistants, setAssistants] = useState<OrgAssistant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAssistants = async () => {
    if (!organizationId) return;
    setIsLoading(true);
    const { data, error } = await (supabase
      .from('organization_assistants' as any)
      .select('id, assistant_key, display_name, is_active')
      .eq('organization_id', organizationId)
      .order('assistant_key', { ascending: true }) as any);

    if (!error && data) setAssistants(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAssistants();
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
        Toggle which tools are available for your employees. Disabled tools won't appear in anyone's Tools tab.
      </Text>

      {assistants.map(item => {
        const info = ASSISTANT_ICONS[item.assistant_key] || {
          label: item.display_name || item.assistant_key,
          description: '',
        };
        return (
          <View key={item.id} style={styles.assistantRow}>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.assistantName,
                  !item.is_active && { opacity: 0.4 },
                ]}
              >
                {item.display_name || info.label}
              </Text>
              {info.description ? (
                <Text style={styles.assistantDesc}>{info.description}</Text>
              ) : null}
            </View>
            <Switch
              value={item.is_active}
              onValueChange={() => handleToggle(item)}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={item.is_active ? colors.primary : colors.textSecondary}
            />
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
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontStyle: 'italic',
      textAlign: 'center',
      paddingVertical: 16,
    },
  });
}
