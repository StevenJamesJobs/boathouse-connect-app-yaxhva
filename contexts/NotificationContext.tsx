import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { supabase } from '@/app/integrations/supabase/client';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  sendNotification: (params: SendNotificationParams) => Promise<void>;
}

interface SendNotificationParams {
  userIds?: string[]; // Specific users (if not provided, sends to all)
  notificationType: 'message' | 'reward' | 'announcement' | 'event' | 'special_feature' | 'custom';
  title: string;
  body: string;
  data?: Record<string, any>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const { user } = useAuth();

  useEffect(() => {
    console.log('[NotificationContext] useEffect triggered', { hasUser: !!user });
    if (user) {
      console.log('[NotificationContext] User found, registering for push notifications...');
      registerForPushNotificationsAsync().then(token => {
        if (token) {
          setExpoPushToken(token);
          savePushTokenToDatabase(token);
        }
      });

      // Listen for notifications received while app is in foreground
      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        setNotification(notification);
      });

      // Listen for notification interactions (user taps notification)
      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification tapped:', response);
        // TODO: Add deep linking based on notification data
      });

      return () => {
        if (notificationListener.current) {
          Notifications.removeNotificationSubscription(notificationListener.current);
        }
        if (responseListener.current) {
          Notifications.removeNotificationSubscription(responseListener.current);
        }
      };
    }
  }, [user]);

  async function registerForPushNotificationsAsync() {
    console.log('[NotificationContext] Starting push notification registration...');
    console.log('[NotificationContext] Platform:', Platform.OS);
    console.log('[NotificationContext] Is device?', Device.isDevice);
    let token;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log('[NotificationContext] Existing permission status:', existingStatus);
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        console.log('[NotificationContext] Requesting permissions...');
        const { status } = await Notifications.requestPermissionsAsync();
        console.log('[NotificationContext] Permission result:', status);
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('[NotificationContext] ❌ Failed to get push token - permission denied');
        return;
      }
      
      console.log('[NotificationContext] ✅ Permission granted, getting push token...');
      
      try {
        const projectId = '1ab6bb51-f4ea-445b-8c25-cd0c5d0d4fea'; // Your Expo project ID from app.json
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        console.log('Expo Push Token:', token);
      } catch (error) {
        console.error('Error getting push token:', error);
      }
    } else {
      console.log('Must use physical device for Push Notifications');
    }

    return token;
  }

  async function savePushTokenToDatabase(token: string) {
    if (!user) {
      console.log('[NotificationContext] No user available for saving token');
      return;
    }

    try {
      console.log('[NotificationContext] Saving push token to database...');
      console.log('[NotificationContext] User ID:', user.id);
      console.log('[NotificationContext] Token:', token);
      
      const deviceType = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
      console.log('[NotificationContext] Device type:', deviceType);

      // Use RPC function to avoid subquery issues
      const { data, error } = await supabase
        .rpc('upsert_push_token', {
          p_user_id: user.id,
          p_token: token,
          p_device_type: deviceType,
        });

      if (error) {
        console.error('[NotificationContext] ❌ Error saving push token:', error);
        console.error('[NotificationContext] Error details:', JSON.stringify(error, null, 2));
      } else {
        console.log('[NotificationContext] ✅ Push token saved successfully!');
        console.log('[NotificationContext] Saved data:', data);
      }
    } catch (error) {
      console.error('[NotificationContext] ❌ Exception in savePushTokenToDatabase:', error);
    }
  }

  async function sendNotification(params: SendNotificationParams) {
    if (!user) {
      console.error('[NotificationContext] No user available');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          userIds: params.userIds,
          notificationType: params.notificationType,
          title: params.title,
          body: params.body,
          data: params.data,
        },
      });

      if (error) {
        console.error('Error sending notification:', error);
        throw error;
      }

      console.log('Notification sent successfully:', data);
    } catch (error) {
      console.error('Error in sendNotification:', error);
      throw error;
    }
  }

  return (
    <NotificationContext.Provider
      value={{
        expoPushToken,
        notification,
        sendNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

// Export alias for convenience
export const useNotification = useNotifications;
