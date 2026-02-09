// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  userIds?: string[]; // Specific users (if not provided, sends to all)
  notificationType: 'message' | 'reward' | 'announcement' | 'event' | 'special_feature' | 'custom';
  title: string;
  body: string;
  data?: Record<string, any>;
}

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

    // Create a user-context client to identify the calling user
    const authHeader = req.headers.get('Authorization');
    let user: any = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      // Try to get user from token - but don't fail if it's the anon key
      const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser(token);
      if (!authError && authUser) {
        user = authUser;
        console.log('Authenticated user:', user.id);
      } else {
        console.log('No user from token, proceeding without user context');
      }
    }

    // Parse request body
    const requestData: NotificationRequest = await req.json();
    const { userIds, notificationType, title, body, data } = requestData;

    console.log('Processing notification request:', { notificationType, title, userIds });

    // Get recipient user IDs
    let recipientIds: string[] = [];

    if (userIds && userIds.length > 0) {
      // Send to specific users
      recipientIds = userIds;
    } else {
      // Send to all users (for announcements, events, etc.)
      const { data: allUsers, error: usersError } = await supabaseClient
        .from('users')
        .select('id');

      if (usersError) {
        throw usersError;
      }

      recipientIds = allUsers.map((u: any) => u.id);
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

    // Prepare messages for Expo Push API
    const messages = filteredTokens.map((item: any) => ({
      to: item.token,
      sound: 'default',
      title: title,
      body: body,
      data: data || {},
      badge: 1,
    }));

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

    // If this is a custom notification, save it
    if (notificationType === 'custom' && user) {
      const { error: customError } = await supabaseClient
        .from('custom_notifications')
        .insert({
          title: title,
          body: body,
          sent_by: user.id,
        });

      if (customError) {
        console.error('Error saving custom notification:', customError);
      }
    }

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
