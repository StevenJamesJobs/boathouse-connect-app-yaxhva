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
    // Get Supabase client
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

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Invalid token');
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

    // Get notification preferences and push tokens
    const { data: usersWithTokens, error: tokensError } = await supabaseClient
      .from('push_tokens')
      .select(`
        token,
        user_id,
        notification_preferences!inner(
          user_id,
          messages_enabled,
          rewards_enabled,
          announcements_enabled,
          events_enabled,
          special_features_enabled,
          custom_notifications_enabled
        )
      `)
      .in('user_id', recipientIds);

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      throw tokensError;
    }

    // Filter based on preferences
    const preferencesMap: Record<string, string> = {
      'message': 'messages_enabled',
      'reward': 'rewards_enabled',
      'announcement': 'announcements_enabled',
      'event': 'events_enabled',
      'special_feature': 'special_features_enabled',
      'custom': 'custom_notifications_enabled',
    };

    const preferenceField = preferencesMap[notificationType];

    const filteredTokens = usersWithTokens.filter((item: any) => {
      const prefs = item.notification_preferences;
      if (!prefs || !preferenceField) return true;
      return prefs[preferenceField] === true;
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
    if (notificationType === 'custom') {
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
