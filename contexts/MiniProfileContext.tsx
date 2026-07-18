import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import GlassCard from '@/components/GlassCard';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/app/integrations/supabase/client';
import { isManagerOrOwner } from '@/utils/roles';
import { displayHandle } from '@/utils/displayHandle';
import { fonts } from '@/constants/fonts';
import type { ThemeColorSet } from '@/styles/commonStyles';

/**
 * MiniProfileContext — the app-wide "social" mini-profile card.
 *
 * Mounted ONCE at the root (app/_layout.tsx) so any screen — including pushed
 * routes like the leaderboards, the roster, or the Employee Editor — can call
 * `useMiniProfile().open(userId)` to pop a read-only glass card for a person.
 * This is the first brick of the future social layer (Shout-Out Wall / feed),
 * where every name + avatar opens this same card.
 */

interface NextShift {
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  roles: string[] | null;
}

interface MiniProfileData {
  id: string;
  name: string;
  username: string | null;
  job_titles: string[] | null;
  job_title: string | null;
  badge_title: string | null;
  profile_picture_url: string | null;
  mcloones_bucks: number | null;
  role: string | null;
}

interface MiniProfileContextValue {
  open: (userId: string) => void;
  close: () => void;
}

const MiniProfileContext = createContext<MiniProfileContextValue>({
  open: () => {},
  close: () => {},
});

export function useMiniProfile() {
  return useContext(MiniProfileContext);
}

const SCREEN_H = Dimensions.get('window').height;

const profileUrl = (url: string | null | undefined) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `https://xvbajqukbakcvdrkcioi.supabase.co/storage/v1/object/public/profile-pictures/${url}`;
};

const initialOf = (name?: string | null) => (name || '?').trim().charAt(0).toUpperCase() || '?';

export function MiniProfileProvider({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { organizationId } = useOrganization();

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MiniProfileData | null>(null);
  const [nextShift, setNextShift] = useState<NextShift | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [score, setScore] = useState<number | null>(null);

  const anim = useRef(new Animated.Value(0)).current;
  const reqRef = useRef(0); // guards against stale fetches when reopening quickly

  const runClose = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished) {
        setVisible(false);
        setData(null);
        setNextShift(null);
        setRank(null);
        setScore(null);
      }
    });
  }, [anim]);

  const load = useCallback(
    async (userId: string) => {
      // Logout race: an empty actor reaches the uuid RPC params as '' (22P02).
      if (!user?.id) return;
      const reqId = ++reqRef.current;
      setLoading(true);
      setData(null);
      setNextShift(null);
      setRank(null);
      setScore(null);

      const results = await Promise.allSettled([
        supabase.rpc('get_user_card', { p_actor_id: user.id, p_user_id: userId }),
        // Same-org gated: a coworker's next shift only, resolved server-side.
        supabase.rpc('get_user_next_shift', { p_actor_id: user.id, p_user_id: userId }),
        user?.id
          ? supabase.rpc('get_master_leaderboard_overall_actor' as any, { p_limit: 200, p_actor_id: user.id })
          : Promise.resolve({ data: null } as any),
      ]);

      if (reqId !== reqRef.current) return; // superseded by a newer open()

      const userRes = results[0];
      if (userRes.status === 'fulfilled' && (userRes.value as any).data) {
        const cardRow = ((userRes.value as any).data as MiniProfileData[])?.[0];
        if (cardRow) {
          setData(cardRow as MiniProfileData);
        }
      }

      const shiftRes = results[1];
      if (shiftRes.status === 'fulfilled' && (shiftRes.value as any).data) {
        const shiftRows = (shiftRes.value as any).data;
        const shiftRow = Array.isArray(shiftRows) ? shiftRows[0] : shiftRows;
        if (shiftRow) setNextShift(shiftRow as NextShift);
      }

      const lbRes = results[2];
      if (lbRes.status === 'fulfilled' && Array.isArray((lbRes.value as any).data)) {
        const entries = (lbRes.value as any).data as { user_id: string; total_score: number }[];
        const idx = entries.findIndex((e) => e.user_id === userId);
        if (idx >= 0) {
          setRank(idx + 1);
          setScore(Number(entries[idx].total_score) || 0);
        }
      }

      setLoading(false);
    },
    [organizationId, user?.id]
  );

  const open = useCallback(
    (userId: string) => {
      if (!userId) return;
      setVisible(true);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      load(userId);
    },
    [anim, load]
  );

  const close = useCallback(() => runClose(), [runClose]);

  const formatShift = (s: NextShift) => {
    let dateLabel = s.shift_date;
    try {
      const d = new Date(`${s.shift_date}T00:00:00`);
      dateLabel = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {}
    const time = (v: string | null) => {
      if (!v) return '';
      const [hStr, m] = v.split(':');
      let h = parseInt(hStr, 10);
      if (isNaN(h)) return v;
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${m ?? '00'} ${ampm}`;
    };
    const range = s.start_time ? `${time(s.start_time)}${s.end_time ? `–${time(s.end_time)}` : ''}` : '';
    return range ? `${dateLabel} · ${range}` : dateLabel;
  };

  const canEdit = isManagerOrOwner(user);
  const handle = data ? displayHandle(data.name, data.username) : null;
  const jobTitleLine =
    data?.job_titles && data.job_titles.length > 0
      ? data.job_titles.join(' · ')
      : data?.job_title || data?.badge_title || '';

  const handleMessage = () => {
    if (!data) return;
    const id = data.id;
    const name = data.name;
    runClose();
    setTimeout(
      () => router.push({ pathname: '/compose-message', params: { recipientId: id, recipientName: name } } as any),
      120
    );
  };

  const handleEdit = () => {
    if (!data) return;
    const id = data.id;
    runClose();
    setTimeout(() => router.push({ pathname: '/employee-detail', params: { employeeId: id } } as any), 120);
  };

  const pic = profileUrl(data?.profile_picture_url);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <MiniProfileContext.Provider value={{ open, close }}>
      {children}
      {visible && (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
          <Animated.View style={[styles.scrim, { opacity: anim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          </Animated.View>

          <Animated.View
            style={[
              styles.sheetWrap,
              { paddingBottom: insets.bottom + 16, opacity: anim, transform: [{ translateY }] },
            ]}
            pointerEvents="box-none"
          >
            <GlassCard variant="glass" radius={26} intensity={40} style={styles.sheet}>
              <View style={styles.grab} />

              <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={18} color={colors.textSecondary} />
              </Pressable>

              {loading && !data ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : data ? (
                <>
                  {/* Identity */}
                  <View style={styles.idRow}>
                    <View style={[styles.avatar, { backgroundColor: colors.thumbPlaceholder, borderColor: colors.glassBorder }]}>
                      {pic ? (
                        <Image source={{ uri: pic }} style={styles.avatarImg} />
                      ) : (
                        <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initialOf(data.name)}</Text>
                      )}
                    </View>
                    <View style={styles.idText}>
                      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                        {data.name}
                      </Text>
                      {!!handle && (
                        <Text style={[styles.handle, { color: colors.tint }]} numberOfLines={1}>
                          @{handle}
                        </Text>
                      )}
                      {!!jobTitleLine && (
                        <Text style={[styles.jobTitles, { color: colors.textSecondary }]} numberOfLines={2}>
                          {jobTitleLine}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Stats */}
                  <GlassCard variant="surface" radius={16} style={styles.stats}>
                    <View style={styles.statRow}>
                      <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={17} color={colors.textSecondary} />
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('mini_profile.next_shift', 'Next shift')}</Text>
                      <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
                        {nextShift ? formatShift(nextShift) : t('mini_profile.no_upcoming_shift', 'None scheduled')}
                      </Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: colors.hairline }]} />
                    <View style={styles.statRow}>
                      <IconSymbol ios_icon_name="trophy.fill" android_material_icon_name="emoji-events" size={17} color={colors.textSecondary} />
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('mini_profile.rank', 'Game rank')}</Text>
                      <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
                        {rank ? `#${rank} · ${(score ?? 0).toLocaleString()}` : t('mini_profile.unranked', 'Unranked')}
                      </Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: colors.hairline }]} />
                    <View style={styles.statRow}>
                      <IconSymbol ios_icon_name="dollarsign.circle.fill" android_material_icon_name="attach-money" size={17} color={colors.textSecondary} />
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('mini_profile.bucks', 'Bucks')}</Text>
                      <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
                        {(data.mcloones_bucks ?? 0).toLocaleString()}
                      </Text>
                    </View>
                  </GlassCard>

                  {/* Actions */}
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.msgBtn, { backgroundColor: colors.primary }]}
                      onPress={handleMessage}
                      activeOpacity={0.85}
                    >
                      <IconSymbol ios_icon_name="paperplane.fill" android_material_icon_name="send" size={17} color={colors.fireText} />
                      <Text style={[styles.msgText, { color: colors.fireText }]}>{t('mini_profile.message', 'Message')}</Text>
                    </TouchableOpacity>
                    {canEdit && (
                      <TouchableOpacity
                        style={[styles.editBtn, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
                        onPress={handleEdit}
                        activeOpacity={0.85}
                      >
                        <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={17} color={colors.tint} />
                        <Text style={[styles.editText, { color: colors.tint }]}>{t('mini_profile.edit', 'Edit')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              ) : (
                <View style={styles.loadingBox}>
                  <Text style={[styles.statValue, { color: colors.textSecondary }]}>
                    {t('mini_profile.not_found', 'Could not load this profile.')}
                  </Text>
                </View>
              )}
            </GlassCard>
          </Animated.View>
        </View>
      )}
    </MiniProfileContext.Provider>
  );
}

const makeStyles = (colors: ThemeColorSet) =>
  StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(10, 9, 8, 0.55)',
    },
    sheetWrap: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 0,
      maxHeight: SCREEN_H * 0.8,
    },
    sheet: {
      padding: 18,
      paddingTop: 14,
      boxShadow: '0px 24px 50px rgba(0, 0, 0, 0.5)',
      elevation: 16,
    },
    grab: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.hairline,
      marginBottom: 12,
    },
    closeBtn: {
      position: 'absolute',
      top: 14,
      right: 14,
      padding: 4,
      zIndex: 2,
    },
    loadingBox: {
      paddingVertical: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    idRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingRight: 24,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: {
      width: 64,
      height: 64,
    },
    avatarInitial: {
      fontFamily: fonts.display.bold,
      fontSize: 26,
    },
    idText: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontFamily: fonts.display.bold,
      fontSize: 19,
    },
    handle: {
      fontFamily: fonts.mono.medium,
      fontSize: 12.5,
      marginTop: 1,
    },
    jobTitles: {
      fontFamily: fonts.body.medium,
      fontSize: 13,
      marginTop: 4,
    },
    stats: {
      marginTop: 16,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
    },
    statLabel: {
      fontFamily: fonts.mono.medium,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    statValue: {
      flex: 1,
      textAlign: 'right',
      fontFamily: fonts.body.semibold,
      fontSize: 13.5,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 16,
    },
    msgBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      borderRadius: 14,
    },
    msgText: {
      fontFamily: fonts.body.semibold,
      fontSize: 14.5,
    },
    editBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 13,
      paddingHorizontal: 20,
      borderRadius: 14,
      borderWidth: 1,
    },
    editText: {
      fontFamily: fonts.body.semibold,
      fontSize: 14.5,
    },
  });
