import { isValidDateKey } from './date';
import type { PlayRecord, RecordInput, Unit } from './types';
import { LIMITS } from './validation';

/**
 * バックアップファイル（JSON）の書式と、読み込み時の検証。
 *
 * 記録の id は端末ごとの連番なので含めない。読み込み時は、ファイルに書かれた順に新しい id が振られる。
 * 読み込むファイルは信頼できない入力として扱い、すべての値を厳密に検証する。
 */

export const BACKUP_APP_ID = 'pachi-shushi';
export const BACKUP_FORMAT_VERSION = 1;
/** 読み込めるファイルの大きさ・記録数の上限（誤って巨大なファイルを選んだときの保護） */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_BACKUP_RECORDS = 100_000;
const MAX_DISMISSED_MACHINES = 10_000;

const UNIT_VALUES: readonly Unit[] = ['yen', 'medal', 'ball'];

export type ImportMode = 'add' | 'replace';

export interface Backup {
  records: RecordInput[];
  /** 入力候補から外した機種名 */
  dismissedMachines: string[];
  /** ファイルを書き出した日時（ISO 8601）。無ければ null */
  exportedAt: string | null;
}

export type ParseResult = ({ ok: true } & Backup) | { ok: false; error: string };

const pad2 = (n: number) => String(n).padStart(2, '0');

export function backupFileName(now: Date): string {
  return `pachi-shushi-backup-${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.json`;
}

/** 記録を JSON にする。古い日付から、同じ日は作成順（id 順）に並べる。 */
export function serializeBackup(
  records: readonly PlayRecord[],
  dismissedMachines: readonly string[],
  now: Date,
): string {
  const sorted = [...records].sort((a, b) =>
    a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1,
  );
  const data = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    records: sorted.map((r) => ({
      date: r.date,
      unit: r.unit,
      investment: r.investment,
      recovery: r.recovery,
      lendPer1000: r.lendPer1000,
      exchangePer1000: r.exchangePer1000,
      lotteryNumber: r.lotteryNumber,
      applicants: r.applicants,
      machine: r.machine,
    })),
    dismissedMachines: [...dismissedMachines].sort(),
  };
  return JSON.stringify(data, null, 2);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

/** 1件の記録を検証する。問題があればメッセージ、なければ記録を返す。 */
function checkRecord(raw: unknown): string | RecordInput {
  if (!isRecord(raw)) return '記録の形式が正しくありません';

  if (typeof raw.date !== 'string' || !isValidDateKey(raw.date)) return '日付が正しくありません';
  if (!UNIT_VALUES.includes(raw.unit as Unit)) return '入力単位（金額・枚数・玉数）が正しくありません';
  const unit = raw.unit as Unit;

  const { MAX_AMOUNT, MAX_PER_1000, MAX_LOTTERY, MAX_MACHINE_LENGTH } = LIMITS;
  if (!isInt(raw.investment) || raw.investment < 0 || raw.investment > MAX_AMOUNT) {
    return '投資が正しくありません';
  }
  if (!isInt(raw.recovery) || Math.abs(raw.recovery) > MAX_AMOUNT) return '回収が正しくありません';

  let lendPer1000: number | null = null;
  let exchangePer1000: number | null = null;
  const lend = raw.lendPer1000 ?? null;
  const exchange = raw.exchangePer1000 ?? null;
  if (unit === 'yen') {
    if (lend !== null || exchange !== null) return '金額入力の記録にレートが入っています';
  } else {
    if (typeof lend !== 'number' || !Number.isFinite(lend) || lend <= 0 || lend > MAX_PER_1000) {
      return '貸しレートが正しくありません';
    }
    lendPer1000 = lend;
    if (exchange !== null) {
      if (typeof exchange !== 'number' || !Number.isFinite(exchange) || exchange <= 0 || exchange > MAX_PER_1000) {
        return '換金レートが正しくありません';
      }
      exchangePer1000 = exchange;
    }
  }

  const ln = raw.lotteryNumber ?? null;
  const ap = raw.applicants ?? null;
  let lotteryNumber: number | null = null;
  let applicants: number | null = null;
  if (ln !== null || ap !== null) {
    if (!isInt(ln) || !isInt(ap) || ln < 1 || ap < 1 || ln > MAX_LOTTERY || ap > MAX_LOTTERY) {
      return '抽選番号・応募者数が正しくありません';
    }
    if (ln > ap) return '抽選番号が応募者数を超えています';
    lotteryNumber = ln;
    applicants = ap;
  }

  const machineRaw = raw.machine ?? '';
  if (typeof machineRaw !== 'string') return '機種名が正しくありません';
  const machine = machineRaw.trim();
  if (machine.length > MAX_MACHINE_LENGTH) return '機種名が長すぎます';

  return {
    date: raw.date,
    unit,
    investment: raw.investment,
    recovery: raw.recovery,
    lendPer1000,
    exchangePer1000,
    lotteryNumber,
    applicants,
    machine,
  };
}

/** バックアップのテキストを読み取る。1件でも不正な記録があれば、全体を読み込まない。 */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'ファイルが大きすぎます' };

  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: 'ファイルの形式が正しくありません（JSON として読み取れません）' };
  }

  if (!isRecord(data) || data.app !== BACKUP_APP_ID) {
    return { ok: false, error: 'このアプリで書き出したバックアップファイルではありません' };
  }
  if (!isInt(data.formatVersion) || data.formatVersion < 1) {
    return { ok: false, error: 'バックアップファイルの版が正しくありません' };
  }
  if (data.formatVersion > BACKUP_FORMAT_VERSION) {
    return { ok: false, error: 'より新しい版のアプリで書き出されたファイルです。アプリを更新してから読み込んでください' };
  }
  if (!Array.isArray(data.records)) {
    return { ok: false, error: '記録のデータがありません' };
  }
  if (data.records.length > MAX_BACKUP_RECORDS) {
    return { ok: false, error: `記録が多すぎます（${MAX_BACKUP_RECORDS}件まで）` };
  }

  const records: RecordInput[] = [];
  const problems: string[] = [];
  data.records.forEach((raw, i) => {
    const r = checkRecord(raw);
    if (typeof r === 'string') problems.push(`${i + 1}件目: ${r}`);
    else records.push(r);
  });
  if (problems.length > 0) {
    const shown = problems.slice(0, 3).join('\n');
    const more = problems.length > 3 ? `\n…ほか${problems.length - 3}件` : '';
    return { ok: false, error: `不正な記録が${problems.length}件あるため、読み込めません。\n${shown}${more}` };
  }

  const dismissed = Array.isArray(data.dismissedMachines)
    ? [
        ...new Set(
          data.dismissedMachines
            .filter((n): n is string => typeof n === 'string')
            .map((n) => n.trim())
            .filter((n) => n !== '' && n.length <= LIMITS.MAX_MACHINE_LENGTH),
        ),
      ].slice(0, MAX_DISMISSED_MACHINES)
    : [];

  return {
    ok: true,
    records,
    dismissedMachines: dismissed,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
  };
}

/** 記録の中身が同じかを判定するためのキー（id は含めない） */
function recordKey(r: RecordInput): string {
  return JSON.stringify([
    r.date,
    r.unit,
    r.investment,
    r.recovery,
    r.lendPer1000,
    r.exchangePer1000,
    r.lotteryNumber,
    r.applicants,
    r.machine,
  ]);
}

/**
 * 読み込む記録のうち、実際に追加するものを決める。
 * - 置き換え: すべて追加する。
 * - 追加: すでに同じ内容の記録がある分は追加しない（同じファイルを2回読み込んでも二重にならない）。
 *   同じ内容の記録が複数あるのは普通にあり得るので、個数まで数えて、足りない分だけ追加する。
 */
export function planImport(
  existing: readonly RecordInput[],
  incoming: readonly RecordInput[],
  mode: ImportMode,
): { toAdd: RecordInput[]; skipped: number } {
  if (mode === 'replace') return { toAdd: [...incoming], skipped: 0 };

  const remaining = new Map<string, number>();
  for (const e of existing) remaining.set(recordKey(e), (remaining.get(recordKey(e)) ?? 0) + 1);

  const toAdd: RecordInput[] = [];
  let skipped = 0;
  for (const r of incoming) {
    const key = recordKey(r);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      skipped++;
    } else {
      toAdd.push(r);
    }
  }
  return { toAdd, skipped };
}

/** 確認画面に出す、ファイルの内容の要約 */
export function summarizeBackup(records: readonly RecordInput[]): {
  count: number;
  firstDate: string | null;
  lastDate: string | null;
} {
  if (records.length === 0) return { count: 0, firstDate: null, lastDate: null };
  let first = records[0].date;
  let last = records[0].date;
  for (const r of records) {
    if (r.date < first) first = r.date;
    if (r.date > last) last = r.date;
  }
  return { count: records.length, firstDate: first, lastDate: last };
}
