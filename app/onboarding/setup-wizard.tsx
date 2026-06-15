import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { splashColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import MenuIconPicker from '@/components/MenuIconPicker';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

const DEFAULT_JOB_TITLES = [
  'Manager',
  'Server',
  'Bartender',
  'Host',
  'Busser',
  'Runner',
  'Chef',
  'Cook',
  'Kitchen',
  'Dishwasher',
];

export default function SetupWizardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ organizationId: string }>();
  const { organizationId: contextOrgId } = useOrganization();
  const organizationId = params.organizationId || contextOrgId;

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1 state — job titles
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
  const [customTitle, setCustomTitle] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Step 2 state — menus
  const [hasSeasonalMenus, setHasSeasonalMenus] = useState(true);
  const [menu1Name, setMenu1Name] = useState('Menu 1');
  const [menu2Name, setMenu2Name] = useState('Menu 2');
  const [menu1Icon, setMenu1Icon] = useState('snowflake');
  const [menu2Icon, setMenu2Icon] = useState('sun.max.fill');
  const [headerIcon, setHeaderIcon] = useState('fork.knife');
  const [categoryScope, setCategoryScope] = useState<'shared' | 'per_menu'>('shared');

  // ─── Step 1: Job Titles ───────────────────────────────────────────

  const toggleTitle = (title: string) => {
    setSelectedTitles((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    );
  };

  const addCustomTitle = () => {
    const trimmed = customTitle.trim();
    if (!trimmed) return;
    if (selectedTitles.includes(trimmed)) {
      Alert.alert('Duplicate', 'That job title already exists.');
      return;
    }
    setSelectedTitles((prev) => [...prev, trimmed]);
    setCustomTitle('');
    setShowCustomInput(false);
  };

  // All known titles (defaults + any custom ones the user added)
  const allTitles = Array.from(new Set([...DEFAULT_JOB_TITLES, ...selectedTitles]));

  // ─── Navigation ───────────────────────────────────────────────────

  const nextStep = () => {
    if (step === 1 && selectedTitles.length === 0) {
      Alert.alert('Select Titles', 'Please select at least one job title.');
      return;
    }
    setStep((s) => s + 1);
  };

  const prevStep = () => setStep((s) => s - 1);

  // ─── Step 3: Save ─────────────────────────────────────────────────

  const handleComplete = async () => {
    if (!organizationId) {
      Alert.alert('Error', 'Organization not found. Please go back and try again.');
      return;
    }

    setIsLoading(true);

    try {
      // Idempotent: clear any titles left over from a previous (failed) attempt
      // so tapping Complete Setup again replaces them instead of duplicating.
      const { error: clearError } = await supabase
        .from('organization_job_titles')
        .delete()
        .eq('organization_id', organizationId);

      if (clearError) {
        console.error('[SetupWizard] Clear job titles error:', clearError);
        Alert.alert('Error', 'Failed to save job titles.');
        setIsLoading(false);
        return;
      }

      // Insert job titles with display_order
      const titleRows = selectedTitles.map((title, idx) => ({
        organization_id: organizationId,
        title,
        display_order: idx,
      }));

      const { error: titlesError } = await supabase
        .from('organization_job_titles')
        .insert(titleRows);

      if (titlesError) {
        console.error('[SetupWizard] Insert job titles error:', titlesError);
        Alert.alert('Error', 'Failed to save job titles.');
        setIsLoading(false);
        return;
      }

      // Seed default job-title → assistant mappings now that titles exist, so
      // employees can see the right assistants out of the box (idempotent;
      // owner can adjust in Org Settings → Jobs & Tools). Non-fatal on error.
      const { error: seedError } = await supabase.rpc(
        'seed_default_job_title_assistants',
        { p_org_id: organizationId }
      );
      if (seedError) {
        console.error('[SetupWizard] Seed assistant mappings error:', seedError);
      }

      // Seed the Cocktails A-Z starter library (clone from the canonical source
      // org). Idempotent by name; non-fatal — a failure here must not block
      // onboarding. p_source_org defaults to McLoone's in the RPC.
      const { error: cocktailSeedError } = await supabase.rpc('seed_org_cocktails', {
        p_target_org: organizationId,
      });
      if (cocktailSeedError) {
        console.error('[SetupWizard] Seed cocktails error:', cocktailSeedError);
      }

      // Update org menu settings. Per-menu scope only applies with 2 menus.
      const menuCount = hasSeasonalMenus ? 2 : 1;
      const scope: 'shared' | 'per_menu' = hasSeasonalMenus ? categoryScope : 'shared';
      const { error: orgError } = await supabase
        .from('organizations')
        .update({
          menu_count: menuCount,
          menu_category_scope: scope,
          menu_1_name: menu1Name.trim() || 'Menu 1',
          // menu_2_name is NOT NULL in the DB; menu_count governs display, so
          // keep a valid placeholder even when there's only one menu.
          menu_2_name: menu2Name.trim() || 'Menu 2',
          menu_1_icon: menu1Icon,
          menu_2_icon: menu2Icon,
          header_icon: headerIcon,
        })
        .eq('id', organizationId);

      if (orgError) {
        console.error('[SetupWizard] Update org menus error:', orgError);
        Alert.alert('Error', 'Failed to save menu configuration.');
        setIsLoading(false);
        return;
      }

      // Per-menu mode needs the slot-1/slot-2 category trees materialized from
      // the seeded slot-0 tree. Non-fatal: the owner can re-toggle in Settings.
      if (scope === 'per_menu') {
        const { error: matError } = await (supabase.rpc as any)('materialize_org_per_menu_categories', {
          p_org_id: organizationId,
        });
        if (matError) console.error('[SetupWizard] Materialize per-menu categories error:', matError);
      }

      router.push({
        pathname: '/onboarding/join-code',
        params: { organizationId },
      });
    } catch (err: any) {
      console.error('[SetupWizard] Unexpected error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Step indicator ───────────────────────────────────────────────

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {[1, 2, 3].map((s) => (
        <View key={s} style={styles.stepRow}>
          <View
            style={[
              styles.stepDot,
              s === step && styles.stepDotActive,
              s < step && styles.stepDotCompleted,
            ]}
          >
            {s < step ? (
              <IconSymbol
                ios_icon_name="checkmark"
                android_material_icon_name="check"
                size={14}
                color="#FFFFFF"
              />
            ) : (
              <Text
                style={[
                  styles.stepDotText,
                  s === step && styles.stepDotTextActive,
                ]}
              >
                {s}
              </Text>
            )}
          </View>
          {s < 3 && (
            <View
              style={[styles.stepLine, s < step && styles.stepLineCompleted]}
            />
          )}
        </View>
      ))}
    </View>
  );

  // ─── Step 1 UI ────────────────────────────────────────────────────

  const renderStep1 = () => (
    <View>
      <Text style={styles.stepTitle}>Job Titles</Text>
      <Text style={styles.stepSubtitle}>
        Select the positions at your restaurant. You can add more later.
      </Text>

      <View style={styles.titlesGrid}>
        {allTitles.map((title) => {
          const isActive = selectedTitles.includes(title);
          return (
            <TouchableOpacity
              key={title}
              style={[styles.titleChip, isActive && styles.titleChipActive]}
              onPress={() => toggleTitle(title)}
            >
              <Text
                style={[
                  styles.titleChipText,
                  isActive && styles.titleChipTextActive,
                ]}
              >
                {title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {showCustomInput ? (
        <View style={styles.customRow}>
          <View style={[styles.inputContainer, { flex: 1, marginBottom: 0 }]}>
            <TextInput
              style={styles.input}
              placeholder="Custom title"
              placeholderTextColor={splashColors.textSecondary}
              value={customTitle}
              onChangeText={setCustomTitle}
              autoCapitalize="words"
              autoFocus
              onSubmitEditing={addCustomTitle}
            />
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={addCustomTitle}>
            <IconSymbol
              ios_icon_name="plus"
              android_material_icon_name="add"
              size={22}
              color="#FFFFFF"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              setShowCustomInput(false);
              setCustomTitle('');
            }}
          >
            <IconSymbol
              ios_icon_name="xmark"
              android_material_icon_name="close"
              size={20}
              color={splashColors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addCustomButton}
          onPress={() => setShowCustomInput(true)}
        >
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add-circle"
            size={20}
            color={splashColors.primary}
          />
          <Text style={styles.addCustomText}>Add Custom Title</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ─── Step 2 UI ────────────────────────────────────────────────────

  const renderStep2 = () => (
    <View>
      <Text style={styles.stepTitle}>Menu Configuration</Text>
      <Text style={styles.stepSubtitle}>
        Configure your restaurant's menu setup.
      </Text>

      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Seasonal menus?</Text>
          <Switch
            value={hasSeasonalMenus}
            onValueChange={setHasSeasonalMenus}
            trackColor={{ false: '#D0D0D0', true: splashColors.secondary }}
            thumbColor={hasSeasonalMenus ? splashColors.primary : '#F5F5F5'}
          />
        </View>
        <Text style={styles.switchHint}>
          {hasSeasonalMenus
            ? 'Two menus — great for summer/winter rotations.'
            : 'One menu — you can always add a second later.'}
        </Text>
      </View>

      <Text style={styles.label}>Menu 1 Name</Text>
      <View style={styles.inputContainer}>
        <IconSymbol
          ios_icon_name="fork.knife"
          android_material_icon_name="restaurant"
          size={20}
          color={splashColors.textSecondary}
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          placeholder="Menu 1"
          placeholderTextColor={splashColors.textSecondary}
          value={menu1Name}
          onChangeText={setMenu1Name}
          autoCapitalize="words"
        />
      </View>

      <MenuIconPicker label={`${menu1Name.trim() || 'Menu 1'} Icon`} value={menu1Icon} onChange={setMenu1Icon} />

      {hasSeasonalMenus && (
        <>
          <Text style={styles.label}>Menu 2 Name</Text>
          <View style={styles.inputContainer}>
            <IconSymbol
              ios_icon_name="fork.knife"
              android_material_icon_name="restaurant"
              size={20}
              color={splashColors.textSecondary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Menu 2"
              placeholderTextColor={splashColors.textSecondary}
              value={menu2Name}
              onChangeText={setMenu2Name}
              autoCapitalize="words"
            />
          </View>

          <MenuIconPicker label={`${menu2Name.trim() || 'Menu 2'} Icon`} value={menu2Icon} onChange={setMenu2Icon} />

          <Text style={styles.label}>How should categories work?</Text>
          <TouchableOpacity
            style={[styles.scopeOption, categoryScope === 'shared' && styles.scopeOptionActive]}
            onPress={() => setCategoryScope('shared')}
            activeOpacity={0.8}
          >
            <Text style={styles.scopeOptionTitle}>Shared categories {categoryScope === 'shared' ? '✓' : ''}</Text>
            <Text style={styles.scopeOptionDesc}>
              Both menus use the same category list (e.g. one seasonal rotation). An item can appear on
              {` ${menu1Name.trim() || 'Menu 1'}, ${menu2Name.trim() || 'Menu 2'}, or both`}. Best if your two menus
              are variations of the same lineup.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scopeOption, categoryScope === 'per_menu' && styles.scopeOptionActive]}
            onPress={() => setCategoryScope('per_menu')}
            activeOpacity={0.8}
          >
            <Text style={styles.scopeOptionTitle}>Per-menu categories {categoryScope === 'per_menu' ? '✓' : ''}</Text>
            <Text style={styles.scopeOptionDesc}>
              Each menu gets its own independent categories you edit separately, and every item belongs to a single
              menu. Best when your two menus are truly different (e.g. a Breakfast menu and a Dinner menu). You can
              switch modes anytime in Settings.
            </Text>
          </TouchableOpacity>
        </>
      )}

      <MenuIconPicker label="Header Icon (shown next to your restaurant name)" value={headerIcon} onChange={setHeaderIcon} />
    </View>
  );

  // ─── Step 3 UI ────────────────────────────────────────────────────

  const renderStep3 = () => (
    <View>
      <Text style={styles.stepTitle}>Review & Save</Text>
      <Text style={styles.stepSubtitle}>
        Confirm your setup before finishing.
      </Text>

      {/* Job Titles Summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Job Titles</Text>
        <View style={styles.titlesGrid}>
          {selectedTitles.map((title) => (
            <View key={title} style={[styles.titleChip, styles.titleChipActive]}>
              <Text style={styles.titleChipTextActive}>{title}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Menu Summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Menus</Text>
        <Text style={styles.cardValue}>
          {hasSeasonalMenus ? '2 menus' : '1 menu'}
        </Text>
        <Text style={styles.cardDetail}>
          {menu1Name.trim() || 'Menu 1'}
          {hasSeasonalMenus ? ` / ${menu2Name.trim() || 'Menu 2'}` : ''}
        </Text>
      </View>
    </View>
  );

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderStepIndicator()}

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </ScrollView>

      {/* Bottom nav */}
      <View style={styles.bottomBar}>
        {step > 1 ? (
          <TouchableOpacity style={styles.backButton} onPress={prevStep}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {step < 3 ? (
          <TouchableOpacity style={styles.nextButton} onPress={nextStep}>
            <Text style={styles.nextButtonText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextButton, isLoading && styles.buttonDisabled]}
            onPress={handleComplete}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.nextButtonText}>Complete Setup</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: splashColors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 100,
  },

  // Step indicator
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: splashColors.primary,
  },
  stepDotCompleted: {
    backgroundColor: splashColors.primary,
  },
  stepDotText: {
    fontSize: 14,
    fontWeight: '600',
    color: splashColors.textSecondary,
  },
  stepDotTextActive: {
    color: '#FFFFFF',
  },
  stepLine: {
    width: 40,
    height: 3,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 4,
  },
  stepLineCompleted: {
    backgroundColor: splashColors.primary,
  },

  // Step content
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: splashColors.text,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 15,
    color: splashColors.textSecondary,
    marginBottom: 24,
    lineHeight: 21,
  },

  // Job titles grid
  titlesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  titleChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  titleChipActive: {
    backgroundColor: splashColors.primary,
    borderColor: splashColors.primary,
  },
  titleChipText: {
    fontSize: 14,
    color: splashColors.textSecondary,
    fontWeight: '500',
  },
  titleChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Custom title input
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: splashColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCustomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  addCustomText: {
    fontSize: 15,
    color: splashColors.primary,
    fontWeight: '600',
  },

  // Inputs (shared with step 2)
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: splashColors.text,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: splashColors.text,
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: splashColors.text,
    marginBottom: 10,
  },
  cardValue: {
    fontSize: 15,
    color: splashColors.text,
    fontWeight: '500',
    marginBottom: 4,
  },
  cardDetail: {
    fontSize: 14,
    color: splashColors.textSecondary,
  },

  // Switch row
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: splashColors.text,
  },
  switchHint: {
    fontSize: 13,
    color: splashColors.textSecondary,
    lineHeight: 18,
  },

  // Category-scope option cards
  scopeOption: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
  },
  scopeOptionActive: {
    borderColor: splashColors.primary,
    backgroundColor: '#FFF8F0',
  },
  scopeOptionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: splashColors.text,
    marginBottom: 4,
  },
  scopeOptionDesc: {
    fontSize: 13,
    color: splashColors.textSecondary,
    lineHeight: 18,
  },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    backgroundColor: splashColors.background,
    gap: 12,
  },
  backButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: splashColors.text,
  },
  nextButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: splashColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
