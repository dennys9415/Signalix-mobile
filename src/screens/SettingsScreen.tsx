import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import type { UserProfileResponse } from '@signalix/contracts';
import { useAuthStore } from '~/store/auth.store';
import { api } from '~/services/api-client';
import { colors, radius, spacing } from '~/lib/theme';

export function SettingsScreen() {
  const logout = useAuthStore((s) => s.logout);
  const [me, setMe] = useState<UserProfileResponse | null>(null);

  useEffect(() => {
    api.getMe().then(setMe).catch(() => setMe(null));
  }, []);

  function handleLogout() {
    Alert.alert('Sign out', 'You will need to sign in again to see your messages.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { void logout(); } },
    ]);
  }

  const version = Constants.expoConfig?.version ?? '0.0.0';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>

        <Section label="Account">
          <Row label="Username" value={me?.user?.username ?? '—'} />
          <Row label="Email" value={me?.user?.email ?? '—'} />
          <Row label="Display name" value={me?.user?.displayName ?? '—'} />
        </Section>

        <Section label="About">
          <Row label="App version" value={version} />
          <Row label="E2EE" value="Web-only in v0.16.0 (port lands v0.17.0)" />
        </Section>

        <TouchableOpacity
          onPress={handleLogout}
          style={{ backgroundColor: colors.bgElev, borderColor: colors.danger, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.xl, alignItems: 'center' }}
        >
          <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '600' }}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: spacing.md, marginBottom: spacing.sm }}>{label}</Text>
      <View style={{ backgroundColor: colors.bgElev, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 14, flexShrink: 1, textAlign: 'right' }} numberOfLines={2}>{value}</Text>
    </View>
  );
}
