import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDateKey, formatDateLong, parseDateKey, todayKey } from '../domain/date';
import { colors, radius, spacing } from '../theme';

interface Props {
  /** 'YYYY-MM-DD' */
  value: string;
  onChange: (value: string) => void;
}

/** iOS はコンパクトなインラインピッカー、Android はタップでダイアログを開く。 */
export function DateField({ value, onChange }: Props) {
  const date = parseDateKey(value) ?? new Date();

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      onValueChange: (_, selected) => onChange(formatDateKey(selected)),
    });
  };

  return (
    <View style={styles.row}>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={date}
          mode="date"
          display="compact"
          locale="ja-JP"
          onValueChange={(_, selected) => onChange(formatDateKey(selected))}
        />
      ) : (
        <Pressable onPress={openAndroid} accessibilityRole="button" style={styles.androidButton}>
          <Text style={styles.androidText}>{formatDateLong(value)}</Text>
        </Pressable>
      )}
      <Pressable
        onPress={() => onChange(todayKey())}
        accessibilityRole="button"
        disabled={value === todayKey()}
        style={styles.today}
      >
        <Text style={[styles.todayText, value === todayKey() && { color: colors.disabled }]}>今日</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  androidButton: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  androidText: { fontSize: 16, color: colors.text },
  today: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  todayText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
});
