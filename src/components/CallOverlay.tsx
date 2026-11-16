// Full-screen call UI (incoming / outgoing / connecting / active / ended).
// Renders nothing while idle. Mirrors the web CallOverlay.

import { useEffect, useState } from 'react';
import { Modal, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { RTCView } from 'react-native-webrtc';
import { CallType } from '@signalix/contracts';
import { describeEndReason, useCallStore } from '~/store/call.store';
import { useChatStore } from '~/store/chat.store';
import { Avatar } from '~/components/Avatar';
import { canvasGradient, colors, spacing } from '~/lib/theme';

export function CallOverlay() {
  const insets = useSafeAreaInsets();
  const s = useCallStore();
  const peer = useChatStore((st) => st.chats
    .find((c) => c.id === s.chatId)?.participants.find((p) => p.userId === s.peerUserId)?.user);
  const elapsed = useElapsed(s.connectedAt);

  // Vibrate while an incoming call rings.
  useEffect(() => {
    if (s.phase !== 'incoming') return;
    Vibration.vibrate([0, 800, 1200], true);
    return () => Vibration.cancel();
  }, [s.phase]);

  if (s.phase === 'idle') return null;

  const name = peer?.displayName ?? peer?.username ?? 'Signalix';
  const isVideo = s.callType === CallType.VIDEO;
  const showRemoteVideo = isVideo && !!s.remoteStream && s.peerVideoEnabled && s.phase === 'active';
  const showLocalVideo = isVideo && !!s.localStream && s.cameraEnabled && s.phase !== 'ended';

  let status: string;
  switch (s.phase) {
    case 'incoming': status = isVideo ? 'Incoming video call…' : 'Incoming voice call…'; break;
    case 'outgoing': status = s.peerRinging ? 'Ringing…' : 'Calling…'; break;
    case 'connecting': status = 'Connecting…'; break;
    case 'active': status = elapsed; break;
    default: status = s.error ?? describeEndReason(s.endReason, s.direction);
  }

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={s.hangUp} supportedOrientations={['portrait']}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {showRemoteVideo ? (
          <RTCView streamURL={s.remoteStream!.toURL()} objectFit="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        ) : (
          <LinearGradient colors={canvasGradient} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        )}

        {/* Peer header */}
        <View style={{ paddingTop: insets.top + spacing.xl, alignItems: 'center', gap: spacing.sm }}>
          {!showRemoteVideo && <Avatar name={name} uri={peer?.avatarUrl} size={120} ring />}
          <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: spacing.md, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 }}>{name}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 }}>{status}</Text>
          {s.phase === 'active' && !s.peerAudioEnabled && <Badge icon="mic-off" text={`${name} is muted`} />}
          {s.phase === 'active' && isVideo && !s.peerVideoEnabled && <Badge icon="video-off" text="Camera off" />}
        </View>

        {/* Self view */}
        {showLocalVideo && (
          <View style={{ position: 'absolute', top: insets.top + spacing.lg, right: spacing.lg, width: 110, height: 160, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
            <RTCView streamURL={s.localStream!.toURL()} objectFit="cover" mirror zOrder={1} style={{ flex: 1 }} />
          </View>
        )}

        {/* Controls */}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + spacing.xl * 1.5, flexDirection: 'row', justifyContent: 'center', gap: spacing.xl }}>
          {s.phase === 'incoming' ? (
            <>
              <Control icon="phone-off" label="Decline" color="#e5484d" onPress={s.rejectCall} />
              <Control icon={isVideo ? 'video' : 'phone'} label="Accept" color="#30a46c" onPress={() => void s.acceptCall()} />
            </>
          ) : s.phase === 'ended' ? (
            <Control icon="x" label="Close" color="rgba(30,30,38,0.6)" onPress={s.dismiss} />
          ) : (
            <>
              <Control icon={s.micEnabled ? 'mic' : 'mic-off'} label={s.micEnabled ? 'Mute' : 'Unmute'} active={!s.micEnabled} onPress={s.toggleMic} />
              {isVideo && <Control icon={s.cameraEnabled ? 'video' : 'video-off'} label={s.cameraEnabled ? 'Camera' : 'Camera off'} active={!s.cameraEnabled} onPress={s.toggleCamera} />}
              {isVideo && <Control icon="refresh-ccw" label="Flip" onPress={s.switchCamera} />}
              <Control icon="phone-off" label="End" color="#e5484d" onPress={s.hangUp} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Control({ icon, label, onPress, color, active }: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  active?: boolean;
}) {
  return (
    <TouchableOpacity accessibilityLabel={label} onPress={onPress} style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: color ?? (active ? '#ffffff' : 'rgba(30,30,38,0.55)'), borderWidth: color ? 0 : 1, borderColor: 'rgba(255,255,255,0.2)' }}>
        <Feather name={icon} size={26} color={active && !color ? '#111' : '#fff'} />
      </View>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Badge({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(30,30,38,0.55)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginTop: 4 }}>
      <Feather name={icon} size={14} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 13 }}>{text}</Text>
    </View>
  );
}

function useElapsed(since: number | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return '';
  const total = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
