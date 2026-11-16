// v0.16.0 — WS client. React Native's `WebSocket` global is a polyfill
// that wraps okhttp on Android / NSURLSession on iOS, so the same
// client code from the web works once we strip the browser-only bits.
//
// Heartbeat every 30s (matches web v0.14.0). Auto-reconnect after 3s
// on close. The chat store subscribes via `setHandler`.

import {
  ClientEvent,
  ServerEvent,
  type ClientCallAcceptPayload,
  type ClientCallHangupPayload,
  type ClientCallIceCandidatePayload,
  type ClientCallInvitePayload,
  type ClientCallMediaUpdatePayload,
  type ClientCallRejectPayload,
  type ClientCallRingingPayload,
  type ClientMessageSendPayload,
  type MessageStatusPayload,
  type WsAuthenticatePayload,
  type WsHeartbeatPayload,
} from '@signalix/contracts';
import { config } from '~/lib/config';

type ServerEventHandler = (event: string, payload: unknown) => void;

const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 3_000;

class WsClient {
  private socket: WebSocket | null = null;
  private accessToken: string | null = null;
  private handler: ServerEventHandler | null = null;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  setHandler(handler: ServerEventHandler): void {
    this.handler = handler;
  }

  connect(accessToken: string): void {
    this.accessToken = accessToken;
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.socket) { this.socket.close(); this.socket = null; }
    this.accessToken = null;
  }

  send(event: string, payload: unknown): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ event, payload }));
    return true;
  }

  isConnected(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  /* convenience wrappers */
  sendMessageSend(p: ClientMessageSendPayload): boolean { return this.send(ClientEvent.MESSAGE_SEND, p); }
  // v0.17.0 — call signaling (same events as the web client)
  sendCallInvite(p: ClientCallInvitePayload): boolean { return this.send(ClientEvent.CALL_INVITE, p); }
  sendCallRinging(p: ClientCallRingingPayload): boolean { return this.send(ClientEvent.CALL_RINGING, p); }
  sendCallAccept(p: ClientCallAcceptPayload): boolean { return this.send(ClientEvent.CALL_ACCEPT, p); }
  sendCallReject(p: ClientCallRejectPayload): boolean { return this.send(ClientEvent.CALL_REJECT, p); }
  sendCallHangup(p: ClientCallHangupPayload): boolean { return this.send(ClientEvent.CALL_HANGUP, p); }
  sendCallIceCandidate(p: ClientCallIceCandidatePayload): boolean { return this.send(ClientEvent.CALL_ICE_CANDIDATE, p); }
  sendCallMediaUpdate(p: ClientCallMediaUpdatePayload): boolean { return this.send(ClientEvent.CALL_MEDIA_UPDATE, p); }
  sendMessageDelivered(p: Pick<MessageStatusPayload, 'messageId' | 'chatId'>): boolean { return this.send(ClientEvent.MESSAGE_DELIVERED, p); }
  sendMessageRead(p: Pick<MessageStatusPayload, 'messageId' | 'chatId'>): boolean { return this.send(ClientEvent.MESSAGE_READ, p); }
  sendHeartbeat(): boolean {
    const p: WsHeartbeatPayload = { timestamp: new Date().toISOString() };
    return this.send(ClientEvent.HEARTBEAT, p);
  }

  private openSocket(): void {
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }
    const ws = new WebSocket(config.wsUrl);
    this.socket = ws;

    ws.onopen = () => {
      if (!this.accessToken) return;
      const p: WsAuthenticatePayload = { accessToken: this.accessToken };
      ws.send(JSON.stringify({ event: ClientEvent.AUTHENTICATE, payload: p }));
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (this.isConnected()) this.sendHeartbeat();
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (ev: WebSocketMessageEvent) => {
      let msg: { event: string; payload: unknown };
      try {
        msg = JSON.parse(ev.data as string) as { event: string; payload: unknown };
      } catch {
        return;
      }
      this.handler?.(msg.event, msg.payload);
    };

    ws.onclose = () => {
      this.socket = null;
      if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.openSocket(), RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }
}

export const wsClient = new WsClient();
export { ServerEvent };
