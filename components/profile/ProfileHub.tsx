/**
 * ProfileHub — the Profile tab for both portals (s84).
 *
 * Hero = WelcomeHeader (byte-identical to Welcome / Manage; its avatar flips to My Info),
 * then the My Hub · My Info · Settings capsule driving a horizontal, non-collapsing pager.
 * The portal layout owns the ambient glow, the tab bar and the Jolt overlay — this page
 * renders none of them. `?tab=hub|info|settings` selects a pane (the hero avatar on the
 * other tab pages pushes `tab=info`).
 */
import React, { ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet, FlatList, Alert, Dimensions,
  NativeSyntheticEvent, NativeScrollEvent, Animated, LayoutChangeEvent,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import WelcomeHeader from '@/components/WelcomeHeader';
import GlassCard from '@/components/GlassCard';
import JoltDockSlot from '@/components/jolt/JoltDockSlot';
import { openJolt } from '@/components/jolt/joltStore';
import NotificationDropdown from '@/components/NotificationDropdown';
import ContentDetailModal from '@/components/ContentDetailModal';
import WeatherDetailModal from '@/components/WeatherDetailModal';
import { IconSymbol } from '@/components/IconSymbol';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { useUnreadContent } from '@/hooks/useUnreadContent';
import { useScheduleSettings } from '@/hooks/useScheduleSettings';
import { useToolVisibility } from '@/hooks/useToolVisibility';
import { supabase } from '@/app/integrations/supabase/client';
import { brokerUploadImage } from '@/utils/storageBroker';
import { translateServerError } from '@/utils/serverErrors';
import { formatTime, localeFor, parseISODate } from '@/utils/schedule/format';
import { fonts } from '@/constants/fonts';
import {
  defForId, FavoriteDef, FavoriteTile, LiveData, MAX_FAVORITES, parseFavorites, serializeFavorites,
} from '@/config/favorites';
import ProfileTabs from './ProfileTabs';
import StatStrip, { StatCell } from './StatStrip';
import TeamDrop from './TeamDrop';
import InviteSheet from './InviteSheet';
import FavoritesGrid, { FavoritesEmpty } from './FavoritesGrid';
import FavoritesEditorSheet from './FavoritesEditorSheet';
import TileOptionsSheet from './TileOptionsSheet';
import IdentityCard from './IdentityCard';
import ProfileSheet from './ProfileSheet';
import SettingsGrid from './SettingsGrid';
import { useProfileStats } from './useProfileStats';
import { useFavoriteData } from './useFavoriteData';
import { GOLD_HUE, TEAM_HUE, RED_HUE, PROFILE_TABS, ProfileTab } from './profileVisuals';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
type ShadeItem = Parameters<ComponentProps<typeof NotificationDropdown>['onItemPress']>[0];

export default function ProfileHub() {
  const colors = useThemeColors();
  const { resolvedMode } = useAppTheme();
  const { user, refreshUser, logout } = useAuth();
  const { organization, organizationId } = useOrganization();
  const { language } = useLanguage();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.language);
  const isManager = user?.role === 'manager' || user?.role === 'owner';
  const portalPrefix = isManager ? '/(portal)/manager' : '/(portal)/employee';

  // ── pager ──
  const pagerRef = useRef<FlatList>(null);
  const [tab, setTab] = useState<ProfileTab>('hub');
  const goTab = useCallback((next: ProfileTab) => {
    setTab(next);
    pagerRef.current?.scrollToIndex({ index: PROFILE_TABS.indexOf(next), animated: true });
  }, []);
  const onPagerScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const next = PROFILE_TABS[Math.max(0, Math.min(PROFILE_TABS.length - 1, idx))];
    activeLeafRef.current = Math.max(0, Math.min(PROFILE_TABS.length - 1, idx));
    setTab((cur) => (cur === next ? cur : next));
  }, []);

  const hubScrollRef = useRef<any>(null);
  // ── collapsing header (s87, Manage's mechanism): one shared scroll value drives
  // the overlay — the Jolt bar slides up behind the locked WelcomeHeader (clipped),
  // the capsule pins under it. Every pane writes the same offset so the collapsed
  // state carries across a horizontal swipe; the docked bolt rides the bar.
  const profileScrollY = useRef(new Animated.Value(0)).current;
  const infoScrollRef = useRef<any>(null);
  const settingsScrollRef = useRef<any>(null);
  const leafRefs = [hubScrollRef, infoScrollRef, settingsScrollRef];
  const activeLeafRef = useRef(0);
  const [headerAreaHeight, setHeaderAreaHeight] = useState(0);
  const [joltBarHeight, setJoltBarHeight] = useState(64);
  const [tabsHeight, setTabsHeight] = useState(54);
  const [pagerHeight, setPagerHeight] = useState(SCREEN_HEIGHT);
  const headerHeight = joltBarHeight + tabsHeight;
  const collapsible = joltBarHeight;
  const overlayTranslate = profileScrollY.interpolate({
    inputRange: [0, Math.max(1, collapsible)],
    outputRange: [0, -collapsible],
    extrapolate: 'clamp',
  });
  const [joltCollapsed, setJoltCollapsed] = useState(false);
  const joltCollapsedRef = useRef(false);
  useEffect(() => {
    const id = profileScrollY.addListener(({ value }) => {
      const collapsed = value > collapsible * 0.45;
      if (collapsed !== joltCollapsedRef.current) {
        joltCollapsedRef.current = collapsed;
        setJoltCollapsed(collapsed);
      }
    });
    return () => profileScrollY.removeListener(id);
  }, [collapsible, profileScrollY]);
  const makeLeafScroll = (leafIndex: number) =>
    Animated.event([{ nativeEvent: { contentOffset: { y: profileScrollY } } }], {
      useNativeDriver: true,
      listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (activeLeafRef.current !== leafIndex) return;
        const y = e.nativeEvent.contentOffset.y;
        leafRefs.forEach((ref, i) => {
          if (i !== leafIndex) ref.current?.scrollTo?.({ y, animated: false });
        });
      },
    });
  // Back to the top on every focus so the bar (and the docked bolt) is expanded on a return visit.
  useFocusEffect(
    useCallback(() => {
      profileScrollY.setValue(0);
      leafRefs.forEach((ref) => ref.current?.scrollTo?.({ y: 0, animated: false }));
      joltCollapsedRef.current = false;
      setJoltCollapsed(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );
  const leafContent = [styles.paneContent, { paddingTop: headerHeight + 10, minHeight: pagerHeight > 0 ? pagerHeight + joltBarHeight : undefined }];
  const { tab: tabParam, open: openParam, ts: openTs } = useLocalSearchParams<{ tab?: string; open?: string; ts?: string }>();
  useEffect(() => {
    if (tabParam && (PROFILE_TABS as string[]).includes(tabParam)) {
      const id = setTimeout(() => goTab(tabParam as ProfileTab), 60);
      return () => clearTimeout(id);
    }
  }, [tabParam, goTab]);

  // ── hero plumbing (same as Welcome / Manage) ──
  const { count: notificationCount, markViewed: markNotificationsViewed } = useUnreadNotifications();
  const { newContentCount } = useUnreadContent();
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [weatherVisible, setWeatherVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ShadeItem | null>(null);
  const openDetailModal = useCallback((item: ShadeItem) => {
    setSelectedItem(item);
    setDetailVisible(true);
  }, []);

  // ── data ──
  const { stats, reload: reloadStats } = useProfileStats();
  const tiles = useMemo(() => parseFavorites(user?.quickTools), [user?.quickTools]);
  const liveRaw = useFavoriteData(tiles);
  const live = useMemo<LiveData>(
    () => ({
      ...liveRaw,
      game: stats.rank !== null || stats.score !== null ? { rank: stats.rank, score: stats.score ?? 0 } : liveRaw.game,
      staffCount: stats.staffCount ?? liveRaw.staffCount,
      scheduledToday: stats.scheduledToday ?? liveRaw.scheduledToday,
      bucks: stats.bucks ?? liveRaw.bucks,
    }),
    [liveRaw, stats]
  );
  const { settings: schedSettings } = useScheduleSettings();
  const { canSee, isLoading: visLoading } = useToolVisibility();
  // One gate for the grid AND the editor: org-mapped tools (Tips, the role assistants) wait for
  // the visibility load (never flash), the roster tile follows the schedule setting.
  const isAllowed = useCallback(
    (def: FavoriteDef) => {
      if (def.visibilityKey) return !visLoading && canSee(def.visibilityKey);
      if (def.gate === 'roster') return isManager || schedSettings.staffCanViewRoster;
      return true;
    },
    [visLoading, canSee, isManager, schedSettings.staffCanViewRoster]
  );
  const visibleTiles = useMemo(
    () =>
      tiles.filter((tile) => {
        const def = defForId(tile.id);
        return !!def && isAllowed(def);
      }),
    [tiles, isAllowed]
  );

  // ── favorites persistence ──
  const saveFavorites = useCallback(
    async (next: FavoriteTile[]) => {
      if (!user?.id) return;
      try {
        const { error } = await supabase.rpc('update_quick_tools', {
          user_id: user.id,
          tools: serializeFavorites(next) as any,
          p_organization_id: organizationId ?? undefined,
        });
        if (error) throw error;
        await refreshUser();
      } catch (e: any) {
        Alert.alert(t('common.error'), translateServerError(e, t('profile_hub.error_save_favorites')));
      }
    },
    [user?.id, organizationId, refreshUser, t]
  );

  // ── sheets ──
  const [editorOpen, setEditorOpen] = useState(false);
  const [optionsFor, setOptionsFor] = useState<FavoriteTile | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [tagline, setTagline] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (stats.tagline !== undefined) setTagline(stats.tagline);
  }, [stats.tagline]);

  // ── navigation resolver for tiles + cells ──
  const navigate = useCallback(
    (route: string) => {
      switch (route) {
        case 'hub/rewards':
          router.push('/(portal)/employee/rewards' as any);
          return;
        case 'hub/schedule-tab':
          router.push({ pathname: portalPrefix as any, params: { tab: 'schedule' } });
          return;
        case 'hub/menus':
          router.push(`${portalPrefix}/menus` as any);
          return;
        case 'hub/team':
          // The drop opens under the stat strip — scroll there first so the expand is seen
          // even when the Team tile sits at the bottom of a long favorites list.
          goTab('hub');
          hubScrollRef.current?.scrollTo({ y: 0, animated: true });
          setTeamOpen(true);
          return;
        default:
          router.push(route as any);
      }
    },
    [router, portalPrefix, goTab]
  );

  // ── photo from the My Info card (direct picker, no sheet in the way) ──
  const [uploading, setUploading] = useState(false);
  const pickPhoto = async () => {
    if (!user?.id) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permission_required'), t('profile.grant_camera_permissions'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;
      setUploading(true);
      const publicUrl = await brokerUploadImage('profile_picture', result.assets[0].uri, user.id);
      if (!publicUrl) throw new Error(t('profile.error_upload_picture'));
      const { error } = await supabase.rpc('update_profile_picture', { user_id: user.id, picture_url: publicUrl, p_organization_id: organizationId ?? undefined, p_actor_id: user.id });
      if (error) throw error;
      await refreshUser();
    } catch (e: any) {
      Alert.alert(t('common.error'), translateServerError(e, t('profile.error_upload_picture')));
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (!user) return null;

  // ── stat strip values ──
  const gold = GOLD_HUE[resolvedMode];
  const azure = TEAM_HUE[resolvedMode];
  const nextShift = stats.nextShift;
  const nextBig = nextShift === undefined ? '…' : nextShift ? parseISODate(nextShift.shift_date).toLocaleDateString(locale, { weekday: 'short' }) : '—';
  const nextSmall = nextShift ? formatTime(nextShift.start_time, locale) : nextShift === null ? t('profile_hub.no_shift') : undefined;
  const rankBig = stats.rank !== null ? `#${stats.rank}` : stats.loaded ? '—' : '…';
  const rankSmall = stats.score !== null && stats.score > 0 ? stats.score.toLocaleString() : stats.loaded && stats.rank === null ? t('profile_hub.unranked') : undefined;

  // ── panes ──
  const renderHub = () => (
    <Animated.ScrollView ref={hubScrollRef} style={styles.pane} contentContainerStyle={leafContent} showsVerticalScrollIndicator={false} scrollEventThrottle={16} bounces={false} overScrollMode="never" nestedScrollEnabled onScroll={makeLeafScroll(0)}>
      <StatStrip>
        {isManager ? (
          <StatCell
            big={stats.staffCount !== null ? String(stats.staffCount) : '…'}
            small={t('profile_hub.staff')}
            eyebrow={t('profile_hub.cell_team')}
            ink={azure}
            accent={azure}
            chevron={teamOpen ? 'up' : 'down'}
            expanded={teamOpen}
            onPress={() => setTeamOpen((o) => !o)}
          />
        ) : (
          <StatCell big={stats.bucks !== null ? `$${stats.bucks.toLocaleString()}` : '…'} eyebrow={organization?.reward_currency_name || t('profile_hub.cell_bucks')} ink={colors.tint} onPress={() => navigate('hub/rewards')} />
        )}
        <StatCell big={rankBig} small={rankSmall} eyebrow={t('profile_hub.cell_rank')} ink={gold} onPress={() => navigate('/game-hub')} />
        <StatCell big={nextBig} small={nextSmall} eyebrow={t('profile_hub.cell_next_shift')} onPress={() => navigate('hub/schedule-tab')} />
      </StatStrip>
      {isManager ? (
        <TeamDrop
          open={teamOpen}
          staffCount={stats.staffCount}
          scheduledToday={stats.scheduledToday}
          joinCode={organization?.join_code || null}
          onEmployees={() => router.push({ pathname: '/(portal)/manager/manage' as any, params: { pane: 'employees' } })}
          onSchedules={() => router.push('/manual-schedule' as any)}
          onInvite={() => setInviteOpen(true)}
        />
      ) : null}

      <View style={styles.rule}>
        <Text style={[styles.ruleLabel, { color: colors.tint }]}>{t('profile_hub.favorites')}</Text>
        <View style={[styles.ruleLine, { backgroundColor: colors.hairline }]} />
        {tiles.length > 0 ? (
          <>
            <Text style={[styles.ruleCount, { color: colors.textSecondary }]}>{`${visibleTiles.length} / ${MAX_FAVORITES}`}</Text>
            <TouchableOpacity onPress={() => setEditorOpen(true)} activeOpacity={0.85} style={[styles.editChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={13} color={colors.text} />
              <Text style={[styles.editText, { color: colors.text }]}>{t('common.edit', 'Edit')}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      {tiles.length === 0 ? (
        <FavoritesEmpty manager={isManager} onAdd={() => setEditorOpen(true)} />
      ) : (
        <FavoritesGrid tiles={visibleTiles} data={live} onNavigate={navigate} onOptions={(tile) => setOptionsFor(tile)} />
      )}

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          {t('profile_hub.signed_in_as')} <Text style={[styles.footerMono, { color: colors.text }]}>@{user.username}</Text>
        </Text>
        <Text style={[styles.footerDot, { color: colors.textSecondary }]}>·</Text>
        <TouchableOpacity onPress={handleLogout} hitSlop={8} style={styles.logout} activeOpacity={0.8}>
          <IconSymbol ios_icon_name="rectangle.portrait.and.arrow.right" android_material_icon_name="logout" size={13} color={RED_HUE[resolvedMode]} />
          <Text style={[styles.logoutText, { color: RED_HUE[resolvedMode] }]}>{t('profile.log_out')}</Text>
        </TouchableOpacity>
      </View>
    </Animated.ScrollView>
  );

  const renderInfo = () => (
    <Animated.ScrollView ref={infoScrollRef} style={styles.pane} contentContainerStyle={leafContent} showsVerticalScrollIndicator={false} scrollEventThrottle={16} bounces={false} overScrollMode="never" nestedScrollEnabled onScroll={makeLeafScroll(1)}>
      <IdentityCard user={user} tagline={tagline} uploading={uploading} onPhoto={pickPhoto} onEdit={() => setProfileOpen(true)} />
    </Animated.ScrollView>
  );

  const renderSettings = () => (
    <Animated.ScrollView ref={settingsScrollRef} style={styles.pane} contentContainerStyle={leafContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} bounces={false} overScrollMode="never" nestedScrollEnabled onScroll={makeLeafScroll(2)}>
      <SettingsGrid openRequest={openParam ? { key: openParam, ts: openTs ?? '' } : undefined} />
    </Animated.ScrollView>
  );

  const renderPane = ({ item }: { item: ProfileTab }) => (
    <View style={{ width: SCREEN_WIDTH }}>{item === 'hub' ? renderHub() : item === 'info' ? renderInfo() : renderSettings()}</View>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.headerArea} onLayout={(e: LayoutChangeEvent) => setHeaderAreaHeight(e.nativeEvent.layout.height)}>
        <View style={styles.headerPadding}>
          <WelcomeHeader
            onWeatherPress={() => setWeatherVisible(true)}
            onNotificationPress={() => {
              setNotificationVisible(true);
              markNotificationsViewed();
            }}
            notificationCount={notificationCount}
            newContentCount={newContentCount}
            onProfilePress={() => goTab('info')}
          />
        </View>
      </View>

      {/* Collapsing overlay: the Jolt bar slides up behind the header, the capsule pins (Manage's, byte for byte). */}
      {headerAreaHeight > 0 && (
        <View style={[styles.overlayClip, { top: headerAreaHeight, height: headerHeight }]} pointerEvents="box-none">
          <Animated.View style={{ transform: [{ translateY: overlayTranslate }] }} pointerEvents="box-none">
            <View onLayout={(e: LayoutChangeEvent) => setJoltBarHeight(e.nativeEvent.layout.height)} style={styles.joltWrap}>
              <GlassCard variant="glass" radius={15} style={styles.joltBar}>
                <Pressable style={styles.joltPress} onPress={openJolt}>
                  <JoltDockSlot id="profile" kind="bar" size={32} iconSize={20} hidden={joltCollapsed} />
                  <Text style={[styles.joltText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {t('jolt.bar', 'Search or jump to anything…')}
                  </Text>
                </Pressable>
              </GlassCard>
            </View>
            <View onLayout={(e: LayoutChangeEvent) => setTabsHeight(e.nativeEvent.layout.height)} style={styles.tabsWrap}>
              <ProfileTabs value={tab} onChange={goTab} />
            </View>
          </Animated.View>
        </View>
      )}

      <FlatList
        ref={pagerRef}
        data={PROFILE_TABS}
        renderItem={renderPane}
        keyExtractor={(k) => k}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onPagerScroll}
        onMomentumScrollEnd={onPagerScroll}
        scrollEventThrottle={16}
        onLayout={(e: LayoutChangeEvent) => setPagerHeight(e.nativeEvent.layout.height)}
        initialScrollIndex={0}
        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
        keyboardShouldPersistTaps="handled"
      />

      <NotificationDropdown visible={notificationVisible} onClose={() => setNotificationVisible(false)} onItemPress={openDetailModal} isManager={isManager} />
      {selectedItem && (
        <ContentDetailModal
          visible={detailVisible}
          onClose={() => setDetailVisible(false)}
          title={selectedItem.title}
          content={selectedItem.content}
          thumbnailUrl={selectedItem.thumbnailUrl}
          thumbnailShape={selectedItem.thumbnailShape}
          imageUrls={selectedItem.imageUrls}
          startDateTime={selectedItem.startDateTime}
          endDateTime={selectedItem.endDateTime}
          priority={selectedItem.priority}
          link={selectedItem.link}
          guideFile={selectedItem.guideFile}
          colors={{ text: colors.text, textSecondary: colors.textSecondary, card: colors.card, primary: colors.primary, fireText: colors.fireText }}
        />
      )}
      <WeatherDetailModal
        visible={weatherVisible}
        onClose={() => setWeatherVisible(false)}
        language={language}
        colors={{ text: colors.text, textSecondary: colors.textSecondary, card: colors.card, primary: colors.primary, border: colors.border }}
      />

      <FavoritesEditorSheet visible={editorOpen} onClose={() => setEditorOpen(false)} tiles={tiles} data={live} onSave={saveFavorites} isAllowed={isAllowed} />
      <TileOptionsSheet
        visible={!!optionsFor}
        onClose={() => setOptionsFor(null)}
        tile={optionsFor}
        data={live}
        onChange={(next) => saveFavorites(tiles.map((x) => (x.id === next.id ? next : x)))}
        onRemove={(x) => saveFavorites(tiles.filter((y) => y.id !== x.id))}
      />
      {isManager ? <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} /> : null}
      <ProfileSheet
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        tagline={tagline}
        onSaved={(tg) => {
          setTagline(tg);
          reloadStats();
        }}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  headerArea: { zIndex: 10 },
  headerPadding: { paddingTop: 12, paddingHorizontal: 16 },
  // Manage's bar, byte for byte: the WelcomeHeader's own marginBottom is the only gap above it.
  overlayClip: { position: 'absolute', left: 0, right: 0, overflow: 'hidden', zIndex: 5 },
  joltWrap: { paddingHorizontal: 16, paddingTop: 0 },
  tabsWrap: { paddingHorizontal: 16 },
  joltBar: { paddingHorizontal: 14, paddingVertical: 11 },
  joltPress: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  joltText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 13.5 },
  pane: { flex: 1 },
  paneContent: { paddingHorizontal: 16, paddingBottom: 150, gap: 12 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  ruleLabel: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' },
  ruleLine: { flex: 1, height: 1 },
  ruleCount: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1 },
  editChip: { height: 30, paddingHorizontal: 9, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  editText: { fontFamily: fonts.body.semibold, fontSize: 11.5 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 6 },
  footerText: { fontFamily: fonts.body.regular, fontSize: 12 },
  footerMono: { fontFamily: fonts.mono.medium },
  footerDot: { fontFamily: fonts.body.regular, fontSize: 12 },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logoutText: { fontFamily: fonts.body.semibold, fontSize: 12 },
});
