import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CallType, ChatType, MessageType } from '@signalix/contracts';
import { Image } from 'expo-image';
import type { AppStackParamList } from '~/navigation/RootNavigator';
import { useAuthStore } from '~/store/auth.store';
import { DECRYPT_FAILED, DRAFT_PREFIX, OTHER_DEVICE, SENT_ELSEWHERE, useChatStore, type SendableType, type StoredMessage } from '~/store/chat.store';
import { Avatar } from '~/components/Avatar';
import { canvasGradient, colors, radius, spacing } from '~/lib/theme';
import { useMediaUri } from '~/hooks/useMediaUri';
import { showActionSheet, useChatActions } from '~/hooks/useChatActions';
import { encryptAndUpload, parseMediaMetadata } from '~/lib/attachments';
import { FileAttachment, VoiceNote } from '~/components/AttachmentBubbles';
import { useCallStore } from '~/store/call.store';

type Props = NativeStackScreenProps<AppStackParamList, 'Conversation'>;

export function ConversationScreen({ route, navigation }: Props) {
  const { recipientUsername, recipientUserId, avatarUrl: draftAvatar } = route.params;
  const insets = useSafeAreaInsets();
  const currentUserId = useAuthStore((s) => s.session?.userId ?? '');
  const resolvedDraft = useChatStore((s) => (recipientUsername ? s.draftChats[recipientUsername] : undefined));
  const chatId = route.params.chatId ?? resolvedDraft;
  const storeKey = chatId ?? `${DRAFT_PREFIX}${recipientUsername ?? ''}`;
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const messages = useChatStore((s) => s.messages[storeKey] ?? EMPTY);
  const presence = useChatStore((s) => s.presence);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendToUser = useChatStore((s) => s.sendToUser);
  const setActiveChat = useChatStore((s) => s.setActiveChat);

  const [text, setText] = useState('');
  const listRef = useRef<FlatList<StoredMessage>>(null);
  const { openChatMenu } = useChatActions();
  const startCall = useCallStore((s) => s.startCall);

  // In-chat search over the (already decrypted) messages, newest match first.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchOpen || q.length < 2) return [];
    const out: number[] = [];
    messages.forEach((m, i) => {
      if (m.messageType === MessageType.TEXT && m.ciphertext.toLowerCase().includes(q)) out.push(i);
    });
    return out.reverse();
  }, [messages, query, searchOpen]);
  const activeMatch = matches[matchIdx];

  useEffect(() => { setMatchIdx(0); }, [query]);
  useEffect(() => {
    if (activeMatch === undefined) return;
    listRef.current?.scrollToIndex({ index: activeMatch, viewPosition: 0.4, animated: true });
  }, [activeMatch]);

  const isGroup = chat?.type === ChatType.GROUP;
  const peer = useMemo(
    () => (chat && !isGroup ? chat.participants.find((p) => p.userId !== currentUserId)?.user : undefined),
    [chat, isGroup, currentUserId],
  );
  const senderNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of chat?.participants ?? []) map[p.userId] = p.user?.displayName ?? p.user?.username ?? 'Member';
    return map;
  }, [chat]);
  const chatLabel = route.params.chatLabel
    ?? (isGroup ? chat?.title : (peer?.displayName ?? peer?.username))
    ?? recipientUsername ?? 'Chat';
  const headerAvatar = isGroup ? chat?.avatarUrl : (peer?.avatarUrl ?? draftAvatar);
  const online = !!peer && presence[peer.id] === 'online';

  // Keep the route in sync once a draft becomes a real chat.
  useEffect(() => {
    if (!route.params.chatId && resolvedDraft) navigation.setParams({ chatId: resolvedDraft });
  }, [resolvedDraft, route.params.chatId, navigation]);

  useEffect(() => {
    if (!chatId) return;
    setActiveChat(chatId);
    void loadMessages(chatId);
    return () => setActiveChat(null);
  }, [chatId, loadMessages, setActiveChat]);

  useEffect(() => {
    if (messages.length === 0 || searchOpen) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length, searchOpen]);

  // ── Attachments: photos, camera, documents, voice notes ──
  const [uploading, setUploading] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 250);
  const [recording, setRecording] = useState(false);

  function dispatchBody(body: string, type: SendableType) {
    if (chatId) sendMessage(chatId, body, type);
    else if (recipientUsername && recipientUserId) sendToUser(recipientUsername, recipientUserId, body, type);
  }

  async function sendAttachment(uri: string, type: SendableType, meta: { mime: string; filename?: string; duration?: number }) {
    setUploading(true);
    try {
      dispatchBody(JSON.stringify(await encryptAndUpload(uri, meta)), type);
    } catch (e) {
      Alert.alert('Could not send', (e as Error).message || 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  }

  async function pickPhoto(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', fromCamera ? 'Allow camera access in Settings → Signalix.' : 'Allow photo access in Settings → Signalix.');
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = res.canceled ? undefined : res.assets[0];
    if (asset) await sendAttachment(asset.uri, MessageType.IMAGE, { mime: asset.mimeType ?? 'image/jpeg' });
  }

  async function pickDocument() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    const asset = res.canceled ? undefined : res.assets[0];
    if (asset) await sendAttachment(asset.uri, MessageType.FILE, { mime: asset.mimeType ?? 'application/octet-stream', filename: asset.name });
  }

  function openAttachMenu() {
    showActionSheet('Send', [
      { label: 'Photo Library', onPress: () => void pickPhoto(false) },
      { label: 'Camera', onPress: () => void pickPhoto(true) },
      { label: 'Document', onPress: () => void pickDocument() },
    ]);
  }

  async function startRecording() {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow microphone access in Settings → Signalix.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  }

  async function stopRecording(send: boolean) {
    const seconds = Math.round(recState.durationMillis / 1000);
    await recorder.stop();
    setRecording(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (send && recorder.uri && seconds >= 1) {
      await sendAttachment(recorder.uri, MessageType.AUDIO, { mime: 'audio/mp4', duration: seconds });
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (chatId) sendMessage(chatId, trimmed);
    else if (recipientUsername && recipientUserId) sendToUser(recipientUsername, recipientUserId, trimmed);
    setText('');
  }

  function handleCall(type: CallType) {
    if (!chatId || !peer) {
      Alert.alert('Calls', 'Send a message first, then you can call.');
      return;
    }
    void startCall(chatId, peer.id, type);
  }

  function openProfile() {
    if (chatId) navigation.navigate('ChatInfo', { chatId });
  }

  function openMenu() {
    if (!chat) return;
    openChatMenu(chat, chatLabel, {
      extra: [{ label: 'Search in chat', onPress: () => setSearchOpen(true) }],
      afterDelete: () => navigation.goBack(),
    });
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery('');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <LinearGradient
        colors={canvasGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={{ flex: 1, borderBottomLeftRadius: 44, borderBottomRightRadius: 44, overflow: 'hidden' }}
      >
        {/* Header */}
        {searchOpen ? (
          <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <TouchableOpacity accessibilityLabel="Close search" onPress={closeSearch} hitSlop={12}>
              <Feather name="x" size={24} color={colors.text} />
            </TouchableOpacity>
            <View style={[pill, { flex: 1, width: undefined, flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.sm, justifyContent: 'flex-start' }]}>
              <Feather name="search" size={16} color="rgba(255,255,255,0.85)" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search this chat"
                placeholderTextColor="rgba(255,255,255,0.7)"
                style={{ flex: 1, color: colors.text, fontSize: 15 }}
                autoFocus
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.trim().length >= 2 && (
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
                  {matches.length === 0 ? '0' : `${matchIdx + 1}/${matches.length}`}
                </Text>
              )}
            </View>
            <TouchableOpacity accessibilityLabel="Older match" disabled={matches.length === 0} onPress={() => setMatchIdx((i) => Math.min(i + 1, matches.length - 1))} style={[pill, { width: 40, opacity: matches.length ? 1 : 0.5 }]}>
              <Feather name="chevron-up" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Newer match" disabled={matches.length === 0} onPress={() => setMatchIdx((i) => Math.max(i - 1, 0))} style={[pill, { width: 40, opacity: matches.length ? 1 : 0.5 }]}>
              <Feather name="chevron-down" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        ) : (
        <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <TouchableOpacity accessibilityLabel="Back" onPress={() => navigation.goBack()} hitSlop={12}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={openProfile} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 }}>
            <Avatar name={chatLabel} uri={headerAvatar} size={44} online={online} surface="#b0aecb" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={{ color: colors.text, fontSize: 26, lineHeight: 27, fontWeight: '800', letterSpacing: -0.9 }}>
                {chatLabel}
              </Text>
              {(online || isGroup) && (
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>
                  {isGroup ? `${chat?.participants.length ?? 0} members` : 'Online'}
                </Text>
              )}
            </View>
          </TouchableOpacity>
          {!isGroup && (
            <>
              <TouchableOpacity accessibilityLabel="Video call" onPress={() => handleCall(CallType.VIDEO)} style={pill}>
                <Feather name="video" size={18} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity accessibilityLabel="Call" onPress={() => handleCall(CallType.AUDIO)} style={pill}>
                <Feather name="phone" size={18} color={colors.text} />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity accessibilityLabel="Chat options" onPress={openMenu} disabled={!chat} style={[pill, { width: 40, opacity: chat ? 1 : 0.5 }]}>
            <Feather name="more-vertical" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
        )}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => ('id' in item ? item.id : item.tempId)}
          renderItem={({ item, index }) => {
            const prev = index > 0 ? messages[index - 1] : undefined;
            const sender = 'senderId' in item ? item.senderId : currentUserId;
            const prevSender = prev && ('senderId' in prev ? prev.senderId : currentUserId);
            return (
              <Bubble
                m={item}
                highlight={index === activeMatch ? 'active' : matches.includes(index) ? 'match' : undefined}
                mine={sender === currentUserId}
                senderName={isGroup && sender !== currentUserId && prevSender !== sender ? senderNames[sender] : undefined}
              />
            );
          }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 6, flexGrow: 1 }}
          onContentSizeChange={() => { if (!searchOpen) listRef.current?.scrollToEnd({ animated: false }); }}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
            setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.4 }), 100);
          }}
          keyboardDismissMode="interactive"
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 }}>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15 }}>
                {chatId ? 'No messages yet' : `Say hi to ${chatLabel} 👋`}
              </Text>
            </View>
          }
        />
      </LinearGradient>

      {/* Composer */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.md) }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', padding: 5, minHeight: 60, gap: 4 }}>
          {recording ? (
            <>
              <TouchableOpacity accessibilityLabel="Cancel recording" onPress={() => void stopRecording(false)} style={roundBtn}>
                <Feather name="trash-2" size={18} color={colors.danger} />
              </TouchableOpacity>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff453a' }} />
                <Text style={{ color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'] }}>{formatClock(recState.durationMillis / 1000)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Recording…</Text>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity accessibilityLabel="Attach" onPress={openAttachMenu} disabled={uploading} style={roundBtn}>
                {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="plus" size={22} color={colors.text} />}
              </TouchableOpacity>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={uploading ? 'Sending attachment…' : 'Your Message...'}
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 14, maxHeight: 120 }}
                multiline
                maxLength={4000}
              />
            </>
          )}
          {recording || text.trim() ? (
            <TouchableOpacity
              accessibilityLabel="Send"
              onPress={() => (recording ? void stopRecording(true) : handleSend())}
              style={{ width: 64, height: 48, borderRadius: 24, backgroundColor: '#2a2a30', alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="send" size={18} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              accessibilityLabel="Record voice message"
              onPress={() => void startRecording()}
              disabled={uploading}
              style={{ width: 64, height: 48, borderRadius: 24, backgroundColor: '#2a2a30', alignItems: 'center', justifyContent: 'center', opacity: uploading ? 0.5 : 1 }}
            >
              <Feather name="mic" size={19} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, mine, senderName, highlight }: { m: StoredMessage; mine: boolean; senderName: string | undefined; highlight: 'active' | 'match' | undefined }) {
  const queued = 'queued' in m ? m.queued : false;
  const pending = 'pending' in m;
  // Bodies arrive already decrypted (chat.store); only the placeholders stay locked.
  const locked = m.ciphertext === DECRYPT_FAILED || m.ciphertext === SENT_ELSEWHERE || m.ciphertext === OTHER_DEVICE;
  const isImage = !locked && m.messageType === MessageType.IMAGE;
  const media = useMediaUri(isImage ? m.ciphertext : undefined);
  const attachment = !locked && (m.messageType === MessageType.FILE || m.messageType === MessageType.AUDIO)
    ? parseMediaMetadata(m.ciphertext)
    : null;
  const body = locked
    ? m.ciphertext
    : m.messageType === MessageType.IMAGE ? (media.failed ? '📷 Photo unavailable' : '📷 Loading photo…')
    : m.messageType === MessageType.AUDIO ? '🎤 Voice message unavailable'
    : m.messageType === MessageType.FILE ? '📎 File unavailable'
    : m.messageType === MessageType.VIDEO ? '🎬 Video — open on web'
    : m.ciphertext;
  const image = media.uri;
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
      {senderName && (
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', marginLeft: spacing.md, marginBottom: 2 }}>{senderName}</Text>
      )}
      <View
        style={{
          backgroundColor: mine ? colors.bubbleMine : colors.bubbleTheirs,
          borderRadius: radius.md,
          borderWidth: highlight ? 2 : 0,
          borderColor: highlight === 'active' ? '#ffffff' : 'rgba(255,214,102,0.8)',
          paddingHorizontal: spacing.md,
          paddingVertical: 7,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          columnGap: spacing.sm,
        }}
      >
        {image ? (
          <Image source={{ uri: image }} style={{ width: 220, height: 220, borderRadius: radius.sm, marginVertical: 3 }} contentFit="cover" />
        ) : attachment && m.messageType === MessageType.FILE ? (
          <FileAttachment meta={attachment} />
        ) : attachment && m.messageType === MessageType.AUDIO ? (
          <VoiceNote meta={attachment} />
        ) : (
          <Text style={{ color: colors.text, fontSize: 14, lineHeight: 19, fontStyle: locked || body !== m.ciphertext ? 'italic' : 'normal' }}>
            {body}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>
            {formatTime(m.createdAt)}{queued ? ' · queued' : ''}
          </Text>
          {mine && (
            <Text style={{ color: 'state' in m && m.state === 'read' ? '#9fe0ff' : 'rgba(255,255,255,0.7)', fontSize: 10 }}>
              {pending ? '◷' : 'state' in m && m.state !== 'sent' ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const pill = {
  width: 52,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.glassDark,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.15)',
};

const roundBtn = {
  width: 48,
  height: 48,
  borderRadius: 24,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const EMPTY: StoredMessage[] = [];
