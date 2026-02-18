
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function BartenderBinderEditorScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={managerColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('bartender_binder_editor.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Checklists Editor Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconSymbol
              ios_icon_name="checklist"
              android_material_icon_name="checklist"
              size={32}
              color={managerColors.highlight}
            />
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>{t('bartender_binder_editor.checklists_editor')}</Text>
              <Text style={styles.cardDescription}>
                {t('bartender_binder_editor.checklists_editor_desc')}
              </Text>
            </View>
          </View>
          
          {/* Opening Checklist Editor */}
          <TouchableOpacity 
            style={styles.subCardButton}
            onPress={() => router.push('/bartender-opening-checklist-editor')}
          >
            <View style={styles.subCardContent}>
              <IconSymbol
                ios_icon_name="sunrise.fill"
                android_material_icon_name="wb-sunny"
                size={24}
                color={managerColors.highlight}
              />
              <Text style={styles.subCardText}>{t('bartender_binder_editor.opening_checklist_editor')}</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={managerColors.text}
            />
          </TouchableOpacity>

          {/* Closing Checklist Editor */}
          <TouchableOpacity
            style={styles.subCardButton}
            onPress={() => router.push('/bartender-closing-checklist-editor')}
          >
            <View style={styles.subCardContent}>
              <IconSymbol
                ios_icon_name="moon.fill"
                android_material_icon_name="nightlight"
                size={24}
                color={managerColors.highlight}
              />
              <Text style={styles.subCardText}>{t('bartender_binder_editor.closing_checklist_editor')}</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={managerColors.text}
            />
          </TouchableOpacity>
        </View>

        {/* Purees and Syrups Recipes Editor */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconSymbol
              ios_icon_name="drop.fill"
              android_material_icon_name="opacity"
              size={32}
              color={managerColors.highlight}
            />
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>{t('bartender_binder_editor.purees_syrups_editor')}</Text>
              <Text style={styles.cardDescription}>
                {t('bartender_binder_editor.purees_syrups_editor_desc')}
              </Text>
            </View>
          </View>
          
          {/* Purees & Syrups Recipes Editor Button */}
          <TouchableOpacity 
            style={styles.subCardButton}
            onPress={() => router.push('/puree-syrup-recipes-editor')}
          >
            <View style={styles.subCardContent}>
              <IconSymbol
                ios_icon_name="drop.fill"
                android_material_icon_name="opacity"
                size={24}
                color={managerColors.highlight}
              />
              <Text style={styles.subCardText}>{t('bartender_binder_editor.purees_syrups_button')}</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={managerColors.text}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: managerColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: managerColors.card,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: managerColors.text,
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
  card: {
    backgroundColor: managerColors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
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
    color: managerColors.text,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: managerColors.textSecondary,
  },
  subCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: managerColors.background,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: managerColors.border,
  },
  subCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subCardText: {
    fontSize: 15,
    fontWeight: '600',
    color: managerColors.text,
  },
});
