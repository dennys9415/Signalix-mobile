import Constants from 'expo-constants';
import { Platform } from 'react-native';

interface Extra {
  apiUrl?: string;
  wsUrl?: string;
}

const extra = (Constants.expoConfig?.extra as Extra | undefined) ?? {};

/**
 * Base URLs read from `app.json` → `extra`. The Android emulator's host
 * loopback is `10.0.2.2`; the iOS simulator reaches the host on
 * `localhost`, so the Android default is rewritten there on iOS.
 */
function forPlatform(url: string): string {
  return Platform.OS === 'ios' ? url.replace('10.0.2.2', 'localhost') : url;
}

export const config = {
  apiUrl: forPlatform(extra.apiUrl ?? 'http://10.0.2.2:4000'),
  wsUrl: forPlatform(extra.wsUrl ?? 'ws://10.0.2.2:5000'),
};

/**
 * Public object-storage URLs come back from the API as the server sees
 * them (`http://localhost:9000/...` in local dev). The Android emulator
 * can't reach the host on `localhost`, so rewrite it there.
 */
export function mediaUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  return Platform.OS === 'android' ? url.replace('//localhost', '//10.0.2.2') : url;
}
