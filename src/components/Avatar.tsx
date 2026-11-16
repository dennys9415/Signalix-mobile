import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '~/lib/theme';
import { mediaUrl } from '~/lib/config';

const PALETTE = ['#7c6fc4', '#5b8fb0', '#4f9a8a', '#b0866a', '#b06a8f', '#6a7fb0', '#8a6ab0', '#5fa3a0'];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (seed.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

interface Props {
  name: string;
  uri?: string | undefined;
  size?: number;
  online?: boolean;
  /** Light ring around the photo, as in the hero contact row. */
  ring?: boolean;
  /** Background behind the online dot border (match the surface). */
  surface?: string;
}

export function Avatar({ name, uri, size = 48, online = false, ring = false, surface = colors.bg }: Props) {
  const inner = ring ? size - 6 : size;
  const resolved = mediaUrl(uri);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        ...(ring ? { borderWidth: 3, borderColor: 'rgba(255,255,255,0.55)' } : {}),
      }}
    >
      {resolved ? (
        <Image
          source={{ uri: resolved }}
          style={{ width: inner, height: inner, borderRadius: inner / 2 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View
          style={{
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            backgroundColor: colorFor(name),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: inner * 0.36 }}>{initials(name)}</Text>
        </View>
      )}
      {online && (
        <View
          style={{
            position: 'absolute',
            right: size * 0.02,
            bottom: size * 0.02,
            width: size * 0.24,
            height: size * 0.24,
            borderRadius: size * 0.12,
            backgroundColor: colors.online,
            borderWidth: 2,
            borderColor: surface,
          }}
        />
      )}
    </View>
  );
}
