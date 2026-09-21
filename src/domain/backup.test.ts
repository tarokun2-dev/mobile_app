import { describe, expect, it } from 'vitest';

import {
  backupFileName,
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  MAX_BACKUP_RECORDS,
  parseBackup,
  planImport,
  serializeBackup,
  summarizeBackup,
} from './backup';
import type { PlayRecord, RecordInput } from './types';

let nextId = 1;
function rec(over: Partial<PlayRecord> = {}): PlayRecord {
  return {
    id: nextId++,
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
  };
}
const stripId = ({ id: _id, ...rest }: PlayRecord): RecordInput => rest;

const NOW = new Date(2026, 8, 21, 12, 0, 0);

/** 検証テスト用に、記録1件だけのバックアップ JSON を作る */
function fileWith(record: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    records: [record],
    ...extra,
  });
}
const good = {
  date: '2026-09-21',
  unit: 'yen',
  investment: 1000,
  recovery: 0,
  lendPer1000: null,
  exchangePer1000: null,
  lotteryNumber: null,
  applicants: null,
  machine: '',
};

describe('serializeBackup / parseBackup（書き出しと読み込み）', () => {
  const records = [
    rec({ date: '2026-09-21', machine: '北斗の拳', lotteryNumber: 12, applicants: 87 }),
    rec({ date: '2026-08-01', unit: 'medal', lendPer1000: 46, exchangePer1000: 56, investment: 460, recovery: 560 }),
    rec({ date: '2026-08-01', unit: 'ball', lendPer1000: 280.11204481792717, investment: 100, recovery: -50 }),
    rec({ date: '2026-09-21', investment: 0, recovery: 0 }),
  ];

  it('書き出したものを読み込むと、全項目が同じに戻る（小数のレート・マイナスの回収・null も）', () => {
    const text = serializeBackup(records, ['ガンダム'], NOW);
    const result = parseBackup(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = [...records]
      .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
      .map(stripId);
    expect(result.records).toEqual(expected);
    expect(result.dismissedMachines).toEqual(['ガンダム']);
    expect(result.exportedAt).toBe(NOW.toISOString());
  });

  it('古い日付から並べ、同じ日は作成順（id 順）。読み込むと同じ日の並びが保たれる', () => {
    const a = rec({ date: '2026-05-01', machine: 'A' });
    const b = rec({ date: '2026-05-01', machine: 'B' });
    const c = rec({ date: '2026-04-30', machine: 'C' });
    const result = parseBackup(serializeBackup([b, a, c], [], NOW));
    expect(result.ok && result.records.map((r) => r.machine)).toEqual(['C', 'A', 'B']);
  });

  it('id はファイルに含めない', () => {
    const text = serializeBackup([rec()], [], NOW);
    expect(text).not.toContain('"id"');
    expect(JSON.parse(text)).toMatchObject({ app: BACKUP_APP_ID, formatVersion: BACKUP_FORMAT_VERSION });
  });

  it('記録が 0 件でも書き出し・読み込みできる', () => {
    const result = parseBackup(serializeBackup([], [], NOW));
    expect(result).toMatchObject({ ok: true, records: [], dismissedMachines: [] });
  });

  it('日本語の機種名や絵文字も壊れない', () => {
    const r = rec({ machine: '北斗の拳 🎰 ｶﾞﾝﾀﾞﾑ' });
    const result = parseBackup(serializeBackup([r], [], NOW));
    expect(result.ok && result.records[0].machine).toBe('北斗の拳 🎰 ｶﾞﾝﾀﾞﾑ');
  });

  it('ファイル名は日付入り', () => {
    expect(backupFileName(new Date(2026, 0, 5))).toBe('pachi-shushi-backup-2026-01-05.json');
  });

  it('BOM 付きでも読める', () => {
    const result = parseBackup('﻿' + serializeBackup([rec()], [], NOW));
    expect(result.ok).toBe(true);
  });
});

describe('parseBackup（ファイル全体の検証）', () => {
  it('JSON でないファイルは読み込まない', () => {
    const r = parseBackup('これは JSON ではありません');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('JSON');
  });

  it('このアプリのバックアップでないファイルは読み込まない', () => {
    for (const text of ['{}', '[]', 'null', '"x"', JSON.stringify({ app: 'other', formatVersion: 1, records: [] })]) {
      const r = parseBackup(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('バックアップファイルではありません');
    }
  });

  it('新しい版のファイルは、アプリの更新を案内して読み込まない', () => {
    const r = parseBackup(JSON.stringify({ app: BACKUP_APP_ID, formatVersion: BACKUP_FORMAT_VERSION + 1, records: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('アプリを更新');
  });

  it('版が不正・記録が配列でないファイルは読み込まない', () => {
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP_ID, formatVersion: 'x', records: [] })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP_ID, formatVersion: 0, records: [] })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP_ID, formatVersion: 1, records: {} })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP_ID, formatVersion: 1 })).ok).toBe(false);
  });

  it('記録が多すぎるファイルは読み込まない', () => {
    const many = Array.from({ length: MAX_BACKUP_RECORDS + 1 }, () => good);
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP_ID, formatVersion: 1, records: many })).ok).toBe(false);
  });

  it('1件でも不正な記録があれば、全体を読み込まず、どの記録かを示す', () => {
    const text = JSON.stringify({
      app: BACKUP_APP_ID,
      formatVersion: 1,
      records: [good, { ...good, date: '2026-02-30' }, good, { ...good, unit: 'coin' }],
    });
    const r = parseBackup(text);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('2件');
      expect(r.error).toContain('2件目');
      expect(r.error).toContain('4件目');
    }
  });

  it('不正な記録が多いときは、先頭の3件だけ示す', () => {
    const bad = Array.from({ length: 6 }, () => ({ ...good, date: 'x' }));
    const r = parseBackup(JSON.stringify({ app: BACKUP_APP_ID, formatVersion: 1, records: bad }));
    expect(!r.ok && r.error).toContain('6件');
    expect(!r.ok && r.error).toContain('ほか3件');
  });
});

describe('parseBackup（記録1件の検証）', () => {
  const rejects = (label: string, override: Record<string, unknown>) =>
    it(`${label} は読み込まない`, () => {
      expect(parseBackup(fileWith({ ...good, ...override })).ok).toBe(false);
    });
  const accepts = (label: string, override: Record<string, unknown>) =>
    it(`${label} は読み込める`, () => {
      expect(parseBackup(fileWith({ ...good, ...override })).ok).toBe(true);
    });

  accepts('基本の記録', {});
  accepts('投資 0', { investment: 0 });
  accepts('回収のマイナス', { recovery: -3000 });
  accepts('機種名なし（項目が無い）', { machine: undefined });
  accepts('レートの項目が無い金額入力', { lendPer1000: undefined, exchangePer1000: undefined });

  rejects('存在しない日付', { date: '2026-02-30' });
  rejects('日付が文字列でない', { date: 20260921 });
  rejects('日付の書式が違う', { date: '2026/09/21' });
  rejects('未知の入力単位', { unit: 'coin' });
  rejects('投資がマイナス', { investment: -1 });
  rejects('投資が小数', { investment: 1.5 });
  rejects('投資が文字列', { investment: '1000' });
  rejects('投資が上限超え', { investment: 1_000_000_000 });
  rejects('回収が小数', { recovery: 0.5 });
  rejects('回収が上限超え', { recovery: -1_000_000_000 });
  rejects('回収が null', { recovery: null });
  rejects('金額入力なのに貸しレートがある', { lendPer1000: 46 });
  rejects('金額入力なのに換金レートがある', { exchangePer1000: 56 });
  rejects('機種名が文字列でない', { machine: 5 });
  rejects('機種名が長すぎる', { machine: 'あ'.repeat(51) });
  rejects('抽選番号だけある', { lotteryNumber: 5 });
  rejects('応募者数だけある', { applicants: 50 });
  rejects('抽選番号が応募者数を超える', { lotteryNumber: 51, applicants: 50 });
  rejects('抽選番号が 0', { lotteryNumber: 0, applicants: 50 });
  rejects('抽選番号が小数', { lotteryNumber: 1.5, applicants: 50 });
  it('記録が配列やオブジェクトでない場合は読み込まない', () => {
    for (const bad of [null, 5, 'x', [], [1]]) expect(parseBackup(fileWith(bad)).ok).toBe(false);
  });

  const medal = { ...good, unit: 'medal', lendPer1000: 46, exchangePer1000: null };
  it('枚数・玉数: 貸しレートが必須。換金レートは無ければ等価', () => {
    expect(parseBackup(fileWith(medal)).ok).toBe(true);
    expect(parseBackup(fileWith({ ...medal, exchangePer1000: 56 })).ok).toBe(true);
    for (const bad of [{ lendPer1000: null }, { lendPer1000: 0 }, { lendPer1000: -1 }, { lendPer1000: '46' }, { lendPer1000: 100_001 }]) {
      expect(parseBackup(fileWith({ ...medal, ...bad })).ok).toBe(false);
    }
    for (const bad of [{ exchangePer1000: 0 }, { exchangePer1000: -5 }, { exchangePer1000: '56' }]) {
      expect(parseBackup(fileWith({ ...medal, ...bad })).ok).toBe(false);
    }
  });

  it('機種名の前後の空白は取り除く', () => {
    const r = parseBackup(fileWith({ ...good, machine: '  北斗の拳  ' }));
    expect(r.ok && r.records[0].machine).toBe('北斗の拳');
  });

  it('桁あふれで Infinity になる数値（1e999）は受け付けない', () => {
    // JSON.stringify では Infinity が null になるため、ファイルの文字列を直接書き換えて作る
    const text = fileWith({ ...medal, lendPer1000: 46 }).replace('"lendPer1000":46', '"lendPer1000":1e999');
    expect(text).toContain('1e999');
    expect(JSON.parse(text).records[0].lendPer1000).toBe(Infinity); // 前提の確認
    expect(parseBackup(text).ok).toBe(false);
    const big = fileWith({ ...good, investment: 1000 }).replace('"investment":1000', '"investment":1e999');
    expect(parseBackup(big).ok).toBe(false);
  });

  it('余分な項目や、id が書かれていても無視して読み込める', () => {
    const r = parseBackup(fileWith({ ...good, id: 999, note: 'x' }));
    expect(r.ok).toBe(true);
    expect(r.ok && Object.keys(r.records[0]).sort()).toEqual(
      ['applicants', 'date', 'exchangePer1000', 'investment', 'lendPer1000', 'lotteryNumber', 'machine', 'recovery', 'unit'].sort(),
    );
  });
});

describe('parseBackup（候補から外した機種）', () => {
  it('文字列だけを取り出し、空・重複・長すぎるものは除く。項目が無ければ空', () => {
    const r = parseBackup(fileWith(good, { dismissedMachines: ['A', 'A', ' B ', '', 5, null, 'あ'.repeat(51)] }));
    expect(r.ok && r.dismissedMachines).toEqual(['A', 'B']);
    expect(parseBackup(fileWith(good)).ok && (parseBackup(fileWith(good)) as { dismissedMachines: string[] }).dismissedMachines).toEqual([]);
    const notArray = parseBackup(fileWith(good, { dismissedMachines: 'A' }));
    expect(notArray.ok && notArray.dismissedMachines).toEqual([]);
  });
});

describe('planImport（追加する記録の決定）', () => {
  const a = stripId(rec({ machine: 'A' }));
  const b = stripId(rec({ machine: 'B', investment: 500 }));

  it('置き換えは、すべて追加する', () => {
    const plan = planImport([a], [a, b], 'replace');
    expect(plan.toAdd).toEqual([a, b]);
    expect(plan.skipped).toBe(0);
  });

  it('追加: すでにある記録は追加しない（同じファイルを2回読み込んでも二重にならない）', () => {
    const plan = planImport([rec({ ...a })], [a, b], 'add');
    expect(plan.toAdd).toEqual([b]);
    expect(plan.skipped).toBe(1);
  });

  it('追加: 何もない状態なら、すべて追加する', () => {
    expect(planImport([], [a, b], 'add')).toEqual({ toAdd: [a, b], skipped: 0 });
  });

  it('追加: 同じ内容の記録が複数あるときは、個数まで数えて足りない分だけ追加する', () => {
    // 手元に2件、ファイルに3件 → 1件だけ追加
    const plan = planImport([rec({ ...a }), rec({ ...a })], [a, a, a], 'add');
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.skipped).toBe(2);
    // 手元に1件、ファイルに1件 → 追加なし
    expect(planImport([rec({ ...a })], [a], 'add')).toEqual({ toAdd: [], skipped: 1 });
  });

  it('追加: 1項目でも違えば別の記録として追加する', () => {
    const variants: RecordInput[] = [
      { ...a, date: '2026-09-22' },
      { ...a, investment: a.investment + 1 },
      { ...a, recovery: a.recovery - 1 },
      { ...a, machine: 'A2' },
      { ...a, lotteryNumber: 1, applicants: 2 },
      { ...a, unit: 'medal', lendPer1000: 46 },
    ];
    const plan = planImport([rec({ ...a })], variants, 'add');
    expect(plan.toAdd).toHaveLength(variants.length);
    expect(plan.skipped).toBe(0);
  });

  it('追加: 小数のレートも一致すれば重複と判定できる', () => {
    const x = stripId(rec({ unit: 'ball', lendPer1000: 280.11204481792717 }));
    const roundTripped = parseBackup(serializeBackup([rec({ ...x })], [], NOW));
    expect(roundTripped.ok).toBe(true);
    if (!roundTripped.ok) return;
    expect(planImport([rec({ ...x })], roundTripped.records, 'add').skipped).toBe(1);
  });
});

describe('summarizeBackup', () => {
  it('件数と期間を返す', () => {
    const s = summarizeBackup([stripId(rec({ date: '2026-05-02' })), stripId(rec({ date: '2025-12-31' })), stripId(rec({ date: '2026-09-21' }))]);
    expect(s).toEqual({ count: 3, firstDate: '2025-12-31', lastDate: '2026-09-21' });
    expect(summarizeBackup([])).toEqual({ count: 0, firstDate: null, lastDate: null });
  });
});
