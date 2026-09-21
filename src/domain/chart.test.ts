import { describe, expect, it } from 'vitest';

import {
  alignedAxes,
  buildMonthChart,
  buildYearChart,
  DIVISIONS,
  formatAxisValue,
  layoutChart,
  type ChartData,
} from './chart';
import {
  ALL_MACHINES,
  filterByMachine,
  filterLabel,
  listMachines,
  resolveFilter,
  sameFilter,
} from './machines';
import type { PlayRecord } from './types';

let nextId = 1;
function rec(date: string, investment: number, recovery: number, machine = ''): PlayRecord {
  return {
    id: nextId++,
    date,
    unit: 'yen',
    investment,
    recovery,
    lendPer1000: null,
    exchangePer1000: null,
    lotteryNumber: null,
    applicants: null,
    machine,
  };
}

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('buildYearChart（月ごと）', () => {
  const records = [
    rec('2026-01-10', 10000, 15000), // +5,000
    rec('2026-01-20', 10000, 6000), // -4,000
    rec('2026-03-05', 5000, 25000), // +20,000
    rec('2025-12-31', 1000, 0), // 別の年（含めない）
  ];

  it('12か月ぶんの収支と累計を返す。過去の年は12月まで累計を描く', () => {
    const c = buildYearChart(records, 2026, 'month', d(2027, 6, 1));
    expect(c.slots).toHaveLength(12);
    expect(c.slots.map((s) => s.profit)).toEqual([1000, 0, 20000, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(c.slots.map((s) => s.cumulative)).toEqual([
      1000, 1000, 21000, 21000, 21000, 21000, 21000, 21000, 21000, 21000, 21000, 21000,
    ]);
    expect(c.hasData).toBe(true);
    expect(c.slots[0].hasRecords).toBe(true);
    expect(c.slots[1].hasRecords).toBe(false);
  });

  it('今年は今月まで累計を描き、それ以降は描かない', () => {
    const c = buildYearChart(records, 2026, 'month', d(2026, 5, 15));
    expect(c.slots.map((s) => s.cumulative)).toEqual([
      1000, 1000, 21000, 21000, 21000, null, null, null, null, null, null, null,
    ]);
  });

  it('未来の日付の記録があれば、そこまで累計を描く', () => {
    const c = buildYearChart([...records, rec('2026-08-01', 1000, 3000)], 2026, 'month', d(2026, 5, 15));
    expect(c.slots[7].cumulative).toBe(23000);
    expect(c.slots[8].cumulative).toBeNull();
  });

  it('記録が無い未来の年は累計を描かず、記録なし扱い', () => {
    const c = buildYearChart([], 2030, 'month', d(2026, 5, 15));
    expect(c.hasData).toBe(false);
    expect(c.slots.every((s) => s.cumulative === null)).toBe(true);
  });

  it('前の年の収支は累計に含めない（年初から数える）', () => {
    const c = buildYearChart(records, 2026, 'month', d(2027, 1, 1));
    expect(c.slots[0].cumulative).toBe(1000);
  });

  it('横軸は 1月〜12月', () => {
    const c = buildYearChart(records, 2026, 'month', d(2027, 1, 1));
    expect(c.ticks.map((t) => t.label)).toEqual(Array.from({ length: 12 }, (_, i) => `${i + 1}月`));
    expect(c.ticks.map((t) => t.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('buildYearChart（日ごと）', () => {
  it('平年は365日、閏年は366日', () => {
    expect(buildYearChart([], 2026, 'day', d(2027, 1, 1)).slots).toHaveLength(365);
    expect(buildYearChart([], 2024, 'day', d(2027, 1, 1)).slots).toHaveLength(366);
  });

  it('日付の位置に収支が入り、同じ日の記録は合計される', () => {
    const c = buildYearChart(
      [rec('2026-01-01', 0, 100), rec('2026-03-01', 1000, 0), rec('2026-03-01', 0, 400), rec('2026-12-31', 0, 50)],
      2026,
      'day',
      d(2027, 1, 1),
    );
    expect(c.slots[0].profit).toBe(100);
    expect(c.slots[59].profit).toBe(-600); // 3/1 は 1/1 から数えて59日目（0始まり）
    expect(c.slots[364].profit).toBe(50);
    expect(c.slots[364].cumulative).toBe(100 - 600 + 50);
  });

  it('閏年の3月1日は 60 番目（2/29 があるため）', () => {
    const c = buildYearChart([rec('2024-03-01', 0, 100)], 2024, 'day', d(2025, 1, 1));
    expect(c.slots[60].profit).toBe(100);
    expect(c.slots[59].profit).toBe(0);
  });

  it('横軸ラベルは各月の1日の位置', () => {
    const c = buildYearChart([], 2026, 'day', d(2027, 1, 1));
    expect(c.ticks[0]).toEqual({ index: 0, label: '1月' });
    expect(c.ticks[1]).toEqual({ index: 31, label: '2月' });
    expect(c.ticks[2]).toEqual({ index: 59, label: '3月' });
    expect(c.ticks[11]).toEqual({ index: 334, label: '12月' });
  });

  it('今年は今日まで累計を描く', () => {
    const c = buildYearChart([rec('2026-02-01', 0, 100)], 2026, 'day', d(2026, 2, 3));
    expect(c.slots[31].cumulative).toBe(100); // 2/1
    expect(c.slots[33].cumulative).toBe(100); // 2/3（今日）
    expect(c.slots[34].cumulative).toBeNull();
  });
});

describe('buildMonthChart', () => {
  const records = [
    rec('2026-02-03', 1000, 4000), // +3,000
    rec('2026-02-03', 2000, 0), // -2,000（同じ日は合計）
    rec('2026-02-10', 0, 500),
    rec('2026-03-01', 0, 9999), // 別の月（含めない）
  ];

  it('その月の日数ぶん、日ごとの収支と累計を返す', () => {
    const c = buildMonthChart(records, 2026, 2, d(2026, 4, 1));
    expect(c.slots).toHaveLength(28);
    expect(c.slots[2].profit).toBe(1000);
    expect(c.slots[9].profit).toBe(500);
    expect(c.slots[9].cumulative).toBe(1500);
    expect(c.slots[27].cumulative).toBe(1500);
    expect(c.hasData).toBe(true);
  });

  it('閏年の2月は29日', () => {
    expect(buildMonthChart([], 2024, 2, d(2025, 1, 1)).slots).toHaveLength(29);
    expect(buildMonthChart([], 2026, 1, d(2027, 1, 1)).slots).toHaveLength(31);
  });

  it('今月は今日まで累計を描く。来月以降は描かない', () => {
    const now = d(2026, 2, 12);
    const c = buildMonthChart(records, 2026, 2, now);
    expect(c.slots[11].cumulative).toBe(1500); // 2/12（今日）
    expect(c.slots[12].cumulative).toBeNull();
    const future = buildMonthChart([], 2026, 5, now);
    expect(future.slots.every((s) => s.cumulative === null)).toBe(true);
    expect(future.hasData).toBe(false);
  });

  it('横軸ラベルは月の日数を超えない', () => {
    expect(buildMonthChart([], 2026, 2, d(2027, 1, 1)).ticks.map((t) => t.label)).toEqual([
      '1日', '5日', '10日', '15日', '20日', '25日',
    ]);
    expect(buildMonthChart([], 2026, 1, d(2027, 1, 1)).ticks.map((t) => t.label)).toEqual([
      '1日', '5日', '10日', '15日', '20日', '25日', '30日',
    ]);
  });
});

describe('alignedAxes', () => {
  const cases: [string, { min: number; max: number }, { min: number; max: number }][] = [
    ['すべてプラス', { min: 0, max: 5000 }, { min: 0, max: 30000 }],
    ['すべてマイナス', { min: -8000, max: 0 }, { min: -25000, max: 0 }],
    ['プラスとマイナスが混在', { min: -3000, max: 5000 }, { min: -1000, max: 12000 }],
    ['棒は負が中心・累計は正が中心', { min: -20000, max: 1000 }, { min: 0, max: 40000 }],
    ['すべて 0', { min: 0, max: 0 }, { min: 0, max: 0 }],
    ['ごく小さい値', { min: -1, max: 1 }, { min: -1, max: 2 }],
    ['大きな値', { min: -1_234_567, max: 2_345_678 }, { min: -5_000_000, max: 9_876_543 }],
  ];

  for (const [name, bar, line] of cases) {
    it(`${name}: 軸が範囲を含み、0 の位置が左右でそろう`, () => {
      const a = alignedAxes(bar, line);
      for (const [axis, range] of [
        [a.bar, bar],
        [a.line, line],
      ] as const) {
        expect(axis.lo).toBeLessThanOrEqual(range.min);
        expect(axis.hi).toBeGreaterThanOrEqual(range.max);
        expect(axis.step).toBeGreaterThanOrEqual(1);
        expect(axis.hi - axis.lo).toBeCloseTo(axis.step * DIVISIONS);
      }
      // 0 より下の区間数が左右で同じ = 0 の高さが同じ
      expect(-a.bar.lo / a.bar.step).toBeCloseTo(-a.line.lo / a.line.step);
    });
  }

  it('すべてプラスなら 0 は下端、すべてマイナスなら 0 は上端', () => {
    expect(alignedAxes({ min: 0, max: 5000 }, { min: 0, max: 9000 }).bar.lo).toBe(0);
    expect(alignedAxes({ min: -5000, max: 0 }, { min: -9000, max: 0 }).bar.hi).toBe(0);
  });

  it('目盛りは切りのよい数（1・2・2.5・5 × 10^n）', () => {
    const a = alignedAxes({ min: 0, max: 9000 }, { min: 0, max: 1 });
    expect(a.bar.step).toBe(2500); // 9000 ÷ 4 = 2250 → 2500
    expect(alignedAxes({ min: 0, max: 40000 }, { min: 0, max: 1 }).bar.step).toBe(10000);
  });
});

describe('formatAxisValue', () => {
  it('1万以上は「万」表記', () => {
    expect(formatAxisValue(0)).toBe('0');
    expect(formatAxisValue(2500)).toBe('2,500');
    expect(formatAxisValue(-2500)).toBe('-2,500');
    expect(formatAxisValue(10000)).toBe('1万');
    expect(formatAxisValue(25000)).toBe('2.5万');
    expect(formatAxisValue(-75000)).toBe('-7.5万');
  });
});

describe('layoutChart', () => {
  const build = (records: PlayRecord[]): ChartData =>
    buildYearChart(records, 2026, 'month', d(2027, 1, 1));

  it('プラスの棒は 0 の線より上、マイナスの棒は下に伸び、0 の罫線に接する', () => {
    const data = build([rec('2026-01-05', 0, 5000), rec('2026-02-05', 3000, 0), rec('2026-03-05', 0, 8000)]);
    const l = layoutChart(data, 360, 220);
    const zero = l.grid.find((g) => g.isZero)!;
    expect(l.bars).toHaveLength(3);
    for (const b of l.bars) {
      if (b.positive) expect(b.y + b.height).toBeCloseTo(zero.y);
      else expect(b.y).toBeCloseTo(zero.y);
    }
    // 8,000 の棒は 5,000 の棒より高い
    expect(l.bars[2].height).toBeGreaterThan(l.bars[0].height);
  });

  it('罫線は5本（DIVISIONS+1）で、上端と下端が描画領域と一致する', () => {
    const l = layoutChart(build([rec('2026-01-05', 0, 5000)]), 360, 220);
    expect(l.grid).toHaveLength(DIVISIONS + 1);
    expect(l.grid[0].y).toBeCloseTo(l.plot.top);
    expect(l.grid[DIVISIONS].y).toBeCloseTo(l.plot.bottom);
  });

  it('累計の折れ線は、累計を描く期間の数だけ点があり、描画領域の中に収まる', () => {
    const data = build([rec('2026-01-05', 0, 5000), rec('2026-06-05', 9000, 0)]);
    const l = layoutChart(data, 360, 220);
    expect(l.line).toHaveLength(12);
    for (const p of l.line) {
      expect(p.x).toBeGreaterThan(l.plot.left);
      expect(p.x).toBeLessThan(l.plot.right);
      expect(p.y).toBeGreaterThanOrEqual(l.plot.top - 1e-9);
      expect(p.y).toBeLessThanOrEqual(l.plot.bottom + 1e-9);
    }
  });

  it('累計の最大値・最小値の点は、それぞれの軸の中に収まる（左右の軸で 0 の高さが同じ）', () => {
    const data = build([rec('2026-01-05', 0, 5000), rec('2026-06-05', 30000, 0), rec('2026-09-05', 0, 90000)]);
    const l = layoutChart(data, 360, 220);
    const zero = l.grid.find((g) => g.isZero)!;
    // 累計が 0 の月（なし）は無いが、1月の累計(+5,000)は 0 の線より上
    expect(l.line[0].y).toBeLessThan(zero.y);
    // 6月の累計(-25,000)は 0 の線より下
    expect(l.line[5].y).toBeGreaterThan(zero.y);
  });

  it('全部 0 や記録なしでも NaN にならない', () => {
    const l = layoutChart(build([]), 360, 220);
    const all = [
      ...l.bars.flatMap((b) => [b.x, b.y, b.width, b.height]),
      ...l.line.flatMap((p) => [p.x, p.y]),
      ...l.grid.map((g) => g.y),
      ...l.xLabels.map((x) => x.x),
    ];
    expect(all.every(Number.isFinite)).toBe(true);
    expect(l.grid[0].barLabel).toBeDefined();
  });

  it('横軸ラベルの位置は各棒の中心', () => {
    const l = layoutChart(build([rec('2026-01-05', 0, 5000)]), 360, 220);
    const slotW = (l.plot.right - l.plot.left) / 12;
    expect(l.xLabels).toHaveLength(12);
    expect(l.xLabels[0].x).toBeCloseTo(l.plot.left + slotW / 2);
    expect(l.xLabels[11].x).toBeCloseTo(l.plot.left + slotW * 11.5);
    // 棒の中心もラベルと一致する
    expect(l.bars[0].x + l.bars[0].width / 2).toBeCloseTo(l.xLabels[0].x);
  });

  it('日ごと（365本）でも棒の幅は 1px 以上', () => {
    const data = buildYearChart([rec('2026-05-05', 0, 5000)], 2026, 'day', d(2027, 1, 1));
    const l = layoutChart(data, 360, 220);
    expect(l.bars[0].width).toBeGreaterThanOrEqual(1);
    expect(l.line).toHaveLength(365);
  });
});

describe('機種の絞り込み', () => {
  const records = [
    rec('2026-01-01', 1000, 3000, '北斗の拳'), // +2,000
    rec('2026-01-02', 1000, 0, '北斗の拳'), // -1,000
    rec('2026-01-03', 1000, 500, 'ガンダム'), // -500
    rec('2026-01-04', 1000, 2000, ''), // +1,000（機種未記入）
    rec('2026-01-05', 0, 100, ''), // +100（機種未記入）
  ];

  it('すべて / 機種未記入 / 指定機種 で絞り込める', () => {
    expect(filterByMachine(records, ALL_MACHINES)).toHaveLength(5);
    expect(filterByMachine(records, { kind: 'none' })).toHaveLength(2);
    expect(filterByMachine(records, { kind: 'machine', name: '北斗の拳' })).toHaveLength(2);
    expect(filterByMachine(records, { kind: 'machine', name: '存在しない' })).toHaveLength(0);
  });

  it('機種一覧は記録数の多い順で、機種未記入は別に集計する', () => {
    const list = listMachines(records);
    expect(list.machines.map((m) => [m.name, m.count, m.profit])).toEqual([
      ['北斗の拳', 2, 1000],
      ['ガンダム', 1, -500],
    ]);
    expect(list.unnamed).toEqual({ count: 2, profit: 1100 });
  });

  it('同じ記録数なら名前順', () => {
    const list = listMachines([rec('2026-01-01', 0, 1, 'B機種'), rec('2026-01-02', 0, 1, 'A機種')]);
    expect(list.machines.map((m) => m.name)).toEqual(['A機種', 'B機種']);
  });

  it('対象の記録が無くなった絞り込みは「すべて」に戻す', () => {
    const f = { kind: 'machine', name: 'ガンダム' } as const;
    expect(resolveFilter(f, records)).toEqual(f);
    expect(resolveFilter(f, records.filter((r) => r.machine !== 'ガンダム'))).toEqual(ALL_MACHINES);
    expect(resolveFilter({ kind: 'none' }, records.filter((r) => r.machine !== ''))).toEqual(ALL_MACHINES);
    expect(resolveFilter(ALL_MACHINES, [])).toEqual(ALL_MACHINES);
  });

  it('表示名と同一判定', () => {
    expect(filterLabel(ALL_MACHINES)).toBe('すべての機種');
    expect(filterLabel({ kind: 'none' })).toBe('機種未記入');
    expect(filterLabel({ kind: 'machine', name: 'ガンダム' })).toBe('ガンダム');
    expect(sameFilter({ kind: 'machine', name: 'A' }, { kind: 'machine', name: 'A' })).toBe(true);
    expect(sameFilter({ kind: 'machine', name: 'A' }, { kind: 'machine', name: 'B' })).toBe(false);
    expect(sameFilter({ kind: 'none' }, ALL_MACHINES)).toBe(false);
  });
});
