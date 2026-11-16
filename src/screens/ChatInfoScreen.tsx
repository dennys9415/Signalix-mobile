import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CallType, ChatType, ParticipantRole } from '@signalix/contracts';
import type { AppStackParamList } from '~/navigation/RootNavigator';
import { useAuthStore } from '~/store/auth.store';
import { useChatStore } from '~/store/chat.store';
import { useCallStore } from '~/store/call.store';
import { Avatar } from '~/components/Avatar';
import { Section, Row } from '~/components/Section';
import { colors, heroGradient, radius, spacing } from '~/lib/theme';

type Props = NativeStackScreenProps<AppStackParamList, 'ChatInfo'>;

/** Contact profile for a direct chat, or group details for a group. */
export function ChatInfoScreen({ route, navigation }: Props) {
  // Opened from the conversation → go back to it; from the chat list → open the chat.
  function openChat() {
    const routes = navigation.getState().routes;
    if (routes[routes.length - 2]?.name === 'Conversation') navigation.goBack();
    else navigation.replace('Conversation', { chatId: route.params.chatId });
  }
  const insets = useSafeAreaInsets();
  const currentUserId = useAuthStore((s) => s.session?.userId ?? '');
  const chat = useChatStore((s) => s.chats.find((c) => c.id === route.params.chatId));
  const presence = useChatStore((s) => s.presence);

  if (!chat) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const isGroup = chat.type === ChatType.GROUP;
  const peer = isGroup ? undefined : chat.participants.find((p) => p.userId !== currentUserId)?.user;
  const name = isGroup ? (chat.title ?? 'Group') : (peer?.displayName ?? peer?.username ?? 'Contact');
  const avatar = isGroup ? chat.avatarUrl : peer?.avatarUrl;
  const online = !!peer && presence[peer.id] === 'online';

  const startCall = useCallStore((s) => s.startCall);
  const call = (type: CallType) => { if (peer) void startCall(chat.id, peer.id, type); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xl * 1.5, borderBottomLeftRadius: radius.xxl, borderBottomRightRadius: radius.xxl, alignItems: 'center' }}
        >
          <View style={{ alignSelf: 'stretch', flexDirection: 'row', paddingHorizontal: spacing.xl }}>
            <TouchableOpacity accessibilityLabel="Back" onPress={() => navigation.goBack()} hitSlop={12}>
              <Feather name="arrow-left" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Avatar name={name} uri={avatar} size={128} ring online={online} surface="#a3a6cc" />
          </View>
          <Text style={{ color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -1.2, marginTop: spacing.lg, textAlign: 'center', paddingHorizontal: spacing.xl }}>{name}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, marginTop: 2 }}>
            {isGroup ? `${chat.participants.length} members` : `@${peer?.username ?? ''}${online ? ' · Online' : ''}`}
          </Text>

          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
            <Action icon="message-circle" label="Message" onPress={openChat} />
            {!isGroup && <Action icon="phone" label="Call" onPress={() => call(CallType.AUDIO)} />}
            {!isGroup && <Action icon="video" label="Video" onPress={() => call(CallType.VIDEO)} />}
          </View>
        </LinearGradient>

        <View style={{ padding: spacing.lg, paddingTop: spacing.xl }}>
          {isGroup && chat.description ? (
            <Section label="Description">
              <Text style={{ color: colors.text, fontSize: 15, padding: spacing.lg }}>{chat.description}</Text>
            </Section>
          ) : null}

          {isGroup ? (
            <Section label="Members">
              {chat.participants.map((p, i) => {
                const n = p.user?.displayName ?? p.user?.username ?? 'Member';
                return (
                  <View key={p.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: i === chat.participants.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
                    <Avatar name={n} uri={p.user?.avatarUrl} size={40} surface={colors.bgElev} online={presence[p.userId] === 'online'} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{p.userId === currentUserId ? `${n} (you)` : n}</Text>
                      {p.user && <Text style={{ color: colors.textMuted, fontSize: 13 }}>@{p.user.username}</Text>}
                    </View>
                    {p.role !== ParticipantRole.MEMBER && (
                      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>{p.role}</Text>
                    )}
                  </View>
                );
              })}
            </Section>
          ) : (
            <Section label="Contact">
              <Row label="Username" value={`@${peer?.username ?? ''}`} />
              <Row label="Display name" value={peer?.displayName ?? '—'} />
              <Row label="Chat started" value={new Date(chat.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} last />
            </Section>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ alignItems: 'center', width: 76, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.glassDark }}>
      <Feather name={icon} size={20} color={colors.text} />
      <Text style={{ color: colors.text, fontSize: 12, marginTop: 4 }}>{label}</Text>
    </TouchableOpacity>
  );
}
