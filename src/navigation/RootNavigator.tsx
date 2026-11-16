import { DarkTheme, NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '~/store/auth.store';
import { useChatStore } from '~/store/chat.store';
import { LoginScreen } from '~/screens/LoginScreen';
import { RegisterScreen } from '~/screens/RegisterScreen';
import { ChatsScreen } from '~/screens/ChatsScreen';
import { ConversationScreen } from '~/screens/ConversationScreen';
import { NewChatScreen } from '~/screens/NewChatScreen';
import { ProfileScreen } from '~/screens/ProfileScreen';
import { ChatInfoScreen } from '~/screens/ChatInfoScreen';
import { colors } from '~/lib/theme';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppStackParamList = {
  Chats: undefined;
  /** `chatId` is absent for a first message to a new contact (`recipientUsername` + `recipientUserId`). */
  Conversation: { chatId?: string; chatLabel?: string; recipientUsername?: string; recipientUserId?: string; avatarUrl?: string };
  NewChat: undefined;
  Profile: undefined;
  ChatInfo: { chatId: string };
};

/** Deep links: signalix://chat/<id>, signalix://profile, signalix://new */
const linking: LinkingOptions<AppStackParamList> = {
  prefixes: [Linking.createURL('/'), 'signalix://'],
  config: {
    screens: {
      Chats: '',
      Conversation: 'chat/:chatId',
      ChatInfo: 'chat/:chatId/info',
      NewChat: 'new',
      Profile: 'profile',
    },
  },
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

function AppNavigator() {
  const initWsHandler = useChatStore((s) => s.initWsHandler);
  const loadChats = useChatStore((s) => s.loadChats);

  useEffect(() => {
    initWsHandler();
    void loadChats();
  }, [initWsHandler, loadChats]);

  return (
    <AppStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <AppStack.Screen name="Chats" component={ChatsScreen} />
      <AppStack.Screen name="Conversation" component={ConversationScreen} />
      <AppStack.Screen name="NewChat" component={NewChatScreen} />
      <AppStack.Screen name="Profile" component={ProfileScreen} />
      <AppStack.Screen name="ChatInfo" component={ChatInfoScreen} />
    </AppStack.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const { session, hydrated, hydrate } = useAuthStore();

  useEffect(() => { void hydrate(); }, [hydrate]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <NavigationContainer
      {...(session ? { linking } : {})}
      theme={{
        ...DarkTheme,
        colors: {
          background: colors.bg,
          card: colors.bgElev,
          text: colors.text,
          border: colors.border,
          notification: colors.accent,
          primary: colors.accent,
        },
      }}
    >
      {session ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
