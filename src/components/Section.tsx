import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { colors, radius, spacing } from '~/lib/theme';

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: spacing.md, marginBottom: spacing.sm }}>{label}</Text>
      <View style={{ backgroundColor: colors.bgElev, borderRadius: radius.lg, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

export function Row({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.text, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 15, flexShrink: 1, textAlign: 'right' }} numberOfLines={2}>{value}</Text>
    </View>
  );
}
