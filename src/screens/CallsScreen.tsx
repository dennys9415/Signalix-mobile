import { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { CallEndReason, CallType, type CallDTO } from '@signalix/contracts';
import type { AppStackParamList } from '~/navigation/RootNavigator';
import { api } from '~/services/api-client';
import { useAuthStore } from '~/store/auth.store';
import { useChatStore } from '~/store/chat.store';
import { Avatar } from '~/components/Avatar';
import { TabHero } from '~/components/TabHero';
import { colors, spacing } from '~/lib/theme';
import { formatChatTime } from '~/lib/format';

/** Call log (same data as the web Calls tab); refreshed whenever the tab gains focus. */
export function CallsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const me = useAuthStore((s) => s.session?.userId ?? '');
  const chats = useChatStore((s) => s.chats);
  const [calls, setCalls] = useState<CallDTO[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setCalls((await api.getCallHistory(50)).calls);
    } catch {
      setCalls((c) => c ?? []);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function callBack() {
    Alert.alert('Calls', 'Voice and video calls from the app are coming soon. For now, call from the web app.');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={calls ?? []}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={<TabHero title={'Recent\nCalls'} />}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.text} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        renderItem={({ item }) => {
          const outgoing = item.callerId === me;
          const peerId = outgoing ? item.calleeId : item.callerId;
          const chat = chats.find((c) => c.id === item.chatId);
          const peer = chat?.participants.find((p) => p.userId === peerId)?.user;
          const name = peer?.displayName ?? peer?.username ?? 'Unknown';
          const missed = !outgoing && item.answeredAt === null;
          const video = item.callType === CallType.VIDEO;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}
                onPress={() => chat && navigation.navigate('Conversation', { chatId: chat.id, chatLabel: name })}
              >
                <Avatar name={name} uri={peer?.avatarUrl} size={54} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: missed ? colors.danger : colors.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 }}>{name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <Feather name={outgoing ? 'arrow-up-right' : 'arrow-down-left'} size={14} color={missed ? colors.danger : outgoing ? colors.accent : colors.online} />
                    <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 14, flex: 1 }}>
                      {describe(item, outgoing, missed)} · {formatChatTime(item.startedAt)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity accessibilityLabel={video ? `Video call ${name}` : `Call ${name}`} onPress={callBack} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgElev2, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={video ? 'video' : 'phone'} size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={calls === null ? undefined : (
          <View style={{ alignItems: 'center', padding: spacing.xl * 2, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>No calls yet</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center' }}>Your voice and video calls will show up here.</Text>
          </View>
        )}
      />
    </View>
  );
}

/** Short status — voice vs video is shown by the call-back button. */
function describe(call: CallDTO, outgoing: boolean, missed: boolean): string {
  if (missed) return call.endReason === CallEndReason.REJECTED ? 'Declined' : 'Missed';
  if (call.durationSeconds != null) {
    const m = Math.floor(call.durationSeconds / 60);
    const s = String(call.durationSeconds % 60).padStart(2, '0');
    return `${outgoing ? 'Outgoing' : 'Incoming'} · ${m}:${s}`;
  }
  if (outgoing && call.endReason && call.endReason !== CallEndReason.COMPLETED) return 'No answer';
  return outgoing ? 'Outgoing' : 'Incoming';
}
