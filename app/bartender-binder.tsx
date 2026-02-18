
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function BartenderBinderScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const colors = user?.role === 'manager' ? managerColors : employeeColors;

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('bartender_binder.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
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
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('bartender_binder.checklists')}</Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                {t('bartender_binder.checklists_desc')}
              </Text>
            </View>
          </View>
          
          {/* Opening Checklist */}
          <TouchableOpacity 
            style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/bartender-opening-checklist')}
          >
            <View style={styles.subCardContent}>
              <IconSymbol
                ios_icon_name="sunrise.fill"
                android_material_icon_name="wb-sunny"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.subCardText, { color: colors.text }]}>{t('bartender_binder.opening_checklist')}</Text>
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
            onPress={() => router.push('/bartender-closing-checklist')}
          >
            <View style={styles.subCardContent}>
              <IconSymbol
                ios_icon_name="moon.fill"
                android_material_icon_name="nightlight"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.subCardText, { color: colors.text }]}>{t('bartender_binder.closing_checklist')}</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Purees and Syrups Recipes Section */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <IconSymbol
              ios_icon_name="drop.fill"
              android_material_icon_name="opacity"
              size={32}
              color={colors.primary}
            />
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('bartender_binder.purees_syrups')}</Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                {t('bartender_binder.purees_syrups_desc')}
              </Text>
            </View>
          </View>
          
          {/* Purees & Syrups Recipes Button */}
          <TouchableOpacity 
            style={[styles.subCardButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/puree-syrup-recipes')}
          >
            <View style={styles.subCardContent}>
              <IconSymbol
                ios_icon_name="drop.fill"
                android_material_icon_name="opacity"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.subCardText, { color: colors.text }]}>{t('bartender_binder.view_recipes')}</Text>
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
