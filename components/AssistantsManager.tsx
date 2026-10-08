import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
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
  bartender: { labelKey: 'employee_tools:bartender_assistant', descKey: 'org_settings.assistant_bartender_desc' },
  host: { labelKey: 'employee_tools:host_assistant', descKey: 'org_settings.assistant_host_desc' },
  kitchen: { labelKey: 'employee_tools:kitchen_assistant', descKey: 'org_settings.assistant_kitchen_desc' },
  check_outs: { labelKey: 'employee_tools:check_out_calculator', descKey: 'org_settings.assistant_check_outs_desc' },
};

// s91: the families with an EDITOR grant. Their rows carry a second chip block,
// "Who can edit recipes", stored in the same job_title_assistants table under
// `${assistant_key}_editor` (the server's _require_recipe_editor reads it).
const EDITOR_FAMILIES: Record<string, { editorNameKey: string }> = {
  bartender: { editorNameKey: 'org_settings:editor_name_bartender' },
  kitchen: { editorNameKey: 'org_settings:editor_name_kitchen' },
};
const editorKeyFor = (assistantKey: string) => `${assistantKey}_editor`;

interface Props {
  colors: any;
  /** Render bare content (no card, no title) — the host's fold group provides
      the chrome. Non-embedded keeps the legacy standalone card. */
  embedded?: boolean;
  /** Reports the assistant count once loaded (the host's fold badge). */
  onCountChange?: (n: number) => void;
}

/**
 * The s86 Onboarding chip grammar (setup-wizard's JobChip): a glass chip with a
 * FIXED 14pt round slot, an empty ring when off and a tinted filled ✓ when on,
 * so picking never reflows the row. Selected = tint ring, never a solid fill.
 */
function TitleChip({ label, selected, onPress, colors }: { label: string; selected: boolean; onPress: () => void; colors: any }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        chipStyles.chip,
        selected
          ? { backgroundColor: colors.primary + '14', borderColor: colors.primary }
          : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View
        style={[
          chipStyles.slot,
          selected
            ? { backgroundColor: colors.primary, borderColor: colors.primary }
            : { borderColor: colors.glassBorder },
        ]}
      >
        {selected && (
          <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={9} color={colors.fireText} />
        )}
      </View>
      <Text style={[chipStyles.label, { color: selected ? colors.text : colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  slot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.body.semibold,
    fontSize: 12,
  },
});

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

  // Exact-key matches only: the `_editor` rows live in the same table and must
  // never count toward (or read as) visibility.
  const titleHasAccess = (assistantKey: string, jobTitle: string) =>
    mappings.some(m => m.assistant_key === assistantKey && m.job_title === jobTitle);
  const countFor = (assistantKey: string) =>
    mappings.filter(m => m.assistant_key === assistantKey).length;

  const setMapping = async (assistantKey: string, jobTitle: string, enabled: boolean) => {
    if (!user?.id) return;
    const { error } = await supabase.rpc('set_job_title_assistant', {
      p_actor_id: user.id,
      p_assistant_key: assistantKey,
      p_job_title: jobTitle,
      p_enabled: enabled,
    });
    if (error) throw error;
    setMappings(prev => {
      const without = prev.filter(m => !(m.assistant_key === assistantKey && m.job_title === jobTitle));
      return enabled ? [...without, { assistant_key: assistantKey, job_title: jobTitle }] : without;
    });
  };

  /** "Who can see it": unticking a title also drops its editor grant (a title
      that cannot see the assistant cannot edit it), one RPC each. */
  const handleToggleTitle = async (assistantKey: string, jobTitle: string) => {
    const hasAccess = titleHasAccess(assistantKey, jobTitle);
    try {
      await setMapping(assistantKey, jobTitle, !hasAccess);
      if (hasAccess && EDITOR_FAMILIES[assistantKey] && titleHasAccess(editorKeyFor(assistantKey), jobTitle)) {
        await setMapping(editorKeyFor(assistantKey), jobTitle, false);
      }
    } catch (err: any) {
      Alert.alert(t('common:error'), translateServerError(err, t('org_settings.update_access_failed', 'Failed to update access.')));
    }
  };

  /** "Who can edit recipes": the `${key}_editor` mapping. */
  const handleToggleEditor = async (assistantKey: string, jobTitle: string) => {
    const editorKey = editorKeyFor(assistantKey);
    const hasGrant = titleHasAccess(editorKey, jobTitle);
    try {
      await setMapping(editorKey, jobTitle, !hasGrant);
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
        const editorFamily = EDITOR_FAMILIES[item.assistant_key];
        const editorKey = editorKeyFor(item.assistant_key);
        const seeCount = countFor(item.assistant_key);
        const editCount = editorFamily ? countFor(editorKey) : 0;
        // Only titles that can SEE the assistant are offered an editor grant.
        const editableTitles = editorFamily ? activeJobTitles.filter(title => titleHasAccess(item.assistant_key, title)) : [];

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
                {!!info.description && (
                  <Text style={styles.assistantDesc}>{info.description}</Text>
                )}
                <Text style={styles.assistantMeta} numberOfLines={1}>
                  {t('org_settings.titles_can_see', { count: seeCount })}
                  {editorFamily ? ' · ' + t('org_settings.titles_can_edit', { count: editCount }) : ''}
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
                <Text style={styles.fieldLabel}>{t('org_settings.who_can_see')}</Text>
                {activeJobTitles.length > 0 ? (
                  <View style={styles.chips}>
                    {activeJobTitles.map(title => (
                      <TitleChip
                        key={title}
                        label={title}
                        colors={colors}
                        selected={titleHasAccess(item.assistant_key, title)}
                        onPress={() => handleToggleTitle(item.assistant_key, title)}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>{t('org_settings.no_active_titles', 'No active job titles. Add some above first.')}</Text>
                )}

                {editorFamily && (
                  <>
                    <View style={styles.fieldLabelRow}>
                      <Text style={styles.fieldLabel}>{t('org_settings.who_can_edit_recipes')}</Text>
                      <Text style={styles.newTag}>{' · ' + t('org_settings.new_tag')}</Text>
                    </View>
                    {editableTitles.length > 0 ? (
                      <View style={styles.chips}>
                        {editableTitles.map(title => (
                          <TitleChip
                            key={title}
                            label={title}
                            colors={colors}
                            selected={titleHasAccess(editorKey, title)}
                            onPress={() => handleToggleEditor(item.assistant_key, title)}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.editorHint}>{t('org_settings.edit_needs_see_hint')}</Text>
                    )}
                    <Text style={styles.editorHint}>
                      {t('org_settings.editor_grant_hint', { editor: t(editorFamily.editorNameKey) })}
                    </Text>
                  </>
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
    // The collapsed meta line: mono, uppercase, "{n} TITLES CAN SEE IT · {m} CAN EDIT".
    assistantMeta: {
      fontFamily: fonts.mono.semibold,
      fontSize: 9.5,
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      marginTop: 4,
    },
    titlesList: {
      paddingLeft: 28,
      paddingVertical: 8,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    fieldLabelRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginTop: 14,
    },
    fieldLabel: {
      fontFamily: fonts.mono.semibold,
      fontSize: 10,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    newTag: {
      fontFamily: fonts.mono.semibold,
      fontSize: 10,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: colors.primary,
      marginBottom: 8,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    editorHint: {
      fontFamily: fonts.body.regular,
      fontSize: 11.5,
      lineHeight: 15,
      color: colors.textSecondary,
      marginTop: 10,
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
