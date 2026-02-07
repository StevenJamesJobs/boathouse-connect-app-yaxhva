/**
 * Notification Helper Functions
 * 
 * These functions provide easy-to-use wrappers for sending different types
 * of notifications throughout the app.
 */

import { supabase } from '@/app/integrations/supabase/client';

interface SendNotificationParams {
  userIds?: string[]; // Specific users (if not provided, sends to all)
  notificationType: 'message' | 'reward' | 'announcement' | 'event' | 'special_feature' | 'custom';
  title: string;
  body: string;
  data?: Record<string, any>;
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
  threadId?: string
): Promise<void> {
  await sendNotification({
    userIds: recipientIds,
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
  description?: string
): Promise<void> {
  await sendNotification({
    userIds: [userId],
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
  preview?: string
): Promise<void> {
  await sendNotification({
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
  eventDate?: string
): Promise<void> {
  const body = eventDate 
    ? `${eventTitle} - ${eventDate}`
    : eventTitle;

  await sendNotification({
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
  description?: string
): Promise<void> {
  await sendNotification({
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
 * Send a custom notification (manager only)
 */
export async function sendCustomNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  await sendNotification({
    notificationType: 'custom',
    title: title,
    body: body,
    data: {
      ...data,
      type: 'custom',
    },
  });
}
