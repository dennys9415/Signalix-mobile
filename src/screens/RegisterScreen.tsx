import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '~/store/auth.store';
import { colors, radius, spacing } from '~/lib/theme';

export function RegisterScreen() {
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, justifyContent: 'center', flexGrow: 1 }}>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: spacing.xl }}>
          Create account
        </Text>

        <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={inputStyle} />
        <TextInput value={username} onChangeText={setUsername} placeholder="Username" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} style={inputStyle} />
        <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Display name (optional)" placeholderTextColor={colors.textMuted} autoCorrect={false} style={inputStyle} />
        <TextInput value={password} onChangeText={setPassword} placeholder="Password (min 8 chars)" placeholderTextColor={colors.textMuted} secureTextEntry style={inputStyle} />

        {error && (
          <Text style={{ color: colors.danger, fontSize: 13, marginTop: spacing.sm }}>{error}</Text>
        )}

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          style={{ backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg, opacity: loading ? 0.5 : 1 }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Create account</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
