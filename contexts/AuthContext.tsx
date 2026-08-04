
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { User, AuthState } from '@/types/user';
import { AppState, Platform } from 'react-native';
import { setResolverActorId } from '@/utils/storageResolver';
import { setCurrentActorId } from '@/utils/currentActor';
import i18n from '@/i18n';
import { LANGUAGE_STORAGE_KEY } from '@/contexts/LanguageContext';

interface AuthContextType extends AuthState {
  login: (username: string, password: string, rememberMe: boolean) => Promise<boolean>;
  adoptSession: (row: unknown, rememberMe: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = '@mrc_auth';
const REMEMBER_ME_KEY = '@mrc_remember_me';
const OLD_STORAGE_KEY = '@mcloones_auth';
const OLD_REMEMBER_ME_KEY = '@mcloones_remember_me';

// B8 stale-session hardening: when a remembered session had to be published from CACHE
// (get_me unreachable at restore), its role/job_titles may be stale — server RPC gates
// still hold, so the leak is UI-only, but it must CONVERGE. Bounded retries run at this
// cadence after a failed restore refresh; independently, every return to the foreground
// revalidates the session (throttled below), which also covers a suspended-not-killed
// app that would otherwise never re-observe a server-side role change.
const REVALIDATE_BACKOFF_MS = [5000, 30000, 120000];
const FOREGROUND_REVALIDATE_MIN_MS = 60000;

// The password the user just authenticated with, held in volatile module memory
// (never persisted) so the FORCED change-password flow can pass it as the
// current password — instead of asserting the org default, which is wrong for
// anyone who already changed their password. Set on successful login, cleared
// on logout. Not available after a session-restore (no password was typed) —
// the forced flow then falls back to the org default, same as before.
let _lastLoginPassword: string | null = null;
export function getStashedLoginPassword(): string | null {
  return _lastLoginPassword;
}
export function clearStashedLoginPassword(): void {
  _lastLoginPassword = null;
}

// Lazy-load AsyncStorage to avoid SSR issues
let AsyncStorage: any = null;
if (typeof window !== 'undefined' || Platform.OS !== 'web') {
  try {
    AsyncStorage = require('@react-native-async-storage/async-storage').default;
    console.log('[AuthContext] AsyncStorage loaded successfully');
  } catch (error) {
    console.warn('[AuthContext] Failed to load AsyncStorage:', error);
  }
}

type FetchResult =
  | { status: 'ok'; user: User }
  | { status: 'not_found' }
  | { status: 'error' };

// Map a users-row shape (from the login_user / get_me RPCs) to the app User model.
function mapRowToUser(row: any): User {
  let jobTitleDisplay = '';
  let jobTitlesArray: string[] = [];
  if (row.job_titles && Array.isArray(row.job_titles) && row.job_titles.length > 0) {
    jobTitlesArray = row.job_titles;
    jobTitleDisplay = row.job_titles.join(', ');
  } else if (row.job_title) {
    jobTitlesArray = [row.job_title];
    jobTitleDisplay = row.job_title;
  }
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    jobTitle: jobTitleDisplay,
    jobTitles: jobTitlesArray,
    phoneNumber: row.phone_number || '',
    role: row.role as 'employee' | 'manager' | 'owner',
    organizationId: row.organization_id,
    profilePictureUrl: row.profile_picture_url || undefined,
    badgeTitle: row.badge_title || undefined,
    mcloonesBucks: row.mcloones_bucks || 0,
    quickTools: row.quick_tools ? (Array.isArray(row.quick_tools) ? row.quick_tools : JSON.parse(row.quick_tools)) : undefined,
    forcePasswordChange: row.force_password_change || false,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // B8 revalidation state (refs so the []-deps effects and timers below never go stale):
  // current session's user id, whether the session was published from cache without a
  // successful get_me, the last revalidation attempt time, and any pending retry timer.
  const userIdRef = useRef<string | null>(null);
  const sessionStaleRef = useRef(false);
  const lastRevalidateAtRef = useRef(0);
  const revalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUserFromDatabase = async (userId: string): Promise<FetchResult> => {
    try {
      console.log('[AuthContext] Fetching user data via get_me for user:', userId);

      const { data, error } = await supabase.rpc('get_me', { p_user_id: userId });

      if (error) {
        // Transport/permission error — NOT proof the account was deleted. Do not wipe the session.
        console.log('[AuthContext] get_me error:', error.message);
        return { status: 'error' };
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        console.log('[AuthContext] User not found via get_me');
        return { status: 'not_found' };
      }

      const user = mapRowToUser(row);
      console.log('[AuthContext] User data fetched successfully, org:', user.organizationId, 'job titles:', user.jobTitles);
      return { status: 'ok', user };
    } catch (error) {
      console.log('[AuthContext] Exception in get_me:', error);
      return { status: 'error' };
    }
  };

  // Apply a fresh get_me row to state + storage. The storage write is deliberately
  // non-fatal: a persistence hiccup must never undo a session the server just confirmed.
  const applyFreshUser = async (freshUser: User) => {
    try {
      if (AsyncStorage) {
        const rememberMe = await AsyncStorage.getItem(REMEMBER_ME_KEY);
        if (rememberMe === 'true') {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(freshUser));
        }
      }
    } catch (storageError) {
      console.log('[AuthContext] Non-fatal: could not persist refreshed user:', storageError);
    }
    setAuthState({ user: freshUser, isLoading: false, isAuthenticated: true });
  };

  // Re-run get_me for the current session and reconcile: fresh row → apply it (stale
  // flag clears, a demoted role unmounts the manager shell via the live layout guard);
  // account gone → end the session; transport error → stay as-is (callers retry).
  const revalidateSession = async (): Promise<'applied' | 'ended' | 'failed' | 'noop'> => {
    const userId = userIdRef.current;
    if (!userId) return 'noop';
    lastRevalidateAtRef.current = Date.now();
    const result = await fetchUserFromDatabase(userId);
    if (userIdRef.current !== userId) return 'noop'; // logged out / switched mid-flight
    if (result.status === 'ok') {
      sessionStaleRef.current = false;
      await applyFreshUser(result.user);
      return 'applied';
    }
    if (result.status === 'not_found') {
      console.log('[AuthContext] Revalidation: account no longer exists — ending session');
      sessionStaleRef.current = false;
      await logout();
      return 'ended';
    }
    return 'failed';
  };

  const scheduleRevalidate = (attempt: number) => {
    if (attempt >= REVALIDATE_BACKOFF_MS.length) return; // foreground listener takes over
    if (revalidateTimerRef.current) clearTimeout(revalidateTimerRef.current);
    revalidateTimerRef.current = setTimeout(async () => {
      revalidateTimerRef.current = null;
      const outcome = await revalidateSession();
      if (outcome === 'failed') scheduleRevalidate(attempt + 1);
    }, REVALIDATE_BACKOFF_MS[attempt]);
  };

  const loadStoredAuth = useCallback(async () => {
    try {
      console.log('[AuthContext] Loading stored auth, Platform:', Platform.OS);
      
      // Skip if AsyncStorage is not available (SSR)
      if (!AsyncStorage) {
        console.log('[AuthContext] AsyncStorage not available, skipping stored auth');
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        });
        return;
      }
      
      // One-time migration from old storage keys
      const oldRememberMe = await AsyncStorage.getItem(OLD_REMEMBER_ME_KEY);
      if (oldRememberMe !== null) {
        const oldAuth = await AsyncStorage.getItem(OLD_STORAGE_KEY);
        if (oldAuth) await AsyncStorage.setItem(STORAGE_KEY, oldAuth);
        await AsyncStorage.setItem(REMEMBER_ME_KEY, oldRememberMe);
        await AsyncStorage.removeItem(OLD_STORAGE_KEY);
        await AsyncStorage.removeItem(OLD_REMEMBER_ME_KEY);
        console.log('[AuthContext] Migrated storage keys from legacy format');
      }

      const rememberMe = await AsyncStorage.getItem(REMEMBER_ME_KEY);
      console.log('[AuthContext] Remember me setting:', rememberMe);

      if (rememberMe === 'true') {
        const storedAuth = await AsyncStorage.getItem(STORAGE_KEY);
        if (storedAuth) {
          try {
            const storedUser = JSON.parse(storedAuth);
            console.log('[AuthContext] Loaded user from storage:', storedUser.name);
            
            // Fetch the latest user data from database to get updated profile picture and job titles
            const result = await fetchUserFromDatabase(storedUser.id);

            if (result.status === 'ok') {
              const freshUser = result.user;
              // Update storage with fresh data (non-fatal: a storage hiccup must not
              // wipe a session get_me just confirmed — the outer catch clears both keys).
              try {
                await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(freshUser));
              } catch (persistError) {
                console.log('[AuthContext] Non-fatal: could not persist refreshed user:', persistError);
              }

              // Update cached org branding
              if (freshUser.organizationId) {
                try {
                  const { data: orgRows } = await supabase.rpc('get_org', { p_actor_id: freshUser.id });
                  const orgData: any = Array.isArray(orgRows) ? orgRows[0] : orgRows;
                  if (orgData) {
                    await AsyncStorage.setItem('@mrc_last_org', JSON.stringify({
                      orgId: freshUser.organizationId,
                      orgName: orgData.name,
                      logoUrl: orgData.logo_url,
                    }));
                  }
                } catch {}
              }

              console.log('[AuthContext] Setting authenticated state with fresh user data');
              setAuthState({
                user: freshUser,
                isLoading: false,
                isAuthenticated: true,
              });
              return;
            } else if (result.status === 'error') {
              // Defense-in-depth: a transient/permission error is NOT proof the account is gone.
              // Keep the cached session rather than logging the user out — this prevents a stale
              // client from being bricked (session erased) during the eventual RLS teardown.
              console.log('[AuthContext] get_me unavailable; keeping cached session');
              // B8: the cached role may be stale (e.g. a demotion we couldn't observe).
              // Mark the session stale and converge: bounded backoff retries now, plus
              // the foreground revalidation listener from then on.
              sessionStaleRef.current = true;
              setAuthState({
                user: storedUser as User,
                isLoading: false,
                isAuthenticated: true,
              });
              scheduleRevalidate(0);
              return;
            } else {
              // not_found — the account genuinely no longer exists; clear stored auth.
              console.log('[AuthContext] User no longer exists, clearing stored auth');
              await AsyncStorage.removeItem(STORAGE_KEY);
              await AsyncStorage.removeItem(REMEMBER_ME_KEY);
            }
          } catch (parseError) {
            console.log('[AuthContext] Error parsing stored auth, clearing:', parseError);
            await AsyncStorage.removeItem(STORAGE_KEY);
            await AsyncStorage.removeItem(REMEMBER_ME_KEY);
          }
        }
      }
      
      console.log('[AuthContext] No valid stored auth found, setting unauthenticated state');
    } catch (error) {
      console.log('[AuthContext] Error loading stored auth:', error);
    }
    
    // Always set loading to false, even if there's an error
    setAuthState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  useEffect(() => {
    console.log('[AuthContext] AuthProvider mounted, Platform:', Platform.OS);

    // Wrap in try-catch to prevent crashes
    try {
      loadStoredAuth();
    } catch (error) {
      console.error('[AuthContext] CRITICAL ERROR in loadStoredAuth:', error);
      // Set to unauthenticated state if there's an error
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }, [loadStoredAuth]);

  // B4b: the storage resolver reads the actor from module scope (leaf image
  // components never thread it). Null on logout clears its signed-URL cache.
  useEffect(() => {
    userIdRef.current = authState.user?.id ?? null;
    if (!authState.user?.id && revalidateTimerRef.current) {
      clearTimeout(revalidateTimerRef.current);
      revalidateTimerRef.current = null;
    }
    setResolverActorId(authState.user?.id ?? null);
    // Same actor feeds edge-function callers (push / translate) that can't thread it.
    setCurrentActorId(authState.user?.id ?? null);
    // s62: sync the UI language to users.preferred_language once per session
    // establishment (login / join-adopt / cold restore). Read the persisted
    // override directly — at cold start i18n.language may still be the device
    // default while LanguageContext's async read is in flight. Fire-and-forget;
    // the server no-ops when the value is unchanged.
    const uid = authState.user?.id;
    if (uid && AsyncStorage) {
      AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
        .then((saved: string | null) => {
          const lang = saved === 'es' || saved === 'en' ? saved : i18n.language === 'es' ? 'es' : 'en';
          return supabase.rpc('set_my_preferred_language', { p_user_id: uid, p_language: lang });
        })
        .then((res: { error: { message: string } | null } | undefined) => {
          if (res?.error) console.warn('[AuthContext] preferred_language sync failed:', res.error.message);
        })
        .catch(() => {});
    }
  }, [authState.user?.id]);

  // B8: revalidate on return to foreground — a suspended (not killed) app never re-runs
  // restore, so without this a server-side role change is unobserved until a cold start.
  // Throttled to once a minute; runs unconditionally while the session is known-stale.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      if (!userIdRef.current) return;
      const throttled = Date.now() - lastRevalidateAtRef.current < FOREGROUND_REVALIDATE_MIN_MS;
      if (!sessionStaleRef.current && throttled) return;
      revalidateSession().then((outcome) => {
        // Retry on ANY transport failure, not just known-stale sessions: iOS can fail
        // requests fired in the first instant after foregrounding (network stack still
        // waking), which would otherwise silently eat this one-shot check.
        if (outcome === 'failed') scheduleRevalidate(0);
      });
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshUser = async (): Promise<boolean> => {
    try {
      if (!authState.user?.id) {
        console.log('[AuthContext] No user to refresh');
        return false;
      }

      console.log('[AuthContext] Refreshing user data...');
      const result = await fetchUserFromDatabase(authState.user.id);

      if (result.status === 'ok') {
        sessionStaleRef.current = false;
        lastRevalidateAtRef.current = Date.now();
        await applyFreshUser(result.user);
        console.log('[AuthContext] User data refreshed successfully');
        return true;
      }
      // On 'error' or 'not_found', leave the current session untouched (don't disrupt an active session).
      return false;
    } catch (error) {
      console.log('[AuthContext] Error refreshing user:', error);
      return false;
    }
  };

  // Adopt a server-authenticated users row (login_user / join_signup shape) as the active
  // session: map it, persist it per rememberMe, publish auth state, and cache org branding.
  const establishSession = async (row: any, rememberMe: boolean): Promise<User> => {
    const user = mapRowToUser(row);

    // Store auth state if AsyncStorage is available
    if (AsyncStorage) {
      if (rememberMe) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        await AsyncStorage.setItem(REMEMBER_ME_KEY, 'true');
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
        await AsyncStorage.setItem(REMEMBER_ME_KEY, 'false');
      }
      // This device has had a signed-in account — the login screens use this
      // to hide the first-time join/owner-setup entry points from now on.
      await AsyncStorage.setItem('@mrc_device_has_account', '1');
    }

    setAuthState({
      user,
      isLoading: false,
      isAuthenticated: true,
    });

    // Cache org branding for login screen (hybrid approach)
    if (AsyncStorage && user.organizationId) {
      try {
        const { data: orgRows } = await supabase.rpc('get_org', { p_actor_id: user.id });
        const orgData: any = Array.isArray(orgRows) ? orgRows[0] : orgRows;
        if (orgData) {
          await AsyncStorage.setItem('@mrc_last_org', JSON.stringify({
            orgId: user.organizationId,
            orgName: orgData.name,
            logoUrl: orgData.logo_url,
          }));
        }
      } catch {}
    }

    return user;
  };

  // Set the session from a row a signup RPC (join_signup) returned — the row is already
  // authenticated server-side, so no second credential round-trip is needed.
  const adoptSession = async (row: unknown, rememberMe: boolean): Promise<boolean> => {
    try {
      if (!row || typeof row !== 'object' || !(row as any).id) {
        console.log('[AuthContext] adoptSession called with an invalid row');
        return false;
      }
      const user = await establishSession(row, rememberMe);
      console.log('[AuthContext] Session adopted for user:', user.name, 'Role:', user.role);
      return true;
    } catch (error) {
      console.log('[AuthContext] adoptSession error:', error);
      return false;
    }
  };

  const login = async (username: string, password: string, rememberMe: boolean): Promise<boolean> => {
    try {
      console.log('[AuthContext] Attempting login with username:', username, 'Platform:', Platform.OS);
      
      // Clean username - remove any leading zeros and whitespace
      const cleanUsername = username.trim();
      
      console.log('[AuthContext] Authenticating via login_user for username:', cleanUsername);

      // Authenticate server-side: case-insensitive, constant-time, and the password hash never
      // leaves the database. Returns 0 rows for BOTH an unknown username and a wrong password.
      const { data, error } = await supabase.rpc('login_user', {
        p_username: cleanUsername,
        p_password: password,
      });

      if (error) {
        console.log('[AuthContext] login_user error:', error.message);
        // Server-side throttle (B4 batch 5): surface the lockout distinctly so
        // the login screens can show a specific message instead of "invalid".
        if (error.message?.includes('rate_limited')) {
          throw new Error('rate_limited');
        }
        return false;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        console.log('[AuthContext] Invalid username or password');
        return false;
      }

      const user = await establishSession(row, rememberMe);
      // Stash for the forced change-password flow (volatile; cleared on logout).
      _lastLoginPassword = password;

      console.log('[AuthContext] Login successful for user:', user.name, 'Role:', user.role);
      return true;
    } catch (error) {
      console.log('[AuthContext] Login exception:', error);
      if (error instanceof Error && error.message === 'rate_limited') throw error;
      return false;
    }
  };

  const logout = async () => {
    try {
      console.log('[AuthContext] Logging out...');
      _lastLoginPassword = null;
      if (AsyncStorage) {
        await AsyncStorage.removeItem(STORAGE_KEY);
        await AsyncStorage.removeItem(REMEMBER_ME_KEY);
      }
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
      console.log('[AuthContext] Logout successful');
    } catch (error) {
      console.log('[AuthContext] Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, adoptSession, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
