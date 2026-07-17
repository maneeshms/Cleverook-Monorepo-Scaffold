/**
 * Best-effort push registration against POST /notifications/devices.
 *
 * The API's PUSH channel sends through FCM HTTP v1, so it needs an FCM
 * *registration token*:
 *  - Android: expo-notifications returns exactly that — works in a dev build
 *    with google-services.json wired in app.json (not in Expo Go, which has no
 *    Firebase config; SDK 53+ removed remote push from Expo Go entirely).
 *  - iOS: expo-notifications returns a raw APNs token, which FCM v1 cannot
 *    target — registering it would only produce dead sends. iOS therefore
 *    needs @react-native-firebase/messaging (config plugin + dev build) to
 *    mint a real FCM token; see docs/MOBILE.md for the recipe.
 *
 * Everything here is deliberately non-fatal: a missing permission, simulator,
 * or Expo Go just logs and skips — push is an enhancement, never a login
 * blocker.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

let registeredToken: string | null = null;

export async function registerForPush(): Promise<void> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) {
      console.warn('push: skipped (needs a physical device)');
      return;
    }
    if (Platform.OS === 'ios') {
      console.warn('push: skipped on iOS — needs an FCM token, see docs/MOBILE.md');
      return;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('push: skipped (permission not granted)');
      return;
    }
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    await api.registerDevice(token, 'ANDROID');
    registeredToken = token;
  } catch (err) {
    // Expected in Expo Go / without google-services.json — never block the app.
    console.warn(`push: skipped (${err instanceof Error ? err.message : 'unavailable'})`);
  }
}

/** Call before logout so the API stops fanning out to this device. */
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  await api.unregisterDevice(registeredToken).catch(() => undefined);
  registeredToken = null;
}
