import type { SQLiteDatabase } from 'expo-sqlite';

import type { ImportMode } from '../domain/backup';
import type { PlayRecord, RecordInput, Unit } from '../domain/types';

export const DATABASE_NAME = 'balance.db';

/**
 * スキーマのマイグレーション。配列の i 番目が「バージョン i → i+1」。
 * 既存の項目は書き換えず、変更は末尾に追加すること（端末内のデータが残っているため）。
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    date           TEXT    NOT NULL,
    unit           TEXT    NOT NULL CHECK (unit IN ('yen', 'medal', 'ball')),
    investment     INTEGER NOT NULL CHECK (investment >= 0),
    recovery       INTEGER NOT NULL CHECK (recovery >= 0),
    rate           REAL    NOT NULL CHECK (rate > 0),
    lottery_number INTEGER,
    applicants     INTEGER,
    machine        TEXT    NOT NULL DEFAULT '',
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL
  );
  CREATE INDEX idx_records_date ON records (date);
  `,
  // v2: 1単位あたりの円(rate) を、貸しレート/換金レート（1000円あたりの枚数・玉数）に置き換える。
  // 旧 rate=r は「1000÷r 枚貸し・等価」に変換するので、既存記録の収支は変わらない。
  `
  CREATE TABLE records_v2 (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    date              TEXT    NOT NULL,
    unit              TEXT    NOT NULL CHECK (unit IN ('yen', 'medal', 'ball')),
    investment        INTEGER NOT NULL CHECK (investment >= 0),
    recovery          INTEGER NOT NULL CHECK (recovery >= 0),
    lend_per_1000     REAL,
    exchange_per_1000 REAL,
    lottery_number    INTEGER,
    applicants        INTEGER,
    machine           TEXT    NOT NULL DEFAULT '',
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL,
    CHECK (
      (unit = 'yen' AND lend_per_1000 IS NULL AND exchange_per_1000 IS NULL)
      OR (unit <> 'yen' AND lend_per_1000 IS NOT NULL AND lend_per_1000 > 0
          AND (exchange_per_1000 IS NULL OR exchange_per_1000 > 0))
    )
  );
  INSERT INTO records_v2
    (id, date, unit, investment, recovery, lend_per_1000, exchange_per_1000,
     lottery_number, applicants, machine, created_at, updated_at)
  SELECT id, date, unit, investment, recovery,
         CASE WHEN unit = 'yen' THEN NULL ELSE 1000.0 / rate END,
         NULL,
         lottery_number, applicants, machine, created_at, updated_at
    FROM records;
  DROP TABLE records;
  ALTER TABLE records_v2 RENAME TO records;
  CREATE INDEX idx_records_date ON records (date);
  `,
  // v3: 回収のマイナスを許可する（recovery >= 0 の制約を外す）。データはそのまま引き継ぐ。
  `
  CREATE TABLE records_v3 (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    date              TEXT    NOT NULL,
    unit              TEXT    NOT NULL CHECK (unit IN ('yen', 'medal', 'ball')),
    investment        INTEGER NOT NULL CHECK (investment >= 0),
    recovery          INTEGER NOT NULL,
    lend_per_1000     REAL,
    exchange_per_1000 REAL,
    lottery_number    INTEGER,
    applicants        INTEGER,
    machine           TEXT    NOT NULL DEFAULT '',
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL,
    CHECK (
      (unit = 'yen' AND lend_per_1000 IS NULL AND exchange_per_1000 IS NULL)
      OR (unit <> 'yen' AND lend_per_1000 IS NOT NULL AND lend_per_1000 > 0
          AND (exchange_per_1000 IS NULL OR exchange_per_1000 > 0))
    )
  );
  INSERT INTO records_v3
    (id, date, unit, investment, recovery, lend_per_1000, exchange_per_1000,
     lottery_number, applicants, machine, created_at, updated_at)
  SELECT id, date, unit, investment, recovery, lend_per_1000, exchange_per_1000,
         lottery_number, applicants, machine, created_at, updated_at
    FROM records;
  DROP TABLE records;
  ALTER TABLE records_v3 RENAME TO records;
  CREATE INDEX idx_records_date ON records (date);
  `,
  // v4: 機種の入力候補から外した機種名。記録そのものは変更しない。
  `
  CREATE TABLE dismissed_machines (
    name TEXT PRIMARY KEY
  );
  `,
];

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

interface RecordRow {
  id: number;
  date: string;
  unit: Unit;
  investment: number;
  recovery: number;
  lend_per_1000: number | null;
  exchange_per_1000: number | null;
  lottery_number: number | null;
  applicants: number | null;
  machine: string;
}

function toRecord(row: RecordRow): PlayRecord {
  return {
    id: row.id,
    date: row.date,
    unit: row.unit,
    investment: row.investment,
    recovery: row.recovery,
    lendPer1000: row.lend_per_1000,
    exchangePer1000: row.exchange_per_1000,
    lotteryNumber: row.lottery_number,
    applicants: row.applicants,
    machine: row.machine,
  };
}

/** 新しい日付順（同じ日は新しく作った順） */
export async function listRecords(db: SQLiteDatabase): Promise<PlayRecord[]> {
  const rows = await db.getAllAsync<RecordRow>(
    `SELECT id, date, unit, investment, recovery, lend_per_1000, exchange_per_1000,
            lottery_number, applicants, machine
       FROM records
      ORDER BY date DESC, id DESC`,
  );
  return rows.map(toRecord);
}

/** 記録を1件追加する（トランザクションは呼び出し側で張る） */
async function insertRow(db: SQLiteDatabase, input: RecordInput, now: string): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO records
       (date, unit, investment, recovery, lend_per_1000, exchange_per_1000,
        lottery_number, applicants, machine, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.date,
      input.unit,
      input.investment,
      input.recovery,
      input.lendPer1000,
      input.exchangePer1000,
      input.lotteryNumber,
      input.applicants,
      input.machine,
      now,
      now,
    ],
  );
  return result.lastInsertRowId;
}

export async function insertRecord(db: SQLiteDatabase, input: RecordInput): Promise<number> {
  let id = 0;
  await db.withTransactionAsync(async () => {
    id = await insertRow(db, input, new Date().toISOString());
    await restoreMachine(db, input.machine);
  });
  return id;
}

export interface ImportOptions {
  /** add: いまの記録に追加する / replace: いまの記録をすべて消して置き換える */
  mode: ImportMode;
  /** バックアップに入っていた、入力候補から外した機種名 */
  dismissedMachines: readonly string[];
}

/**
 * バックアップの記録をまとめて取り込む。すべてひとつのトランザクションで行うので、
 * 途中で失敗したら何も変わらない（置き換えの途中で記録が消えたままになることはない）。
 * 記録はファイルの順に追加されるので、同じ日の記録の並びも保たれる。
 */
export async function importRecords(
  db: SQLiteDatabase,
  records: readonly RecordInput[],
  options: ImportOptions,
): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    if (options.mode === 'replace') {
      await db.runAsync('DELETE FROM records');
      await db.runAsync('DELETE FROM dismissed_machines');
    }
    for (const r of records) await insertRow(db, r, now);

    // 候補から外した機種は、読み込んだ記録で使われていなければ引き継ぐ。
    // 使われている機種は、通常の記録と同じく候補に戻す。
    const used = new Set(records.map((r) => r.machine).filter((m) => m !== ''));
    for (const name of options.dismissedMachines) {
      if (!used.has(name)) await dismissMachine(db, name);
    }
    for (const name of used) await restoreMachine(db, name);
  });
}

/** 更新できたら true、該当 id が無ければ false */
export async function updateRecord(
  db: SQLiteDatabase,
  id: number,
  input: RecordInput,
): Promise<boolean> {
  let updated = false;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `UPDATE records
          SET date = ?, unit = ?, investment = ?, recovery = ?,
              lend_per_1000 = ?, exchange_per_1000 = ?,
              lottery_number = ?, applicants = ?, machine = ?, updated_at = ?
        WHERE id = ?`,
      [
        input.date,
        input.unit,
        input.investment,
        input.recovery,
        input.lendPer1000,
        input.exchangePer1000,
        input.lotteryNumber,
        input.applicants,
        input.machine,
        new Date().toISOString(),
        id,
      ],
    );
    updated = result.changes > 0;
    if (updated) await restoreMachine(db, input.machine);
  });
  return updated;
}

/** 削除できたら true、該当 id が無ければ false */
export async function deleteRecord(db: SQLiteDatabase, id: number): Promise<boolean> {
  const result = await db.runAsync('DELETE FROM records WHERE id = ?', [id]);
  return result.changes > 0;
}

/** 入力候補から外した機種名の一覧 */
export async function listDismissedMachines(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>('SELECT name FROM dismissed_machines');
  return rows.map((r) => r.name);
}

/** 機種名を入力候補から外す。過去の記録は変更しない。 */
export async function dismissMachine(db: SQLiteDatabase, name: string): Promise<void> {
  if (name === '') return;
  await db.runAsync('INSERT OR IGNORE INTO dismissed_machines (name) VALUES (?)', [name]);
}

/** 候補から外していた機種名を、記録に使ったときに候補へ戻す。 */
async function restoreMachine(db: SQLiteDatabase, name: string): Promise<void> {
  if (name === '') return;
  await db.runAsync('DELETE FROM dismissed_machines WHERE name = ?', [name]);
}
