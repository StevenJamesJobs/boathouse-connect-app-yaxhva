
import { supabase } from '@/app/integrations/supabase/client';

/**
 * Helper functions to send push notifications for various app events
 */

export interface NotificationPayload {
  userIds?: string[];
  notificationType: 'message' | 'reward' | 'announcement' | 'event' | 'special_feature' | 'custom';
  title: string;
  body: string;
  data?: Record<string, any>;
}

/**
 * Send a push notification via the Edge Function
 */
export async function sendPushNotification(payload: NotificationPayload): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      console.error('No active session for sending notification');
      return false;
    }

    const response = await fetch(
      `${supabase.supabaseUrl}/functions/v1/send-push-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Failed to send notification:', result.error);
      return false;
    }

    console.log('Notification sent successfully:', result);
    return true;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
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
  threadId?: string
): Promise<boolean> {
  return sendPushNotification({
    userIds: recipientIds,
    notificationType: 'message',
    title: 'New Message',
    body: `${senderName}: ${messagePreview.substring(0, 100)}${messagePreview.length > 100 ? '...' : ''}`,
    data: {
      type: 'message',
      messageId,
      threadId,
    },
  });
}

/**
 * Send a notification when McLoone's Bucks are awarded
 */
export async function sendRewardNotification(
  userId: string,
  amount: number,
  description: string
): Promise<boolean> {
  return sendPushNotification({
    userIds: [userId],
    notificationType: 'reward',
    title: 'McLoone\'s Bucks Earned! 🎉',
    body: `You earned $${amount}! ${description}`,
    data: {
      type: 'reward',
      amount,
    },
  });
}

/**
 * Send a notification when a new announcement is published
 */
export async function sendAnnouncementNotification(
  title: string,
  announcementId: string
): Promise<boolean> {
  return sendPushNotification({
    notificationType: 'announcement',
    title: 'New Announcement',
    body: title,
    data: {
      type: 'announcement',
      announcementId,
    },
  });
}

/**
 * Send a notification when a new event is published
 */
export async function sendEventNotification(
  title: string,
  eventId: string,
  eventDate?: string
): Promise<boolean> {
  const body = eventDate 
    ? `${title} - ${new Date(eventDate).toLocaleDateString()}`
    : title;

  return sendPushNotification({
    notificationType: 'event',
    title: 'New Event Added',
    body,
    data: {
      type: 'event',
      eventId,
    },
  });
}

/**
 * Send a notification when a new special feature is published
 */
export async function sendSpecialFeatureNotification(
  title: string,
  featureId: string
): Promise<boolean> {
  return sendPushNotification({
    notificationType: 'special_feature',
    title: 'New Special Feature',
    body: title,
    data: {
      type: 'special_feature',
      featureId,
    },
  });
}

/**
 * Send a custom notification (manager only)
 */
export async function sendCustomNotification(
  title: string,
  body: string,
  sentBy: string
): Promise<boolean> {
  // Save to custom_notifications table
  const { error: saveError } = await supabase
    .from('custom_notifications')
    .insert({
      title,
      body,
      sent_by: sentBy,
    });

  if (saveError) {
    console.error('Error saving custom notification:', saveError);
  }

  return sendPushNotification({
    notificationType: 'custom',
    title,
    body,
    data: {
      type: 'custom',
      sentBy,
    },
  });
}
