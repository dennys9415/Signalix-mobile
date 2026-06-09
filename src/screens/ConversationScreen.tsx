import { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '~/navigation/RootNavigator';
import { useAuthStore } from '~/store/auth.store';
import { useChatStore, type StoredMessage } from '~/store/chat.store';
import { colors, radius, spacing } from '~/lib/theme';

type Props = NativeStackScreenProps<AppStackParamList, 'Conversation'>;

export function ConversationScreen({ route }: Props) {
  const { chatId } = route.params;
  const session = useAuthStore((s) => s.session);
  const currentUserId = session?.userId ?? '';
  const messages = useChatStore((s) => s.messages[chatId] ?? EMPTY);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setActiveChat = useChatStore((s) => s.setActiveChat);

  const [text, setText] = useState('');
  const listRef = useRef<FlatList<StoredMessage>>(null);

  useEffect(() => {
    setActiveChat(chatId);
    void loadMessages(chatId);
    return () => setActiveChat(null);
  }, [chatId, loadMessages, setActiveChat]);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage(chatId, trimmed);
    setText('');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={{ flex: 1 }}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => ('id' in item ? item.id : item.tempId)}
          renderItem={({ item }) => <MessageBubble m={item} currentUserId={currentUserId} />}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        <View style={{ flexDirection: 'row', padding: spacing.md, gap: spacing.sm, borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.bg }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, backgroundColor: colors.bgElev, color: colors.text, borderRadius: radius.lg, padding: spacing.md, fontSize: 15, borderWidth: 1, borderColor: colors.border }}
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim()}
            style={{ backgroundColor: colors.accent, borderRadius: radius.lg, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', opacity: text.trim() ? 1 : 0.4 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ m, currentUserId }: { m: StoredMessage; currentUserId: string }) {
  const isMine = 'senderId' in m ? m.senderId === currentUserId : true;
  const queued = 'queued' in m ? m.queued : false;
  return (
    <View
      style={{
        alignSelf: isMine ? 'flex-end' : 'flex-start',
        maxWidth: '78%',
        backgroundColor: isMine ? colors.bubbleMine : colors.bubbleTheirs,
        borderRadius: radius.lg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: isMine ? '#fff' : colors.text, fontSize: 15 }}>{m.ciphertext}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginTop: 2 }}>
        <Text style={{ color: isMine ? 'rgba(255,255,255,0.7)' : colors.textDim, fontSize: 10 }}>
          {formatTime(m.createdAt)}{queued ? ' • queued' : ''}
        </Text>
        {isMine && 'state' in m && (
          <Text style={{ color: stateColor(m.state, isMine), fontSize: 11 }}>{stateGlyph(m.state)}</Text>
        )}
      </View>
    </View>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function stateGlyph(state: string): string {
  if (state === 'read') return '✓✓';
  if (state === 'delivered') return '✓✓';
  return '✓';
}

function stateColor(state: string, isMine: boolean): string {
  if (state === 'read') return '#34c8ff';
  return isMine ? 'rgba(255,255,255,0.55)' : colors.textDim;
}

const EMPTY: StoredMessage[] = [];
