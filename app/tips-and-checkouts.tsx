/**
 * Tips & Checkouts (s78, presets phase s79) — two views under one pushed
 * screen: the Tips Tracker (DEFAULT — Steve's call) and the Checkouts ritual.
 *
 * s79 header rework: the Solo|Pool capsule moved INTO the ConsoleStrip's
 * header row (gear + capsule together truncated the title in both languages —
 * measured, Steve's placement pick), which frees the standard 38pt right slot
 * for the HOUSE DEFAULTS gear on BOTH tabs. The gear renders for O/M only and
 * opens the Checkout Defaults sheet (declare %, tip-out positions/order/%).
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import AmbientGlow from '@/components/AmbientGlow';
import ScreenHeader from '@/components/ScreenHeader';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import TrackerView from '@/components/tips/TrackerView';
import CheckoutView, { type CheckoutMode } from '@/components/tips/CheckoutView';
import HouseDefaultsSheet from '@/components/tips/HouseDefaultsSheet';
import { TIPS_VISUALS } from '@/components/tips/tipsVisuals';
import { fonts } from '@/constants/fonts';

type Tab = 'tracker' | 'checkouts';

export default function TipsAndCheckoutsScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('tracker');
  const [mode, setMode] = useState<CheckoutMode>('solo');
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  // Remounts CheckoutView after a defaults save so the new house baseline
  // seeds immediately (its baseline loads once per mount by design).
  const [checkoutEpoch, setCheckoutEpoch] = useState(0);

  const isManagerOrOwner = user?.role === 'owner' || user?.role === 'manager';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('tips_checkouts.title')}
        right={
          isManagerOrOwner ? (
            <TouchableOpacity
              onPress={() => setDefaultsOpen(true)}
              hitSlop={8}
              style={[styles.gearChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
            >
              <IconSymbol
                ios_icon_name="gearshape.fill"
                android_material_icon_name="settings"
                size={18}
                color={colors.text}
              />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.seg, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <SegTab
              on={tab === 'tracker'}
              label={t('tips_checkouts.tab_tracker')}
              iosIcon="book.fill"
              androidIcon="menu-book"
              onPress={() => setTab('tracker')}
            />
            <SegTab
              on={tab === 'checkouts'}
              label={t('tips_checkouts.tab_checkouts')}
              iosIcon="dollarsign.circle.fill"
              androidIcon="calculate"
              onPress={() => setTab('checkouts')}
            />
          </View>

          {tab === 'tracker' ? (
            <TrackerView active={tab === 'tracker'} />
          ) : (
            <CheckoutView
              key={checkoutEpoch}
              mode={mode}
              onModeChange={setMode}
              onDone={() => setTab('tracker')}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {isManagerOrOwner && (
        <HouseDefaultsSheet
          visible={defaultsOpen}
          onClose={() => setDefaultsOpen(false)}
          onSaved={() => setCheckoutEpoch((n) => n + 1)}
        />
      )}
    </View>
  );
}

function SegTab({
  on,
  label,
  iosIcon,
  androidIcon,
  onPress,
}: {
  on: boolean;
  label: string;
  iosIcon: string;
  androidIcon: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <TouchableOpacity onPress={onPress} style={styles.segTab}>
      {on && (
        <LinearGradient
          colors={[TIPS_VISUALS.gradient[0], TIPS_VISUALS.gradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.segFill]}
        />
      )}
      <IconSymbol
        ios_icon_name={iosIcon}
        android_material_icon_name={androidIcon}
        size={14}
        color={on ? '#FFFFFF' : colors.textSecondary}
      />
      <Text style={[styles.segText, { color: on ? '#FFFFFF' : colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  kav: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 48 },
  gearChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seg: {
    flexDirection: 'row',
    borderRadius: 13,
    borderWidth: 1,
    padding: 4,
    marginBottom: 10,
  },
  segTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 9,
    overflow: 'hidden',
  },
  segFill: { borderRadius: 10 },
  segText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
});
