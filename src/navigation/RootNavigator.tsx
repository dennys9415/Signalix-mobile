import { DarkTheme, NavigationContainer, type LinkingOptions, type NavigatorScreenParams } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '~/store/auth.store';
import { useChatStore } from '~/store/chat.store';
import { LoginScreen } from '~/screens/LoginScreen';
import { RegisterScreen } from '~/screens/RegisterScreen';
import { ChatsScreen } from '~/screens/ChatsScreen';
import { ConversationScreen } from '~/screens/ConversationScreen';
import { NewChatScreen } from '~/screens/NewChatScreen';
import { ProfileScreen } from '~/screens/ProfileScreen';
import { ChatInfoScreen } from '~/screens/ChatInfoScreen';
import { CallsScreen } from '~/screens/CallsScreen';
import { GroupsScreen } from '~/screens/GroupsScreen';
import { NewGroupScreen } from '~/screens/NewGroupScreen';
import { CallOverlay } from '~/components/CallOverlay';
import { colors } from '~/lib/theme';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type HomeTabParamList = {
  Chats: undefined;
  Calls: undefined;
  Groups: undefined;
  Settings: undefined;
};

export type AppStackParamList = {
  Home: NavigatorScreenParams<HomeTabParamList> | undefined;
  /** `chatId` is absent for a first message to a new contact (`recipientUsername` + `recipientUserId`). */
  Conversation: { chatId?: string; chatLabel?: string; recipientUsername?: string; recipientUserId?: string; avatarUrl?: string };
  NewChat: undefined;
  NewGroup: undefined;
  ChatInfo: { chatId: string };
};

/** Deep links: signalix://chat/<id>, signalix://calls, signalix://groups, signalix://profile, signalix://new */
const linking: LinkingOptions<AppStackParamList> = {
  prefixes: [Linking.createURL('/'), 'signalix://'],
  config: {
    screens: {
      Home: {
        screens: { Chats: '', Calls: 'calls', Groups: 'groups', Settings: 'profile' },
      },
      Conversation: 'chat/:chatId',
      ChatInfo: 'chat/:chatId/info',
      NewChat: 'new',
      NewGroup: 'groups/new',
    },
  },
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<HomeTabParamList>();

const TAB_ICONS: Record<keyof HomeTabParamList, keyof typeof Feather.glyphMap> = {
  Chats: 'message-circle',
  Calls: 'phone',
  Groups: 'users',
  Settings: 'settings',
};

/** Black tab bar with a frosted pill behind the active tab (matches the web phone layout). */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const unread = useChatStore((s) => Object.values(s.unreadCounts).reduce((a, n) => a + n, 0));
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) }}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const name = route.name as keyof HomeTabParamList;
        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={name}
            onPress={() => { if (!focused) navigation.navigate(route.name); }}
            style={{ flex: 1, alignItems: 'center', gap: 2 }}
          >
            <View style={{ width: 58, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? 'rgba(255,255,255,0.12)' : 'transparent' }}>
              <Feather name={TAB_ICONS[name]} size={21} color={focused ? colors.text : colors.textDim} />
              {name === 'Chats' && unread > 0 && (
                <View style={{ position: 'absolute', top: -2, right: 6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: focused ? colors.text : colors.textDim, fontSize: 11, fontWeight: '600' }}>{name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function HomeTabs() {
  return (
    <Tabs.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="Chats" component={ChatsScreen} />
      <Tabs.Screen name="Calls" component={CallsScreen} />
      <Tabs.Screen name="Groups" component={GroupsScreen} />
      <Tabs.Screen name="Settings" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

function AppNavigator() {
  const initWsHandler = useChatStore((s) => s.initWsHandler);
  const loadChats = useChatStore((s) => s.loadChats);

  useEffect(() => {
    initWsHandler();
    void loadChats();
  }, [initWsHandler, loadChats]);

  return (
    <>
    <AppStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <AppStack.Screen name="Home" component={HomeTabs} />
      <AppStack.Screen name="Conversation" component={ConversationScreen} />
      <AppStack.Screen name="NewChat" component={NewChatScreen} />
      <AppStack.Screen name="NewGroup" component={NewGroupScreen} />
      <AppStack.Screen name="ChatInfo" component={ChatInfoScreen} />
    </AppStack.Navigator>
    <CallOverlay />
    </>
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
