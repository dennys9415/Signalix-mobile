// FILE and AUDIO message bodies. Both download the encrypted blob, decrypt it
// on device (lib/attachments.ts) and then open / play the local copy.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Share, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { decryptToCache, formatBytes, type MediaMetadataV1 } from '~/lib/attachments';
import { colors, spacing } from '~/lib/theme';

/** Tap → decrypt → iOS share sheet (Save to Files, open in another app, …). */
export function FileAttachment({ meta }: { meta: MediaMetadataV1 }) {
  const [busy, setBusy] = useState(false);
  const name = meta.filename ?? 'File';

  async function open() {
    setBusy(true);
    try {
      const uri = await decryptToCache(meta, name);
      await Share.share({ url: uri, title: name });
    } catch (e) {
      Alert.alert('Could not open the file', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <TouchableOpacity onPress={() => void open()} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4, minWidth: 200 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="file-text" size={20} color={colors.text} />}
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={2} style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{name}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>{formatBytes(meta.size)} · Tap to open</Text>
      </View>
    </TouchableOpacity>
  );
}

/** Play / pause a voice note. Chrome records WebM/Opus, which iOS can't decode. */
export function VoiceNote({ meta }: { meta: MediaMetadataV1 }) {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const unsupported = meta.mime.includes('webm');

  // Start playback once the decrypted file is loaded after the first tap.
  useEffect(() => {
    if (uri && status.isLoaded && !status.playing && status.currentTime === 0) player.play();
  }, [uri, status.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle() {
    if (unsupported) {
      Alert.alert('Voice message', 'This voice message was recorded in a format iPhone can’t play (WebM). Open it on the web.');
      return;
    }
    if (!uri) {
      setLoading(true);
      try {
        setUri(await decryptToCache(meta, 'voice.m4a'));
      } catch (e) {
        Alert.alert('Could not play the voice message', (e as Error).message);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) player.seekTo(0);
      player.play();
    }
  }

  const total = meta.duration ?? (status.duration || 0);
  const shown = status.playing || status.currentTime > 0 ? status.currentTime : total;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 200, paddingVertical: 2 }}>
      <TouchableOpacity accessibilityLabel={status.playing ? 'Pause' : 'Play voice message'} onPress={() => void toggle()} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name={status.playing ? 'pause' : 'play'} size={18} color={colors.text} />}
      </TouchableOpacity>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
          <View style={{ width: `${progress * 100}%`, height: 4, backgroundColor: '#fff' }} />
        </View>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>{unsupported ? 'Voice message (web format)' : clock(shown)}</Text>
      </View>
    </View>
  );
}

function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
