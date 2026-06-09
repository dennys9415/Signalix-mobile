// v0.16.0 — tokens + session live in expo-secure-store (OS-backed
// encrypted keychain). Anything larger than 2KB goes to AsyncStorage.

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthSessionDTO } from '@signalix/contracts';

const SESSION_KEY = 'signalix.session.v1';

export async function loadSession(): Promise<AuthSessionDTO | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSessionDTO;
  } catch {
    return null;
  }
}

export async function saveSession(session: AuthSessionDTO): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

/**
 * AsyncStorage-backed key/value for non-sensitive cached state (e.g.,
 * last-seen draft text per chat). Keep payloads small — AsyncStorage is
 * a single-disk file on Android and large blobs hurt cold-start time.
 */
export const localCache = {
  get: async (key: string): Promise<string | null> => AsyncStorage.getItem(key),
  set: async (key: string, value: string): Promise<void> => AsyncStorage.setItem(key, value),
  remove: async (key: string): Promise<void> => AsyncStorage.removeItem(key),
};
