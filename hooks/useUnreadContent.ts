import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/app/integrations/supabase/client';
import { weeklySpecialsNames } from '@/utils/categoryNames';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { ConnectBarTab } from '@/components/ConnectBar';

const STORAGE_KEYS = {
  today: 'lastViewed_today',
  events: 'lastViewed_events',
  specials: 'lastViewed_specials',
  announcements: 'lastViewed_announcements',
  specialFeatures: 'lastViewed_specialFeatures',
  eventsContent: 'lastViewed_eventsContent',
  eventsEventTab: 'lastVisited_eventsEventTab',
  eventsEntertainmentTab: 'lastVisited_eventsEntertainmentTab',
  viewedAnnouncementIds: 'viewed_announcement_ids',
  viewedSpecialFeatureIds: 'viewed_special_feature_ids',
  viewedEventIds: 'viewed_event_ids',
} as const;

export type WelcomeTab = 'announcements' | 'specialFeatures';

// Global event system for cross-component refresh
type Listener = () => void;
const listeners = new Set<Listener>();

export function refreshAllUnreadContent() {
  listeners.forEach((fn) => fn());
}

interface UnreadContentResult {
  todayHasNew: boolean;
  eventsHasNew: boolean;
  specialsHasNew: boolean;
  /** Announcements tab on the Welcome screen segmented control */
  announcementsHasNew: boolean;
  /** Special Features tab on the Welcome screen segmented control */
  specialFeaturesHasNew: boolean;
  /** Events sub-tab badge on the Events section segmented control */
  eventsEventHasNew: boolean;
  /** Entertainment sub-tab badge on the Events section segmented control */
  eventsEntertainmentHasNew: boolean;
  /** ISO timestamp set on first install — items created before this don't get NEW pills. Never advances on tab tap. */
  lastViewedAnnouncements: string | null;
  lastViewedSpecialFeatures: string | null;
  lastViewedEvents: string | null;
  /** Per-item viewed sets — an item ID is added when the user opens its detail modal. */
  viewedAnnouncementIds: Set<string>;
  viewedSpecialFeatureIds: Set<string>;
  viewedEventIds: Set<string>;
  hasAnyNew: boolean;
  newContentCount: number;
  markTabViewed: (tab: ConnectBarTab) => Promise<void>;
  /** Bootstraps the cutoff timestamp on first install only — does NOT clear NEW state. */
  markWelcomeTabViewed: (tab: WelcomeTab) => Promise<void>;
  /** Mark an individual content item as viewed (clears its NEW pill). Call when opening the detail modal. */
  markAnnouncementViewed: (id: string) => Promise<void>;
  markSpecialFeatureViewed: (id: string) => Promise<void>;
  markEventViewed: (id: string) => Promise<void>;
  /** Clears the Events/Entertainment sub-tab dot for the given category when user visits that sub-tab. */
  markEventsTabVisited: (category: 'Event' | 'Entertainment') => Promise<void>;
  /** Advances ALL event timestamps to now — used when "New Added" is tapped to mass-dismiss event badges. */
  markAllEventsViewed: () => Promise<void>;
  refresh: () => void;
}

export function useUnreadContent(): UnreadContentResult {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  // checkUnread below is a []-dep callback held by long-lived subscriptions, the
  // 60s interval, and the AppState listener — it must read CURRENT auth through a
  // ref (its closure would otherwise pin the first-render user forever).
  const userIdRef = useRef<string | null>(user?.id ?? null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);
  const [todayHasNew, setTodayHasNew] = useState(false);
  const [eventsHasNew, setEventsHasNew] = useState(false);
  const [specialsHasNew, setSpecialsHasNew] = useState(false);
  const [announcementsHasNew, setAnnouncementsHasNew] = useState(false);
  const [specialFeaturesHasNew, setSpecialFeaturesHasNew] = useState(false);
  const [eventsEventHasNew, setEventsEventHasNew] = useState(false);
  const [eventsEntertainmentHasNew, setEventsEntertainmentHasNew] = useState(false);
  const [lastViewedAnnouncements, setLastViewedAnnouncements] = useState<string | null>(null);
  const [lastViewedSpecialFeatures, setLastViewedSpecialFeatures] = useState<string | null>(null);
  const [lastViewedEvents, setLastViewedEvents] = useState<string | null>(null);
  const [viewedAnnouncementIds, setViewedAnnouncementIds] = useState<Set<string>>(() => new Set());
  const [viewedSpecialFeatureIds, setViewedSpecialFeatureIds] = useState<Set<string>>(() => new Set());
  const [viewedEventIds, setViewedEventIds] = useState<Set<string>>(() => new Set());
  const [newContentCount, setNewContentCount] = useState(0);

  const checkUnread = useCallback(async () => {
    // Logout teardown: skip the tick entirely — an empty actor would reach
    // get_menu_items as uuid '' (22P02). Badge state is moot post-logout.
    const actorId = userIdRef.current;
    if (!actorId) return;
    try {
      // Load last-viewed timestamps + per-item viewed sets
      const [todayTs, eventsTs, specialsTs, announcementsTs, specialFeaturesTs, eventsContentTs, evtEventTabTs, evtEntTabTs, annViewedRaw, sfViewedRaw, evtViewedRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.today),
        AsyncStorage.getItem(STORAGE_KEYS.events),
        AsyncStorage.getItem(STORAGE_KEYS.specials),
        AsyncStorage.getItem(STORAGE_KEYS.announcements),
        AsyncStorage.getItem(STORAGE_KEYS.specialFeatures),
        AsyncStorage.getItem(STORAGE_KEYS.eventsContent),
        AsyncStorage.getItem(STORAGE_KEYS.eventsEventTab),
        AsyncStorage.getItem(STORAGE_KEYS.eventsEntertainmentTab),
        AsyncStorage.getItem(STORAGE_KEYS.viewedAnnouncementIds),
        AsyncStorage.getItem(STORAGE_KEYS.viewedSpecialFeatureIds),
        AsyncStorage.getItem(STORAGE_KEYS.viewedEventIds),
      ]);

      // Bootstrap cutoff on first ever load — items that already exist at install
      // time don't all flood the NEW state. After bootstrap, the timestamp is
      // never advanced; per-item viewedSet is the source of truth for clearing NEW.
      let effectiveAnnouncementsTs = announcementsTs;
      let effectiveSpecialFeaturesTs = specialFeaturesTs;
      let effectiveEventsContentTs = eventsContentTs;
      if (!effectiveAnnouncementsTs) {
        effectiveAnnouncementsTs = new Date().toISOString();
        await AsyncStorage.setItem(STORAGE_KEYS.announcements, effectiveAnnouncementsTs);
      }
      if (!effectiveSpecialFeaturesTs) {
        effectiveSpecialFeaturesTs = new Date().toISOString();
        await AsyncStorage.setItem(STORAGE_KEYS.specialFeatures, effectiveSpecialFeaturesTs);
      }
      if (!effectiveEventsContentTs) {
        effectiveEventsContentTs = new Date().toISOString();
        await AsyncStorage.setItem(STORAGE_KEYS.eventsContent, effectiveEventsContentTs);
      }
      setLastViewedAnnouncements(effectiveAnnouncementsTs);
      setLastViewedSpecialFeatures(effectiveSpecialFeaturesTs);
      setLastViewedEvents(effectiveEventsContentTs);

      const parseIds = (raw: string | null): Set<string> => {
        if (!raw) return new Set();
        try {
          const arr = JSON.parse(raw);
          return new Set(Array.isArray(arr) ? arr : []);
        } catch {
          return new Set();
        }
      };
      const annViewed = parseIds(annViewedRaw);
      const sfViewed = parseIds(sfViewedRaw);
      const evtViewed = parseIds(evtViewedRaw);
      setViewedAnnouncementIds(annViewed);
      setViewedSpecialFeatureIds(sfViewed);
      setViewedEventIds(evtViewed);

      // Tab dot logic: any active item created after cutoff that the user hasn't opened yet.
      // We must fetch IDs (not just counts) so we can filter against the local viewed set.
      const annCutoff = effectiveAnnouncementsTs;
      const sfCutoff = effectiveSpecialFeaturesTs;
      const todayCutoff = todayTs || new Date(0).toISOString();
      // One member-gated RPC per table (org + role visibility server-side);
      // both cutoff windows filter client-side off the same row set (the RPC
      // has no time-cutoff param). Side effect: badges no longer count posts
      // this role can't see — the old reads had no visibility filter.
      const [annRes, sfRes] = await Promise.all([
        supabase.rpc('get_announcements', { p_actor_id: actorId }),
        supabase.rpc('get_special_features', { p_actor_id: actorId }),
      ]);
      const annRows = ((annRes.data as { id: string; created_at: string | null }[] | null) ?? []);
      const sfRows = ((sfRes.data as { id: string; created_at: string | null }[] | null) ?? []);
      const newerThan = (r: { created_at: string | null }, cutoff: string) =>
        new Date(r.created_at || 0) > new Date(cutoff);
      const todayAnnUnviewed = annRows.filter((r) => newerThan(r, todayCutoff) && !annViewed.has(r.id)).length;
      const todaySfUnviewed = sfRows.filter((r) => newerThan(r, todayCutoff) && !sfViewed.has(r.id)).length;
      const annTabUnviewed = annRows.filter((r) => newerThan(r, annCutoff) && !annViewed.has(r.id)).length;
      const sfTabUnviewed = sfRows.filter((r) => newerThan(r, sfCutoff) && !sfViewed.has(r.id)).length;
      const todayCount = todayAnnUnviewed + todaySfUnviewed;
      setTodayHasNew(todayCount > 0);
      setAnnouncementsHasNew(annTabUnviewed > 0);
      setSpecialFeaturesHasNew(sfTabUnviewed > 0);

      // Check "Events" tab: upcoming_events (per-item + per-category tracking)
      const eventsCutoff = eventsTs || new Date(0).toISOString();
      const evtCutoff = effectiveEventsContentTs;
      const eventsRes = await supabase.rpc('get_upcoming_events', { p_actor_id: actorId });
      const eventRows = (((eventsRes.data as any[] | null) ?? []) as { id: string; category: string; created_at: string }[])
        .filter((r) => new Date(r.created_at || 0) > new Date(evtCutoff));
      const unviewedEvents = eventRows.filter((r) => !evtViewed.has(r.id));
      // Sub-tab badges use the per-tab visit timestamp so swiping to a sub-tab clears its dot
      // independently from item-level NEW pills (which use evtCutoff + viewedEventIds).
      const evtEventTabCutoff = evtEventTabTs && evtEventTabTs > evtCutoff ? evtEventTabTs : evtCutoff;
      const evtEntTabCutoff = evtEntTabTs && evtEntTabTs > evtCutoff ? evtEntTabTs : evtCutoff;
      const eventEventUnviewed = unviewedEvents.filter((r) => r.category === 'Event' && new Date(r.created_at) > new Date(evtEventTabCutoff)).length;
      const eventEntertainmentUnviewed = unviewedEvents.filter((r) => r.category === 'Entertainment' && new Date(r.created_at) > new Date(evtEntTabCutoff)).length;
      const eventsCount = eventEventUnviewed + eventEntertainmentUnviewed;
      setEventsHasNew(eventsCount > 0);
      setEventsEventHasNew(eventEventUnviewed > 0);
      setEventsEntertainmentHasNew(eventEntertainmentUnviewed > 0);

      // Check "Specials" tab: menu_items in the org's Weekly Specials category
      // (resolved by system_key so it follows owner renames).
      const wsNames = await weeklySpecialsNames(actorId);
      const specialsCutoff = specialsTs || new Date(0).toISOString();
      // Two sources of "new specials": items newly CREATED in the Weekly
      // Specials category, and existing items just FEATURED via is_weekly_special
      // (the feature toggle bumps updated_at). Dedupe by id.
      // RPC returns active items (with created_at/updated_at); apply the "new since cutoff"
      // filter client-side (the RPC has no time-cutoff param).
      const [byCatRes, byFlagRes] = await Promise.all([
        supabase.rpc('get_menu_items', { p_actor_id: actorId, p_categories: wsNames }),
        supabase.rpc('get_menu_items', { p_actor_id: actorId, p_weekly_special: true }),
      ]);
      const specialIds = new Set<string>([
        ...((byCatRes.data || []) as any[]).filter((r) => (r.created_at || '') > specialsCutoff).map((r) => r.id),
        ...((byFlagRes.data || []) as any[]).filter((r) => (r.updated_at || '') > specialsCutoff).map((r) => r.id),
      ]);
      const specialsCount = specialIds.size;
      setSpecialsHasNew(specialsCount > 0);

      // Total count for notification bell badge
      setNewContentCount(todayCount + eventsCount + specialsCount);
    } catch (err) {
      console.error('Error checking unread content:', err);
    }
  }, []);

  const markTabViewed = useCallback(async (tab: ConnectBarTab) => {
    // 'schedule' has no unread-content tracking → no key, guarded below.
    const key = STORAGE_KEYS[tab as keyof typeof STORAGE_KEYS];
    if (!key) return;
    await AsyncStorage.setItem(key, new Date().toISOString());

    // Immediately clear the badge for this tab
    switch (tab) {
      case 'today': setTodayHasNew(false); break;
      case 'events': setEventsHasNew(false); break;
      case 'specials': setSpecialsHasNew(false); break;
    }
  }, []);

  // Tab tap no longer clears NEW state — it only bootstraps the cutoff timestamp
  // on first install, so existing items at install time don't all get NEW pills.
  // Per-item NEW state is cleared via markAnnouncementViewed / markSpecialFeatureViewed
  // when the user actually opens an item's detail modal.
  const markWelcomeTabViewed = useCallback(async (tab: WelcomeTab) => {
    if (tab === 'announcements') {
      if (!lastViewedAnnouncements) {
        const now = new Date().toISOString();
        await AsyncStorage.setItem(STORAGE_KEYS.announcements, now);
        setLastViewedAnnouncements(now);
      }
    } else {
      if (!lastViewedSpecialFeatures) {
        const now = new Date().toISOString();
        await AsyncStorage.setItem(STORAGE_KEYS.specialFeatures, now);
        setLastViewedSpecialFeatures(now);
      }
    }
  }, [lastViewedAnnouncements, lastViewedSpecialFeatures]);

  const markAnnouncementViewed = useCallback(async (id: string) => {
    if (!id) return;
    setViewedAnnouncementIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(STORAGE_KEYS.viewedAnnouncementIds, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
    // Refresh tab dot state so it can clear if this was the only unviewed item
    setTimeout(() => checkUnread(), 0);
  }, [checkUnread]);

  const markSpecialFeatureViewed = useCallback(async (id: string) => {
    if (!id) return;
    setViewedSpecialFeatureIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(STORAGE_KEYS.viewedSpecialFeatureIds, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
    setTimeout(() => checkUnread(), 0);
  }, [checkUnread]);

  const markEventViewed = useCallback(async (id: string) => {
    if (!id) return;
    setViewedEventIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(STORAGE_KEYS.viewedEventIds, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
    setTimeout(() => checkUnread(), 0);
  }, [checkUnread]);

  const markEventsTabVisited = useCallback(async (category: 'Event' | 'Entertainment') => {
    const now = new Date().toISOString();
    const key = category === 'Event' ? STORAGE_KEYS.eventsEventTab : STORAGE_KEYS.eventsEntertainmentTab;
    await AsyncStorage.setItem(key, now);
    if (category === 'Event') setEventsEventHasNew(false);
    else setEventsEntertainmentHasNew(false);
  }, []);

  const markAllEventsViewed = useCallback(async () => {
    const now = new Date().toISOString();
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.eventsContent, now),
      AsyncStorage.setItem(STORAGE_KEYS.eventsEventTab, now),
      AsyncStorage.setItem(STORAGE_KEYS.eventsEntertainmentTab, now),
    ]);
    setLastViewedEvents(now);
    setEventsEventHasNew(false);
    setEventsEntertainmentHasNew(false);
    setEventsHasNew(false);
  }, []);

  useEffect(() => {
    checkUnread();
    listeners.add(checkUnread);

    // Listen for new content via realtime
    const announcementsChannel = supabase
      .channel(`unread_announcements_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, () => checkUnread())
      .subscribe();

    const specialFeaturesChannel = supabase
      .channel(`unread_special_features_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'special_features' }, () => checkUnread())
      .subscribe();

    const eventsChannel = supabase
      .channel(`unread_events_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'upcoming_events' }, () => checkUnread())
      .subscribe();

    const menuItemsChannel = supabase
      .channel(`unread_specials_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'menu_items' }, () => checkUnread())
      .subscribe();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') checkUnread();
    });

    // Poll every 60 seconds (content doesn't change as often as messages)
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') checkUnread();
    }, 60000);

    return () => {
      listeners.delete(checkUnread);
      supabase.removeChannel(announcementsChannel);
      supabase.removeChannel(specialFeaturesChannel);
      supabase.removeChannel(eventsChannel);
      supabase.removeChannel(menuItemsChannel);
      subscription.remove();
      clearInterval(interval);
    };
  }, [checkUnread]);

  return {
    todayHasNew,
    eventsHasNew,
    specialsHasNew,
    announcementsHasNew,
    specialFeaturesHasNew,
    eventsEventHasNew,
    eventsEntertainmentHasNew,
    lastViewedAnnouncements,
    lastViewedSpecialFeatures,
    lastViewedEvents,
    viewedAnnouncementIds,
    viewedSpecialFeatureIds,
    viewedEventIds,
    hasAnyNew: todayHasNew || eventsHasNew || specialsHasNew,
    newContentCount,
    markTabViewed,
    markWelcomeTabViewed,
    markAnnouncementViewed,
    markSpecialFeatureViewed,
    markEventViewed,
    markEventsTabVisited,
    markAllEventsViewed,
    refresh: checkUnread,
  };
}
