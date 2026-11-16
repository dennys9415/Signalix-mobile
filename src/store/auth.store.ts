import { create } from 'zustand';
import type { AuthSessionDTO, LoginRequest, RegisterRequest } from '@signalix/contracts';
import { api } from '~/services/api-client';
import { loadSession, saveSession, clearSession } from '~/services/secure-store';
import { wsClient } from '~/services/ws-client';
import { cryptoService } from '~/crypto';

/**
 * Load (or generate + publish) this device's E2EE keys in the background.
 * Never blocks auth; if it fails, sends fall back to plaintext and the next
 * launch retries.
 */
function initCrypto(deviceId: string): void {
  cryptoService.init({ deviceId }).catch((err: unknown) => {
    console.warn('[signalix-crypto] init failed', err);
  });
}

interface AuthState {
  session: AuthSessionDTO | null;
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  hydrated: false,
  loading: false,
  error: null,

  async hydrate() {
    const session = await loadSession();
    if (session?.accessToken) {
      wsClient.connect(session.accessToken);
      initCrypto(session.deviceId);
    }
    set({ session, hydrated: true });
  },

  async login(payload) {
    set({ loading: true, error: null });
    try {
      const session = await api.login(payload);
      await saveSession(session);
      wsClient.connect(session.accessToken);
      initCrypto(session.deviceId);
      set({ session, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message || 'Login failed' });
      throw err;
    }
  },

  async register(payload) {
    set({ loading: true, error: null });
    try {
      const session = await api.register(payload);
      await saveSession(session);
      wsClient.connect(session.accessToken);
      initCrypto(session.deviceId);
      set({ session, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message || 'Registration failed' });
      throw err;
    }
  },

  async logout() {
    wsClient.disconnect();
    cryptoService.reset();
    try { await api.logout(); } catch { /* best effort */ }
    await clearSession();
    set({ session: null, error: null });
  },
}));
