import { describe, expect, it } from 'vitest';

import {
  describeRate,
  investmentYen,
  normalizedLottery,
  profitYen,
  recoveryYen,
  toYen,
} from './calc';
import {
  formatDateKey,
  formatDateLong,
  isValidDateKey,
  monthKey,
  parseDateKey,
  todayKey,
} from './date';
import {
  formatCompact,
  formatDecimal1,
  formatNumber,
  formatPercent,
  formatProfit,
  formatWinLoss,
} from './format';
import {
  availableYears,
  groupByMonth,
  summarize,
  summarizeByMonth,
  summarizeByYear,
} from './stats';
import type { PlayRecord } from './types';
import { validateForm, type FormValues } from './validation';

let nextId = 1;
function rec(partial: Partial<PlayRecord> & Pick<PlayRecord, 'date'>): PlayRecord {
  return {
    id: nextId++,
    unit: 'yen',
    investment: 0,
    recovery: 0,
    lendPer1000: null,
    exchangePer1000: null,
    lotteryNumber: null,
    applicants: null,
    machine: '',
    ...partial,
  };
}

describe('calc', () => {
  const yen = { unit: 'yen', lendPer1000: null, exchangePer1000: null } as const;
  const medal = (lend: number, exchange: number | null = null) =>
    ({ unit: 'medal', lendPer1000: lend, exchangePer1000: exchange }) as const;
  const ball = (lend: number, exchange: number | null = null) =>
    ({ unit: 'ball', lendPer1000: lend, exchangePer1000: exchange }) as const;

  it('金額入力はそのまま収支になる', () => {
    expect(profitYen({ ...yen, investment: 10000, recovery: 13500 })).toBe(3500);
  });

  it('投資 0・回収マイナスでも収支を計算できる', () => {
    expect(profitYen({ ...yen, investment: 0, recovery: 0 })).toBe(0);
    expect(profitYen({ ...yen, investment: 0, recovery: -3000 })).toBe(-3000);
    expect(profitYen({ ...yen, investment: 1000, recovery: -500 })).toBe(-1500);
  });

  it('回収がマイナスの枚数・玉数も円換算でき、四捨五入は符号に対して対称', () => {
    const r = { ...medal(50), investment: 100, recovery: -100 };
    expect(recoveryYen(r)).toBe(-2000);
    expect(profitYen(r)).toBe(-4000);
    expect(toYen(1, 400)).toBe(3); // +2.5円 → 3円
    expect(toYen(-1, 400)).toBe(-3); // -2.5円 → -3円
    expect(Object.is(toYen(0, 46), 0)).toBe(true); // -0 にならない
    expect(Object.is(toYen(-0.1, 400), 0)).toBe(true);
  });

  it('50枚貸し・等価は 1枚=20円で換算する', () => {
    const r = { ...medal(50), investment: 500, recovery: 800 };
    expect(investmentYen(r)).toBe(10000);
    expect(recoveryYen(r)).toBe(16000);
    expect(profitYen(r)).toBe(6000);
  });

  it('玉数も同様に換算する（250玉貸し・等価は 1玉=4円）', () => {
    expect(profitYen({ ...ball(250), investment: 1000, recovery: 500 })).toBe(-2000);
  });

  it('貸しと換金で別のレートを使う（46枚貸し・56枚交換）', () => {
    const r = { ...medal(46, 56), investment: 460, recovery: 560 };
    expect(investmentYen(r)).toBe(10000); // 460枚を 1000円=46枚 で借りた
    expect(recoveryYen(r)).toBe(10000); // 560枚を 1000円=56枚 で換金
    expect(profitYen(r)).toBe(0);

    // 同じ枚数でも、等価のほうが回収が大きい
    const equal = { ...medal(46), investment: 460, recovery: 560 };
    expect(recoveryYen(equal)).toBe(12174);
    expect(profitYen(equal)).toBeGreaterThan(profitYen(r));
  });

  it('等価は「交換レート=貸しレート」と同じ結果になる', () => {
    const a = { ...medal(46, null), investment: 1234, recovery: 2345 };
    const b = { ...medal(46, 46), investment: 1234, recovery: 2345 };
    expect(profitYen(a)).toBe(profitYen(b));
  });

  it('端数は記録単位で四捨五入し、投資・回収・収支が食い違わない', () => {
    const r = { ...ball(280), investment: 1001, recovery: 2000 };
    expect(investmentYen(r)).toBe(3575);
    expect(recoveryYen(r)).toBe(7143);
    expect(profitYen(r)).toBe(recoveryYen(r) - investmentYen(r));
    expect(toYen(1, 400)).toBe(3); // 2.5円 → 3円（四捨五入）
  });

  it('レートの表示文字列', () => {
    expect(describeRate(medal(46))).toBe('46枚貸し・等価');
    expect(describeRate(medal(46, 56))).toBe('46枚貸し・56枚交換');
    expect(describeRate(ball(250, 280))).toBe('250玉貸し・280玉交換');
    expect(describeRate(ball(280.1120448))).toBe('280.112玉貸し・等価');
    expect(describeRate(yen)).toBe('');
  });

  it('応募者数を100としたときの抽選番号を返す', () => {
    expect(normalizedLottery({ lotteryNumber: 25, applicants: 50 })).toBe(50);
    expect(normalizedLottery({ lotteryNumber: 1, applicants: 200 })).toBe(0.5);
    expect(normalizedLottery({ lotteryNumber: 30, applicants: 30 })).toBe(100);
  });

  it('抽選情報が欠けている記録は null', () => {
    expect(normalizedLottery({ lotteryNumber: null, applicants: null })).toBeNull();
    expect(normalizedLottery({ lotteryNumber: 5, applicants: null })).toBeNull();
    expect(normalizedLottery({ lotteryNumber: 5, applicants: 0 })).toBeNull();
  });
});

describe('date', () => {
  it('ローカル日付で YYYY-MM-DD にする', () => {
    expect(formatDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayKey(new Date(2026, 8, 21, 0, 0))).toBe('2026-09-21');
  });

  it('存在しない日付は不正とする', () => {
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-2-3')).toBe(false);
    expect(isValidDateKey('2024-02-29')).toBe(true);
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(parseDateKey('abc')).toBeNull();
  });

  it('曜日付きで表示する', () => {
    expect(formatDateLong('2026-09-21')).toBe('2026年9月21日(月)');
  });

  it('年月キーは YYYY-MM（月は0埋め）', () => {
    expect(monthKey(2026, 3)).toBe('2026-03');
    expect(monthKey(2026, 12)).toBe('2026-12');
  });
});

describe('format', () => {
  it('3桁区切りと符号', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(-1234)).toBe('-1,234');
    expect(formatNumber(999)).toBe('999');
    expect(formatProfit(3500)).toBe('+3,500円');
    expect(formatProfit(-12000)).toBe('-12,000円');
    expect(formatProfit(0)).toBe('±0円');
    expect(formatDecimal1(48.25)).toBe('48.3');
    expect(formatPercent(2 / 3)).toBe('66.7%');
  });

  it('勝敗は「x勝y負z分」（0 も省略しない）', () => {
    expect(formatWinLoss({ winCount: 7, loseCount: 3, drawCount: 1 })).toBe('7勝3負1分');
    expect(formatWinLoss({ winCount: 0, loseCount: 0, drawCount: 0 })).toBe('0勝0負0分');
  });

  it('余計な小数を出さない', () => {
    expect(formatCompact(46)).toBe('46');
    expect(formatCompact(21.7391304)).toBe('21.7391');
    expect(formatCompact(277.5)).toBe('277.5');
  });
});

describe('stats', () => {
  const records: PlayRecord[] = [
    rec({ date: '2025-12-31', investment: 10000, recovery: 0 }),
    rec({ date: '2026-01-10', investment: 20000, recovery: 50000, lotteryNumber: 10, applicants: 100 }),
    rec({
      date: '2026-01-20',
      unit: 'medal',
      lendPer1000: 50,
      investment: 500,
      recovery: 300,
      lotteryNumber: 60,
      applicants: 120,
    }),
    rec({ date: '2026-03-05', investment: 5000, recovery: 5000 }),
    rec({ date: '2026-03-05', investment: 3000, recovery: 9000, lotteryNumber: 3, applicants: 100 }),
  ];

  it('合計・勝敗・勝率を集計する', () => {
    const s = summarize(records);
    expect(s.count).toBe(5);
    expect(s.investment).toBe(10000 + 20000 + 10000 + 5000 + 3000);
    expect(s.recovery).toBe(0 + 50000 + 6000 + 5000 + 9000);
    expect(s.profit).toBe(s.recovery - s.investment);
    expect(s.winCount).toBe(2);
    expect(s.loseCount).toBe(2);
    expect(s.drawCount).toBe(1); // 収支ぴったり0円（5,000円投資・5,000円回収）は分け
    expect(s.winCount + s.loseCount + s.drawCount).toBe(s.count);
    expect(s.winRate).toBeCloseTo(2 / 5); // 分けは勝ちに含めず、分母には含める
  });

  it('円換算後に収支がちょうど 0 円になる記録も分けに数える（46枚貸し・56枚交換）', () => {
    const s = summarize([
      rec({ date: '2026-05-01', unit: 'medal', lendPer1000: 46, exchangePer1000: 56, investment: 460, recovery: 560 }),
    ]);
    expect([s.winCount, s.loseCount, s.drawCount]).toEqual([0, 0, 1]);
  });

  it('記録が無いときは勝率・平均抽選番号が null', () => {
    const s = summarize([]);
    expect(s.count).toBe(0);
    expect(s.profit).toBe(0);
    expect([s.winCount, s.loseCount, s.drawCount]).toEqual([0, 0, 0]);
    expect(s.winRate).toBeNull();
    expect(s.avgLottery).toBeNull();
  });

  it('年別集計は新しい年から並び、平均抽選番号は応募者数=100換算の平均', () => {
    expect(availableYears(records)).toEqual([2026, 2025]);
    const [y2026, y2025] = summarizeByYear(records);
    expect(y2026.year).toBe(2026);
    expect(y2025.year).toBe(2025);
    // 10/100→10、60/120→50、3/100→3 の平均
    expect(y2026.lotteryCount).toBe(3);
    expect(y2026.avgLottery).toBeCloseTo((10 + 50 + 3) / 3);
    // 2025年は抽選なし
    expect(y2025.avgLottery).toBeNull();
    expect(y2025.profit).toBe(-10000);
  });

  it('月別集計は指定年の 1〜12 月を返し、他の年は含めない', () => {
    const months = summarizeByMonth(records, 2026);
    expect(months).toHaveLength(12);
    expect(months[0].month).toBe(1);
    expect(months[0].count).toBe(2);
    expect(months[0].profit).toBe(30000 - 4000); // 金額 +30,000 と 枚数 300-500枚×20円 = -4,000
    expect(months[1].count).toBe(0);
    expect(months[2].profit).toBe(6000);
    expect(months.reduce((a, m) => a + m.count, 0)).toBe(4);
  });

  it('記録一覧用に月ごとにまとめ、新しい順に並べる', () => {
    const sections = groupByMonth(records);
    expect(sections.map((s) => s.key)).toEqual(['2026-03', '2026-01', '2025-12']);
    expect(sections[0].data.map((r) => r.date)).toEqual(['2026-03-05', '2026-03-05']);
    // 同じ日は新しく作った記録(id が大きい)が先
    expect(sections[0].data[0].id).toBeGreaterThan(sections[0].data[1].id);
    expect(sections[1].data.map((r) => r.date)).toEqual(['2026-01-20', '2026-01-10']);
    expect(sections[0].summary.profit).toBe(6000);
  });

  it('月別収支で選んだ年月のキーで、記録一覧のセクションを特定できる', () => {
    // 収支タブは monthKey(年, 月) を渡し、記録一覧は section.key で探す
    const sections = groupByMonth(records);
    expect(sections.findIndex((s) => s.key === monthKey(2026, 1))).toBe(1);
    expect(sections.findIndex((s) => s.key === monthKey(2026, 3))).toBe(0);
    expect(sections.findIndex((s) => s.key === monthKey(2025, 12))).toBe(2);
    // 記録の無い月は見つからない（収支タブ側でもタップできない）
    expect(sections.findIndex((s) => s.key === monthKey(2026, 2))).toBe(-1);
  });

  it('月別集計の勝ち・負け・分けが「10回（7勝2負1分）」表示の元になる', () => {
    const many = [
      ...Array.from({ length: 7 }, () => rec({ date: '2026-05-10', investment: 1000, recovery: 2000 })),
      ...Array.from({ length: 2 }, () => rec({ date: '2026-05-11', investment: 1000, recovery: 0 })),
      rec({ date: '2026-05-12', investment: 1000, recovery: 1000 }),
    ];
    const may = summarizeByMonth(many, 2026)[4];
    expect([may.count, may.winCount, may.loseCount, may.drawCount]).toEqual([10, 7, 2, 1]);
    expect(formatWinLoss(may)).toBe('7勝2負1分');
  });
});

describe('validateForm', () => {
  const base: FormValues = {
    date: '2026-09-21',
    unit: 'yen',
    investment: '10000',
    recovery: '15000',
    lendPer1000: '',
    exchangePer1000: '',
    lotteryNumber: '',
    applicants: '',
    machine: '',
  };

  it('金額入力: レート不要で、抽選なしは null', () => {
    const r = validateForm(base);
    expect(r).toEqual({
      ok: true,
      value: {
        date: '2026-09-21',
        unit: 'yen',
        investment: 10000,
        recovery: 15000,
        lendPer1000: null,
        exchangePer1000: null,
        lotteryNumber: null,
        applicants: null,
        machine: '',
      },
    });
  });

  it('金額入力のときは残っているレート欄の値を無視する', () => {
    const r = validateForm({ ...base, lendPer1000: 'abc', exchangePer1000: '-1' });
    expect(r.ok && [r.value.lendPer1000, r.value.exchangePer1000]).toEqual([null, null]);
  });

  it('枚数・玉数では貸しレートが必須', () => {
    const r = validateForm({ ...base, unit: 'medal', lendPer1000: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.lendPer1000).toBeDefined();
  });

  it('換金レートが空欄なら等価（null）', () => {
    const r = validateForm({ ...base, unit: 'medal', lendPer1000: '46', exchangePer1000: '' });
    expect(r.ok && [r.value.lendPer1000, r.value.exchangePer1000]).toEqual([46, null]);
  });

  it('46枚貸し・56枚交換を受け付ける（全角・小数も可）', () => {
    const a = validateForm({ ...base, unit: 'medal', lendPer1000: '46', exchangePer1000: '56' });
    expect(a.ok && [a.value.lendPer1000, a.value.exchangePer1000]).toEqual([46, 56]);
    const b = validateForm({ ...base, unit: 'ball', lendPer1000: '２５０', exchangePer1000: '277.5' });
    expect(b.ok && [b.value.lendPer1000, b.value.exchangePer1000]).toEqual([250, 277.5]);
  });

  it('貸し・換金レートは 0 以下や数値以外を拒否する', () => {
    for (const v of ['0', '-1', 'x']) {
      const lend = validateForm({ ...base, unit: 'medal', lendPer1000: v });
      expect(lend.ok).toBe(false);
      if (!lend.ok) expect(lend.errors.lendPer1000).toBeDefined();

      const ex = validateForm({ ...base, unit: 'medal', lendPer1000: '46', exchangePer1000: v });
      expect(ex.ok).toBe(false);
      if (!ex.ok) expect(ex.errors.exchangePer1000).toBeDefined();
    }
  });

  it('全角数字・カンマを受け付ける', () => {
    const r = validateForm({ ...base, investment: '１０,０００', recovery: '０' });
    expect(r.ok && [r.value.investment, r.value.recovery]).toEqual([10000, 0]);
  });

  it('投資は 0 を入力できる。空欄も 0 として扱う', () => {
    const zero = validateForm({ ...base, investment: '0' });
    expect(zero.ok && zero.value.investment).toBe(0);
    const blank = validateForm({ ...base, investment: '' });
    expect(blank.ok && blank.value.investment).toBe(0);
    const both = validateForm({ ...base, investment: '', recovery: '' });
    expect(both.ok && [both.value.investment, both.value.recovery]).toEqual([0, 0]);
  });

  it('投資は 0 以上の整数のみ（マイナス・小数・文字は不可）', () => {
    for (const v of ['-100', '-1', '1.5', 'abc', '-']) {
      const r = validateForm({ ...base, investment: v });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.investment).toBeDefined();
    }
  });

  it('回収は 0 とマイナスを入力できる。空欄は 0', () => {
    const zero = validateForm({ ...base, recovery: '0' });
    expect(zero.ok && zero.value.recovery).toBe(0);
    const negative = validateForm({ ...base, recovery: '-3000' });
    expect(negative.ok && negative.value.recovery).toBe(-3000);
    const blank = validateForm({ ...base, recovery: '' });
    expect(blank.ok && blank.value.recovery).toBe(0);
  });

  it('回収のマイナスは全角・長音（日本語IMEで「-」を打った場合）・カンマも受け付ける', () => {
    for (const v of ['－３，０００', 'ー3000', '−3,000', '‐3000']) {
      const r = validateForm({ ...base, recovery: v });
      expect(r.ok && r.value.recovery).toBe(-3000);
    }
  });

  it('回収は整数のみ（小数・文字・マイナスだけは不可）', () => {
    for (const v of ['1.5', 'abc', '-', '--5', '5-']) {
      const r = validateForm({ ...base, recovery: v });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.recovery).toBeDefined();
    }
  });

  it('抽選番号と応募者数は両方入力か両方空', () => {
    const onlyNumber = validateForm({ ...base, lotteryNumber: '5' });
    expect(onlyNumber.ok).toBe(false);
    if (!onlyNumber.ok) expect(onlyNumber.errors.applicants).toBeDefined();

    const onlyApplicants = validateForm({ ...base, applicants: '50' });
    expect(onlyApplicants.ok).toBe(false);
    if (!onlyApplicants.ok) expect(onlyApplicants.errors.lotteryNumber).toBeDefined();

    const both = validateForm({ ...base, lotteryNumber: '5', applicants: '50' });
    expect(both.ok && [both.value.lotteryNumber, both.value.applicants]).toEqual([5, 50]);
  });

  it('抽選番号が応募者数を超える・0 は拒否する', () => {
    expect(validateForm({ ...base, lotteryNumber: '51', applicants: '50' }).ok).toBe(false);
    expect(validateForm({ ...base, lotteryNumber: '0', applicants: '50' }).ok).toBe(false);
    expect(validateForm({ ...base, lotteryNumber: '50', applicants: '50' }).ok).toBe(true);
  });

  it('機種名は前後の空白を除去し、長すぎる場合は拒否する', () => {
    const r = validateForm({ ...base, machine: '  北斗の拳  ' });
    expect(r.ok && r.value.machine).toBe('北斗の拳');
    expect(validateForm({ ...base, machine: 'あ'.repeat(51) }).ok).toBe(false);
  });

  it('不正な日付は拒否する', () => {
    expect(validateForm({ ...base, date: '2026-02-30' }).ok).toBe(false);
  });
});
