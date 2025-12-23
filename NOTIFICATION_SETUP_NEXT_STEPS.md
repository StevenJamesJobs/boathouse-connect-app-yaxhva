
# Push Notifications - Next Steps

## ✅ What's Already Done

1. **Notification Integration Code** - All notification sending code has been integrated into:
   - `compose-message.tsx` - Sends notifications when messages are sent
   - `rewards-and-reviews-editor.tsx` - Sends notifications when McLoone's Bucks are awarded
   - `announcement-editor.tsx` - Sends notifications when announcements are published
   - `upcoming-events-editor.tsx` - Sends notifications when events are published
   - `special-features-editor.tsx` - Sends notifications when special features are published

2. **Notification Helper Functions** - Created in `utils/notificationHelpers.ts`

3. **Notification Context** - Set up in `contexts/NotificationContext.tsx` to manage push tokens and preferences

4. **App Configuration** - Updated `app.json` with:
   - Expo project ID: `f7f98351-f034-4baa-8eb8-ef50cd4aaf7b`
   - Firebase plugin configuration
   - iOS `googleservice-info.plist` reference
   - Notification permissions

5. **Linting Errors** - Fixed all React Hook dependency warnings

## 🚀 Next Steps to Get Notifications Working

### Step 1: Deploy the Edge Function

You need to deploy the `send-push-notification` Edge Function to your Supabase project. This function handles sending the actual push notifications.

**Option A: Using Supabase CLI (Recommended)**

```bash
# Install Supabase CLI if you haven't already
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref xvbajqukbakcvdrkcioi

# Deploy the edge function
supabase functions deploy send-push-notification
```

**Option B: Using Supabase Dashboard**

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/xvbajqukbakcvdrkcioi
2. Navigate to "Edge Functions" in the left sidebar
3. Click "Create a new function"
4. Name it `send-push-notification`
5. Copy the code from the `NOTIFICATION_INTEGRATION_EXAMPLES.md` file (the Edge Function code section)
6. Deploy the function

### Step 2: Create Database Tables

Run these SQL migrations in your Supabase SQL Editor:

```sql
-- Create push_tokens table
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  device_type TEXT NOT NULL CHECK (device_type IN ('ios', 'android', 'web')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);

-- Create notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  messages_enabled BOOLEAN DEFAULT TRUE,
  rewards_enabled BOOLEAN DEFAULT TRUE,
  announcements_enabled BOOLEAN DEFAULT TRUE,
  events_enabled BOOLEAN DEFAULT TRUE,
  special_features_enabled BOOLEAN DEFAULT TRUE,
  custom_notifications_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create notification_logs table
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent'
);

-- Create custom_notifications table
CREATE TABLE IF NOT EXISTS custom_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for push_tokens
CREATE POLICY "Users can view their own push tokens"
  ON push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own push tokens"
  ON push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push tokens"
  ON push_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push tokens"
  ON push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for notification_preferences
CREATE POLICY "Users can view their own notification preferences"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification preferences"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for notification_logs
CREATE POLICY "Users can view their own notification logs"
  ON notification_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Managers can view all notification logs"
  ON notification_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

-- RLS Policies for custom_notifications
CREATE POLICY "Managers can insert custom notifications"
  ON custom_notifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );

CREATE POLICY "Everyone can view custom notifications"
  ON custom_notifications FOR SELECT
  USING (true);
```

### Step 3: Test on a Physical Device

**Important:** Push notifications only work on physical devices, not simulators/emulators.

1. **Build and install the app on your physical device:**

   For iOS:
   ```bash
   npx expo run:ios --device
   ```

   For Android:
   ```bash
   npx expo run:android --device
   ```

2. **Grant notification permissions** when prompted

3. **Test each notification type:**
   - Send a message to another user
   - Award McLoone's Bucks to a user
   - Publish a new announcement
   - Publish a new event
   - Publish a new special feature

### Step 4: Verify Notifications Are Working

1. **Check the Supabase logs:**
   - Go to your Supabase Dashboard
   - Navigate to "Edge Functions" → "send-push-notification"
   - Click on "Logs" to see if the function is being called

2. **Check the database:**
   ```sql
   -- Check if push tokens are being saved
   SELECT * FROM push_tokens;

   -- Check notification logs
   SELECT * FROM notification_logs ORDER BY sent_at DESC LIMIT 10;

   -- Check notification preferences
   SELECT * FROM notification_preferences;
   ```

3. **Check the app console:**
   - Look for "Expo Push Token:" in the console
   - Look for "Notification sent successfully:" messages
   - Look for any error messages

### Step 5: Troubleshooting

If notifications aren't working:

1. **Verify the Expo Project ID is correct:**
   - Check `app.json` → `extra.eas.projectId`
   - Should be: `f7f98351-f034-4baa-8eb8-ef50cd4aaf7b`

2. **Verify Firebase is set up correctly:**
   - Make sure `googleservice-info.plist` is in the root directory
   - Check that the file is referenced in `app.json`

3. **Check Edge Function deployment:**
   ```bash
   supabase functions list
   ```
   Should show `send-push-notification` as deployed

4. **Check Edge Function logs:**
   ```bash
   supabase functions logs send-push-notification
   ```

5. **Verify permissions:**
   - iOS: Check Settings → Boathouse Connect → Notifications
   - Android: Check Settings → Apps → Boathouse Connect → Notifications

### Step 6: Enable Notification Preferences UI

The notification preferences UI is already created in `components/NotificationPreferences.tsx`. Users can toggle notifications on/off by type in their profile settings.

## 📱 Testing Checklist

- [ ] Edge Function deployed
- [ ] Database tables created
- [ ] App installed on physical device
- [ ] Notification permissions granted
- [ ] Push token saved to database
- [ ] Test message notification
- [ ] Test reward notification
- [ ] Test announcement notification
- [ ] Test event notification
- [ ] Test special feature notification
- [ ] Test notification preferences (toggle on/off)
- [ ] Verify notifications respect user preferences

## 🎉 Once Everything Works

1. **Add the Notification Center** for managers to send custom notifications
2. **Implement deep linking** to navigate to specific screens when notifications are tapped
3. **Add notification badges** to show unread counts
4. **Test on both iOS and Android** devices

## 📚 Additional Resources

- [Expo Notifications Documentation](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)
- [Firebase Cloud Messaging Documentation](https://firebase.google.com/docs/cloud-messaging)

## ❓ Need Help?

If you encounter any issues:

1. Check the console logs in your app
2. Check the Supabase Edge Function logs
3. Check the database tables for any errors
4. Verify all environment variables are set correctly
5. Make sure you're testing on a physical device, not a simulator

---

**Current Status:** ✅ Code integrated, ready for Edge Function deployment and database setup
