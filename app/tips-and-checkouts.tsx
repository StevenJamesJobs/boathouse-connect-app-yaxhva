/**
 * Tips & Checkouts (s78) — the renamed section, replacing the pre-glass
 * check-out-calculator screen. Two views under one pushed screen: the Tips
 * Tracker (DEFAULT — Steve's call) and the Checkouts ritual. The Solo|Pool
 * capsule lives in the ScreenHeader's right slot, visible only on the
 * Checkouts tab, and SAYS it in words + icons for first-timers.
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
import TrackerView from '@/components/tips/TrackerView';
import CheckoutView, { type CheckoutMode } from '@/components/tips/CheckoutView';
import { TIPS_VISUALS } from '@/components/tips/tipsVisuals';
import { fonts } from '@/constants/fonts';

type Tab = 'tracker' | 'checkouts';

export default function TipsAndCheckoutsScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [tab, setTab] = useState<Tab>('tracker');
  const [mode, setMode] = useState<CheckoutMode>('solo');

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AmbientGlow />
      <ScreenHeader
        title={t('tips_checkouts.title')}
        rightWide={tab === 'checkouts'}
        right={
          tab === 'checkouts' ? (
            <View style={[styles.modeCap, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <ModeHalf
                on={mode === 'solo'}
                label={t('tips_checkouts.mode_solo')}
                iosIcon="person.fill"
                androidIcon="person"
                onPress={() => setMode('solo')}
              />
              <ModeHalf
                on={mode === 'pooled'}
                label={t('tips_checkouts.mode_pool')}
                iosIcon="person.2.fill"
                androidIcon="people"
                onPress={() => setMode('pooled')}
              />
            </View>
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
            <CheckoutView mode={mode} onDone={() => setTab('tracker')} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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

function ModeHalf({
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
    <TouchableOpacity onPress={onPress} style={styles.modeHalf}>
      {on && (
        <LinearGradient
          colors={[TIPS_VISUALS.gradient[0], TIPS_VISUALS.gradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <IconSymbol
        ios_icon_name={iosIcon}
        android_material_icon_name={androidIcon}
        size={12}
        color={on ? '#FFFFFF' : colors.textSecondary}
      />
      <Text style={[styles.modeText, { color: on ? '#FFFFFF' : colors.textSecondary }]} numberOfLines={1}>
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
  modeCap: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    height: 38,
  },
  modeHalf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    overflow: 'hidden',
  },
  modeText: { fontFamily: fonts.body.semibold, fontSize: 10.5 },
});
