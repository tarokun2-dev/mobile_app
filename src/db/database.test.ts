/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { beforeEach, describe, expect, it } from 'vitest';

import { profitYen } from '../domain/calc';
import type { RecordInput } from '../domain/types';
import {
  deleteRecord,
  dismissMachine,
  importRecords,
  insertRecord,
  listDismissedMachines,
  listRecords,
  MIGRATIONS,
  migrateDatabase,
  updateRecord,
} from './database';

/** expo-sqlite の SQLiteDatabase のうち、保存層が使う部分だけを node:sqlite で再現する。 */
function createTestDb(raw: DatabaseSync = new DatabaseSync(':memory:')) {
  const db = {
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, params: (string | number | null)[] = []) {
      const r = raw.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getAllAsync(sql: string, params: (string | number | null)[] = []) {
      return raw.prepare(sql).all(...params);
    },
    async getFirstAsync(sql: string, params: (string | number | null)[] = []) {
      return raw.prepare(sql).get(...params) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { db: db as unknown as SQLiteDatabase, raw };
}

const input = (over: Partial<RecordInput> = {}): RecordInput => ({
  date: '2026-09-21',
  unit: 'yen',
  investment: 10000,
  recovery: 15000,
  lendPer1000: null,
  exchangePer1000: null,
  lotteryNumber: null,
  applicants: null,
  machine: '',
  ...over,
});

describe('database', () => {
  let db: SQLiteDatabase;
  let raw: DatabaseSync;

  beforeEach(async () => {
    ({ db, raw } = createTestDb());
    await migrateDatabase(db);
  });

  it('マイグレーションは何度実行しても安全で、バージョンが記録される', async () => {
    await migrateDatabase(db);
    await migrateDatabase(db);
    const v = raw.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(v.user_version).toBe(MIGRATIONS.length);
  });

  it('追加した記録をそのまま取得できる（null も含む）', async () => {
    const id = await insertRecord(
      db,
      input({
        unit: 'medal',
        lendPer1000: 46,
        exchangePer1000: 56,
        investment: 500,
        recovery: 830,
        lotteryNumber: 12,
        applicants: 87,
        machine: '北斗の拳',
      }),
    );
    await insertRecord(db, input({ date: '2026-09-22' }));

    const list = await listRecords(db);
    expect(list).toHaveLength(2);
    // 日付の新しい順
    expect(list[0].date).toBe('2026-09-22');
    expect(list[0].lotteryNumber).toBeNull();
    expect(list[0].applicants).toBeNull();
    expect(list[1]).toEqual({
      id,
      date: '2026-09-21',
      unit: 'medal',
      investment: 500,
      recovery: 830,
      lendPer1000: 46,
      exchangePer1000: 56,
      lotteryNumber: 12,
      applicants: 87,
      machine: '北斗の拳',
    });
  });

  it('等価は exchangePer1000 = null のまま保存・取得できる', async () => {
    await insertRecord(db, input({ unit: 'ball', lendPer1000: 250, exchangePer1000: null }));
    const [r] = await listRecords(db);
    expect(r.lendPer1000).toBe(250);
    expect(r.exchangePer1000).toBeNull();
  });

  it('同じ日の記録は新しく作った順', async () => {
    const a = await insertRecord(db, input());
    const b = await insertRecord(db, input());
    expect((await listRecords(db)).map((r) => r.id)).toEqual([b, a]);
  });

  it('記録を変更できる（抽選情報を消すことも、単位を変えることも可能）', async () => {
    const id = await insertRecord(db, input({ lotteryNumber: 3, applicants: 30, machine: 'A' }));
    const ok = await updateRecord(
      db,
      id,
      input({
        date: '2026-08-01',
        unit: 'ball',
        lendPer1000: 250,
        exchangePer1000: 280,
        investment: 800,
        recovery: 0,
      }),
    );
    expect(ok).toBe(true);
    const [r] = await listRecords(db);
    expect(r).toMatchObject({
      id,
      date: '2026-08-01',
      unit: 'ball',
      lendPer1000: 250,
      exchangePer1000: 280,
      investment: 800,
      recovery: 0,
      lotteryNumber: null,
      applicants: null,
      machine: '',
    });
  });

  it('存在しない id の更新・削除は false を返す', async () => {
    expect(await updateRecord(db, 999, input())).toBe(false);
    expect(await deleteRecord(db, 999)).toBe(false);
  });

  it('記録を削除できる', async () => {
    const a = await insertRecord(db, input());
    const b = await insertRecord(db, input({ date: '2026-09-22' }));
    expect(await deleteRecord(db, a)).toBe(true);
    expect((await listRecords(db)).map((r) => r.id)).toEqual([b]);
  });

  it('投資 0 と、回収の 0・マイナスを保存できる', async () => {
    await insertRecord(db, input({ investment: 0, recovery: 0 }));
    await insertRecord(db, input({ investment: 0, recovery: -3000, date: '2026-09-22' }));
    await insertRecord(
      db,
      input({ unit: 'medal', lendPer1000: 46, investment: 100, recovery: -50, date: '2026-09-23' }),
    );
    const list = await listRecords(db);
    expect(list.map((r) => [r.investment, r.recovery])).toEqual([
      [100, -50],
      [0, -3000],
      [0, 0],
    ]);
  });

  it('回収のマイナスを含めて更新もできる', async () => {
    const id = await insertRecord(db, input({ investment: 1000, recovery: 500 }));
    expect(await updateRecord(db, id, input({ investment: 1000, recovery: -200 }))).toBe(true);
    expect((await listRecords(db))[0].recovery).toBe(-200);
  });

  it('不正な値は DB の制約で弾かれる', async () => {
    await expect(insertRecord(db, input({ unit: 'coin' as never }))).rejects.toThrow();
    await expect(insertRecord(db, input({ investment: -1 }))).rejects.toThrow(); // 投資のマイナスは不可
    // 枚数・玉数なのに貸しレートが無い / 0 以下
    await expect(insertRecord(db, input({ unit: 'medal', lendPer1000: null }))).rejects.toThrow();
    await expect(insertRecord(db, input({ unit: 'medal', lendPer1000: 0 }))).rejects.toThrow();
    await expect(
      insertRecord(db, input({ unit: 'medal', lendPer1000: 46, exchangePer1000: 0 })),
    ).rejects.toThrow();
    // 金額入力なのにレートが入っている
    await expect(insertRecord(db, input({ unit: 'yen', lendPer1000: 46 }))).rejects.toThrow();
  });
});

describe('マイグレーション v1 → v2（旧レート「円/単位」から貸し・換金レートへ）', () => {
  /** v1 時点のスキーマとデータを再現する（端末に残っている旧データ） */
  function createV1Db() {
    const { db, raw } = createTestDb();
    raw.exec(MIGRATIONS[0]);
    raw.exec('PRAGMA user_version = 1');
    const insert = raw.prepare(
      `INSERT INTO records
         (date, unit, investment, recovery, rate, lottery_number, applicants, machine, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 't', 't')`,
    );
    return { db, raw, insert };
  }

  it('既存の記録を、内容を保ったまま等価レートに変換する', async () => {
    const { db, insert } = createV1Db();
    insert.run('2026-09-01', 'yen', 10000, 12000, 1, null, null, '');
    insert.run('2026-09-02', 'medal', 500, 800, 20, 12, 87, '北斗の拳'); // 20円/枚 → 50枚貸し
    insert.run('2026-09-03', 'medal', 500, 100, 5, null, null, ''); // 5円/枚 → 200枚貸し
    insert.run('2026-09-04', 'ball', 1000, 500, 4, 3, 30, 'ガンダム'); // 4円/玉 → 250玉貸し

    await migrateDatabase(db);

    const list = await listRecords(db);
    expect(list.map((r) => r.date)).toEqual(['2026-09-04', '2026-09-03', '2026-09-02', '2026-09-01']);
    const [ball, five, medal, yen] = list;

    expect(yen).toMatchObject({
      unit: 'yen',
      investment: 10000,
      recovery: 12000,
      lendPer1000: null,
      exchangePer1000: null,
    });
    expect(medal).toMatchObject({
      unit: 'medal',
      investment: 500,
      recovery: 800,
      exchangePer1000: null, // 等価
      lotteryNumber: 12,
      applicants: 87,
      machine: '北斗の拳',
    });
    expect(medal.lendPer1000).toBeCloseTo(50, 9);
    expect(five.lendPer1000).toBeCloseTo(200, 9);
    expect(ball.lendPer1000).toBeCloseTo(250, 9);
    expect(ball).toMatchObject({ lotteryNumber: 3, applicants: 30, machine: 'ガンダム' });

    // 旧レートで計算した収支と、変換後の収支が一致する
    expect(profitYen(medal)).toBe((800 - 500) * 20);
    expect(profitYen(five)).toBe((100 - 500) * 5);
    expect(profitYen(ball)).toBe((500 - 1000) * 4);
  });

  it('端数のある旧レート（3.57円/玉など）でも収支が変わらない', async () => {
    const { db, insert } = createV1Db();
    insert.run('2026-09-01', 'ball', 1001, 2000, 3.57, null, null, '');
    await migrateDatabase(db);
    const [r] = await listRecords(db);
    expect(profitYen(r)).toBe(Math.round(2000 * 3.57) - Math.round(1001 * 3.57));
  });

  it('変換後も新規追加・採番が正常に動き、索引が作り直されている', async () => {
    const { db, raw, insert } = createV1Db();
    insert.run('2026-09-01', 'medal', 100, 100, 20, null, null, '');
    await migrateDatabase(db);

    const id = await insertRecord(db, input({ unit: 'medal', lendPer1000: 46, exchangePer1000: 56 }));
    expect(id).toBeGreaterThan(1);
    expect((await listRecords(db)).map((r) => r.id).sort()).toEqual([1, id]);

    const idx = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_records_date'")
      .all();
    expect(idx).toHaveLength(1);
  });

  it('記録が 0 件でも変換できる', async () => {
    const { db } = createV1Db();
    await migrateDatabase(db);
    expect(await listRecords(db)).toEqual([]);
  });
});

describe('マイグレーション v2 → v3（回収のマイナスを許可）', () => {
  it('v2 のデータをそのまま残して、回収のマイナスを保存できるようになる', async () => {
    const { db, raw } = createTestDb();
    // v2 時点のスキーマ（recovery >= 0 の制約あり）とデータを再現する
    raw.exec(MIGRATIONS[0]);
    raw.exec(MIGRATIONS[1]);
    raw.exec('PRAGMA user_version = 2');
    const insert = raw.prepare(
      `INSERT INTO records
         (date, unit, investment, recovery, lend_per_1000, exchange_per_1000,
          lottery_number, applicants, machine, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 't', 't')`,
    );
    insert.run('2026-09-01', 'yen', 10000, 12000, null, null, null, null, '');
    insert.run('2026-09-02', 'medal', 460, 560, 46, 56, 12, 87, '北斗の拳');

    // v2 では回収のマイナスは制約で拒否される（前提の確認）
    expect(() =>
      insert.run('2026-09-03', 'yen', 0, -1, null, null, null, null, ''),
    ).toThrow();

    await migrateDatabase(db);

    const [medal, yen] = await listRecords(db);
    expect(yen).toMatchObject({ date: '2026-09-01', unit: 'yen', investment: 10000, recovery: 12000 });
    expect(medal).toMatchObject({
      date: '2026-09-02',
      unit: 'medal',
      investment: 460,
      recovery: 560,
      lendPer1000: 46,
      exchangePer1000: 56,
      lotteryNumber: 12,
      applicants: 87,
      machine: '北斗の拳',
    });

    // v3 ではマイナスを保存できる。投資のマイナスとレートの制約は引き続き有効
    await insertRecord(db, input({ investment: 0, recovery: -3000 }));
    await expect(insertRecord(db, input({ investment: -1 }))).rejects.toThrow();
    await expect(insertRecord(db, input({ unit: 'medal', lendPer1000: null }))).rejects.toThrow();

    const v = raw.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(v.user_version).toBe(MIGRATIONS.length); // v3 を経由して最新まで進む
    const idx = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_records_date'")
      .all();
    expect(idx).toHaveLength(1);
  });
});

describe('機種の入力候補（候補から外した機種名）', () => {
  let db: SQLiteDatabase;

  beforeEach(async () => {
    ({ db } = createTestDb());
    await migrateDatabase(db);
  });

  it('候補から外した機種名を保存・取得できる。同じ名前を重ねて外してもエラーにならない', async () => {
    expect(await listDismissedMachines(db)).toEqual([]);
    await dismissMachine(db, '北斗の拳');
    await dismissMachine(db, '北斗の拳');
    await dismissMachine(db, 'ガンダム');
    expect((await listDismissedMachines(db)).sort()).toEqual(['ガンダム', '北斗の拳']);
  });

  it('空の機種名は無視する', async () => {
    await dismissMachine(db, '');
    expect(await listDismissedMachines(db)).toEqual([]);
  });

  it('候補から外しても、過去の記録の機種名は変わらない', async () => {
    await insertRecord(db, input({ machine: '北斗の拳' }));
    await dismissMachine(db, '北斗の拳');
    const [r] = await listRecords(db);
    expect(r.machine).toBe('北斗の拳');
  });

  it('その機種で新しく記録すると、候補に戻る', async () => {
    await dismissMachine(db, '北斗の拳');
    await dismissMachine(db, 'ガンダム');
    await insertRecord(db, input({ machine: '北斗の拳' }));
    expect(await listDismissedMachines(db)).toEqual(['ガンダム']);
  });

  it('記録の機種を変更して保存したときも、その機種は候補に戻る', async () => {
    const id = await insertRecord(db, input({ machine: '' }));
    await dismissMachine(db, 'ガンダム');
    await updateRecord(db, id, input({ machine: 'ガンダム' }));
    expect(await listDismissedMachines(db)).toEqual([]);
  });

  it('機種未記入の記録を保存しても、外した候補は戻らない', async () => {
    await dismissMachine(db, 'ガンダム');
    await insertRecord(db, input({ machine: '' }));
    expect(await listDismissedMachines(db)).toEqual(['ガンダム']);
  });

  it('保存に失敗した場合は、候補の状態も変わらない（同じトランザクション）', async () => {
    await dismissMachine(db, 'ガンダム');
    await expect(insertRecord(db, input({ machine: 'ガンダム', investment: -1 }))).rejects.toThrow();
    expect(await listDismissedMachines(db)).toEqual(['ガンダム']);
    expect(await listRecords(db)).toEqual([]);
  });

  it('記録を削除しても、外した候補の設定は残る', async () => {
    const id = await insertRecord(db, input({ machine: 'A' }));
    await dismissMachine(db, 'A');
    await deleteRecord(db, id);
    expect(await listDismissedMachines(db)).toEqual(['A']);
  });
});

describe('マイグレーション v3 → v4（機種候補テーブルの追加）', () => {
  it('既存の記録を変えずにテーブルを追加する', async () => {
    const { db, raw } = createTestDb();
    for (const m of MIGRATIONS.slice(0, 3)) raw.exec(m);
    raw.exec('PRAGMA user_version = 3');
    raw
      .prepare(
        `INSERT INTO records (date, unit, investment, recovery, machine, created_at, updated_at)
         VALUES ('2026-09-01', 'yen', 100, -50, '北斗の拳', 't', 't')`,
      )
      .run();

    await migrateDatabase(db);

    const [r] = await listRecords(db);
    expect(r).toMatchObject({ date: '2026-09-01', investment: 100, recovery: -50, machine: '北斗の拳' });
    expect(await listDismissedMachines(db)).toEqual([]);
    await dismissMachine(db, '北斗の拳');
    expect(await listDismissedMachines(db)).toEqual(['北斗の拳']);
    const v = raw.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(v.user_version).toBe(4);
  });
});

describe('バックアップの一括読み込み（importRecords）', () => {
  let db: SQLiteDatabase;

  beforeEach(async () => {
    ({ db } = createTestDb());
    await migrateDatabase(db);
  });

  const dates = async () => (await listRecords(db)).map((r) => `${r.date}:${r.machine}`);

  it('置き換え: いまの記録と候補の設定をすべて消して、ファイルの内容にする', async () => {
    await insertRecord(db, input({ date: '2026-01-01', machine: '古い機種' }));
    await dismissMachine(db, '古い候補');

    await importRecords(
      db,
      [input({ date: '2026-05-01', machine: 'A' }), input({ date: '2026-05-02', machine: 'B' })],
      { mode: 'replace', dismissedMachines: ['ガンダム'] },
    );

    expect(await dates()).toEqual(['2026-05-02:B', '2026-05-01:A']);
    expect(await listDismissedMachines(db)).toEqual(['ガンダム']);
  });

  it('置き換え: 0 件のファイルなら、記録が空になる', async () => {
    await insertRecord(db, input());
    await importRecords(db, [], { mode: 'replace', dismissedMachines: [] });
    expect(await listRecords(db)).toEqual([]);
  });

  it('追加: いまの記録は残り、ファイルの記録が加わる。外した候補は和集合になる', async () => {
    await insertRecord(db, input({ date: '2026-01-01', machine: '既存' }));
    await dismissMachine(db, '既存の候補');

    await importRecords(db, [input({ date: '2026-05-01', machine: 'A' })], {
      mode: 'add',
      dismissedMachines: ['新しい候補'],
    });

    expect(await dates()).toEqual(['2026-05-01:A', '2026-01-01:既存']);
    expect((await listDismissedMachines(db)).sort()).toEqual(['既存の候補', '新しい候補'].sort());
  });

  it('追加: 外した候補があっても、それを使う記録を追加したら候補に戻る。無関係な候補は触らない', async () => {
    await insertRecord(db, input({ machine: '既存で使用中' }));
    await dismissMachine(db, '既存で使用中'); // 記録は残したまま候補から外している
    await dismissMachine(db, 'X');

    await importRecords(db, [input({ machine: 'X' })], { mode: 'add', dismissedMachines: [] });

    // X は読み込んだ記録で使われたので候補に戻る。既存の「使用中」は外したまま
    expect(await listDismissedMachines(db)).toEqual(['既存で使用中']);
  });

  it('ファイルの中で、記録に使われている機種が外した候補にも入っていたら、使用中を優先して候補に残す', async () => {
    await importRecords(db, [input({ machine: 'A' })], { mode: 'replace', dismissedMachines: ['A', 'B'] });
    expect(await listDismissedMachines(db)).toEqual(['B']);
  });

  it('同じ日の記録は、ファイルの順に取り込まれ、並びが保たれる', async () => {
    await importRecords(
      db,
      [input({ date: '2026-05-01', machine: '1番目' }), input({ date: '2026-05-01', machine: '2番目' })],
      { mode: 'replace', dismissedMachines: [] },
    );
    // 同じ日は新しく作った記録（あとに入れたもの）が先に表示される
    expect(await dates()).toEqual(['2026-05-01:2番目', '2026-05-01:1番目']);
  });

  it('途中で失敗したら、何も変わらない（置き換えでも、いまの記録は消えない）', async () => {
    const keep = await insertRecord(db, input({ machine: '残るはず' }));
    await dismissMachine(db, '残る候補');

    await expect(
      importRecords(db, [input({ machine: 'OK' }), input({ investment: -1 })], {
        mode: 'replace',
        dismissedMachines: ['新しい'],
      }),
    ).rejects.toThrow();

    const list = await listRecords(db);
    expect(list.map((r) => [r.id, r.machine])).toEqual([[keep, '残るはず']]);
    expect(await listDismissedMachines(db)).toEqual(['残る候補']);
  });

  it('追加の途中で失敗した場合も、追加分は残らない', async () => {
    await insertRecord(db, input({ machine: '既存' }));
    await expect(
      importRecords(db, [input({ machine: 'OK' }), input({ unit: 'medal', lendPer1000: null })], {
        mode: 'add',
        dismissedMachines: [],
      }),
    ).rejects.toThrow();
    expect((await listRecords(db)).map((r) => r.machine)).toEqual(['既存']);
  });

  it('大量（5,000件）でも取り込める', async () => {
    const many = Array.from({ length: 5000 }, (_, i) =>
      input({ date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, recovery: i }),
    );
    await importRecords(db, many, { mode: 'replace', dismissedMachines: [] });
    expect(await listRecords(db)).toHaveLength(5000);
  });
});
