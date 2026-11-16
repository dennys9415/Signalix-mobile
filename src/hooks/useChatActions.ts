// Chat actions shared by the chat-list swipe ("More") and the conversation ⋮
// menu: contact / group info, clear chat, delete chat. Native action sheet on
// iOS, Alert buttons on Android.

import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatType, type ChatDTO } from '@signalix/contracts';
import type { AppStackParamList } from '~/navigation/RootNavigator';
import { useChatStore } from '~/store/chat.store';

export interface SheetOption {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export function showActionSheet(title: string, options: SheetOption[]): void {
  if (Platform.OS === 'ios') {
    const destructiveButtonIndex = options.map((o, i) => (o.destructive ? i : -1)).filter((i) => i >= 0);
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...options.map((o) => o.label), 'Cancel'], cancelButtonIndex: options.length, destructiveButtonIndex },
      (i) => options[i]?.onPress(),
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...options.map((o) => ({ text: o.label, style: o.destructive ? 'destructive' as const : 'default' as const, onPress: o.onPress })),
    { text: 'Cancel', style: 'cancel' as const },
  ], { cancelable: true });
}

export function useChatActions() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const clearChat = useChatStore((s) => s.clearChat);
  const deleteChat = useChatStore((s) => s.deleteChat);

  function confirmClear(chatId: string, label: string) {
    Alert.alert('Clear chat?', `All messages with ${label} will be removed for you only.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear chat', style: 'destructive', onPress: () => void clearChat(chatId).catch(fail) },
    ]);
  }

  function confirmDelete(chatId: string, label: string, after?: () => void) {
    Alert.alert('Delete chat?', `The chat with ${label} will be removed for you only.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete chat', style: 'destructive', onPress: () => void deleteChat(chatId).then(after, fail) },
    ]);
  }

  /** Full "More" menu for a chat. `extra` options go first (e.g. Search in chat). */
  function openChatMenu(chat: ChatDTO, label: string, opts: { extra?: SheetOption[]; afterDelete?: () => void } = {}) {
    const isGroup = chat.type === ChatType.GROUP;
    showActionSheet(label, [
      ...(opts.extra ?? []),
      { label: isGroup ? 'Group info' : 'Contact info', onPress: () => navigation.navigate('ChatInfo', { chatId: chat.id }) },
      { label: 'Clear chat', destructive: true, onPress: () => confirmClear(chat.id, label) },
      ...(!isGroup ? [{ label: 'Delete chat', destructive: true, onPress: () => confirmDelete(chat.id, label, opts.afterDelete) }] : []),
    ]);
  }

  return { openChatMenu, confirmDelete };
}

function fail(err: unknown) {
  Alert.alert('Something went wrong', (err as Error)?.message ?? 'Please try again.');
}
