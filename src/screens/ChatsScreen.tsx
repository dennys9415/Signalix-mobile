import { useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatType, MessageType, type ChatDTO, type PublicUserDTO } from '@signalix/contracts';
import type { AppStackParamList } from '~/navigation/RootNavigator';
import { useAuthStore } from '~/store/auth.store';
import { useChatStore, type StoredMessage } from '~/store/chat.store';
import { Avatar } from '~/components/Avatar';
import { useChatActions } from '~/hooks/useChatActions';
import { colors, display, heroGradient, radius, spacing } from '~/lib/theme';
import { formatChatTime } from '~/lib/format';

type Nav = NativeStackNavigationProp<AppStackParamList>;

interface Row {
  chat: ChatDTO;
  label: string;
  avatarUrl: string | undefined;
  peer: PublicUserDTO | undefined;
  online: boolean;
  preview: string;
  time: string;
  unread: number;
}

export function ChatsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const currentUserId = useAuthStore((s) => s.session?.userId ?? '');
  const chats = useChatStore((s) => s.chats);
  const messagesMap = useChatStore((s) => s.messages);
  const previews = useChatStore((s) => s.previews);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const presence = useChatStore((s) => s.presence);
  const loading = useChatStore((s) => s.loading);
  const loadChats = useChatStore((s) => s.loadChats);
  const [query, setQuery] = useState('');
  const { openChatMenu, confirmDelete } = useChatActions();

  const rows = useMemo<Row[]>(() => {
    const list = chats.map((chat) => {
      const peer = directPeer(chat, currentUserId);
      const last = lastOf(messagesMap[chat.id]) ?? previews[chat.id];
      return {
        chat,
        label: chatLabel(chat, peer),
        avatarUrl: chat.type === ChatType.GROUP ? chat.avatarUrl : peer?.avatarUrl,
        peer,
        online: !!peer && presence[peer.id] === 'online',
        preview: last ? previewText(last, currentUserId) : 'Say hi 👋',
        time: last?.createdAt ?? chat.createdAt,
        unread: unreadCounts[chat.id] ?? 0,
      };
    });
    list.sort((a, b) => b.time.localeCompare(a.time));
    const q = query.trim().toLowerCase();
    return q ? list.filter((r) => r.label.toLowerCase().includes(q) || r.peer?.username.toLowerCase().includes(q)) : list;
  }, [chats, messagesMap, previews, unreadCounts, presence, currentUserId, query]);

  const contacts = useMemo(() => rows.filter((r) => r.peer), [rows]);

  function open(r: Row) {
    navigation.navigate('Conversation', { chatId: r.chat.id, chatLabel: r.label });
  }

  const hero = (
    <LinearGradient
      colors={heroGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        paddingTop: insets.top + spacing.md,
        paddingBottom: spacing.xl,
        borderBottomLeftRadius: radius.xxl,
        borderBottomRightRadius: radius.xxl,
        marginBottom: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.glass, borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 38, width: '58%' }}>
          <Feather name="search" size={16} color="rgba(255,255,255,0.85)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search..."
            placeholderTextColor="rgba(255,255,255,0.75)"
            style={{ flex: 1, color: colors.text, fontSize: 15 }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity accessibilityLabel="Profile and settings" onPress={() => navigation.navigate('Home', { screen: 'Settings' })} hitSlop={12}>
          <Feather name="chevron-down" size={26} color={colors.text} />
        </TouchableOpacity>
      </View>

      <Text style={[display, { paddingHorizontal: spacing.xl, marginTop: spacing.xl * 1.5 }]}>
        Let’s Stay{'\n'}Connected
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.lg, marginTop: spacing.xl }}
      >
        <TouchableOpacity accessibilityLabel="New chat" onPress={() => navigation.navigate('NewChat')} style={{ alignItems: 'center', width: 68 }}>
          <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="plus" size={20} color={colors.text} />
            </View>
          </View>
          <Text style={heroLabel}>Add</Text>
        </TouchableOpacity>
        {contacts.map((r) => (
          <TouchableOpacity key={r.chat.id} onPress={() => open(r)} style={{ alignItems: 'center', width: 68 }}>
            <Avatar name={r.label} uri={r.avatarUrl} size={68} ring />
            <Text style={heroLabel} numberOfLines={1}>{r.label.split(' ')[0]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </LinearGradient>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.chat.id}
        ListHeaderComponent={hero}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ChatRow
            row={item}
            onPress={() => open(item)}
            onMore={() => openChatMenu(item.chat, item.label)}
            onDelete={item.chat.type === ChatType.DIRECT ? () => confirmDelete(item.chat.id, item.label) : undefined}
          />
        )}
        ListEmptyComponent={
          <View style={{ padding: spacing.xl * 2, alignItems: 'center', gap: spacing.md }}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>
              {query ? 'No chats match your search.' : 'No conversations yet.'}
            </Text>
            {!query && (
              <TouchableOpacity onPress={() => navigation.navigate('NewChat')}>
                <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>Start a new chat</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadChats} tintColor={colors.text} />}
      />
    </View>
  );
}

/** Swipe left for "More" (contact info / clear / delete) and "Delete", like WhatsApp. */
function ChatRow({ row, onPress, onMore, onDelete }: { row: Row; onPress: () => void; onMore: () => void; onDelete: (() => void) | undefined }) {
  const swipe = useRef<SwipeableMethods>(null);
  const act = (fn: () => void) => () => { swipe.current?.close(); fn(); };
  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <View style={{ flexDirection: 'row' }}>
          <SwipeAction icon="more-horizontal" label="More" color="#3a3a44" onPress={act(onMore)} />
          {onDelete && <SwipeAction icon="trash-2" label="Delete" color="#d9434b" onPress={act(onDelete)} />}
        </View>
      )}
    >
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={{ flexDirection: 'row', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.lg, alignItems: 'center', backgroundColor: colors.bg }}>
      <Avatar name={row.label} uri={row.avatarUrl} size={54} online={row.online} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.3, flex: 1 }}>{row.label}</Text>
          <Text style={{ color: row.unread > 0 ? colors.accent : colors.textDim, fontSize: 12 }}>{formatChatTime(row.time)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 }}>
          <Text numberOfLines={1} style={{ color: row.unread > 0 ? colors.text : colors.textMuted, fontSize: 14, flex: 1 }}>{row.preview}</Text>
          {row.unread > 0 && (
            <View style={{ minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{row.unread > 99 ? '99+' : row.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
    </ReanimatedSwipeable>
  );
}

function SwipeAction({ icon, label, color, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityLabel={label} onPress={onPress} style={{ width: 78, backgroundColor: color, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <Feather name={icon} size={20} color={colors.text} />
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const heroLabel = { color: colors.text, fontSize: 12, marginTop: 6, fontWeight: '500' as const };

/* helpers */

function directPeer(chat: ChatDTO, currentUserId: string): PublicUserDTO | undefined {
  if (chat.type !== ChatType.DIRECT) return undefined;
  return chat.participants.find((p) => p.userId !== currentUserId)?.user;
}

function chatLabel(chat: ChatDTO, peer: PublicUserDTO | undefined): string {
  if (chat.type === ChatType.GROUP) return chat.title ?? 'Group';
  return peer?.displayName ?? peer?.username ?? 'Direct chat';
}

function lastOf(msgs: StoredMessage[] | undefined): StoredMessage | undefined {
  return msgs && msgs.length > 0 ? msgs[msgs.length - 1] : undefined;
}

function previewText(m: StoredMessage, currentUserId: string): string {
  const mine = 'senderId' in m ? m.senderId === currentUserId : true;
  const prefix = mine ? 'You: ' : '';
  switch (m.messageType) {
    case MessageType.IMAGE: return `${prefix}📷 Photo`;
    case MessageType.AUDIO: return `${prefix}🎤 Voice message`;
    case MessageType.FILE: return `${prefix}📎 File`;
    case MessageType.VIDEO: return `${prefix}🎬 Video`;
    default: break;
  }
  return `${prefix}${m.ciphertext.replace(/\s+/g, ' ')}`;
}
