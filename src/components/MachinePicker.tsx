import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ALL_MACHINES,
  filterLabel,
  listMachines,
  sameFilter,
  type MachineFilter,
} from '../domain/machines';
import { summarize } from '../domain/stats';
import type { PlayRecord } from '../domain/types';
import { colors, radius, spacing } from '../theme';
import { ProfitText } from './ui';

interface Option {
  key: string;
  filter: MachineFilter;
  label: string;
  count: number;
  profit: number;
}

interface Props {
  /** 絞り込む前の全記録（候補の一覧に使う） */
  records: readonly PlayRecord[];
  value: MachineFilter;
  onChange: (filter: MachineFilter) => void;
}

/** 「機種：○○ ▾」のボタンと、タップで開く機種の選択画面 */
export function MachinePicker({ records, value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const options = useMemo<Option[]>(() => {
    const { machines, unnamed } = listMachines(records);
    const list: Option[] = [
      {
        key: 'all',
        filter: ALL_MACHINES,
        label: filterLabel(ALL_MACHINES),
        count: records.length,
        profit: summarize(records).profit,
      },
      ...machines.map((m) => ({
        key: `machine:${m.name}`,
        filter: { kind: 'machine', name: m.name } as MachineFilter,
        label: m.name,
        count: m.count,
        profit: m.profit,
      })),
    ];
    if (unnamed.count > 0) {
      list.push({
        key: 'none',
        filter: { kind: 'none' },
        label: filterLabel({ kind: 'none' }),
        count: unnamed.count,
        profit: unnamed.profit,
      });
    }
    return list;
  }, [records]);

  const choose = (filter: MachineFilter) => {
    onChange(filter);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`機種の絞り込み。現在は${filterLabel(value)}`}
        style={({ pressed }) => [styles.button, pressed && { backgroundColor: '#F0F2F5' }]}
      >
        <Text style={styles.buttonLabel}>機種</Text>
        <Text style={styles.buttonValue} numberOfLines={1}>
          {filterLabel(value)}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      {/* Modal は別ウィンドウなので、画面端の余白（ナビゲーションバーなど）はその中で取得し直す */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaProvider>
          <MachineSheet options={options} value={value} onChoose={choose} onClose={() => setOpen(false)} />
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

function MachineSheet({
  options,
  value,
  onChoose,
  onClose,
}: {
  options: Option[];
  value: MachineFilter;
  onChoose: (filter: MachineFilter) => void;
  onClose: () => void;
}) {
  // 3ボタンナビゲーションやジェスチャーバーの高さ。最後の項目が隠れないよう、その分の余白を下に足す。
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.backdrop}>
      {/* 枠の外をタップしたら閉じる */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="閉じる" />
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>機種を選ぶ</Text>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.close}>閉じる</Text>
          </Pressable>
        </View>
        <FlatList
          data={options}
          keyExtractor={(o) => o.key}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.md }}
          renderItem={({ item }) => {
            const selected = sameFilter(item.filter, value);
            return (
              <Pressable
                onPress={() => onChoose(item.filter)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#F0F2F5' }]}
              >
                <Text style={styles.check}>{selected ? '✓' : ''}</Text>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={styles.rowMeta}>{item.count}回</Text>
                </View>
                <ProfitText value={item.profit} style={styles.rowProfit} />
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttonLabel: { fontSize: 13, color: colors.subtext, marginRight: spacing.md },
  buttonValue: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  chevron: { fontSize: 14, color: colors.subtext, marginLeft: spacing.sm },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  close: { fontSize: 15, color: colors.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  check: { width: 24, fontSize: 16, color: colors.primary },
  rowBody: { flex: 1, paddingRight: spacing.sm },
  rowLabel: { fontSize: 15, color: colors.text },
  rowLabelSelected: { fontWeight: '700' },
  rowMeta: { fontSize: 12, color: colors.subtext, marginTop: 2 },
  rowProfit: { fontSize: 15 },
});
