// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  actor_id?: string; // Required: the sending user. Org is DERIVED from this, never trusted from the body.
  userIds?: string[]; // Specific users (must resolve to the actor's org; cross-org ids are dropped)
  organizationId?: string; // Ignored for scoping — kept only for back-compat logging (camel/snake both accepted)
  organization_id?: string;
  notificationType: 'message' | 'reward' | 'announcement' | 'event' | 'special_feature' | 'custom';
  title: string;
  body: string;
  data?: Record<string, any>;
  jobTitles?: string[]; // Filter recipients by job titles (broadcast — requires manager/owner)
}

const json = (obj: unknown, status: number) =>
  new Response(JSON.stringify(obj), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Service role client for database operations (full access)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Parse request body
    const requestData: NotificationRequest = await req.json();
    const { actor_id, userIds, notificationType, title, body, data, jobTitles } = requestData;

    // --- Authorization: verify a real actor and DERIVE the org from it ---
    // This app has no Supabase Auth (the anon key satisfies verify_jwt but proves
    // nothing), so the actor_id in the body — looked up via the service role — is
    // the only real caller identity. The client-supplied org is NEVER trusted for
    // scoping; every recipient query is bound to the actor's own org.
    if (!actor_id || !UUID_RE.test(actor_id)) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }
    const { data: actor, error: actorError } = await supabaseClient
      .from('users')
      .select('id, role, organization_id, is_active')
      .eq('id', actor_id)
      .single();
    if (actorError || !actor || actor.is_active === false || !actor.organization_id) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }
    const actorOrg = actor.organization_id as string;
    const isManager = actor.role === 'manager' || actor.role === 'owner';
    const hasExplicitUserIds = Array.isArray(userIds) && userIds.length > 0;

    console.log('Processing notification request:', { notificationType, title, actor_id, actorOrg, count: userIds?.length, jobTitles });

    // Get recipient user IDs — always scoped to the actor's org.
    let recipientIds: string[] = [];

    if (hasExplicitUserIds) {
      // Targeted send (messages, rewards, leaderboard-pass): allowed for any active
      // member, but recipients are filtered to the actor's org — cross-org ids drop out.
      const { data: sameOrgUsers, error: usersError } = await supabaseClient
        .from('users')
        .select('id')
        .in('id', userIds)
        .eq('organization_id', actorOrg)
        .eq('is_active', true);
      if (usersError) {
        throw usersError;
      }
      recipientIds = (sameOrgUsers || []).map((u: any) => u.id);
    } else {
      // Broadcast (whole org, optionally job-title filtered) — announcements, events,
      // features, custom sends: manager/owner only.
      if (!isManager) {
        return json({ success: false, error: 'Forbidden: broadcast requires manager or owner' }, 403);
      }

      const { data: orgUsers, error: usersError } = await supabaseClient
        .from('users')
        .select('id, job_titles, job_title')
        .eq('organization_id', actorOrg)
        .eq('is_active', true);
      if (usersError) {
        throw usersError;
      }

      if (jobTitles && jobTitles.length > 0) {
        recipientIds = (orgUsers || [])
          .filter((u: any) => {
            const userJobTitles: string[] = u.job_titles || (u.job_title ? [u.job_title] : []);
            return userJobTitles.some((jt: string) => jobTitles.includes(jt));
          })
          .map((u: any) => u.id);
        console.log(`Found ${recipientIds.length} users matching job titles: ${jobTitles.join(', ')}`);
      } else {
        recipientIds = (orgUsers || []).map((u: any) => u.id);
      }
    }

    console.log(`Sending to ${recipientIds.length} users`);

    // Get push tokens for recipients
    const { data: pushTokens, error: tokensError } = await supabaseClient
      .from('push_tokens')
      .select('token, user_id')
      .in('user_id', recipientIds);

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      throw tokensError;
    }

    console.log(`Found ${pushTokens.length} push tokens`);

    // Get notification preferences for recipients
    const { data: preferences, error: prefsError } = await supabaseClient
      .from('notification_preferences')
      .select('user_id, messages_enabled, rewards_enabled, announcements_enabled, events_enabled, special_features_enabled, custom_notifications_enabled')
      .in('user_id', recipientIds);

    if (prefsError) {
      console.error('Error fetching preferences:', prefsError);
      // Don't throw - send notifications even if preferences can't be fetched
    }

    // Build a preferences lookup map
    const prefsMap: Record<string, any> = {};
    if (preferences) {
      for (const pref of preferences) {
        prefsMap[pref.user_id] = pref;
      }
    }

    // Filter based on preferences
    const preferencesFieldMap: Record<string, string> = {
      'message': 'messages_enabled',
      'reward': 'rewards_enabled',
      'announcement': 'announcements_enabled',
      'event': 'events_enabled',
      'special_feature': 'special_features_enabled',
      'custom': 'custom_notifications_enabled',
    };

    const preferenceField = preferencesFieldMap[notificationType];

    const filteredTokens = pushTokens.filter((item: any) => {
      const userPrefs = prefsMap[item.user_id];
      // If no preferences found or no matching field, send by default
      if (!userPrefs || !preferenceField) return true;
      return userPrefs[preferenceField] === true;
    });

    console.log(`Filtered to ${filteredTokens.length} users with preferences enabled`);

    if (filteredTokens.length === 0) {
      console.log('No users with enabled preferences found');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No users with enabled preferences',
          sent: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Compute per-recipient badge totals so the APNs payload reflects the
    // user's actual unread (messages + uncompleted eligible weekly quizzes)
    // instead of overwriting their existing badge with a hardcoded value.
    const recipientIdsForBadge = Array.from(new Set(filteredTokens.map((t: any) => t.user_id)));
    const badgeTotals: Record<string, number> = {};
    try {
      const { data: badgeRows, error: badgeErr } = await supabaseClient.rpc(
        'get_user_badge_totals',
        { p_user_ids: recipientIdsForBadge }
      );
      if (badgeErr) {
        console.error('Error fetching badge totals:', badgeErr);
      } else if (badgeRows) {
        for (const row of badgeRows as any[]) {
          badgeTotals[row.user_id] = row.badge_total || 0;
        }
      }
    } catch (e) {
      console.error('Exception fetching badge totals:', e);
    }

    // Prepare messages for Expo Push API
    const messages = filteredTokens.map((item: any) => {
      // Server-computed total reflects the DB right now. For quiz activation
      // pushes, the new active exam is already in the DB, so the count
      // already includes it. For message pushes, the new message row is
      // likewise already inserted before this function runs. Fall back to 1
      // only if the RPC failed, so the user still sees a badge bump.
      const computedTotal = badgeTotals[item.user_id];
      const badgeValue = typeof computedTotal === 'number' ? computedTotal : 1;
      return {
        to: item.token,
        sound: 'default',
        title: title,
        body: body,
        data: data || {},
        badge: badgeValue,
      };
    });

    // Send notifications to Expo Push API
    const expoPushEndpoint = 'https://exp.host/--/api/v2/push/send';
    const pushResponse = await fetch(expoPushEndpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const pushResult = await pushResponse.json();
    console.log('Expo push result:', pushResult);

    // Log notifications to database
    const notificationLogs = filteredTokens.map((item: any) => ({
      user_id: item.user_id,
      notification_type: notificationType,
      title: title,
      body: body,
      data: data || {},
      status: 'sent',
    }));

    const { error: logError } = await supabaseClient
      .from('notification_logs')
      .insert(notificationLogs);

    if (logError) {
      console.error('Error logging notifications:', logError);
    }

    // NOTE: custom_notifications inserts are handled by the calling editor
    // (announcement, special-features, upcoming-events, notification-center)
    // so the writer is consistent regardless of whether the push toggle is on.

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Notifications sent successfully',
        sent: filteredTokens.length,
        result: pushResult,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
