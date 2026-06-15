import { AppState, Platform } from 'react-native';
import {
  getExpoPushTokenAsync,
  requestPermissionsAsync,
  getPermissionsAsync,
  setNotificationHandler,
  setNotificationChannelAsync,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  setBadgeCountAsync,
  scheduleNotificationAsync,
  getLastNotificationResponseAsync,
  AndroidImportance,
  type ExpoPushToken,
  type Notification,
  type NotificationResponse,
} from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

console.log('[NOTIFICATIONS] Module loading, Platform:', Platform.OS);

setNotificationHandler({
  handleNotification: async (notification: Notification) => {
    console.log('[NOTIFICATIONS] handleNotification called:', JSON.stringify(notification));
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

if (Platform.OS === 'android') {
  console.log('[NOTIFICATIONS] Creating Android notification channel...');
  setNotificationChannelAsync('vhorto-notificaciones', {
    name: 'Voto Secreto',
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7A',
  })
    .then(() => console.log('[NOTIFICATIONS] Channel created successfully'))
    .catch((err) => console.error('[NOTIFICATIONS] Error creating channel:', err));
}

let receivedListener: { remove: () => void } | null = null;
let responseListener: { remove: () => void } | null = null;
let appStateListener: { remove: () => void } | null = null;

async function clearBadge(): Promise<void> {
  try {
    await setBadgeCountAsync(0);
  } catch (e) {
    console.warn('[NOTIFICATIONS] Error clearing badge:', e);
  }
}

function navigateToEncuesta(response: NotificationResponse): void {
  const data = response.notification.request.content.data as Record<string, string> | undefined;
  const encuestaId = data?.encuesta_id;
  if (encuestaId) {
    console.log('[NOTIFICATIONS] Navigating to vote/', encuestaId);
    router.replace(`/vote/${encuestaId}`);
  }
}

export function setupNotificationListeners(): void {
  if (receivedListener) return;

  clearBadge();

  console.log('[NOTIFICATIONS] Setting up listeners...');

  receivedListener = addNotificationReceivedListener((notification: Notification) => {
    console.log('[NOTIFICATIONS] NOTIFICATION RECEIVED:', JSON.stringify(notification));
  });

  responseListener = addNotificationResponseReceivedListener((response: NotificationResponse) => {
    console.log('[NOTIFICATIONS] NOTIFICATION TAPPED:', JSON.stringify(response));
    clearBadge();
    navigateToEncuesta(response);
  });

  appStateListener = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      console.log('[NOTIFICATIONS] App became active, clearing badge');
      clearBadge();
    }
  });
}

export async function handleInitialNotification(): Promise<void> {
  try {
    const response = await getLastNotificationResponseAsync();
    if (response) {
      console.log('[NOTIFICATIONS] Initial notification response:', JSON.stringify(response));
      navigateToEncuesta(response);
    }
  } catch (e) {
    console.warn('[NOTIFICATIONS] Error checking initial notification:', e);
  }
}

export function cleanupNotificationListeners(): void {
  if (receivedListener) { receivedListener.remove(); receivedListener = null; }
  if (responseListener) { responseListener.remove(); responseListener = null; }
  if (appStateListener) { appStateListener.remove(); appStateListener = null; }
}

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    console.log('[NOTIFICATIONS] registerForPushNotifications started');

    const { status: existing } = await getPermissionsAsync();
    console.log('[NOTIFICATIONS] Existing permission status:', existing);
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await requestPermissionsAsync();
      console.log('[NOTIFICATIONS] Requested permission status:', status);
      finalStatus = status;
    }
    if (finalStatus !== 'granted') { console.log('[NOTIFICATIONS] Permission not granted'); return null; }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData: ExpoPushToken = await getExpoPushTokenAsync({ projectId });
    console.log('[NOTIFICATIONS] Token obtained:', tokenData.data);
    return tokenData.data;
  } catch (err) {
    console.error('[NOTIFICATIONS] Error registering for push:', err);
    return null;
  }
}

export async function testLocalNotification(): Promise<void> {
  console.log('[NOTIFICATIONS] Scheduling test local notification...');
  try {
    await scheduleNotificationAsync({
      content: {
        title: '🔔 Test Local',
        body: 'Si ves esto, las notificaciones funcionan en Android',
        sound: 'default',
      },
      trigger: null,
    });
    console.log('[NOTIFICATIONS] Test local notification scheduled');
  } catch (err) {
    console.error('[NOTIFICATIONS] Error scheduling test notification:', err);
  }
}

export async function savePushToken(userId: string): Promise<void> {
  const token = await registerForPushNotifications();
  if (!token) return;

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  console.log('[NOTIFICATIONS] Saving push token for user', userId, ':', token);

  const { error } = await supabase.from('push_tokens').upsert(
    { user_id: userId, token, platform, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.warn('[NOTIFICATIONS] Error guardando push token:', error.message);
  } else {
    console.log('[NOTIFICATIONS] Push token saved successfully');
  }
}
