import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PublicUserDTO } from '@signalix/contracts';
import type { AppStackParamList } from '~/navigation/RootNavigator';
import { api } from '~/services/api-client';
import { useAuthStore } from '~/store/auth.store';
import { useChatStore } from '~/store/chat.store';
import { Avatar } from '~/components/Avatar';
import { colors, heroGradient, radius, spacing } from '~/lib/theme';

type Props = NativeStackScreenProps<AppStackParamList, 'NewGroup'>;

/** Name the group, pick members via user search, create — same API as the web GroupCreateModal. */
export function NewGroupScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.session?.userId ?? '');
  const loadChats = useChatStore((s) => s.loadChats);
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUserDTO[]>([]);
  const [selected, setSelected] = useState<PublicUserDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.searchUsers(q)
        .then((r) => setResults(r.users.filter((u) => u.id !== me)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, me]);

  const isSelected = (u: PublicUserDTO) => selected.some((s) => s.id === u.id);
  const toggle = (u: PublicUserDTO) => setSelected((cur) => (isSelected(u) ? cur.filter((s) => s.id !== u.id) : [...cur, u]));
  const canCreate = title.trim().length > 0 && selected.length > 0 && !creating;

  async function create() {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    try {
      const { chat } = await api.createGroupChat({ title: title.trim(), memberIds: selected.map((u) => u.id) });
      await loadChats();
      navigation.replace('Conversation', { chatId: chat.id, chatLabel: chat.title ?? title.trim() });
    } catch (e) {
      setError((e as Error).message || 'Could not create the group.');
      setCreating(false);
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
          <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -1, flex: 1 }}>New group</Text>
          <TouchableOpacity
            accessibilityLabel="Create group"
            onPress={() => void create()}
            disabled={!canCreate}
            style={{ paddingHorizontal: spacing.lg, height: 38, borderRadius: 19, backgroundColor: 'rgba(30,30,38,0.45)', alignItems: 'center', justifyContent: 'center', opacity: canCreate ? 1 : 0.5 }}
          >
            {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: colors.text, fontWeight: '700' }}>Create</Text>}
          </TouchableOpacity>
        </View>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Group name"
          placeholderTextColor="rgba(255,255,255,0.75)"
          style={{ backgroundColor: colors.glass, borderRadius: radius.pill, paddingHorizontal: spacing.lg, height: 44, marginTop: spacing.lg, color: colors.text, fontSize: 16, fontWeight: '600' }}
          maxLength={100}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.glass, borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 44, marginTop: spacing.sm }}>
          <Feather name="search" size={16} color="rgba(255,255,255,0.85)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Add people by name or username"
            placeholderTextColor="rgba(255,255,255,0.75)"
            style={{ flex: 1, color: colors.text, fontSize: 15 }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator color="#fff" size="small" />}
        </View>
      </LinearGradient>

      {selected.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.md }}>
          {selected.map((u) => (
            <TouchableOpacity key={u.id} onPress={() => toggle(u)} style={{ alignItems: 'center', width: 60 }}>
              <View>
                <Avatar name={u.displayName ?? u.username} uri={u.avatarUrl} size={52} />
                <View style={{ position: 'absolute', right: -2, top: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bgElev2, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="x" size={12} color={colors.text} />
                </View>
              </View>
              <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{(u.displayName ?? u.username).split(' ')[0]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {error && <Text style={{ color: colors.danger, paddingHorizontal: spacing.xl, marginTop: spacing.sm }}>{error}</Text>}

      <FlatList
        data={results}
        keyExtractor={(u) => u.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => toggle(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
            <Avatar name={item.displayName ?? item.username} uri={item.avatarUrl} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{item.displayName ?? item.username}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>@{item.username}</Text>
            </View>
            <Feather name={isSelected(item) ? 'check-circle' : 'circle'} size={22} color={isSelected(item) ? colors.accent : colors.textDim} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.xl }}>
            {query.trim().length < 2 ? 'Search for people to add to the group.' : searching ? '' : 'No people found.'}
          </Text>
        }
      />
    </View>
  );
}
