
# Notification Integration Examples

This guide shows exactly how to integrate push notifications into your existing screens.

## 1. Messages - Send Notification When Message is Sent

**File: `app/compose-message.tsx`**

Find the section where you successfully send a message and add the notification call:

```typescript
import { sendMessageNotification } from '@/utils/notificationHelpers';

// After your existing message sending code
const handleSendMessage = async () => {
  try {
    // ... your existing message sending code ...
    
    // After message is successfully sent
    const { data: messageData, error: messageError } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        subject: subject,
        body: body,
        thread_id: threadId,
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Insert recipients
    const recipientRecords = selectedRecipients.map(recipientId => ({
      message_id: messageData.id,
      recipient_id: recipientId,
    }));

    await supabase.from('message_recipients').insert(recipientRecords);

    // 🔔 SEND PUSH NOTIFICATION
    await sendMessageNotification(
      selectedRecipients,  // Array of recipient user IDs
      user.name,           // Sender's name
      body,                // Message body
      messageData.id,      // Message ID
      threadId             // Thread ID (if replying)
    );

    Alert.alert('Success', 'Message sent successfully!');
    router.back();
  } catch (error) {
    console.error('Error sending message:', error);
    Alert.alert('Error', 'Failed to send message');
  }
};
```

## 2. Rewards - Send Notification When McLoone's Bucks Are Awarded

**File: `app/rewards-and-reviews-editor.tsx`**

Find the function that awards McLoone's Bucks:

```typescript
import { sendRewardNotification } from '@/utils/notificationHelpers';

const handleAwardBucks = async () => {
  try {
    // ... your existing reward code ...
    
    const { error } = await supabase
      .from('rewards_transactions')
      .insert({
        user_id: selectedUserId,
        amount: amount,
        description: description,
        created_by: user.id,
      });

    if (error) throw error;

    // Update user's total
    await supabase.rpc('update_user_mcloones_bucks', {
      user_id: selectedUserId,
      amount_change: amount,
    });

    // 🔔 SEND PUSH NOTIFICATION
    await sendRewardNotification(
      selectedUserId,  // User who received the reward
      amount,          // Amount of McLoone's Bucks
      description      // Description of why they earned it
    );

    Alert.alert('Success', 'McLoone\'s Bucks awarded successfully!');
  } catch (error) {
    console.error('Error awarding bucks:', error);
    Alert.alert('Error', 'Failed to award McLoone\'s Bucks');
  }
};
```

## 3. Announcements - Send Notification When Published

**File: `app/announcement-editor.tsx`**

Find the function that publishes an announcement:

```typescript
import { sendAnnouncementNotification } from '@/utils/notificationHelpers';

const handlePublishAnnouncement = async () => {
  try {
    // ... your existing announcement code ...
    
    const { data: announcementData, error } = await supabase
      .from('announcements')
      .insert({
        title: title,
        content: content,
        created_by: user.id,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    // 🔔 SEND PUSH NOTIFICATION TO ALL STAFF
    await sendAnnouncementNotification(
      title,              // Announcement title
      announcementData.id // Announcement ID
    );

    Alert.alert('Success', 'Announcement published and staff notified!');
    router.back();
  } catch (error) {
    console.error('Error publishing announcement:', error);
    Alert.alert('Error', 'Failed to publish announcement');
  }
};
```

## 4. Events - Send Notification When Published

**File: `app/upcoming-events-editor.tsx`**

Find the function that publishes an event:

```typescript
import { sendEventNotification } from '@/utils/notificationHelpers';

const handlePublishEvent = async () => {
  try {
    // ... your existing event code ...
    
    const { data: eventData, error } = await supabase
      .from('upcoming_events')
      .insert({
        title: title,
        content: content,
        start_date_time: startDateTime,
        end_date_time: endDateTime,
        created_by: user.id,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    // 🔔 SEND PUSH NOTIFICATION TO ALL STAFF
    await sendEventNotification(
      title,                                    // Event title
      eventData.id,                             // Event ID
      startDateTime?.toISOString()              // Event date (optional)
    );

    Alert.alert('Success', 'Event published and staff notified!');
    router.back();
  } catch (error) {
    console.error('Error publishing event:', error);
    Alert.alert('Error', 'Failed to publish event');
  }
};
```

## 5. Special Features - Send Notification When Published

**File: `app/special-features-editor.tsx`**

Find the function that publishes a special feature:

```typescript
import { sendSpecialFeatureNotification } from '@/utils/notificationHelpers';

const handlePublishFeature = async () => {
  try {
    // ... your existing special feature code ...
    
    const { data: featureData, error } = await supabase
      .from('special_features')
      .insert({
        title: title,
        content: content,
        start_date_time: startDateTime,
        end_date_time: endDateTime,
        created_by: user.id,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    // 🔔 SEND PUSH NOTIFICATION TO ALL STAFF
    await sendSpecialFeatureNotification(
      title,          // Feature title
      featureData.id  // Feature ID
    );

    Alert.alert('Success', 'Special feature published and staff notified!');
    router.back();
  } catch (error) {
    console.error('Error publishing special feature:', error);
    Alert.alert('Error', 'Failed to publish special feature');
  }
};
```

## Important Notes

### Error Handling
All notification functions are designed to fail silently - if a notification fails to send, it won't break your app's main functionality. However, you can add error handling if you want:

```typescript
try {
  await sendMessageNotification(...);
} catch (notificationError) {
  console.error('Failed to send notification:', notificationError);
  // Don't show error to user - notification is secondary to main action
}
```

### User Preferences
The Edge Function automatically respects user notification preferences. You don't need to check preferences in your app code - the backend handles it.

### Testing
To test notifications:
1. Make sure you're on a physical device (not simulator)
2. Grant notification permissions when prompted
3. Perform the action (send message, award bucks, etc.)
4. Check your device for the notification
5. Check Supabase `notification_logs` table to verify it was sent

### Notification Content
You can customize the notification title and body in the helper functions. The current implementations are:

- **Messages**: "New Message" - "{Sender}: {Preview}"
- **Rewards**: "McLoone's Bucks Earned! 🎉" - "You earned ${amount}! {description}"
- **Announcements**: "New Announcement" - "{title}"
- **Events**: "New Event Added" - "{title} - {date}"
- **Special Features**: "New Special Feature" - "{title}"
- **Custom**: Manager-defined title and body

### Deep Linking (Future Enhancement)
Currently, tapping a notification just opens the app. To navigate to specific screens, you can add deep linking logic in `NotificationContext.tsx` in the `responseListener`:

```typescript
responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
  const data = response.notification.request.content.data;
  
  // Navigate based on notification type
  if (data.type === 'message' && data.messageId) {
    router.push(`/message-detail?id=${data.messageId}`);
  } else if (data.type === 'reward') {
    router.push('/(portal)/employee/rewards');
  }
  // ... etc
});
```

## Quick Copy-Paste Imports

Add these imports to the top of each file:

```typescript
// For all notification integrations
import { 
  sendMessageNotification,
  sendRewardNotification,
  sendAnnouncementNotification,
  sendEventNotification,
  sendSpecialFeatureNotification,
} from '@/utils/notificationHelpers';
```

That's it! These are the exact code snippets you need to add to enable push notifications throughout your app. 🎉
