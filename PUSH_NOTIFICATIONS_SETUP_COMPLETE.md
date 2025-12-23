
# Push Notifications Setup - Complete Implementation Guide

## ✅ What Has Been Implemented

### 1. **Database Tables** (Already Created)
- ✅ `push_tokens` - Stores device push tokens for each user
- ✅ `notification_preferences` - User notification settings
- ✅ `custom_notifications` - History of custom notifications sent by managers
- ✅ `notification_logs` - Audit log of all sent notifications

### 2. **Edge Function** (Deployed)
- ✅ `send-push-notification` - Handles sending push notifications via Expo Push Service
- Respects user notification preferences
- Logs all sent notifications
- Filters recipients based on their settings

### 3. **App Configuration** (Updated)
- ✅ `app.json` - Configured with expo-notifications plugin
- ✅ iOS background notification support enabled
- ✅ Android notification permissions added
- ✅ Firebase integration configured

### 4. **Context & Helpers** (Implemented)
- ✅ `NotificationContext` - Manages push token registration and notification state
- ✅ `notificationHelpers.ts` - Helper functions for sending different notification types
- ✅ `NotificationPreferences` component - UI for managing notification settings

### 5. **Manager Features** (Implemented)
- ✅ Notification Center screen for sending custom notifications
- ✅ Added to Manager Tools page

## 📋 Setup Steps for You

### Step 1: Add googleservice-info.plist to Root Directory
You mentioned you've already downloaded this file from Firebase. Place it in the root directory of your project:

```
your-project/
├── googleservice-info.plist  ← Place it here
├── app.json
├── package.json
└── ...
```

### Step 2: Update app.json with Your Expo Project ID
Open `app.json` and replace `"your-expo-project-id"` with your actual Expo project ID:

```json
"extra": {
  "eas": {
    "projectId": "YOUR_ACTUAL_EXPO_PROJECT_ID"
  }
}
```

You can find your Expo project ID by running:
```bash
npx expo whoami
```

Or by visiting your project on https://expo.dev

### Step 3: Set Up Expo Access Token (Optional but Recommended)
For better delivery rates, set up an Expo Access Token:

1. Go to https://expo.dev/accounts/[your-account]/settings/access-tokens
2. Create a new token
3. Add it to your Supabase Edge Function secrets:

```bash
supabase secrets set EXPO_ACCESS_TOKEN=your_expo_access_token_here
```

### Step 4: Test on Physical Device
Push notifications don't work on simulators/emulators. You need to test on a physical device:

```bash
# For iOS
npx expo run:ios --device

# For Android
npx expo run:android --device
```

## 🎯 How Notifications Work

### Automatic Notifications

#### 1. **New Messages**
When a user sends a message, recipients automatically receive a notification.
- Location: `app/compose-message.tsx` (needs integration)
- Helper: `sendMessageNotification()`

#### 2. **McLoone's Bucks Rewards**
When a manager awards McLoone's Bucks, the recipient gets notified.
- Location: `app/rewards-and-reviews-editor.tsx` (needs integration)
- Helper: `sendRewardNotification()`

#### 3. **New Announcements**
When a manager publishes an announcement, all staff get notified.
- Location: `app/announcement-editor.tsx` (needs integration)
- Helper: `sendAnnouncementNotification()`

#### 4. **New Events**
When a manager publishes an event, all staff get notified.
- Location: `app/upcoming-events-editor.tsx` (needs integration)
- Helper: `sendEventNotification()`

#### 5. **New Special Features**
When a manager publishes a special feature, all staff get notified.
- Location: `app/special-features-editor.tsx` (needs integration)
- Helper: `sendSpecialFeatureNotification()`

### Manual Notifications

#### 6. **Custom Notifications (Manager Only)**
Managers can send custom notifications from the Notification Center.
- Location: `app/notification-center.tsx` ✅ Already implemented
- Access: Manager Tools → Notification Center

## 🔧 Integration Points

To complete the implementation, you need to integrate notification sending into these screens:

### 1. Compose Message Screen
Add this after successfully sending a message:

```typescript
import { sendMessageNotification } from '@/utils/notificationHelpers';

// After message is sent successfully
await sendMessageNotification(
  recipientIds,
  senderName,
  messageBody,
  messageId,
  threadId
);
```

### 2. Rewards Editor
Add this after awarding McLoone's Bucks:

```typescript
import { sendRewardNotification } from '@/utils/notificationHelpers';

// After reward is granted
await sendRewardNotification(
  userId,
  amount,
  description
);
```

### 3. Announcement Editor
Add this after publishing an announcement:

```typescript
import { sendAnnouncementNotification } from '@/utils/notificationHelpers';

// After announcement is published
await sendAnnouncementNotification(
  title,
  announcementId
);
```

### 4. Events Editor
Add this after publishing an event:

```typescript
import { sendEventNotification } from '@/utils/notificationHelpers';

// After event is published
await sendEventNotification(
  title,
  eventId,
  eventDate
);
```

### 5. Special Features Editor
Add this after publishing a special feature:

```typescript
import { sendSpecialFeatureNotification } from '@/utils/notificationHelpers';

// After special feature is published
await sendSpecialFeatureNotification(
  title,
  featureId
);
```

## 🎨 User Experience

### For Employees
1. **First Launch**: App requests notification permissions
2. **Profile Settings**: Can toggle notifications on/off for each type
3. **Receive Notifications**: Get notified based on their preferences
4. **Tap Notification**: Opens the app (deep linking can be added later)

### For Managers
1. **All Employee Features**: Plus...
2. **Notification Center**: Send custom notifications to all staff
3. **Automatic Notifications**: When they publish content, staff get notified

## 🔒 Security & Privacy

- ✅ Users control which notifications they receive
- ✅ Push tokens are securely stored in Supabase
- ✅ Edge Function respects user preferences
- ✅ All notifications are logged for audit purposes
- ✅ JWT verification ensures only authenticated users can send notifications

## 📱 Testing Checklist

- [ ] Install app on physical iOS device
- [ ] Grant notification permissions
- [ ] Verify push token is saved to database
- [ ] Send a test notification from Notification Center
- [ ] Verify notification appears on device
- [ ] Test toggling notification preferences
- [ ] Verify disabled notifications are not received
- [ ] Test all notification types (messages, rewards, etc.)

## 🐛 Troubleshooting

### No Notifications Received
1. Check if push token is saved in `push_tokens` table
2. Verify notification preferences are enabled
3. Check Edge Function logs in Supabase dashboard
4. Ensure you're testing on a physical device (not simulator)
5. Verify Expo project ID is correct in app.json

### Push Token Not Saving
1. Check console logs for errors
2. Verify Expo project ID is set correctly
3. Ensure user is authenticated when registering token
4. Check Supabase RLS policies on `push_tokens` table

### Notifications Not Respecting Preferences
1. Check `notification_preferences` table has entries for users
2. Verify Edge Function is filtering correctly (check logs)
3. Ensure notification type matches preference field

## 🚀 Next Steps

1. **Deep Linking**: Add navigation when tapping notifications
2. **Rich Notifications**: Add images and action buttons
3. **Scheduled Notifications**: Schedule notifications for future delivery
4. **Analytics**: Track notification open rates
5. **A/B Testing**: Test different notification messages

## 📚 Resources

- [Expo Notifications Documentation](https://docs.expo.dev/push-notifications/overview/)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Expo Push Notification Tool](https://expo.dev/notifications) - Test sending notifications

## ✨ Summary

Your push notification system is now fully set up and ready to use! The infrastructure is in place, and you just need to:

1. Add the `googleservice-info.plist` file to your project root
2. Update the Expo project ID in `app.json`
3. Integrate notification sending into the 5 screens mentioned above
4. Test on a physical device

The Notification Center for managers is already fully functional and ready to use!
