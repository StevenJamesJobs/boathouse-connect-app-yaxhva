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
import { useTranslation } from 'react-i18next';
import { IconSymbol } from '@/components/IconSymbol';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgJobTitles } from '@/hooks/useOrgJobTitles';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';
import { fonts } from '@/constants/fonts';

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

// t() cannot run at module scope, so this table holds KEYS and the render site
// resolves them. The labels reuse the employee_tools names the staff-facing
// Tools screen already uses, so one assistant has one name app-wide.
const ASSISTANT_INFO: Record<string, { labelKey: string; descKey: string }> = {
  server: { labelKey: 'employee_tools:server_assistant', descKey: 'org_settings.assistant_server_desc' },
  bartender: { labelKey: 'employee_tools:bartender_assistant', descKey: 'org_settings.assistant_bartender_desc' },
  host: { labelKey: 'employee_tools:host_assistant', descKey: 'org_settings.assistant_host_desc' },
  kitchen: { labelKey: 'employee_tools:kitchen_assistant', descKey: 'org_settings.assistant_kitchen_desc' },
  check_outs: { labelKey: 'employee_tools:check_out_calculator', descKey: 'org_settings.assistant_check_outs_desc' },
};

interface Props {
  colors: any;
  /** Render bare content (no card, no title) — the host's fold group provides
      the chrome. Non-embedded keeps the legacy standalone card. */
  embedded?: boolean;
  /** Reports the assistant count once loaded (the host's fold badge). */
  onCountChange?: (n: number) => void;
}

export default function AssistantsManager({ colors, embedded, onCountChange }: Props) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const { activeJobTitles } = useOrgJobTitles();
  const [assistants, setAssistants] = useState<OrgAssistant[]>([]);
  const [mappings, setMappings] = useState<TitleMapping[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isLoading) onCountChange?.(assistants.length);
  }, [isLoading, assistants.length, onCountChange]);

  const fetchData = async () => {
    if (!organizationId || !user?.id) return;
    setIsLoading(true);

    const [assistantsRes, mappingsRes] = await Promise.all([
      supabase.rpc('get_org_assistants', { p_actor_id: user.id }),
      supabase.rpc('get_job_title_assistants', { p_actor_id: user.id }),
    ]);

    if (!assistantsRes.error && assistantsRes.data) setAssistants(assistantsRes.data);
    if (!mappingsRes.error && mappingsRes.data) setMappings(mappingsRes.data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [organizationId, user?.id]);

  const handleToggle = async (item: OrgAssistant) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase.rpc('set_org_assistant_active', {
        p_actor_id: user.id,
        p_id: item.id,
        p_is_active: !item.is_active,
      });

      if (error) throw error;
      setAssistants(prev =>
        prev.map(a => a.id === item.id ? { ...a, is_active: !a.is_active } : a)
      );
    } catch (err: any) {
      Alert.alert(t('common:error'), translateServerError(err, t('org_settings.update_failed', 'Failed to update.')));
    }
  };

  const titleHasAccess = (assistantKey: string, jobTitle: string) =>
    mappings.some(m => m.assistant_key === assistantKey && m.job_title === jobTitle);

  const handleToggleTitle = async (assistantKey: string, jobTitle: string) => {
    const hasAccess = titleHasAccess(assistantKey, jobTitle);
    if (!user?.id) return;

    try {
      const { error } = await supabase.rpc('set_job_title_assistant', {
        p_actor_id: user.id,
        p_assistant_key: assistantKey,
        p_job_title: jobTitle,
        p_enabled: !hasAccess,
      });
      if (error) throw error;
      if (hasAccess) {
        setMappings(prev => prev.filter(m =>
          !(m.assistant_key === assistantKey && m.job_title === jobTitle)
        ));
      } else {
        setMappings(prev => [...prev, { assistant_key: assistantKey, job_title: jobTitle }]);
      }
    } catch (err: any) {
      Alert.alert(t('common:error'), translateServerError(err, t('org_settings.update_access_failed', 'Failed to update access.')));
    }
  };

  const styles = createStyles(colors);

  if (isLoading) {
    if (embedded) {
      return <ActivityIndicator color={colors.primary} style={{ paddingVertical: 16 }} />;
    }
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('org_settings.tools_assistants', 'Tools & Assistants')}</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const body = (
    <>
      <Text style={styles.hint}>
        {t('org_settings.tools_assistants_hint', 'Toggle tools on/off, then tap a tool to configure which job titles can access it.')}
      </Text>

      {assistants.map(item => {
        const meta = ASSISTANT_INFO[item.assistant_key];
        const info = {
          label: meta ? t(meta.labelKey) : (item.display_name || item.assistant_key),
          description: meta ? t(meta.descKey) : '',
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
                  {assignedCount > 0 ? ' · ' + t('org_settings.title_count', { count: assignedCount }) : ''}
                </Text>
              </View>
              <Switch
                value={item.is_active}
                onValueChange={() => handleToggle(item)}
                trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
                thumbColor={colors.card}
              />
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.titlesList}>
                <Text style={styles.titlesHeader}>{t('org_settings.who_can_access', 'Who can access this tool?')}</Text>
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
                        !checked && { borderColor: colors.glassBorder },
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
                  <Text style={styles.emptyText}>{t('org_settings.no_active_titles', 'No active job titles. Add some above first.')}</Text>
                )}
              </View>
            )}
          </View>
        );
      })}

      {assistants.length === 0 && (
        <Text style={styles.emptyText}>{t('org_settings.no_assistants', 'No assistants configured for this organization.')}</Text>
      )}
    </>
  );

  if (embedded) {
    return <View>{body}</View>;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('org_settings.tools_assistants', 'Tools & Assistants')}</Text>
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
    assistantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    chevronWrap: {
      width: 24,
      alignItems: 'center',
      marginRight: 4,
    },
    assistantName: {
      fontFamily: fonts.body.semibold,
      fontSize: 14,
      color: colors.text,
    },
    assistantDesc: {
      fontFamily: fonts.body.regular,
      fontSize: 11.5,
      lineHeight: 15,
      color: colors.textSecondary,
      marginTop: 2,
    },
    titlesList: {
      paddingLeft: 28,
      paddingVertical: 8,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    titlesHeader: {
      fontFamily: fonts.mono.semibold,
      fontSize: 10,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
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
      borderRadius: 6,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      backgroundColor: colors.glass,
    },
    titleCheckLabel: {
      fontFamily: fonts.body.regular,
      fontSize: 14,
      color: colors.text,
    },
    emptyText: {
      fontFamily: fonts.body.regular,
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: 16,
    },
  });
}
