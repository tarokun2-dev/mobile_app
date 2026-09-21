import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { formatProfit } from '../domain/format';
import { colors, profitColor, radius, spacing } from '../theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** 収支を色付き・符号付きで表示する */
export function ProfitText({ value, style }: { value: number; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ color: profitColor(value), fontWeight: '700' }, style]}>{formatProfit(value)}</Text>;
}

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 小さな選択肢ボタン（レート候補・機種候補） */
export function Chip({
  label,
  selected,
  onPress,
  onLongPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityHint={onLongPress ? '長押しで削除' : undefined}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'danger';
  disabled?: boolean;
}) {
  const danger = variant === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        danger ? styles.buttonDanger : styles.buttonPrimary,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.buttonText, danger && { color: colors.minus }]}>{label}</Text>
    </Pressable>
  );
}

export function StatRow({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <View style={styles.statRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.statLabel}>{label}</Text>
        {note ? <Text style={styles.statNote}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#E4E7EB',
    borderRadius: radius.sm,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: radius.sm - 2,
  },
  segmentSelected: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, color: colors.subtext },
  segmentTextSelected: { color: colors.text, fontWeight: '700' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text },
  chipTextSelected: { color: colors.onPrimary, fontWeight: '700' },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonDanger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.minus },
  buttonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  statLabel: { fontSize: 14, color: colors.subtext },
  statNote: { fontSize: 11, color: colors.disabled, marginTop: 1 },
});
