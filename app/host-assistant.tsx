
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BottomNavBar from '@/components/BottomNavBar';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';

interface HostSectionCard {
  id: string;
  title: string;
  card_subtitle: string | null;
  card_image_url: string | null;
  icon: string | null;
}

// iOS SF Symbol → Android MaterialIcons glyph for section card icons.
const ANDROID_ICON: Record<string, string> = {
  'graduationcap.fill': 'school',
  'book.fill': 'menu-book',
  'calendar': 'event',
  'star.fill': 'star',
  'link': 'link',
};

export default function HostAssistantScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { organizationId } = useOrganization();
  const [sections, setSections] = useState<HostSectionCard[]>([]);

  const loadSections = useCallback(async () => {
    if (!organizationId) return;
    try {
      const { data } = await (supabase
        .from('host_sections' as any)
        .select('id, title, card_subtitle, card_image_url, icon')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('display_order', { ascending: true }) as any);
      setSections((data as HostSectionCard[]) || []);
    } catch (e) {
      console.error('Error loading host sections:', e);
    }
  }, [organizationId]);

  useFocusEffect(useCallback(() => { loadSections(); }, [loadSections]));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('host_assistant.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Custom Sections (owner/manager managed; e.g. OpenTable Academy) */}
        {sections.map((section) => (
          <TouchableOpacity
            key={section.id}
            style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push(`/host-section?id=${section.id}` as any)}
          >
            <View style={styles.sectionCardContent}>
              {section.card_image_url ? (
                <Image source={{ uri: section.card_image_url }} style={styles.sectionThumb} resizeMode="cover" />
              ) : (
                <IconSymbol
                  ios_icon_name={section.icon || 'square.grid.2x2.fill'}
                  android_material_icon_name={(section.icon && ANDROID_ICON[section.icon]) || 'apps'}
                  size={32}
                  color={colors.primary}
                />
              )}
              <View style={styles.sectionCardText}>
                <Text style={[styles.sectionCardTitle, { color: colors.text }]}>{section.title}</Text>
                {!!section.card_subtitle && (
                  <Text style={[styles.sectionCardDescription, { color: colors.textSecondary }]}>
                    {section.card_subtitle}
                  </Text>
                )}
              </View>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        ))}

        {/* Checklists Section */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <IconSymbol
              ios_icon_name="checklist"
              android_material_icon_name="checklist"
              size={32}
              color={colors.primary}
            />
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('host_assistant.checklists')}</Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                {t('host_assistant.checklists_desc')}
              </Text>
            </View>
          </View>

          {/* Opening Checklist */}
          <TouchableOpacity
            style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/opening-checklist')}
          >
            <View style={styles.subCardContent}>
              <IconSymbol
                ios_icon_name="sunrise.fill"
                android_material_icon_name="wb-sunny"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.subCardText, { color: colors.text }]}>{t('host_assistant.opening_checklist')}</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Running Side Work Checklist */}
          <TouchableOpacity
            style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/running-side-work-checklist')}
          >
            <View style={styles.subCardContent}>
              <IconSymbol
                ios_icon_name="clock.fill"
                android_material_icon_name="schedule"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.subCardText, { color: colors.text }]}>{t('host_assistant.running_side_work')}</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Closing Checklist */}
          <TouchableOpacity
            style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/closing-checklist')}
          >
            <View style={styles.subCardContent}>
              <IconSymbol
                ios_icon_name="moon.fill"
                android_material_icon_name="nightlight"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.subCardText, { color: colors.text }]}>{t('host_assistant.closing_checklist')}</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
      <BottomNavBar activeTab="tools" />
    </View>
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
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  sectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  sectionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  sectionThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  sectionCardText: {
    flex: 1,
  },
  sectionCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionCardDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
  },
  subCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
  },
  subCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subCardText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
