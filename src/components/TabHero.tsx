import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, display, heroGradient, radius, spacing } from '~/lib/theme';

/** Gradient header used by the Calls / Groups tabs (same language as the Chats hero). */
export function TabHero({ title, children }: { title: string; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={heroGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        paddingTop: insets.top + spacing.xl,
        paddingBottom: spacing.xl,
        borderBottomLeftRadius: radius.xxl,
        borderBottomRightRadius: radius.xxl,
        marginBottom: spacing.md,
      }}
    >
      <Text style={[display, { paddingHorizontal: spacing.xl }]}>{title}</Text>
      {children && <View style={{ marginTop: spacing.xl }}>{children}</View>}
    </LinearGradient>
  );
}

export const heroLabel = { color: colors.text, fontSize: 12, marginTop: 6, fontWeight: '500' as const };
