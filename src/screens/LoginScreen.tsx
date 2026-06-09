import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '~/navigation/RootNavigator';
import { useAuthStore } from '~/store/auth.store';
import { colors, radius, spacing } from '~/lib/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login, loading, error } = useAuthStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit() {
    if (!identifier.trim() || !password) return;
    try {
      await login({ identifier: identifier.trim(), password });
    } catch {
      // store already captured the error
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, padding: spacing.xl, justifyContent: 'center' }}>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: spacing.xl }}>
          Welcome back
        </Text>

        <TextInput
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="Username or email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={inputStyle}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          style={inputStyle}
        />

        {error && (
          <Text style={{ color: colors.danger, fontSize: 13, marginTop: spacing.sm }}>{error}</Text>
        )}

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          style={{
            backgroundColor: colors.accent,
            borderRadius: radius.lg,
            paddingVertical: 14,
            alignItems: 'center',
            marginTop: spacing.lg,
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Sign in</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: colors.accent, textAlign: 'center', fontSize: 14 }}>
            Don&apos;t have an account? Create one
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const inputStyle = {
  backgroundColor: colors.bgElev,
  color: colors.text,
  borderRadius: radius.md,
  padding: spacing.lg,
  fontSize: 15,
  marginBottom: spacing.md,
  borderWidth: 1,
  borderColor: colors.border,
} as const;
