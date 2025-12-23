
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from './AuthContext';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface NotificationPreferences {
  messages_enabled: boolean;
  rewards_enabled: boolean;
  announcements_enabled: boolean;
  events_enabled: boolean;
  special_features_enabled: boolean;
  custom_notifications_enabled: boolean;
}

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  preferences: NotificationPreferences | null;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  refreshPreferences: () => Promise<void>;
  sendNotification: (payload: {
    userIds?: string[];
    notificationType: 'message' | 'reward' | 'announcement' | 'event' | 'special_feature' | 'custom';
    title: string;
    body: string;
    data?: Record<string, any>;
  }) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const { user, isAuthenticated } = useAuth();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  const registerForPushNotificationsAsync = useCallback(async () => {
    try {
      if (!Device.isDevice) {
        console.log('Must use physical device for Push Notifications');
        return;
      }

      // Create notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4A90E2',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }

      // Get Expo push token
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      
      if (!projectId) {
        console.error('Project ID not found. Please add it to app.json under extra.eas.projectId');
        return;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      
      const token = tokenData.data;
      console.log('Expo Push Token:', token);
      setExpoPushToken(token);

      // Save token to database
      if (user?.id) {
        const deviceType = Platform.OS as 'ios' | 'android' | 'web';
        
        const { error } = await supabase
          .from('push_tokens')
          .upsert({
            user_id: user.id,
            token: token,
            device_type: deviceType,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,token'
          });

        if (error) {
          console.error('Error saving push token:', error);
        } else {
          console.log('Push token saved successfully');
        }
      }
    } catch (error) {
      console.error('Error registering for push notifications:', error);
    }
  }, [user?.id]);

  const loadPreferences = useCallback(async () => {
    try {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading notification preferences:', error);
        return;
      }

      if (data) {
        setPreferences({
          messages_enabled: data.messages_enabled,
          rewards_enabled: data.rewards_enabled,
          announcements_enabled: data.announcements_enabled,
          events_enabled: data.events_enabled,
          special_features_enabled: data.special_features_enabled,
          custom_notifications_enabled: data.custom_notifications_enabled,
        });
      } else {
        // Create default preferences
        const defaultPrefs = {
          user_id: user.id,
          messages_enabled: true,
          rewards_enabled: true,
          announcements_enabled: true,
          events_enabled: true,
          special_features_enabled: true,
          custom_notifications_enabled: true,
        };

        const { error: insertError } = await supabase
          .from('notification_preferences')
          .insert(defaultPrefs);

        if (insertError) {
          console.error('Error creating default preferences:', insertError);
        } else {
          setPreferences(defaultPrefs);
        }
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isAuthenticated && user) {
      registerForPushNotificationsAsync();
      loadPreferences();
    }

    // Set up notification listeners
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      // Handle notification tap here - navigate to relevant screen
      const data = response.notification.request.content.data;
      console.log('Notification data:', data);
      // TODO: Add navigation logic based on notification type
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [isAuthenticated, user, registerForPushNotificationsAsync, loadPreferences]);

  const updatePreferences = async (prefs: Partial<NotificationPreferences>) => {
    try {
      if (!user?.id) return;

      const { error } = await supabase
        .from('notification_preferences')
        .update({
          ...prefs,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) {
        console.error('Error updating preferences:', error);
        throw error;
      }

      setPreferences(prev => prev ? { ...prev, ...prefs } : null);
      console.log('Notification preferences updated');
    } catch (error) {
      console.error('Error updating preferences:', error);
      throw error;
    }
  };

  const refreshPreferences = async () => {
    await loadPreferences();
  };

  const sendNotification = async (payload: {
    userIds?: string[];
    notificationType: 'message' | 'reward' | 'announcement' | 'event' | 'special_feature' | 'custom';
    title: string;
    body: string;
    data?: Record<string, any>;
  }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
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
        throw new Error(result.error || 'Failed to send notification');
      }

      console.log('Notification sent successfully:', result);
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        expoPushToken,
        notification,
        preferences,
        updatePreferences,
        refreshPreferences,
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
