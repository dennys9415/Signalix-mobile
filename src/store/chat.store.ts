// v0.16.0 — chat store. Mirrors the web store's shape (chats list +
// per-chat message arrays + presence + unread counts).
// v0.17.0 — E2EE: text is encrypted to every recipient device on send
// (plaintext fallback when someone has no keys, like the web) and
// decrypted on receive / history load. Stored messages hold plaintext.

import { create } from 'zustand';
import {
  ChatType,
  MessageStatus,
  MessageType,
  ServerEvent,
  type ChatDTO,
  type GroupRecipientPayloadDTO,
  type MessageDTO,
  type MessageStatusPayload,
  type PresenceEventPayload,
  type ServerChatCreatedPayload,
  type ServerMessageNewPayload,
  type ServerMessageSentPayload,
} from '@signalix/contracts';
import { cryptoService } from '~/crypto';
import { api } from '~/services/api-client';
import { wsClient } from '~/services/ws-client';
import { useAuthStore } from '~/store/auth.store';

export interface TempMessage {
  tempId: string;
  chatId: string;
  ciphertext: string;
  messageType: MessageType;
  createdAt: string;
  pending: true;
  queued?: boolean;
}

export type StoredMessage = MessageDTO | TempMessage;

interface ChatState {
  chats: ChatDTO[];
  messages: Record<string, StoredMessage[]>;
  unreadCounts: Record<string, number>;
  presence: Record<string, 'online' | 'offline'>;
  /** Latest message per chat, for list previews before a chat is opened. */
  previews: Record<string, MessageDTO>;
  /** recipientUsername → real chatId, once a first message to a new contact lands. */
  draftChats: Record<string, string>;
  activeChatId: string | null;
  loading: boolean;

  initWsHandler: () => void;
  loadChats: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  sendMessage: (chatId: string, text: string) => void;
  /** First message to someone without an existing direct chat. */
  sendToUser: (recipientUsername: string, recipientUserId: string, text: string) => void;
  /** Hide every message so far (for me); the chat stays listed. */
  clearChat: (chatId: string) => Promise<void>;
  /** Delete for me: hidden until someone writes again. */
  deleteChat: (chatId: string) => Promise<void>;
  setActiveChat: (chatId: string | null) => void;
  markChatRead: (chatId: string) => void;
}

export const DRAFT_PREFIX = 'draft:';
/** Shown in place of an encrypted message this device can't open. */
export const DECRYPT_FAILED = '🔒 Unable to decrypt this message';
/** Own encrypted message sent from another device (senders never encrypt to themselves). */
export const SENT_ELSEWHERE = '🔒 Sent from another device';
/** Encrypted only for the user's other devices (e.g. sent before this device signed in). */
export const OTHER_DEVICE = '🔒 Encrypted for your other device';

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messages: {},
  unreadCounts: {},
  presence: {},
  previews: {},
  draftChats: {},
  activeChatId: null,
  loading: false,

  initWsHandler() {
    wsClient.setHandler((event, payload) => {
      // server.message.sent — promote temp to confirmed
      if (event === ServerEvent.MESSAGE_SENT) {
        const p = payload as ServerMessageSentPayload;
        set((s) => {
          if (!p.tempId) return s;
          let arr = s.messages[p.chatId] ?? [];
          let draftChats = s.draftChats;
          const messages = { ...s.messages };
          if (!arr.some((m) => 'tempId' in m && m.tempId === p.tempId)) {
            // First message to a new contact: the temp lives under `draft:<username>`.
            const draftKey = Object.keys(s.messages).find((k) =>
              k.startsWith(DRAFT_PREFIX) && s.messages[k]!.some((m) => 'tempId' in m && m.tempId === p.tempId));
            if (draftKey) {
              arr = [...arr, ...s.messages[draftKey]!];
              delete messages[draftKey];
              draftChats = { ...s.draftChats, [draftKey.slice(DRAFT_PREFIX.length)]: p.chatId };
            }
          }
          const promoted = arr.map<StoredMessage>((m) => {
            if (!('tempId' in m) || m.tempId !== p.tempId) return m;
            const tmp = m;
            // Nobody encrypts to the sender — keep our own plaintext for history reloads.
            void cryptoService.cachePlaintext(p.messageId, tmp.ciphertext).catch(() => {});
            return {
              id: p.messageId,
              chatId: p.chatId,
              senderId: p.senderId,
              ciphertext: tmp.ciphertext,
              messageType: tmp.messageType,
              state: 'sent' as never,
              createdAt: p.timestamp,
            } as MessageDTO;
          });
          return { messages: { ...messages, [p.chatId]: promoted }, draftChats };
        });
        if (!get().chats.some((c) => c.id === p.chatId)) void get().loadChats();
        return;
      }

      // server.message.new — append + unread + bring chat to top
      if (event === ServerEvent.MESSAGE_NEW) {
        const p = payload as ServerMessageNewPayload;
        void onMessageNew(p);
        return;
      }

      // status updates
      if (event === ServerEvent.MESSAGE_DELIVERED || event === ServerEvent.MESSAGE_READ) {
        handleStatus(payload as MessageStatusPayload);
        return;
      }
      handleOther(event, payload);
    });

    async function onMessageNew(p: ServerMessageNewPayload): Promise<void> {
      const msg = await reveal({
        id: p.messageId,
        chatId: p.chatId,
        senderId: p.senderId,
        ciphertext: p.ciphertext,
        messageType: p.messageType,
        state: 'delivered' as never,
        createdAt: p.timestamp,
        ...(p.encryptionVersion !== undefined && { encryptionVersion: p.encryptionVersion }),
        ...(p.senderDeviceId !== undefined && { senderDeviceId: p.senderDeviceId }),
        ...(p.recipientDeviceId !== undefined && { recipientDeviceId: p.recipientDeviceId }),
        ...(p.preKeyId !== undefined && { preKeyId: p.preKeyId }),
        ...(p.signedPreKeyId !== undefined && { signedPreKeyId: p.signedPreKeyId }),
      } as MessageDTO);
      const isActive = get().activeChatId === p.chatId;
      set((s) => {
        const existing = s.messages[p.chatId] ?? [];
        if (existing.some((m) => 'id' in m && m.id === p.messageId)) return s;
        const chatExists = s.chats.some((c) => c.id === p.chatId);
        return {
          messages: { ...s.messages, [p.chatId]: [...existing, msg] },
          unreadCounts: isActive || !chatExists
            ? s.unreadCounts
            : { ...s.unreadCounts, [p.chatId]: (s.unreadCounts[p.chatId] ?? 0) + 1 },
        };
      });
      // If the chat isn't tracked locally yet, refresh the chats list to pull it in.
      if (!get().chats.some((c) => c.id === p.chatId)) {
        void get().loadChats();
      }
      // Auto-ack delivered.
      wsClient.sendMessageDelivered({ messageId: p.messageId, chatId: p.chatId });
      if (isActive) wsClient.sendMessageRead({ messageId: p.messageId, chatId: p.chatId });
    }

    function handleStatus(p: MessageStatusPayload): void {
      const newState = p.status === MessageStatus.READ ? 'read' : 'delivered';
      set((s) => {
        const arr = s.messages[p.chatId];
        if (!arr) return s;
        return {
          messages: {
            ...s.messages,
            [p.chatId]: arr.map((m) => {
              if (!('id' in m) || m.id !== p.messageId) return m;
              if ((m as MessageDTO).state === newState) return m;
              return { ...(m as MessageDTO), state: newState } as MessageDTO;
            }),
          },
        };
      });
    }

    function handleOther(event: string, payload: unknown): void {
      if (event === ServerEvent.CHAT_CREATED) {
        const p = payload as ServerChatCreatedPayload;
        set((s) => {
          if (s.chats.some((c) => c.id === p.chat.id)) return s;
          return {
            chats: [p.chat, ...s.chats],
            unreadCounts: { ...s.unreadCounts, [p.chat.id]: p.chat.unreadCount ?? 0 },
          };
        });
        return;
      }

      if (event === ServerEvent.USER_ONLINE) {
        const p = payload as PresenceEventPayload;
        set((s) => ({ presence: { ...s.presence, [p.userId]: 'online' } }));
        return;
      }

      if (event === ServerEvent.USER_OFFLINE) {
        const p = payload as PresenceEventPayload;
        set((s) => ({ presence: { ...s.presence, [p.userId]: 'offline' } }));
      }
    }
  },

  async loadChats() {
    set({ loading: true });
    try {
      const { chats } = await api.getChats();
      void loadPreviews(chats);
      void loadPresence(chats);
      set((s) => ({
        chats,
        unreadCounts: chats.reduce<Record<string, number>>((acc, c) => {
          acc[c.id] = s.unreadCounts[c.id] ?? c.unreadCount ?? 0;
          return acc;
        }, {}),
        loading: false,
      }));
    } catch {
      set({ loading: false });
    }
  },

  async loadMessages(chatId) {
    try {
      const res = await api.getMessages(chatId, { limit: 50 });
      const revealed = await Promise.all(res.messages.map(reveal));
      // API returns newest-first; store oldest-first.
      set((s) => ({
        messages: { ...s.messages, [chatId]: revealed.reverse() },
      }));
    } catch {
      // silent — keep whatever's in store
    }
  },

  sendToUser(recipientUsername, recipientUserId, text) {
    const key = `${DRAFT_PREFIX}${recipientUsername}`;
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmp: TempMessage = {
      tempId,
      chatId: key,
      ciphertext: text,
      messageType: MessageType.TEXT,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    set((s) => ({ messages: { ...s.messages, [key]: [...(s.messages[key] ?? []), tmp] } }));
    void (async () => {
      wsClient.sendMessageSend({ recipientUsername, ...(await sealText(text, [recipientUserId])), messageType: MessageType.TEXT, tempId });
    })();
  },

  sendMessage(chatId, text) {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const tmp: TempMessage = {
      tempId,
      chatId,
      ciphertext: text,
      messageType: MessageType.TEXT,
      createdAt: now,
      pending: true,
    };
    set((s) => ({
      messages: { ...s.messages, [chatId]: [...(s.messages[chatId] ?? []), tmp] },
    }));
    const me = useAuthStore.getState().session?.userId;
    const others = (get().chats.find((c) => c.id === chatId)?.participants ?? [])
      .map((p) => p.userId)
      .filter((id) => id !== me);
    void (async () => {
      const sent = wsClient.sendMessageSend({ chatId, ...(await sealText(text, others)), messageType: MessageType.TEXT, tempId });
      if (!sent) markQueued(chatId, tempId);
    })();
  },


  async clearChat(chatId) {
    await api.clearChat(chatId);
    set((s) => {
      const { [chatId]: _preview, ...previews } = s.previews;
      return {
        messages: { ...s.messages, [chatId]: [] },
        previews,
        unreadCounts: { ...s.unreadCounts, [chatId]: 0 },
      };
    });
  },

  async deleteChat(chatId) {
    await api.deleteChatForMe(chatId);
    set((s) => {
      const { [chatId]: _messages, ...messages } = s.messages;
      const { [chatId]: _preview, ...previews } = s.previews;
      const { [chatId]: _unread, ...unreadCounts } = s.unreadCounts;
      return { chats: s.chats.filter((c) => c.id !== chatId), messages, previews, unreadCounts };
    });
  },

  setActiveChat(chatId) {
    set({ activeChatId: chatId });
    if (chatId) get().markChatRead(chatId);
  },

  markChatRead(chatId) {
    set((s) => {
      if (!s.unreadCounts[chatId]) return s;
      return { unreadCounts: { ...s.unreadCounts, [chatId]: 0 } };
    });
    void api.markChatRead(chatId).catch(() => {});
    // Best-effort mark all unread messages from others as read.
    const arr = get().messages[chatId] ?? [];
    const me = useAuthStore.getState().session?.userId;
    for (const m of arr) {
      if (!('id' in m)) continue;
      if (m.senderId === me) continue;
      if (m.state === 'read') continue;
      wsClient.sendMessageRead({ messageId: m.id, chatId });
    }
  },
}));

/** Fetch the newest message of every chat so the list can show previews. */
async function loadPreviews(chats: ChatDTO[]): Promise<void> {
  const results = await Promise.all(chats.map(async (c) => {
    try {
      const res = await api.getMessages(c.id, { limit: 1 });
      return [c.id, res.messages[0] && await reveal(res.messages[0])] as const;
    } catch {
      return [c.id, undefined] as const;
    }
  }));
  const previews: Record<string, MessageDTO> = {};
  for (const [id, m] of results) if (m) previews[id] = m;
  useChatStore.setState((s) => ({ previews: { ...s.previews, ...previews } }));
}

/** Seed presence for direct-chat peers; later changes arrive over WS. */
async function loadPresence(chats: ChatDTO[]): Promise<void> {
  const ids = new Set<string>();
  for (const c of chats) {
    if (c.type !== ChatType.DIRECT) continue;
    for (const p of c.participants) ids.add(p.userId);
  }
  try {
    const { presence } = await api.getPresence([...ids]);
    const map: Record<string, 'online' | 'offline'> = {};
    for (const p of presence) {
      if (map[p.userId] === 'online') continue;
      map[p.userId] = p.status === 'online' ? 'online' : 'offline';
    }
    useChatStore.setState((s) => ({ presence: { ...map, ...s.presence } }));
  } catch {
    // presence is cosmetic
  }
}

function markQueued(chatId: string, tempId: string): void {
  useChatStore.setState((s) => {
    const arr = s.messages[chatId];
    if (!arr) return s;
    return {
      messages: {
        ...s.messages,
        [chatId]: arr.map((m) => ('tempId' in m && m.tempId === tempId ? { ...m, queued: true } : m)),
      },
    };
  });
}

/**
 * Wire fields for an outgoing text: encrypted to every device of every
 * recipient, or plaintext when anyone has no published keys (or crypto
 * isn't up) — all-or-nothing, so no recipient silently misses the body.
 */
async function sealText(
  text: string,
  recipientUserIds: string[],
): Promise<{ ciphertext: string; encryptionVersion?: number; senderDeviceId?: string; recipients?: GroupRecipientPayloadDTO[] }> {
  const deviceId = useAuthStore.getState().session?.deviceId;
  if (!deviceId || recipientUserIds.length === 0) return { ciphertext: text };
  try {
    const recipients: GroupRecipientPayloadDTO[] = [];
    for (const uid of recipientUserIds) {
      for (const e of await cryptoService.encryptForUserAllDevices(text, uid)) {
        recipients.push({
          recipientUserId: uid,
          recipientDeviceId: e.recipientDeviceId,
          ciphertext: e.ciphertext,
          encryptionVersion: e.encryptionVersion,
          signedPreKeyId: e.signedPreKeyId,
          ...(e.preKeyId !== undefined && { preKeyId: e.preKeyId }),
        });
      }
    }
    return { ciphertext: '', encryptionVersion: 1, senderDeviceId: deviceId, recipients };
  } catch {
    return { ciphertext: text };
  }
}

/** Replace an encrypted body with its plaintext (cache → decrypt → placeholder). Never throws. */
async function reveal(m: MessageDTO): Promise<MessageDTO> {
  if (!m.encryptionVersion) return m;
  const cached = await cryptoService.lookupPlaintext(m.id).catch(() => undefined);
  if (cached !== undefined) return { ...m, ciphertext: cached };
  try {
    const text = await cryptoService.decryptIncoming(m);
    void cryptoService.cachePlaintext(m.id, text).catch(() => {});
    return { ...m, ciphertext: text };
  } catch {
    const mine = m.senderId === useAuthStore.getState().session?.userId;
    // No envelope for this device at all → it simply wasn't a recipient.
    return { ...m, ciphertext: mine ? SENT_ELSEWHERE : !m.ciphertext ? OTHER_DEVICE : DECRYPT_FAILED };
  }
}
