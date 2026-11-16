// v0.16.0 — REST client. Mirrors the web `lib/api-client.ts` API
// surface but uses native fetch + expo-secure-store for tokens.
//
// On 401 the call transparently refreshes via /auth/refresh and
// retries once. Multiple concurrent calls share the same in-flight
// refresh so we never thrash the refresh endpoint.

import type {
  ApiResponse,
  AuthSessionDTO,
  CallHistoryResponse,
  IceServersResponse,
  ClearChatResponse,
  DeleteChatForMeResponse,
  ChatDTO,
  CreateGroupChatRequest,
  CreateGroupChatResponse,
  GetMessagesResponse,
  KeyBundleResponse,
  RegisterDeviceKeysRequest,
  RegisterDeviceKeysResponse,
  UploadPreKeysRequest,
  UploadPreKeysResponse,
  PresenceLookupResponse,
  LoginRequest,
  RegisterRequest,
  UserProfileResponse,
  UserSearchResponse,
} from '@signalix/contracts';
import { config } from '~/lib/config';
import { clearSession, loadSession, saveSession } from './secure-store';

class ApiError extends Error {
  status: number;
  code: string | undefined;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshInFlight: Promise<AuthSessionDTO | null> | null = null;

async function refreshSession(): Promise<AuthSessionDTO | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const session = await loadSession();
      if (!session?.refreshToken) return null;
      const res = await fetch(`${config.apiUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (!res.ok) {
        await clearSession();
        return null;
      }
      const json = (await res.json()) as ApiResponse<AuthSessionDTO>;
      if (!json.success || !json.data) {
        await clearSession();
        return null;
      }
      await saveSession(json.data);
      return json.data;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function rawRequest<T>(
  method: string,
  path: string,
  init?: { body?: unknown; auth?: boolean },
): Promise<T> {
  const { body, auth = true } = init ?? {};
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const session = await loadSession();
    if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (res.status === 401 && auth) {
    // Try one refresh + retry.
    const refreshed = await refreshSession();
    if (!refreshed) throw new ApiError('Session expired', 401);
    headers.Authorization = `Bearer ${refreshed.accessToken}`;
    const retry = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const retryJson = (await retry.json().catch(() => null)) as ApiResponse<T> | null;
    if (!retryJson?.success || retryJson.data === undefined) {
      throw new ApiError(retryJson?.error?.message ?? `Request failed`, retry.status, retryJson?.error?.code);
    }
    return retryJson.data;
  }

  if (!json?.success || json.data === undefined) {
    throw new ApiError(json?.error?.message ?? `Request failed`, res.status, json?.error?.code);
  }
  return json.data;
}

/** Multipart upload of a local file URI (image picker result). */
async function uploadRequest<T>(path: string, field: string, file: { uri: string; name: string; type: string }): Promise<T> {
  const send = async (token: string | undefined) => {
    const form = new FormData();
    // React Native's FormData accepts { uri, name, type } file descriptors.
    form.append(field, file as unknown as Blob);
    return fetch(`${config.apiUrl}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  };
  let res = await send((await loadSession())?.accessToken);
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (!refreshed) throw new ApiError('Session expired', 401);
    res = await send(refreshed.accessToken);
  }
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!json?.success || json.data === undefined) {
    throw new ApiError(json?.error?.message ?? 'Upload failed', res.status, json?.error?.code);
  }
  return json.data;
}

/* ────────── Public surface ────────── */

export const api = {
  async login(payload: LoginRequest): Promise<AuthSessionDTO> {
    return rawRequest<AuthSessionDTO>('POST', '/api/v1/auth/login', { body: payload, auth: false });
  },

  async register(payload: RegisterRequest): Promise<AuthSessionDTO> {
    return rawRequest<AuthSessionDTO>('POST', '/api/v1/auth/register', { body: payload, auth: false });
  },

  async logout(): Promise<void> {
    const session = await loadSession();
    try {
      if (session?.refreshToken) {
        await rawRequest<{ revoked: true }>('POST', '/api/v1/auth/logout', {
          body: { refreshToken: session.refreshToken },
          auth: true,
        });
      }
    } catch {
      // Server-side revoke is best-effort; we still clear local state.
    }
    await clearSession();
  },

  async getMe(): Promise<UserProfileResponse> {
    return rawRequest<UserProfileResponse>('GET', '/api/v1/users/me');
  },

  async getChats(): Promise<{ chats: ChatDTO[] }> {
    return rawRequest<{ chats: ChatDTO[] }>('GET', '/api/v1/chats');
  },

  async getMessages(chatId: string, params?: { limit?: number; cursor?: string }): Promise<GetMessagesResponse> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.cursor) qs.set('cursor', params.cursor);
    const qsString = qs.toString();
    const suffix = qsString ? `?${qsString}` : '';
    return rawRequest<GetMessagesResponse>('GET', `/api/v1/chats/${chatId}/messages${suffix}`);
  },

  async createGroupChat(payload: CreateGroupChatRequest): Promise<CreateGroupChatResponse> {
    return rawRequest<CreateGroupChatResponse>('POST', '/api/v1/chats/group', { body: payload });
  },

  async searchUsers(q: string, limit = 20): Promise<UserSearchResponse> {
    const qs = new URLSearchParams({ q, limit: String(limit) });
    return rawRequest<UserSearchResponse>('GET', `/api/v1/users/search?${qs.toString()}`);
  },

  async uploadAvatar(file: { uri: string; name: string; type: string }): Promise<{ avatarUrl: string }> {
    return uploadRequest<{ avatarUrl: string }>('/api/v1/profile/avatar', 'avatar', file);
  },

  async removeAvatar(): Promise<void> {
    await rawRequest<Record<string, never>>('DELETE', '/api/v1/profile/avatar');
  },

  async getPresence(userIds: string[]): Promise<PresenceLookupResponse> {
    if (userIds.length === 0) return { presence: [] };
    return rawRequest<PresenceLookupResponse>('GET', `/api/v1/presence?userIds=${userIds.map(encodeURIComponent).join(',')}`);
  },

  async markChatRead(chatId: string): Promise<void> {
    await rawRequest<{ chatId: string }>('POST', `/api/v1/chats/${chatId}/read`);
  },

  async clearChat(chatId: string): Promise<ClearChatResponse> {
    return rawRequest<ClearChatResponse>('POST', `/api/v1/chats/${chatId}/clear`);
  },

  async deleteChatForMe(chatId: string): Promise<DeleteChatForMeResponse> {
    return rawRequest<DeleteChatForMeResponse>('POST', `/api/v1/chats/${chatId}/delete-for-me`);
  },

  async getIceServers(): Promise<IceServersResponse> {
    return rawRequest<IceServersResponse>('GET', '/api/v1/calls/ice-servers');
  },

  async getCallHistory(limit = 50): Promise<CallHistoryResponse> {
    return rawRequest<CallHistoryResponse>('GET', `/api/v1/calls?limit=${limit}`);
  },

  /* ── E2EE key directory (same endpoints as the web client) ── */

  async registerDeviceKeys(dto: RegisterDeviceKeysRequest): Promise<RegisterDeviceKeysResponse> {
    return rawRequest<RegisterDeviceKeysResponse>('POST', '/api/v1/crypto/devices/keys', { body: dto });
  },

  async uploadPreKeys(dto: UploadPreKeysRequest): Promise<UploadPreKeysResponse> {
    return rawRequest<UploadPreKeysResponse>('POST', '/api/v1/crypto/devices/keys/pre-keys', { body: dto });
  },

  async getKeyBundle(userId: string): Promise<KeyBundleResponse> {
    return rawRequest<KeyBundleResponse>('GET', `/api/v1/crypto/users/${encodeURIComponent(userId)}/key-bundle`);
  },
};

export { ApiError };
