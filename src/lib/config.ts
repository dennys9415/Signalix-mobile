import Constants from 'expo-constants';

interface Extra {
  apiUrl?: string;
  wsUrl?: string;
}

const extra = (Constants.expoConfig?.extra as Extra | undefined) ?? {};

/**
 * Base URLs read from `app.json` → `extra`. The Android emulator's host
 * loopback is `10.0.2.2`; iOS simulator uses `localhost`. Override per
 * environment by editing app.json before `expo start`.
 */
export const config = {
  apiUrl: extra.apiUrl ?? 'http://10.0.2.2:4000',
  wsUrl: extra.wsUrl ?? 'ws://10.0.2.2:5000',
};
