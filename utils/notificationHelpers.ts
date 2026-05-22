/**
 * Notification Helper Functions
 * 
 * These functions provide easy-to-use wrappers for sending different types
 * of notifications throughout the app.
 */

import { supabase } from '@/app/integrations/supabase/client';

interface SendNotificationParams {
  userIds?: string[];
  organizationId?: string;
  notificationType: 'message' | 'reward' | 'announcement' | 'event' | 'special_feature' | 'custom';
  title: string;
  body: string;
  data?: Record<string, any>;
  jobTitles?: string[];
}

/**
 * Core function to send notifications via Edge Function
 */
async function sendNotification(params: SendNotificationParams): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: params,
    });

    if (error) {
      console.error('Error sending notification:', error);
      throw error;
    }

    console.log('Notification sent successfully:', data);
  } catch (error) {
    console.error('Error in sendNotification:', error);
    // Don't throw - fail silently so app continues working
  }
}

/**
 * Send a notification when a new message is received
 */
export async function sendMessageNotification(
  recipientIds: string[],
  senderName: string,
  messagePreview: string,
  messageId: string,
  threadId?: string,
  organizationId?: string
): Promise<void> {
  await sendNotification({
    userIds: recipientIds,
    organizationId,
    notificationType: 'message',
    title: `New message from ${senderName}`,
    body: messagePreview.substring(0, 100), // Limit preview length
    data: {
      messageId,
      threadId,
      type: 'message',
    },
  });
}

/**
 * Send a notification when McLoone's Bucks are awarded
 */
export async function sendRewardNotification(
  userId: string,
  amount: number,
  description?: string,
  organizationId?: string
): Promise<void> {
  await sendNotification({
    userIds: [userId],
    organizationId,
    notificationType: 'reward',
    title: '🎉 McLoone\'s Bucks Earned!',
    body: `You earned $${amount} McLoone's Bucks!${description ? ` ${description}` : ''}`,
    data: {
      amount,
      type: 'reward',
    },
  });
}

/**
 * Send a notification when a new announcement is published
 */
export async function sendAnnouncementNotification(
  title: string,
  announcementId: string,
  preview?: string,
  organizationId?: string
): Promise<void> {
  await sendNotification({
    organizationId,
    notificationType: 'announcement',
    title: '📢 New Announcement',
    body: preview || title,
    data: {
      announcementId,
      type: 'announcement',
    },
  });
}

/**
 * Send a notification when a new event is published
 */
export async function sendEventNotification(
  eventTitle: string,
  eventId: string,
  eventDate?: string,
  organizationId?: string
): Promise<void> {
  const body = eventDate 
    ? `${eventTitle} - ${eventDate}`
    : eventTitle;

  await sendNotification({
    organizationId,
    notificationType: 'event',
    title: '📅 New Event Added',
    body: body,
    data: {
      eventId,
      type: 'event',
    },
  });
}

/**
 * Send a notification when a new special feature is published
 */
export async function sendSpecialFeatureNotification(
  featureTitle: string,
  featureId: string,
  description?: string,
  organizationId?: string
): Promise<void> {
  await sendNotification({
    organizationId,
    notificationType: 'special_feature',
    title: '✨ New Special Feature',
    body: description || featureTitle,
    data: {
      featureId,
      type: 'special_feature',
    },
  });
}

/**
 * Notify users who got passed on the master Game Hub leaderboard.
 * Calls get_passed_users_on_leaderboard RPC (which already filters
 * recipients by their game_hub_enabled preference) and fires a push
 * to the resulting list. No-op when no one was passed.
 *
 * Caller passes localized title/body — recipient locale isn't known here.
 * Fire-and-forget; errors are swallowed so the post-game UI isn't blocked.
 */
export async function notifyLeaderboardPassed(
  playerUserId: string,
  scoreJustEarned: number,
  title: string,
  body: string,
  organizationId?: string
): Promise<void> {
  if (!playerUserId || scoreJustEarned <= 0) return;
  try {
    const { data, error } = await (supabase.rpc as any)('get_passed_users_on_leaderboard', {
      p_user_id: playerUserId,
      p_new_score: scoreJustEarned,
    });
    if (error) {
      console.error('[notifyLeaderboardPassed] RPC error:', error);
      return;
    }
    const passed = (data ?? []) as Array<{ user_id: string; name: string }>;
    if (passed.length === 0) return;

    // Write per-recipient shade rows so each passed user sees the entry in
    // their personal notification dropdown. data.targetUserId scopes the row
    // to that user; data.notificationType excludes it from manager Sent History.
    const shadeRows = passed.map((p) => ({
      title,
      body,
      sent_by: playerUserId,
      data: {
        type: 'custom',
        notificationType: 'leaderboard_pass',
        destination: 'master-leaderboard',
        targetUserId: p.user_id,
      },
    }));
    const { error: insertError } = await (supabase.from('custom_notifications') as any).insert(shadeRows);
    if (insertError) {
      console.error('[notifyLeaderboardPassed] shade insert error:', insertError);
      // Continue to push even if shade insert failed.
    }

    await sendNotification({
      userIds: passed.map((p) => p.user_id),
      organizationId,
      notificationType: 'custom',
      title,
      body,
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
 */
export async function sendCustomNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
  organizationId?: string
): Promise<void> {
  // Extract job_titles from data to pass as top-level param for edge function filtering
  const jobTitles = data?.job_titles as string[] | undefined;

  await sendNotification({
    organizationId,
    notificationType: 'custom',
    title: title,
    body: body,
    data: {
      ...data,
      type: 'custom',
    },
    jobTitles,
  });
}
