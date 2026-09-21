import { profitYen } from './calc';
import type { PlayRecord } from './types';

/** 収支画面の機種の絞り込み */
export type MachineFilter =
  | { kind: 'all' }
  /** 機種が未記入の記録だけ */
  | { kind: 'none' }
  | { kind: 'machine'; name: string };

export const ALL_MACHINES: MachineFilter = { kind: 'all' };

export function filterByMachine(records: readonly PlayRecord[], filter: MachineFilter): PlayRecord[] {
  switch (filter.kind) {
    case 'all':
      return [...records];
    case 'none':
      return records.filter((r) => r.machine === '');
    case 'machine':
      return records.filter((r) => r.machine === filter.name);
  }
}

export interface MachineEntry {
  name: string;
  count: number;
  /** 収支合計（円） */
  profit: number;
}

export interface MachineList {
  /** 記録数の多い順（同数は名前順） */
  machines: MachineEntry[];
  /** 機種未記入の記録 */
  unnamed: { count: number; profit: number };
}

export function listMachines(records: readonly PlayRecord[]): MachineList {
  const byName = new Map<string, MachineEntry>();
  const unnamed = { count: 0, profit: 0 };

  for (const r of records) {
    const profit = profitYen(r);
    if (r.machine === '') {
      unnamed.count++;
      unnamed.profit += profit;
      continue;
    }
    const entry = byName.get(r.machine) ?? { name: r.machine, count: 0, profit: 0 };
    entry.count++;
    entry.profit += profit;
    byName.set(r.machine, entry);
  }

  const machines = [...byName.values()].sort((a, b) =>
    b.count !== a.count ? b.count - a.count : a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  return { machines, unnamed };
}

/** 記録の編集などで対象が無くなった絞り込みは「すべて」に戻す。 */
export function resolveFilter(filter: MachineFilter, records: readonly PlayRecord[]): MachineFilter {
  if (filter.kind === 'all') return filter;
  return filterByMachine(records, filter).length > 0 ? filter : ALL_MACHINES;
}

export function filterLabel(filter: MachineFilter): string {
  switch (filter.kind) {
    case 'all':
      return 'すべての機種';
    case 'none':
      return '機種未記入';
    case 'machine':
      return filter.name;
  }
}

export function sameFilter(a: MachineFilter, b: MachineFilter): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'machine' || (b.kind === 'machine' && a.name === b.name);
}
