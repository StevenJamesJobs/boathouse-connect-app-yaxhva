/**
 * Notification Helper Functions
 *
 * These functions provide easy-to-use wrappers for sending different types
 * of notifications throughout the app.
 */

import { supabase } from '@/app/integrations/supabase/client';
import { getCurrentActorId } from '@/utils/currentActor';
import i18n from '@/i18n';

interface SendNotificationParams {
  userIds?: string[];
  organizationId?: string;
  notificationType: 'message' | 'reward' | 'announcement' | 'event' | 'special_feature' | 'custom';
  title: string;
  body: string;
  // s62: optional Spanish copy — the edge function picks per recipient from
  // users.preferred_language; anyone unknown/en gets the English base.
  title_es?: string;
  body_es?: string;
  data?: Record<string, any>;
  jobTitles?: string[];
}

/**
 * Build the same i18n key in both supported languages (interpolation included).
 * Push senders pass the pair through so the edge function can deliver each
 * recipient's copy from users.preferred_language (s62). Both locales are
 * bundled inline, so the fixed-lng lookups are synchronous.
 */
export function bothLanguages(key: string, vars?: Record<string, any>): { en: string; es: string } {
  return {
    en: i18n.t(key, { ...vars, lng: 'en' }),
    es: i18n.t(key, { ...vars, lng: 'es' }),
  };
}

/**
 * Core function to send notifications via Edge Function.
 *
 * Never throws — system senders (games/redemption/quiz/…) stay fire-and-forget.
 * Returns whether the push HTTP call succeeded so interactive senders (the
 * composer) can tell the manager when the phone alert may not have gone out.
 */
async function sendNotification(params: SendNotificationParams): Promise<boolean> {
  try {
    // Server verifies actor_id (active user) and derives the org from it — the
    // recipient org is never trusted from the client. Null actor => 401 (no push).
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: { ...params, actor_id: getCurrentActorId() },
    });

    if (error) {
      console.error('Error sending notification:', error);
      throw error;
    }

    console.log('Notification sent successfully:', data);
    return true;
  } catch (error) {
    console.error('Error in sendNotification:', error);
    // Don't throw - fail silently so app continues working
    return false;
  }
}

/**
 * Notify users who got passed on the master Game Hub leaderboard.
 * Calls get_passed_users_on_leaderboard RPC (which already filters
 * recipients by their game_hub_enabled preference) and fires a push
 * to the resulting list. No-op when no one was passed.
 *
 * Both language copies are built HERE (s62): each passed user gets the push
 * and the shade row in their own language, regardless of the player's UI
 * language. Fire-and-forget; errors are swallowed so the post-game UI isn't
 * blocked.
 */
export async function notifyLeaderboardPassed(
  playerUserId: string,
  scoreJustEarned: number,
  playerName: string,
  organizationId?: string
): Promise<void> {
  if (!playerUserId || scoreJustEarned <= 0) return;
  try {
    const { data, error } = await supabase.rpc('get_passed_users_on_leaderboard', {
      p_user_id: playerUserId,
      p_new_score: scoreJustEarned,
      p_organization_id: organizationId,
    });
    if (error) {
      console.error('[notifyLeaderboardPassed] RPC error:', error);
      return;
    }
    const passed = (data ?? []) as Array<{ user_id: string; name: string }>;
    if (passed.length === 0) return;

    const title = bothLanguages('notifications.game_hub_passed_title', { name: playerName });
    const body = bothLanguages('notifications.game_hub_passed_body');

    // Write per-recipient shade rows (server-side) so each passed user sees the entry in
    // their personal notification dropdown. The DEFINER RPC derives organization_id from the
    // actor, sets sent_by, and stamps data.targetUserId per recipient — it works for an
    // employee player (the direct insert used to fail the manager-only INSERT policy) and
    // supplies the NOT NULL organization_id the old insert omitted. The Spanish copy rides
    // data.title_es/body_es for the dropdown's viewer-language pick.
    const { error: insertError } = await supabase.rpc('add_leaderboard_pass_notifications', {
      p_actor_id: playerUserId,
      p_recipient_ids: passed.map((p) => p.user_id),
      p_title: title.en,
      p_body: body.en,
      p_title_es: title.es,
      p_body_es: body.es,
    });
    if (insertError) {
      console.error('[notifyLeaderboardPassed] shade insert error:', insertError);
      // Continue to push even if shade insert failed.
    }

    await sendNotification({
      userIds: passed.map((p) => p.user_id),
      organizationId,
      notificationType: 'custom',
      title: title.en,
      body: body.en,
      title_es: title.es,
      body_es: body.es,
      data: {
        type: 'custom',
        notificationType: 'leaderboard_pass',
        destination: 'master-leaderboard',
      },
    });
  } catch (err) {
    console.error('[notifyLeaderboardPassed] unexpected error:', err);
  }
}

/**
 * Send a custom notification (manager only)
 * Supports optional job_titles filtering for targeted notifications
 *
 * Returns whether the push HTTP call succeeded (never throws).
 */
export async function sendCustomNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
  organizationId?: string,
  titleEs?: string,
  bodyEs?: string
): Promise<boolean> {
  // Extract job_titles from data to pass as top-level param for edge function filtering
  const jobTitles = data?.job_titles as string[] | undefined;

  return sendNotification({
    organizationId,
    notificationType: 'custom',
    title: title,
    body: body,
    title_es: titleEs,
    body_es: bodyEs,
    data: {
      ...data,
      type: 'custom',
    },
    jobTitles,
  });
}
