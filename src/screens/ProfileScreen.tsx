import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { UserProfileResponse } from '@signalix/contracts';
import type { AppStackParamList } from '~/navigation/RootNavigator';
import { useAuthStore } from '~/store/auth.store';
import { api } from '~/services/api-client';
import { Avatar } from '~/components/Avatar';
import { Section, Row } from '~/components/Section';
import { colors, heroGradient, radius, spacing } from '~/lib/theme';

type Props = NativeStackScreenProps<AppStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);
  const [me, setMe] = useState<UserProfileResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api.getMe().then(setMe).catch(() => setMe(null));
  }, []);
  useEffect(refresh, [refresh]);

  const user = me?.user;
  const name = user?.displayName ?? user?.username ?? '';

  async function changePhoto(source: 'library' | 'camera') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', `Allow Signalix to access your ${source === 'camera' ? 'camera' : 'photos'} in Settings.`);
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    setBusy(true);
    try {
      await api.uploadAvatar({
        uri: asset.uri,
        name: asset.fileName ?? 'avatar.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
      refresh();
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function photoMenu() {
    const buttons: Parameters<typeof Alert.alert>[2] = [
      { text: 'Choose from library', onPress: () => { void changePhoto('library'); } },
      { text: 'Take photo', onPress: () => { void changePhoto('camera'); } },
    ];
    if (user?.avatarUrl) {
      buttons.push({
        text: 'Remove photo',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          api.removeAvatar().then(refresh).catch((e: Error) => Alert.alert('Error', e.message)).finally(() => setBusy(false));
        },
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile photo', undefined, buttons);
  }

  function handleLogout() {
    Alert.alert('Sign out', 'You will need to sign in again to see your messages.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { void logout(); } },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xl * 1.5, borderBottomLeftRadius: radius.xxl, borderBottomRightRadius: radius.xxl, alignItems: 'center' }}
        >
          <View style={{ alignSelf: 'stretch', flexDirection: 'row', paddingHorizontal: spacing.xl }}>
            <TouchableOpacity accessibilityLabel="Back" onPress={() => navigation.goBack()} hitSlop={12}>
              <Feather name="arrow-left" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={photoMenu} disabled={!user || busy} style={{ marginTop: spacing.md }}>
            <Avatar name={name || '?'} uri={user?.avatarUrl} size={128} ring />
            <View style={{ position: 'absolute', right: 2, bottom: 2, width: 38, height: 38, borderRadius: 19, backgroundColor: '#2a2a30', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#a3a6cc' }}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="camera" size={17} color={colors.text} />}
            </View>
          </TouchableOpacity>

          <Text style={{ color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -1.2, marginTop: spacing.lg, textAlign: 'center', paddingHorizontal: spacing.xl }}>
            {name || ' '}
          </Text>
          {user && <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, marginTop: 2 }}>@{user.username}</Text>}
          <TouchableOpacity onPress={photoMenu} disabled={!user || busy} style={{ marginTop: spacing.lg, backgroundColor: colors.glass, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: 10 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{user?.avatarUrl ? 'Change photo' : 'Add photo'}</Text>
          </TouchableOpacity>
        </LinearGradient>

        <View style={{ padding: spacing.lg, paddingTop: spacing.xl }}>
          <Section label="Account">
            <Row label="Email" value={user?.email ?? '—'} />
            <Row label="Email verified" value={user ? (user.isVerified ? 'Yes' : 'Not yet') : '—'} />
            <Row label="Member since" value={user ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—'} />
            <Row label="Sign-in methods" value={me ? (me.providers.length ? me.providers.join(', ') : 'Password') : '—'} last />
          </Section>

          <Section label="About">
            <Row label="App version" value={Constants.expoConfig?.version ?? '0.0.0'} />
            <Row label="End-to-end encryption" value="On" last />
          </Section>

          <TouchableOpacity
            onPress={handleLogout}
            style={{ backgroundColor: colors.bgElev, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}
          >
            <Feather name="log-out" size={16} color={colors.danger} />
            <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '600' }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
