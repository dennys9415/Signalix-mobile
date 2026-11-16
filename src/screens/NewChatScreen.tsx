import { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChatType, type PublicUserDTO } from '@signalix/contracts';
import type { AppStackParamList } from '~/navigation/RootNavigator';
import { api } from '~/services/api-client';
import { useAuthStore } from '~/store/auth.store';
import { useChatStore } from '~/store/chat.store';
import { Avatar } from '~/components/Avatar';
import { colors, heroGradient, radius, spacing } from '~/lib/theme';

type Props = NativeStackScreenProps<AppStackParamList, 'NewChat'>;

export function NewChatScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const currentUserId = useAuthStore((s) => s.session?.userId ?? '');
  const chats = useChatStore((s) => s.chats);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUserDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced server-side user search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setError(null); return; }
    setLoading(true);
    const t = setTimeout(() => {
      api.searchUsers(q)
        .then((r) => { setResults(r.users.filter((u) => u.id !== currentUserId)); setError(null); })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, currentUserId]);

  function pick(user: PublicUserDTO) {
    const label = user.displayName ?? user.username;
    const existing = chats.find((c) => c.type === ChatType.DIRECT && c.participants.some((p) => p.userId === user.id));
    if (existing) {
      navigation.replace('Conversation', { chatId: existing.id, chatLabel: label });
    } else {
      navigation.replace('Conversation', {
        chatLabel: label,
        recipientUsername: user.username,
        recipientUserId: user.id,
        ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient
        colors={heroGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, borderBottomLeftRadius: radius.xxl, borderBottomRightRadius: radius.xxl }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <TouchableOpacity accessibilityLabel="Back" onPress={() => navigation.goBack()} hitSlop={12}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -1 }}>New chat</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.glass, borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 44, marginTop: spacing.lg }}>
          <Feather name="search" size={16} color="rgba(255,255,255,0.85)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or username"
            placeholderTextColor="rgba(255,255,255,0.75)"
            style={{ flex: 1, color: colors.text, fontSize: 15 }}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {loading && <ActivityIndicator color="#fff" size="small" />}
        </View>
      </LinearGradient>

      <FlatList
        data={results}
        keyExtractor={(u) => u.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingVertical: spacing.md }}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => pick(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
            <Avatar name={item.displayName ?? item.username} uri={item.avatarUrl} size={50} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{item.displayName ?? item.username}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>@{item.username}</Text>
            </View>
            <Feather name="message-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={{ color: error ? colors.danger : colors.textMuted, textAlign: 'center', marginTop: spacing.xl * 2, paddingHorizontal: spacing.xl }}>
            {error ?? (query.trim().length < 2 ? 'Type at least 2 characters to find people.' : loading ? '' : 'No people found.')}
          </Text>
        }
      />
    </View>
  );
}
