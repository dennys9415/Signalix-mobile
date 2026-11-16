import type { ReactNode } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity, ActivityIndicator, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, display, heroGradient, radius, spacing } from '~/lib/theme';

/** Gradient hero with a big two-line title, form on black below. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + spacing.xl * 2, paddingBottom: spacing.xl * 1.5, paddingHorizontal: spacing.xl, borderBottomLeftRadius: radius.xxl, borderBottomRightRadius: radius.xxl }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 }}>Signalix</Text>
          <Text style={[display, { marginTop: spacing.xl }]}>{title}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, marginTop: spacing.md }}>{subtitle}</Text>
        </LinearGradient>
        <View style={{ padding: spacing.xl, gap: spacing.md }}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="rgba(255,255,255,0.45)"
      {...props}
      style={{ backgroundColor: colors.bgElev, color: colors.text, borderRadius: radius.pill, paddingHorizontal: spacing.xl, height: 56, fontSize: 15, borderWidth: 1, borderColor: colors.border }}
    />
  );
}

export function PrimaryButton({ label, onPress, loading }: { label: string; onPress: () => void; loading: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={loading} style={{ borderRadius: radius.pill, overflow: 'hidden', marginTop: spacing.sm, opacity: loading ? 0.6 : 1 }}>
      <LinearGradient colors={heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 56, alignItems: 'center', justifyContent: 'center' }}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{label}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );
}
