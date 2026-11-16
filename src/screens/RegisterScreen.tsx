import { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '~/navigation/RootNavigator';
import { useAuthStore } from '~/store/auth.store';
import { AuthLayout, AuthInput, PrimaryButton } from '~/components/AuthLayout';
import { colors, spacing } from '~/lib/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { register, loading, error } = useAuthStore();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  async function handleSubmit() {
    if (!email.trim() || !username.trim() || !password) return;
    try {
      await register({
        email: email.trim(),
        username: username.trim(),
        password,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });
    } catch {
      // surfaced via store error
    }
  }

  return (
    <AuthLayout title={'Let’s Get\nConnected'} subtitle="Create your Signalix account.">
      <AuthInput value={displayName} onChangeText={setDisplayName} placeholder="Your name (optional)" autoCorrect={false} textContentType="name" />
      <AuthInput value={username} onChangeText={setUsername} placeholder="Username" autoCapitalize="none" autoCorrect={false} textContentType="username" />
      <AuthInput value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />
      <AuthInput value={password} onChangeText={setPassword} placeholder="Password (min 8 characters)" secureTextEntry textContentType="newPassword" />
      {error && <Text style={{ color: colors.danger, fontSize: 13, marginLeft: spacing.md }}>{error}</Text>}
      <PrimaryButton label="Create account" onPress={handleSubmit} loading={loading} />
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 14 }}>
          Already have an account? <Text style={{ color: colors.text, fontWeight: '700' }}>Sign in</Text>
        </Text>
      </TouchableOpacity>
    </AuthLayout>
  );
}
