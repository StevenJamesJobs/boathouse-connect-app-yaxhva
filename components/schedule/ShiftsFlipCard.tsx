import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing, Alert, LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import GlassCard from '@/components/GlassCard';
import { IconSymbol } from '@/components/IconSymbol';
import { AttentionRing } from '@/components/tools/ToolsBits';
import ShiftRow from '@/components/schedule/ShiftRow';
import AvailableShiftCard, { type AvailableShift } from '@/components/schedule/AvailableShiftCard';
import { AVAILABLE_BACK_ROWS } from '@/components/schedule/scheduleVisuals';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useScheduleAttention, refreshAllScheduleAttention } from '@/hooks/useScheduleAttention';
import { supabase } from '@/app/integrations/supabase/client';
import { translateServerError } from '@/utils/serverErrors';
import { notifyPickupRequested } from '@/utils/schedule/notify';
import { todayISO } from '@/utils/schedule/format';
import { fonts } from '@/constants/fonts';

interface MyShift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[] | null;
  is_closer: boolean;
  is_opener: boolean;
  is_training: boolean;
  room_assignment: string | null;
}

const FLIP_MS = 450;

/**
 * The Shifts card (s83, Steve's Design D): FRONT = Upcoming shifts with a
 * strobing "N shifts available" chip; tap → the card flips (the Manage
 * FlipTile's rotateY) to the BACK = the released shifts I'm qualified to pick
 * up, capped at AVAILABLE_BACK_ROWS with "See all" expanding IN PLACE; "My shifts"
 * flips home.
 *
 * The height concern, solved: both faces are laid out absolutely inside a
 * container whose HEIGHT is an Animated.Value; each face reports its natural
 * height via onLayout, and every flip / expand animates the container to the
 * visible face's height (JS-driven — a different node from the native-driven
 * rotations), so the tiles below slide instead of jumping. The hidden face is
 * pointerEvents="none" with backfaceVisibility hidden.
 */
export default function ShiftsFlipCard({ releaseEnabled }: { releaseEnabled: boolean }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { user } = useAuth();
  const { attention } = useScheduleAttention();

  const [upcoming, setUpcoming] = useState<MyShift[]>([]);
  const [available, setAvailable] = useState<AvailableShift[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const flip = useRef(new Animated.Value(0)).current; // 0 = front, 1 = back
  const height = useRef(new Animated.Value(0)).current;
  const frontH = useRef(0);
  const backH = useRef(0);
  const flippedRef = useRef(false);
  const sized = useRef(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const today = todayISO();
    const [up, av] = await Promise.all([
      supabase.rpc('get_my_shifts', { p_actor_id: user.id, p_start_date: today, p_limit: 7 }),
      releaseEnabled ? supabase.rpc('get_available_shifts', { p_actor_id: user.id }) : Promise.resolve({ data: [] as any[] } as any),
    ]);
    setUpcoming((up.data || []) as MyShift[]);
    setAvailable((av.data || []) as AvailableShift[]);
    setLoaded(true);
  }, [user?.id, releaseEnabled]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // the attention poll is the change signal (a release / claim / decision elsewhere)
  useEffect(() => {
    if (loaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attention.availableShifts, attention.unseenDecisions]);

  const animateHeight = (to: number) => {
    if (to <= 0) return;
    if (!sized.current) {
      sized.current = true;
      height.setValue(to);
      return;
    }
    Animated.timing(height, { toValue: to, duration: FLIP_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  };

  const onFrontLayout = (e: LayoutChangeEvent) => {
    frontH.current = e.nativeEvent.layout.height;
    if (!flippedRef.current) animateHeight(frontH.current);
  };
  const onBackLayout = (e: LayoutChangeEvent) => {
    backH.current = e.nativeEvent.layout.height;
    if (flippedRef.current) animateHeight(backH.current);
  };

  const doFlip = (toBack: boolean) => {
    flippedRef.current = toBack;
    setFlipped(toBack);
    if (!toBack) setShowAll(false);
    Animated.timing(flip, { toValue: toBack ? 1 : 0, duration: FLIP_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
    animateHeight(toBack ? backH.current : frontH.current);
  };

  const pickUp = (row: AvailableShift) => {
    Alert.alert(
      t('shift_tools.pick_up_title'),
      t('shift_tools.pick_up_msg', { name: row.releaser_name || t('notifications.an_employee') }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('shift_tools.pick_up'),
          onPress: async () => {
            if (!user?.id) return;
            setBusyId(row.release_id);
            try {
              const { data, error } = await supabase.rpc('claim_shift', { p_actor_id: user.id, p_release_id: row.release_id });
              if (error) throw error;
              const res = Array.isArray(data) ? data[0] : null;
              notifyPickupRequested({ id: user.id, name: user.name }, row.release_id, res?.releaser_name ?? row.releaser_name, {
                shift_date: row.shift_date, start_time: row.start_time, end_time: row.end_time, roles: row.roles,
              });
              refreshAllScheduleAttention();
              await load();
            } catch (e: any) {
              Alert.alert(t('shift_tools.pick_up_failed_title'), translateServerError(e, t('shift_tools.pick_up_failed_msg')));
              await load();
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const openCount = available.filter((r) => !r.claimed_by_me).length;
  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const visibleBack = showAll ? available : available.slice(0, AVAILABLE_BACK_ROWS);

  return (
    <Animated.View style={[styles.wrap, sized.current ? { height } : null]}>
      {/* FRONT — upcoming shifts */}
      <Animated.View
        onLayout={onFrontLayout}
        pointerEvents={flipped ? 'none' : 'auto'}
        style={[styles.face, { transform: [{ perspective: 1000 }, { rotateY: frontRotate }] }]}
      >
        <GlassCard variant="surface" radius={16} style={styles.card}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: colors.text }]}>{t('upcoming_shifts.title', 'Upcoming shifts')}</Text>
            {releaseEnabled && (
              <Pressable
                onPress={() => doFlip(true)}
                style={[
                  styles.strobe,
                  openCount > 0
                    ? { backgroundColor: colors.primary + '29', borderColor: colors.primary + '66' }
                    : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                ]}
              >
                <IconSymbol ios_icon_name="arrow.2.squarepath" android_material_icon_name="swap-horiz" size={13} color={openCount > 0 ? colors.primary : colors.textSecondary} />
                <Text style={[styles.strobeText, { color: openCount > 0 ? colors.primary : colors.textSecondary }]} numberOfLines={1}>
                  {openCount > 0 ? t('shift_tools.n_available', { count: openCount }) : t('shift_tools.none_open')}
                </Text>
                <AttentionRing active={openCount > 0} color={colors.primary} radius={9} />
              </Pressable>
            )}
          </View>
          <View style={styles.list}>
            {upcoming.length ? (
              upcoming.map((s, i) => <ShiftRow key={s.id} shift={s} first={i === 0} />)
            ) : (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('upcoming_shifts.no_shifts')}</Text>
            )}
          </View>
        </GlassCard>
      </Animated.View>

      {/* BACK — available shifts */}
      <Animated.View
        onLayout={onBackLayout}
        pointerEvents={flipped ? 'auto' : 'none'}
        style={[styles.face, { transform: [{ perspective: 1000 }, { rotateY: backRotate }] }]}
      >
        <GlassCard variant="surface" radius={16} style={[styles.card, { borderColor: colors.primary + '4D' }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('shift_tools.available_title')}
              {available.length ? <Text style={[styles.count, { color: colors.primary }]}>  {available.length}</Text> : null}
            </Text>
            <Pressable onPress={() => doFlip(false)} style={[styles.strobe, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <IconSymbol ios_icon_name="arrow.2.squarepath" android_material_icon_name="swap-horiz" size={13} color={colors.textSecondary} />
              <Text style={[styles.strobeText, { color: colors.textSecondary }]}>{t('shift_tools.my_shifts')}</Text>
            </Pressable>
          </View>
          <View style={styles.list}>
            {visibleBack.length ? (
              visibleBack.map((r, i) => <AvailableShiftCard key={r.release_id} row={r} first={i === 0} onPickUp={pickUp} busy={busyId === r.release_id} />)
            ) : (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('shift_tools.none_open_body')}</Text>
            )}
            {available.length > AVAILABLE_BACK_ROWS && (
              <Pressable onPress={() => setShowAll((v) => !v)} style={[styles.seeAll, { borderTopColor: colors.hairline }]}>
                <Text style={[styles.seeAllText, { color: colors.primary }]}>
                  {showAll ? t('shift_tools.see_less') : t('shift_tools.see_all', { n: available.length })}
                </Text>
                <IconSymbol ios_icon_name={showAll ? 'chevron.up' : 'chevron.down'} android_material_icon_name={showAll ? 'expand-less' : 'expand-more'} size={14} color={colors.primary} />
              </Pressable>
            )}
            <Text style={[styles.foot, { color: colors.textSecondary, borderTopColor: colors.hairline }]}>{t('shift_tools.titles_note')}</Text>
          </View>
        </GlassCard>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'visible' },
  face: { position: 'absolute', left: 0, right: 0, top: 0, backfaceVisibility: 'hidden' },
  card: { padding: 12, borderWidth: StyleSheet.hairlineWidth + 0.5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontFamily: fonts.display.semibold, fontSize: 15 },
  count: { fontFamily: fonts.mono.semibold, fontSize: 12 },
  strobe: {
    position: 'relative',
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 190,
  },
  strobeText: { fontFamily: fonts.mono.semibold, fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', flexShrink: 1 },
  list: { marginTop: 6 },
  empty: { fontFamily: fonts.body.regular, fontSize: 12.5, textAlign: 'center', paddingVertical: 12 },
  seeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 10, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth },
  seeAllText: { fontFamily: fonts.body.semibold, fontSize: 12.5 },
  foot: { fontFamily: fonts.body.regular, fontSize: 11, textAlign: 'center', paddingTop: 10, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
