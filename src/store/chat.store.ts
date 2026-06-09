// v0.16.0 — chat store. Mirrors the web store's shape (chats list +
// per-chat message arrays + presence + unread counts) but without the
// E2EE / decrypt / outbox plumbing — that lands with the v0.17.0
// crypto port. Mobile renders text exactly as the server returns it.

import { create } from 'zustand';
import {
  MessageStatus,
  MessageType,
  ServerEvent,
  type ChatDTO,
  type MessageDTO,
  type MessageStatusPayload,
  type PresenceEventPayload,
  type ServerChatCreatedPayload,
  type ServerMessageNewPayload,
  type ServerMessageSentPayload,
} from '@signalix/contracts';
import { api } from '~/services/api-client';
import { wsClient } from '~/services/ws-client';

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
  activeChatId: string | null;
  loading: boolean;

  initWsHandler: () => void;
  loadChats: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  sendMessage: (chatId: string, text: string) => void;
  setActiveChat: (chatId: string | null) => void;
  markChatRead: (chatId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messages: {},
  unreadCounts: {},
  presence: {},
  activeChatId: null,
  loading: false,

  initWsHandler() {
    wsClient.setHandler((event, payload) => {
      // server.message.sent — promote temp to confirmed
      if (event === ServerEvent.MESSAGE_SENT) {
        const p = payload as ServerMessageSentPayload;
        set((s) => {
          const arr = s.messages[p.chatId] ?? [];
          if (!p.tempId) return s;
          const promoted = arr.map<StoredMessage>((m) => {
            if (!('tempId' in m) || m.tempId !== p.tempId) return m;
            const tmp = m;
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
          return { messages: { ...s.messages, [p.chatId]: promoted } };
        });
        return;
      }

      // server.message.new — append + unread + bring chat to top
      if (event === ServerEvent.MESSAGE_NEW) {
        const p = payload as ServerMessageNewPayload;
        const isActive = get().activeChatId === p.chatId;
        const msg: MessageDTO = {
          id: p.messageId,
          chatId: p.chatId,
          senderId: p.senderId,
          ciphertext: p.ciphertext,
          messageType: p.messageType,
          state: 'delivered' as never,
          createdAt: p.timestamp,
        };
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
        return;
      }

      // status updates
      if (event === ServerEvent.MESSAGE_DELIVERED || event === ServerEvent.MESSAGE_READ) {
        const p = payload as MessageStatusPayload;
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
        return;
      }

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
        return;
      }
    });
  },

  async loadChats() {
    set({ loading: true });
    try {
      const { chats } = await api.getChats();
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
      // API returns newest-first; store oldest-first.
      set((s) => ({
        messages: { ...s.messages, [chatId]: [...res.messages].reverse() },
      }));
    } catch {
      // silent — keep whatever's in store
    }
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
    const sent = wsClient.sendMessageSend({
      chatId,
      ciphertext: text,
      messageType: MessageType.TEXT,
      tempId,
    });
    if (!sent) {
      set((s) => {
        const arr = s.messages[chatId];
        if (!arr) return s;
        return {
          messages: {
            ...s.messages,
            [chatId]: arr.map((m) => (
              'tempId' in m && m.tempId === tempId ? { ...m, queued: true } : m
            )),
          },
        };
      });
    }
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
    const me = (arr.find((m): m is MessageDTO => 'id' in m) as MessageDTO | undefined)?.senderId;
    for (const m of arr) {
      if (!('id' in m)) continue;
      if (m.senderId === me) continue;
      if (m.state === 'read') continue;
      wsClient.sendMessageRead({ messageId: m.id, chatId });
    }
  },
}));
