
# Push Notifications Setup Guide for McLoone's Boathouse Connect

## Overview
This guide will help you complete the setup of push notifications for your iOS app using Firebase Cloud Messaging (FCM) and Expo.

## What Has Been Implemented

### 1. Database Tables Created ✅
- `push_tokens` - Stores device push tokens for each user
- `notification_preferences` - Stores user notification preferences
- `custom_notifications` - Stores manager-sent custom notifications
- `notification_logs` - Tracks all sent notifications

### 2. Edge Function Deployed ✅
- `send-push-notification` - Handles sending push notifications via Expo Push Notification service

### 3. React Native Components Created ✅
- `NotificationContext` - Manages push notification registration and sending
- `NotificationPreferences` - UI component for managing notification settings
- `notification-center.tsx` - Screen for managers to send custom notifications

### 4. Integration Points ✅
- Notification preferences added to both Employee and Manager profile screens
- Notification Center added to Manager Tools screen
- NotificationProvider wrapped around the app in `_layout.tsx`

## Next Steps to Complete Setup

### Step 1: Add googleservice-info.plist File
1. Place your downloaded `googleservice-info.plist` file in the **root directory** of your project (same level as `app.json`)
2. This file contains your Firebase project configuration for iOS

### Step 2: Get Your Expo Project ID
1. Run `npx expo whoami` to see your Expo account
2. Run `eas project:info` to get your project ID
3. Update the `projectId` in `contexts/NotificationContext.tsx` (line 73):
   ```typescript
   const tokenData = await Notifications.getExpoPushTokenAsync({
     projectId: 'your-actual-expo-project-id', // Replace this
   });
   ```

### Step 3: Configure Firebase Cloud Messaging (FCM)
1. Go to your Firebase Console: https://console.firebase.google.com
2. Select your project
3. Go to Project Settings > Cloud Messaging
4. Under "Cloud Messaging API (Legacy)", make sure it's enabled
5. Copy your **Server Key** (you'll need this for Expo)

### Step 4: Add FCM Server Key to Expo
1. Run: `eas credentials`
2. Select your iOS app
3. Select "Push Notifications: Manage your Apple Push Notifications Key"
4. Follow the prompts to upload your FCM server key

### Step 5: Build and Test
1. Build your iOS app with EAS:
   ```bash
   eas build --platform ios --profile development
   ```
2. Install the build on a physical iOS device (push notifications don't work in simulator)
3. Test the notification flow

## How to Trigger Notifications

### 1. New Message Notification
When a message is sent, add this code to trigger a notification:

```typescript
import { useNotifications } from '@/contexts/NotificationContext';

const { sendNotification } = useNotifications();

// After sending a message
await sendNotification({
  userIds: [recipientId], // Array of recipient user IDs
  notificationType: 'message',
  title: 'New Message',
  body: `${senderName} sent you a message`,
  data: {
    messageId: messageId,
    threadId: threadId,
  },
});
```

### 2. Reward Notification
When McLoone's Bucks are awarded:

```typescript
await sendNotification({
  userIds: [userId],
  notificationType: 'reward',
  title: 'McLoone\'s Bucks Earned!',
  body: `You earned $${amount} McLoone's Bucks! Check your rewards.`,
  data: {
    amount: amount,
  },
});
```

### 3. Announcement Notification
When a new announcement is published:

```typescript
await sendNotification({
  notificationType: 'announcement',
  title: 'New Announcement',
  body: announcementTitle,
  data: {
    announcementId: id,
  },
});
```

### 4. Event Notification
When a new event is published:

```typescript
await sendNotification({
  notificationType: 'event',
  title: 'New Event Added',
  body: eventTitle,
  data: {
    eventId: id,
  },
});
```

### 5. Special Feature Notification
When a new special feature is published:

```typescript
await sendNotification({
  notificationType: 'special_feature',
  title: 'New Special Feature',
  body: featureTitle,
  data: {
    featureId: id,
  },
});
```

### 6. Custom Notification (Manager Only)
Managers can send custom notifications through the Notification Center in the Manager Tools screen.

## Notification Preferences

Users can manage their notification preferences in their profile:
- Messages
- Rewards
- Announcements
- Events
- Special Features
- Custom Notifications

Each preference can be toggled on/off independently.

## Testing Checklist

- [ ] googleservice-info.plist added to root directory
- [ ] Expo project ID updated in NotificationContext.tsx
- [ ] FCM configured in Firebase Console
- [ ] FCM Server Key added to Expo credentials
- [ ] iOS app built with EAS
- [ ] App installed on physical iOS device
- [ ] Push notification permission requested on app launch
- [ ] Push token saved to database
- [ ] Test sending a custom notification from Notification Center
- [ ] Test notification preferences (toggle on/off)
- [ ] Test each notification type (message, reward, announcement, etc.)

## Troubleshooting

### Notifications Not Received
1. Check that the user has granted notification permissions
2. Verify the push token is saved in the `push_tokens` table
3. Check the `notification_logs` table to see if notifications were sent
4. Verify notification preferences are enabled for that notification type
5. Check Expo Push Notification service status

### Permission Not Requested
1. Make sure you're testing on a physical device (not simulator)
2. Check that NotificationProvider is wrapped around your app
3. Verify the user is authenticated before requesting permissions

### Edge Function Errors
1. Check Supabase Edge Function logs
2. Verify the Edge Function has the correct environment variables
3. Test the Edge Function directly from Supabase dashboard

## Additional Resources

- [Expo Push Notifications Documentation](https://docs.expo.dev/push-notifications/overview/)
- [Firebase Cloud Messaging Documentation](https://firebase.google.com/docs/cloud-messaging)
- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)

## Support

If you encounter any issues during setup, please check:
1. Expo documentation for push notifications
2. Firebase console for any configuration errors
3. Supabase logs for Edge Function errors
4. Device logs for permission or token registration errors
