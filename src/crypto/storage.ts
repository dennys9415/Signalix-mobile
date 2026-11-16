// Device storage for E2EE state. The private keys + plaintext cache are too
// big for the keychain (expo-secure-store values should stay ~2 KB), so they
// live in AsyncStorage encrypted with AES-256-GCM under a random master key
// that only ever sits in the keychain / keystore.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { CryptoStorage } from './signal';
import {
  GCM_IV_BYTES,
  aesGcmDecrypt,
  aesGcmEncrypt,
  base64UrlToBytes,
  bytesToBase64Url,
  randomBytes,
  utf8Decode,
  utf8Encode,
} from './primitives';

const MASTER_KEY = 'sg_crypto_master';
const PREFIX = 'sg_crypto:';

let masterKey: Promise<Uint8Array> | null = null;

function getMasterKey(): Promise<Uint8Array> {
  masterKey ??= (async () => {
    const existing = await SecureStore.getItemAsync(MASTER_KEY);
    if (existing) return base64UrlToBytes(existing);
    const fresh = randomBytes(32);
    await SecureStore.setItemAsync(MASTER_KEY, bytesToBase64Url(fresh), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    return fresh;
  })();
  return masterKey;
}

export const deviceCryptoStorage: CryptoStorage = {
  async get(key) {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const [iv, ct] = raw.split('.');
    try {
      return utf8Decode(aesGcmDecrypt(await getMasterKey(), base64UrlToBytes(iv!), base64UrlToBytes(ct!)));
    } catch {
      // Master key gone (app reinstalled → keychain wiped) — treat as empty.
      return null;
    }
  },
  async set(key, value) {
    const iv = randomBytes(GCM_IV_BYTES);
    const ct = aesGcmEncrypt(await getMasterKey(), iv, utf8Encode(value));
    await AsyncStorage.setItem(PREFIX + key, `${bytesToBase64Url(iv)}.${bytesToBase64Url(ct)}`);
  },
  async remove(key) {
    await AsyncStorage.removeItem(PREFIX + key);
  },
};
