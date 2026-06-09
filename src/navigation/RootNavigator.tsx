import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { useAuthStore } from '~/store/auth.store';
import { useChatStore } from '~/store/chat.store';
import { LoginScreen } from '~/screens/LoginScreen';
import { RegisterScreen } from '~/screens/RegisterScreen';
import { ChatsScreen } from '~/screens/ChatsScreen';
import { ConversationScreen } from '~/screens/ConversationScreen';
import { SettingsScreen } from '~/screens/SettingsScreen';
import { colors } from '~/lib/theme';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  Conversation: { chatId: string; chatLabel: string };
};

export type TabsParamList = {
  Chats: undefined;
  Settings: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<TabsParamList>();

function TabsNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text, fontSize: 17, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.bgElev, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="Chats"
        component={ChatsScreen}
        options={{ tabBarIcon: ({ color }) => <TabIcon label="Chats" color={color} /> }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarIcon: ({ color }) => <TabIcon label="Settings" color={color} /> }}
      />
    </Tabs.Navigator>
  );
}

function TabIcon({ label, color }: { label: string; color: string }) {
  // RN core has no icon font baked in; using a tiny text glyph for v0.16.0.
  return (
    <Text style={{ color, fontSize: 18 }}>{label === 'Chats' ? '💬' : '⚙'}</Text>
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
    <AppStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.accent,
      }}
    >
      <AppStack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
      <AppStack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={({ route }) => ({ title: route.params.chatLabel })}
      />
    </AppStack.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.accent,
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in' }} />
      <AuthStack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const { session, hydrated, hydrate } = useAuthStore();

  useEffect(() => { void hydrate(); }, [hydrate]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={{
        dark: true,
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
