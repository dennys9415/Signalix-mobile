import { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '~/navigation/RootNavigator';
import { useAuthStore } from '~/store/auth.store';
import { AuthLayout, AuthInput, PrimaryButton } from '~/components/AuthLayout';
import { colors, spacing } from '~/lib/theme';

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
    <AuthLayout title={'Welcome\nBack'} subtitle="Sign in to pick up your conversations.">
      <AuthInput value={identifier} onChangeText={setIdentifier} placeholder="Username or email" autoCapitalize="none" autoCorrect={false} textContentType="username" />
      <AuthInput value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry textContentType="password" onSubmitEditing={handleSubmit} />
      {error && <Text style={{ color: colors.danger, fontSize: 13, marginLeft: spacing.md }}>{error}</Text>}
      <PrimaryButton label="Sign in" onPress={handleSubmit} loading={loading} />
      <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 14 }}>
          New to Signalix? <Text style={{ color: colors.text, fontWeight: '700' }}>Create an account</Text>
        </Text>
      </TouchableOpacity>
    </AuthLayout>
  );
}
