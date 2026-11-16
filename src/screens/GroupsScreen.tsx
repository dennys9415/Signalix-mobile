import { useMemo } from 'react';
import { FlatList, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { ChatType } from '@signalix/contracts';
import type { AppStackParamList } from '~/navigation/RootNavigator';
import { useChatStore } from '~/store/chat.store';
import { useChatActions } from '~/hooks/useChatActions';
import { Avatar } from '~/components/Avatar';
import { TabHero, heroLabel } from '~/components/TabHero';
import { colors, spacing } from '~/lib/theme';

export function GroupsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const chats = useChatStore((s) => s.chats);
  const { openChatMenu } = useChatActions();
  const groups = useMemo(() => chats.filter((c) => c.type === ChatType.GROUP), [chats]);

  const open = (id: string, title: string) => navigation.navigate('Conversation', { chatId: id, chatLabel: title });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        ListHeaderComponent={
          <TabHero title={'Your\nGroups'}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
              <TouchableOpacity accessibilityLabel="New group" onPress={() => navigation.navigate('NewGroup')} style={{ alignItems: 'center', width: 68 }}>
                <View style={{ width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="plus" size={22} color={colors.text} />
                </View>
                <Text style={heroLabel}>New</Text>
              </TouchableOpacity>
              {groups.map((g) => (
                <TouchableOpacity key={g.id} onPress={() => open(g.id, g.title ?? 'Group')} style={{ alignItems: 'center', width: 68 }}>
                  <Avatar name={g.title ?? 'Group'} uri={g.avatarUrl} size={68} ring />
                  <Text style={heroLabel} numberOfLines={1}>{(g.title ?? 'Group').split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TabHero>
        }
        renderItem={({ item }) => {
          const title = item.title ?? 'Group';
          return (
            <TouchableOpacity
              onPress={() => open(item.id, title)}
              onLongPress={() => openChatMenu(item, title)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}
            >
              <Avatar name={title} uri={item.avatarUrl} size={54} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: colors.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 }}>{title}</Text>
                <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 14, marginTop: 3 }}>
                  {item.participants.length} members
                </Text>
              </View>
              <TouchableOpacity accessibilityLabel={`Options for ${title}`} onPress={() => openChatMenu(item, title)} hitSlop={10}>
                <Feather name="more-horizontal" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: spacing.xl * 2, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>No groups yet</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Tap New to create one.</Text>
          </View>
        }
      />
    </View>
  );
}
