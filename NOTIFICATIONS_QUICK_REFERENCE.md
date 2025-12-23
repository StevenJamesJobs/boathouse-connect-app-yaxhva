
# Push Notifications - Quick Reference Guide

## 🚀 Quick Start

### 1. Configuration (5 minutes)
```bash
# 1. Add googleservice-info.plist to project root
# 2. Update app.json with your Expo project ID
# 3. Build for physical device
npx expo run:ios --device
# or
npx expo run:android --device
```

### 2. Integration (15 minutes)
Add these imports and function calls to 5 screens (see examples below).

## 📝 Code Snippets

### Import Statement (Add to top of file)
```typescript
import { 
  sendMessageNotification,
  sendRewardNotification,
  sendAnnouncementNotification,
  sendEventNotification,
  sendSpecialFeatureNotification,
} from '@/utils/notificationHelpers';
```

### 1. Messages (compose-message.tsx)
```typescript
// After message is sent successfully
await sendMessageNotification(
  recipientIds,    // string[]
  senderName,      // string
  messageBody,     // string
  messageId,       // string
  threadId         // string | undefined
);
```

### 2. Rewards (rewards-and-reviews-editor.tsx)
```typescript
// After McLoone's Bucks are awarded
await sendRewardNotification(
  userId,          // string
  amount,          // number
  description      // string
);
```

### 3. Announcements (announcement-editor.tsx)
```typescript
// After announcement is published
await sendAnnouncementNotification(
  title,           // string
  announcementId   // string
);
```

### 4. Events (upcoming-events-editor.tsx)
```typescript
// After event is published
await sendEventNotification(
  title,           // string
  eventId,         // string
  eventDate        // string | undefined
);
```

### 5. Special Features (special-features-editor.tsx)
```typescript
// After special feature is published
await sendSpecialFeatureNotification(
  title,           // string
  featureId        // string
);
```

## 🎯 Manager Features

### Notification Center
- **Location**: Manager Tools → Notification Center
- **Purpose**: Send custom notifications to all staff
- **Access**: Managers only
- **File**: `app/notification-center.tsx`

### How to Use
1. Open Manager Tools
2. Tap "Notification Center"
3. Enter title and message
4. Tap "Send to All Staff"
5. Confirm sending
6. Done! All staff receive notification

## 👤 User Features

### Notification Preferences
- **Location**: Profile → Notifications (collapsible section)
- **Purpose**: Control which notifications to receive
- **Access**: All users
- **File**: `components/NotificationPreferences.tsx`

### Available Toggles
- ✅ Messages
- ✅ Rewards (McLoone's Bucks)
- ✅ Announcements
- ✅ Events
- ✅ Special Features
- ✅ Custom Notifications

## 🔍 Database Tables

### push_tokens
```sql
- id: uuid
- user_id: uuid (FK to users)
- token: text (Expo push token)
- device_type: text (ios/android/web)
- created_at: timestamp
- updated_at: timestamp
```

### notification_preferences
```sql
- id: uuid
- user_id: uuid (FK to users, unique)
- messages_enabled: boolean (default: true)
- rewards_enabled: boolean (default: true)
- announcements_enabled: boolean (default: true)
- events_enabled: boolean (default: true)
- special_features_enabled: boolean (default: true)
- custom_notifications_enabled: boolean (default: true)
- created_at: timestamp
- updated_at: timestamp
```

### notification_logs
```sql
- id: uuid
- user_id: uuid (FK to users)
- notification_type: text (message/reward/announcement/event/special_feature/custom)
- title: text
- body: text
- data: jsonb
- sent_at: timestamp
- is_read: boolean (default: false)
- read_at: timestamp
```

### custom_notifications
```sql
- id: uuid
- title: text
- body: text
- sent_by: uuid (FK to users)
- created_at: timestamp
```

## 🛠️ Edge Function

### Endpoint
```
POST https://[your-project].supabase.co/functions/v1/send-push-notification
```

### Headers
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer [user-jwt-token]"
}
```

### Request Body
```json
{
  "userIds": ["uuid1", "uuid2"],  // Optional, omit to send to all
  "notificationType": "message",  // message|reward|announcement|event|special_feature|custom
  "title": "Notification Title",
  "body": "Notification message body",
  "data": {                       // Optional
    "key": "value"
  }
}
```

### Response
```json
{
  "message": "Notifications sent successfully",
  "sent": 5,
  "results": { /* Expo push results */ }
}
```

## 🧪 Testing

### Test Notification Center
1. Login as manager
2. Go to Manager Tools
3. Tap Notification Center
4. Enter test message
5. Send
6. Check device for notification

### Test Notification Preferences
1. Login as employee
2. Go to Profile
3. Expand Notifications section
4. Toggle a preference off
5. Have manager send that type of notification
6. Verify you don't receive it

### Test Automatic Notifications
1. Perform action (send message, award bucks, etc.)
2. Check recipient device for notification
3. Check notification_logs table in Supabase
4. Verify notification was sent and logged

## 🐛 Common Issues

### Issue: No notifications received
**Solution**: 
- Check push_tokens table for user's token
- Verify notification preferences are enabled
- Check Edge Function logs
- Ensure testing on physical device

### Issue: Push token not saving
**Solution**:
- Check Expo project ID in app.json
- Verify user is authenticated
- Check console for errors
- Verify RLS policies

### Issue: Notifications not respecting preferences
**Solution**:
- Check notification_preferences table
- Verify notification type matches
- Check Edge Function filtering logic

## 📊 Monitoring

### Check Sent Notifications
```sql
SELECT * FROM notification_logs 
ORDER BY sent_at DESC 
LIMIT 100;
```

### Check User Preferences
```sql
SELECT u.name, np.* 
FROM notification_preferences np
JOIN users u ON u.id = np.user_id;
```

### Check Push Tokens
```sql
SELECT u.name, pt.device_type, pt.updated_at
FROM push_tokens pt
JOIN users u ON u.id = pt.user_id
ORDER BY pt.updated_at DESC;
```

### Check Custom Notifications History
```sql
SELECT cn.*, u.name as sent_by_name
FROM custom_notifications cn
JOIN users u ON u.id = cn.sent_by
ORDER BY cn.created_at DESC;
```

## 🎨 Customization

### Change Notification Content
Edit functions in `utils/notificationHelpers.ts`:

```typescript
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
    title: 'New Message',  // ← Change this
    body: `${senderName}: ${messagePreview}`,  // ← Or this
    data: {
      type: 'message',
      messageId,
      threadId,
    },
  });
}
```

### Add New Notification Type
1. Add to database enum in notification_type check constraint
2. Add preference field to notification_preferences table
3. Add toggle to NotificationPreferences component
4. Create helper function in notificationHelpers.ts
5. Update Edge Function to handle new type

## 📱 Platform-Specific Notes

### iOS
- Requires googleservice-info.plist
- Background notifications enabled in app.json
- Must test on physical device
- Permissions requested automatically

### Android
- Notification channel created automatically
- Permissions added to app.json
- Must test on physical device
- Permissions requested automatically

## 🔗 Useful Links

- [Expo Notifications Docs](https://docs.expo.dev/push-notifications/overview/)
- [Test Notifications](https://expo.dev/notifications)
- [Firebase Console](https://console.firebase.google.com/)
- [Supabase Dashboard](https://supabase.com/dashboard)

## ✅ Checklist

- [ ] googleservice-info.plist added to root
- [ ] Expo project ID updated in app.json
- [ ] App built for physical device
- [ ] Notification permissions granted
- [ ] Push token saved to database
- [ ] Notification Center tested (manager)
- [ ] Notification preferences tested (employee)
- [ ] Message notifications integrated
- [ ] Reward notifications integrated
- [ ] Announcement notifications integrated
- [ ] Event notifications integrated
- [ ] Special feature notifications integrated
- [ ] All notification types tested
- [ ] Preferences respected
- [ ] Notifications logged in database

---

**Need more details?** See:
- `PUSH_NOTIFICATIONS_SETUP_COMPLETE.md` - Full setup guide
- `NOTIFICATION_INTEGRATION_EXAMPLES.md` - Detailed code examples
- `PUSH_NOTIFICATIONS_SUMMARY.md` - Complete overview
