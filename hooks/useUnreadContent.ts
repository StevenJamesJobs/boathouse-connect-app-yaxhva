import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/app/integrations/supabase/client';
import { ConnectBarTab } from '@/components/ConnectBar';

const STORAGE_KEYS = {
  today: 'lastViewed_today',
  events: 'lastViewed_events',
  specials: 'lastViewed_specials',
} as const;

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
  hasAnyNew: boolean;
  newContentCount: number;
  markTabViewed: (tab: ConnectBarTab) => Promise<void>;
  refresh: () => void;
}

export function useUnreadContent(): UnreadContentResult {
  const [todayHasNew, setTodayHasNew] = useState(false);
  const [eventsHasNew, setEventsHasNew] = useState(false);
  const [specialsHasNew, setSpecialsHasNew] = useState(false);
  const [newContentCount, setNewContentCount] = useState(0);

  const checkUnread = useCallback(async () => {
    try {
      // Load last-viewed timestamps
      const [todayTs, eventsTs, specialsTs] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.today),
        AsyncStorage.getItem(STORAGE_KEYS.events),
        AsyncStorage.getItem(STORAGE_KEYS.specials),
      ]);

      // Check "Today" tab: announcements + special_features
      const todayCutoff = todayTs || new Date(0).toISOString();
      const [announcementsRes, specialFeaturesRes] = await Promise.all([
        (supabase.from('announcements') as any)
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .gt('created_at', todayCutoff),
        (supabase.from('special_features') as any)
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .gt('created_at', todayCutoff),
      ]);
      const todayCount = (announcementsRes.count || 0) + (specialFeaturesRes.count || 0);
      setTodayHasNew(todayCount > 0);

      // Check "Events" tab: upcoming_events
      const eventsCutoff = eventsTs || new Date(0).toISOString();
      const eventsRes = await (supabase.from('upcoming_events') as any)
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .gt('created_at', eventsCutoff);
      const eventsCount = eventsRes.count || 0;
      setEventsHasNew(eventsCount > 0);

      // Check "Specials" tab: menu_items with category "Weekly Specials"
      const specialsCutoff = specialsTs || new Date(0).toISOString();
      const specialsRes = await (supabase.from('menu_items') as any)
        .select('id', { count: 'exact', head: true })
        .eq('category', 'Weekly Specials')
        .gt('created_at', specialsCutoff);
      const specialsCount = specialsRes.count || 0;
      setSpecialsHasNew(specialsCount > 0);

      // Total count for notification bell badge
      setNewContentCount(todayCount + eventsCount + specialsCount);
    } catch (err) {
      console.error('Error checking unread content:', err);
    }
  }, []);

  const markTabViewed = useCallback(async (tab: ConnectBarTab) => {
    const key = STORAGE_KEYS[tab];
    if (!key) return;
    await AsyncStorage.setItem(key, new Date().toISOString());

    // Immediately clear the badge for this tab
    switch (tab) {
      case 'today': setTodayHasNew(false); break;
      case 'events': setEventsHasNew(false); break;
      case 'specials': setSpecialsHasNew(false); break;
    }
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
    hasAnyNew: todayHasNew || eventsHasNew || specialsHasNew,
    newContentCount,
    markTabViewed,
    refresh: checkUnread,
  };
}
