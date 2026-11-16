// v0.17.0 — 1:1 voice / video calls on mobile (react-native-webrtc).
//
// Port of Signalix-frontend/src/store/call.store.ts: same signaling over the
// realtime WebSocket (Signalix-contracts/protocol/call-flow.md), same TURN
// credentials from the API, so web and mobile can call each other.
// Needs a development build — react-native-webrtc is not in Expo Go.
//
// Non-serializable WebRTC objects live in module scope, not in the store.

import { create } from 'zustand';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
  type MediaStream,
} from 'react-native-webrtc';
import {
  CallEndReason,
  CallType,
  ServerEvent,
  type IceCandidateDTO,
  type ServerCallAcceptedPayload,
  type ServerCallEndedPayload,
  type ServerCallIceCandidatePayload,
  type ServerCallIncomingPayload,
  type ServerCallMediaUpdatePayload,
  type SessionDescriptionDTO,
} from '@signalix/contracts';
import { api } from '~/services/api-client';
import { wsClient } from '~/services/ws-client';
import { uuidv4 } from '~/lib/uuid';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

const ENDED_SCREEN_MS = 2_500;
const DISCONNECTED_GRACE_MS = 8_000;

interface CallState {
  phase: CallPhase;
  callId: string | null;
  chatId: string | null;
  peerUserId: string | null;
  callType: CallType;
  direction: 'outgoing' | 'incoming' | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  peerAudioEnabled: boolean;
  peerVideoEnabled: boolean;
  peerRinging: boolean;
  connectedAt: number | null;
  endReason: CallEndReason | null;
  error: string | null;

  startCall: (chatId: string, peerUserId: string, callType: CallType) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  hangUp: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
  dismiss: () => void;
  handleServerEvent: (event: string, payload: unknown) => void;
}

type CallActions = Pick<
  CallState,
  'startCall' | 'acceptCall' | 'rejectCall' | 'hangUp' | 'toggleMic' | 'toggleCamera' | 'switchCamera' | 'dismiss' | 'handleServerEvent'
>;

const IDLE: Omit<CallState, keyof CallActions> = {
  phase: 'idle',
  callId: null,
  chatId: null,
  peerUserId: null,
  callType: CallType.AUDIO,
  direction: null,
  localStream: null,
  remoteStream: null,
  micEnabled: true,
  cameraEnabled: false,
  peerAudioEnabled: true,
  peerVideoEnabled: false,
  peerRinging: false,
  connectedAt: null,
  endReason: null,
  error: null,
};

// ── WebRTC internals (module scope) ──
let pc: RTCPeerConnection | null = null;
let incomingOffer: SessionDescriptionDTO | null = null;
let pendingLocalCandidates: IceCandidateDTO[] = [];
let pendingRemoteCandidates: IceCandidateDTO[] = [];
let canSendCandidates = false;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
let endedTimer: ReturnType<typeof setTimeout> | null = null;

async function getMedia(callType: CallType): Promise<MediaStream> {
  try {
    return await mediaDevices.getUserMedia({
      audio: true,
      video: callType === CallType.VIDEO ? { facingMode: 'user', width: 1280, height: 720, frameRate: 30 } : false,
    });
  } catch {
    throw new Error(callType === CallType.VIDEO
      ? 'Camera and microphone access is needed. Enable it in Settings → Signalix.'
      : 'Microphone access is needed. Enable it in Settings → Signalix.');
  }
}

async function getIceServers() {
  try {
    return (await api.getIceServers()).iceServers;
  } catch {
    return []; // host candidates still work on the same network
  }
}

function releaseMedia(): void {
  if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
  if (pc) {
    pc.close();
    pc = null;
  }
  incomingOffer = null;
  pendingLocalCandidates = [];
  pendingRemoteCandidates = [];
  canSendCandidates = false;
}

export const useCallStore = create<CallState>()((set, get) => {
  function isCurrent(callId: string): boolean {
    return get().callId === callId && get().phase !== 'ended' && get().phase !== 'idle';
  }

  function sendLocalCandidate(candidate: IceCandidateDTO): void {
    const callId = get().callId;
    if (!callId) return;
    if (canSendCandidates) wsClient.sendCallIceCandidate({ callId, candidate });
    else pendingLocalCandidates.push(candidate);
  }

  function flushLocalCandidates(): void {
    canSendCandidates = true;
    const callId = get().callId;
    const queued = pendingLocalCandidates;
    pendingLocalCandidates = [];
    if (!callId) return;
    for (const candidate of queued) wsClient.sendCallIceCandidate({ callId, candidate });
  }

  async function flushRemoteCandidates(): Promise<void> {
    const queued = pendingRemoteCandidates;
    pendingRemoteCandidates = [];
    for (const c of queued) await pc?.addIceCandidate(c).catch(() => {});
  }

  function createPeer(iceServers: Awaited<ReturnType<typeof getIceServers>>, callId: string): RTCPeerConnection {
    const peer = new RTCPeerConnection({ iceServers });

    peer.addEventListener('icecandidate', (e) => {
      const c = e.candidate;
      if (c) sendLocalCandidate({ candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null });
    });

    peer.addEventListener('track', (e) => {
      const stream = e.streams[0];
      if (stream) set({ remoteStream: stream });
    });

    peer.addEventListener('connectionstatechange', () => {
      if (!isCurrent(callId)) return;
      const state = peer.connectionState;
      if (state === 'connected') {
        if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
        set((s) => ({ phase: 'active', connectedAt: s.connectedAt ?? Date.now() }));
      } else if (state === 'disconnected') {
        // Often transient (Wi-Fi ↔ cellular). Give ICE a moment to recover.
        disconnectTimer ??= setTimeout(() => {
          disconnectTimer = null;
          if (isCurrent(callId) && peer.connectionState !== 'connected') endLocally(CallEndReason.FAILED, true);
        }, DISCONNECTED_GRACE_MS);
      } else if (state === 'failed') {
        endLocally(CallEndReason.FAILED, true);
      }
    });

    return peer;
  }

  function showEnded(reason: CallEndReason | null, error: string | null = null): void {
    releaseMedia();
    get().localStream?.getTracks().forEach((t) => t.stop());
    get().localStream?.release();
    set({ phase: 'ended', endReason: reason, error, localStream: null, remoteStream: null });
    if (endedTimer) clearTimeout(endedTimer);
    endedTimer = setTimeout(() => {
      endedTimer = null;
      if (get().phase === 'ended') set({ ...IDLE });
    }, ENDED_SCREEN_MS);
  }

  function endLocally(reason: CallEndReason, notifyServer: boolean, error: string | null = null): void {
    const { callId } = get();
    if (callId && notifyServer) {
      wsClient.sendCallHangup({ callId, ...(reason === CallEndReason.FAILED && { reason: CallEndReason.FAILED }) });
    }
    showEnded(reason, error);
  }

  function resetForNewCall(): void {
    if (endedTimer) { clearTimeout(endedTimer); endedTimer = null; }
    releaseMedia();
  }

  return {
    ...IDLE,

    async startCall(chatId, peerUserId, callType) {
      const { phase } = get();
      if (phase !== 'idle' && phase !== 'ended') return;
      resetForNewCall();

      const callId = uuidv4();
      set({
        ...IDLE,
        phase: 'outgoing',
        direction: 'outgoing',
        callId,
        chatId,
        peerUserId,
        callType,
        cameraEnabled: callType === CallType.VIDEO,
        peerVideoEnabled: callType === CallType.VIDEO,
      });

      let stream: MediaStream;
      try {
        stream = await getMedia(callType);
      } catch (err) {
        if (isCurrent(callId)) showEnded(CallEndReason.FAILED, (err as Error).message);
        return;
      }
      if (!isCurrent(callId)) { stream.getTracks().forEach((t) => t.stop()); return; }
      set({ localStream: stream });

      const iceServers = await getIceServers();
      if (!isCurrent(callId)) return;

      try {
        pc = createPeer(iceServers, callId);
        stream.getTracks().forEach((track) => pc!.addTrack(track, stream));
        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        if (!isCurrent(callId)) return;

        const sent = wsClient.sendCallInvite({ callId, chatId, callType, offer: { type: 'offer', sdp: offer.sdp ?? '' } });
        if (!sent) showEnded(CallEndReason.FAILED, 'You are offline. Check your connection.');
      } catch {
        if (isCurrent(callId)) showEnded(CallEndReason.FAILED, 'Could not start the call.');
      }
    },

    async acceptCall() {
      const { callId, callType, phase } = get();
      if (phase !== 'incoming' || !callId || !incomingOffer) return;
      const offer = incomingOffer;
      set({ phase: 'connecting' });

      let stream: MediaStream;
      try {
        stream = await getMedia(callType);
      } catch (err) {
        wsClient.sendCallReject({ callId });
        if (isCurrent(callId)) showEnded(CallEndReason.FAILED, (err as Error).message);
        return;
      }
      if (!isCurrent(callId)) { stream.getTracks().forEach((t) => t.stop()); return; }
      set({ localStream: stream });

      const iceServers = await getIceServers();
      if (!isCurrent(callId)) return;

      try {
        pc = createPeer(iceServers, callId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        stream.getTracks().forEach((track) => pc!.addTrack(track, stream));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (!isCurrent(callId)) return;

        const sent = wsClient.sendCallAccept({ callId, answer: { type: 'answer', sdp: answer.sdp ?? '' } });
        if (!sent) {
          showEnded(CallEndReason.FAILED, 'You are offline. Check your connection.');
          return;
        }
        flushLocalCandidates();
        await flushRemoteCandidates();
      } catch {
        if (isCurrent(callId)) endLocally(CallEndReason.FAILED, true, 'Could not connect the call.');
      }
    },

    rejectCall() {
      const { callId, phase } = get();
      if (phase !== 'incoming' || !callId) return;
      wsClient.sendCallReject({ callId });
      showEnded(CallEndReason.REJECTED);
    },

    hangUp() {
      const { phase, direction } = get();
      if (phase === 'incoming') { get().rejectCall(); return; }
      if (phase === 'idle' || phase === 'ended') return;
      const answered = phase === 'active' || (phase === 'connecting' && direction === 'incoming');
      endLocally(answered ? CallEndReason.COMPLETED : CallEndReason.CANCELLED, true);
    },

    toggleMic() {
      const { localStream, callId, micEnabled, cameraEnabled } = get();
      const next = !micEnabled;
      localStream?.getAudioTracks().forEach((t) => { t.enabled = next; });
      set({ micEnabled: next });
      if (callId) wsClient.sendCallMediaUpdate({ callId, audioEnabled: next, videoEnabled: cameraEnabled });
    },

    toggleCamera() {
      const { localStream, callId, micEnabled, cameraEnabled, callType } = get();
      if (callType !== CallType.VIDEO) return;
      const next = !cameraEnabled;
      localStream?.getVideoTracks().forEach((t) => { t.enabled = next; });
      set({ cameraEnabled: next });
      if (callId) wsClient.sendCallMediaUpdate({ callId, audioEnabled: micEnabled, videoEnabled: next });
    },

    switchCamera() {
      get().localStream?.getVideoTracks().forEach((t) => t._switchCamera());
    },

    dismiss() {
      if (get().phase !== 'ended') return;
      if (endedTimer) { clearTimeout(endedTimer); endedTimer = null; }
      set({ ...IDLE });
    },

    handleServerEvent(event, payload) {
      const state = get();

      if (event === ServerEvent.CALL_INCOMING) {
        const p = payload as ServerCallIncomingPayload;
        if (state.phase !== 'idle' && state.phase !== 'ended') return;
        resetForNewCall();
        incomingOffer = p.offer;
        set({
          ...IDLE,
          phase: 'incoming',
          direction: 'incoming',
          callId: p.callId,
          chatId: p.chatId,
          peerUserId: p.callerId,
          callType: p.callType,
          cameraEnabled: p.callType === CallType.VIDEO,
          peerVideoEnabled: p.callType === CallType.VIDEO,
        });
        wsClient.sendCallRinging({ callId: p.callId });
        return;
      }

      const callId = (payload as { callId?: string } | null)?.callId;
      if (!callId || callId !== state.callId) return;

      switch (event) {
        case ServerEvent.CALL_RINGING:
          if (state.phase === 'outgoing') set({ peerRinging: true });
          break;
        case ServerEvent.CALL_ACCEPTED: {
          const p = payload as ServerCallAcceptedPayload;
          if (state.phase !== 'outgoing' || !pc) break;
          set({ phase: 'connecting' });
          void (async () => {
            try {
              await pc!.setRemoteDescription(new RTCSessionDescription(p.answer));
              flushLocalCandidates();
              await flushRemoteCandidates();
            } catch {
              if (isCurrent(callId)) endLocally(CallEndReason.FAILED, true, 'Could not connect the call.');
            }
          })();
          break;
        }
        case ServerEvent.CALL_ICE_CANDIDATE: {
          const p = payload as ServerCallIceCandidatePayload;
          if (pc?.remoteDescription) void pc.addIceCandidate(p.candidate).catch(() => {});
          else pendingRemoteCandidates.push(p.candidate);
          break;
        }
        case ServerEvent.CALL_MEDIA_UPDATE: {
          const p = payload as ServerCallMediaUpdatePayload;
          set({ peerAudioEnabled: p.audioEnabled, peerVideoEnabled: p.videoEnabled });
          break;
        }
        case ServerEvent.CALL_ANSWERED_ELSEWHERE:
          releaseMedia();
          state.localStream?.getTracks().forEach((t) => t.stop());
          set({ ...IDLE });
          break;
        case ServerEvent.CALL_ENDED: {
          const p = payload as ServerCallEndedPayload;
          if (state.phase === 'ended' || state.phase === 'idle') break;
          showEnded(p.reason);
          break;
        }
      }
    },
  };
});

export function describeEndReason(reason: CallEndReason | null, direction: CallState['direction']): string {
  switch (reason) {
    case CallEndReason.BUSY: return 'Busy';
    case CallEndReason.REJECTED: return direction === 'outgoing' ? 'Call declined' : 'Declined';
    case CallEndReason.MISSED: return direction === 'outgoing' ? 'No answer' : 'Missed call';
    case CallEndReason.UNAVAILABLE: return 'Unavailable';
    case CallEndReason.CANCELLED: return 'Call cancelled';
    case CallEndReason.FAILED: return 'Call failed';
    default: return 'Call ended';
  }
}
