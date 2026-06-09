import { useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatType, type ChatDTO } from '@signalix/contracts';
import type { AppStackParamList } from '~/navigation/RootNavigator';
import { useAuthStore } from '~/store/auth.store';
import { useChatStore } from '~/store/chat.store';
import { colors, radius, spacing } from '~/lib/theme';
import { formatChatTime } from '~/lib/format';

export function ChatsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const session = useAuthStore((s) => s.session);
  const currentUserId = session?.userId ?? '';
  const chats = useChatStore((s) => s.chats);
  const messagesMap = useChatStore((s) => s.messages);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const presence = useChatStore((s) => s.presence);
  const loading = useChatStore((s) => s.loading);
  const loadChats = useChatStore((s) => s.loadChats);

  const sorted = useMemo(() => {
    return [...chats].sort((a, b) => {
      const aLast = lastTimestamp(messagesMap[a.id]) ?? a.createdAt;
      const bLast = lastTimestamp(messagesMap[b.id]) ?? b.createdAt;
      return bLast.localeCompare(aLast);
    });
  }, [chats, messagesMap]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right']}>
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatRow
            chat={item}
            currentUserId={currentUserId}
            unread={unreadCounts[item.id] ?? 0}
            isOnline={isPeerOnline(item, currentUserId, presence)}
            lastMessage={lastMessagePreview(messagesMap[item.id])}
            lastTime={lastTimestamp(messagesMap[item.id]) ?? item.createdAt}
            onPress={() => navigation.navigate('Conversation', {
              chatId: item.id,
              chatLabel: chatLabel(item, currentUserId),
            })}
          />
        )}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 76 }} />
        )}
        ListEmptyComponent={
          <View style={{ padding: spacing.xl * 2, alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted }}>No conversations yet.</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadChats} tintColor={colors.accent} />
        }
      />
    </SafeAreaView>
  );
}

interface RowProps {
  chat: ChatDTO;
  currentUserId: string;
  unread: number;
  isOnline: boolean;
  lastMessage: string;
  lastTime: string;
  onPress: () => void;
}

function ChatRow({ chat, currentUserId, unread, isOnline, lastMessage, lastTime, onPress }: RowProps) {
  const label = chatLabel(chat, currentUserId);
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', padding: spacing.lg, gap: spacing.md, alignItems: 'center' }}>
      <View style={{ width: 48, height: 48, borderRadius: radius.xl, backgroundColor: colors.bgElev, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, position: 'relative' }}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{initials(label)}</Text>
        {isOnline && (
          <View style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#34c759', borderWidth: 2, borderColor: colors.bg }} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 }}>{label}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{formatChatTime(lastTime)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 }}>
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>{lastMessage}</Text>
          {unread > 0 && (
            <View style={{ minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* helpers */

function chatLabel(chat: ChatDTO, currentUserId: string): string {
  if (chat.type === ChatType.GROUP) return chat.title ?? 'Group';
  const other = chat.participants.find((p) => p.userId !== currentUserId);
  return other?.user?.displayName ?? other?.user?.username ?? 'Direct chat';
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}

function lastMessagePreview(msgs: ReturnType<typeof useChatStore.getState>['messages'][string] | undefined): string {
  if (!msgs || msgs.length === 0) return 'No messages yet';
  const last = msgs[msgs.length - 1];
  const text = last.ciphertext;
  if (!text) return '(media)';
  if (text.length > 80) return `${text.slice(0, 80)}…`;
  return text;
}

function lastTimestamp(msgs: ReturnType<typeof useChatStore.getState>['messages'][string] | undefined): string | null {
  if (!msgs || msgs.length === 0) return null;
  return msgs[msgs.length - 1].createdAt;
}

function isPeerOnline(chat: ChatDTO, currentUserId: string, presence: Record<string, 'online' | 'offline'>): boolean {
  if (chat.type !== ChatType.DIRECT) return false;
  const other = chat.participants.find((p) => p.userId !== currentUserId);
  return other ? presence[other.userId] === 'online' : false;
}
