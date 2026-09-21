import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Text, View } from 'react-native';

import {
  deleteRecord,
  dismissMachine as dismissMachineInDb,
  insertRecord,
  listDismissedMachines,
  listRecords,
  updateRecord,
} from '../db/database';
import type { PlayRecord, RecordInput } from '../domain/types';
import { colors, spacing } from '../theme';

interface RecordsValue {
  /** 新しい日付順 */
  records: PlayRecord[];
  addRecord: (input: RecordInput) => Promise<void>;
  updateRecord: (id: number, input: RecordInput) => Promise<void>;
  removeRecord: (id: number) => Promise<void>;
  /** 入力候補から外した機種名（記録そのものは残る） */
  dismissedMachines: ReadonlySet<string>;
  /** 機種を入力候補から外す。過去の記録は変更しない。 */
  dismissMachine: (name: string) => Promise<void>;
}

const RecordsContext = createContext<RecordsValue | null>(null);

/**
 * 全記録をメモリに保持し、追加・変更・削除のたびに DB から読み直す。
 * 個人利用の収支記録なので件数は数千件程度に収まり、集計は都度メモリ上で行う。
 */
export function RecordsProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [records, setRecords] = useState<PlayRecord[] | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [list, dismissedNames] = await Promise.all([listRecords(db), listDismissedMachines(db)]);
    setDismissed(new Set(dismissedNames));
    setRecords(list);
  }, [db]);

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [reload]);

  const value = useMemo<RecordsValue>(
    () => ({
      records: records ?? [],
      addRecord: async (input) => {
        await insertRecord(db, input);
        await reload();
      },
      updateRecord: async (id, input) => {
        await updateRecord(db, id, input);
        await reload();
      },
      removeRecord: async (id) => {
        await deleteRecord(db, id);
        await reload();
      },
      dismissedMachines: dismissed,
      dismissMachine: async (name) => {
        await dismissMachineInDb(db, name);
        await reload();
      },
    }),
    [db, records, dismissed, reload],
  );

  if (error) {
    return <FatalMessage message={`記録の読み込みに失敗しました。\n${error}`} />;
  }
  if (records === null) return null;

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}

export function useRecords(): RecordsValue {
  const value = useContext(RecordsContext);
  if (!value) throw new Error('useRecords must be used within a <RecordsProvider>');
  return value;
}

export function FatalMessage({ message }: { message: string }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background }}>
      <Text style={{ color: colors.minus, fontSize: 15, lineHeight: 22 }}>{message}</Text>
    </View>
  );
}
