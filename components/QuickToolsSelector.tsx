import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import {
  QUICK_TOOLS_CATALOG,
  QuickToolConfig,
  getAvailableTools,
  MAX_QUICK_TOOLS,
} from '@/config/quickTools';

interface QuickToolsSelectorProps {
  visible: boolean;
  selectedToolIds: string[];
  onSave: (toolIds: string[]) => void;
  onClose: () => void;
}

export default function QuickToolsSelector({
  visible,
  selectedToolIds,
  onSave,
  onClose,
}: QuickToolsSelectorProps) {
  const colors = useThemeColors();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(selectedToolIds);

  // Reset selection when modal opens
  React.useEffect(() => {
    if (visible) {
      setSelected(selectedToolIds);
    }
  }, [visible, selectedToolIds]);

  const availableTools = useMemo(() => {
    if (!user) return [];
    return getAvailableTools(user.role, user.jobTitles || []);
  }, [user]);

  // Group tools by category
  const groupedTools = useMemo(() => {
    const groups: { [key: string]: QuickToolConfig[] } = {};
    const categoryOrder = ['general', 'assistants', 'editors', 'management'];

    categoryOrder.forEach((cat) => {
      const tools = availableTools.filter((t) => t.category === cat);
      if (tools.length > 0) {
        groups[cat] = tools;
      }
    });

    return groups;
  }, [availableTools]);

  const getCategoryLabel = (category: string): string => {
    switch (category) {
      case 'general': return t('quick_tools.category_general');
      case 'assistants': return t('quick_tools.category_assistants');
      case 'editors': return t('quick_tools.category_editors');
      case 'management': return t('quick_tools.category_management');
      default: return category;
    }
  };

  const toggleTool = (toolId: string) => {
    setSelected((prev) => {
      if (prev.includes(toolId)) {
        return prev.filter((id) => id !== toolId);
      }
      if (prev.length >= MAX_QUICK_TOOLS) {
        return prev; // Don't allow more than max
      }
      return [...prev, toolId];
    });
  };

  const handleSave = () => {
    onSave(selected);
  };

  const isMaxReached = selected.length >= MAX_QUICK_TOOLS;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Text style={[styles.headerButtonText, { color: colors.primary }]}>
              {t('common.cancel')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('quick_tools.select_tools')}
          </Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerButton}>
            <Text style={[styles.headerButtonText, { color: colors.primary, fontWeight: '700' }]}>
              {t('common.save')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Selection Counter */}
        <View style={[styles.counterBar, { backgroundColor: colors.card }]}>
          <Text style={[styles.counterText, { color: colors.textSecondary }]}>
            {t('quick_tools.selected_count', { count: selected.length, max: MAX_QUICK_TOOLS })}
          </Text>
          {isMaxReached && (
            <Text style={[styles.maxText, { color: colors.primary }]}>
              {t('quick_tools.max_reached')}
            </Text>
          )}
        </View>

        {/* Tool List */}
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {Object.entries(groupedTools).map(([category, tools]) => (
            <View key={category} style={styles.categorySection}>
              <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>
                {getCategoryLabel(category)}
              </Text>
              <View style={[styles.categoryCard, { backgroundColor: colors.card }]}>
                {tools.map((tool, index) => {
                  const isSelected = selected.includes(tool.id);
                  const isDisabled = !isSelected && isMaxReached;

                  return (
                    <React.Fragment key={tool.id}>
                      {index > 0 && (
                        <View style={[styles.separator, { backgroundColor: colors.border }]} />
                      )}
                      <TouchableOpacity
                        style={[styles.toolRow, isDisabled && styles.toolRowDisabled]}
                        onPress={() => toggleTool(tool.id)}
                        disabled={isDisabled}
                        activeOpacity={0.6}
                      >
                        <View style={[styles.toolIcon, { backgroundColor: colors.primary + '15' }]}>
                          <IconSymbol
                            ios_icon_name={tool.iosIcon as any}
                            android_material_icon_name={tool.androidIcon as any}
                            size={20}
                            color={colors.primary}
                          />
                        </View>
                        <Text
                          style={[
                            styles.toolLabel,
                            { color: isDisabled ? colors.textSecondary : colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {t(tool.labelKey)}
                        </Text>
                        <View
                          style={[
                            styles.checkbox,
                            {
                              borderColor: isSelected ? colors.primary : colors.border,
                              backgroundColor: isSelected ? colors.primary : 'transparent',
                            },
                          ]}
                        >
                          {isSelected && (
                            <IconSymbol
                              ios_icon_name="checkmark"
                              android_material_icon_name="check"
                              size={14}
                              color="#FFFFFF"
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 60,
  },
  headerButtonText: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  counterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
  },
  counterText: {
    fontSize: 14,
  },
  maxText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  categorySection: {
    marginTop: 16,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  categoryCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    marginLeft: 56,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  toolRowDisabled: {
    opacity: 0.4,
  },
  toolIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toolLabel: {
    flex: 1,
    fontSize: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
