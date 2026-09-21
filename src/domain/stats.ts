import { investmentYen, normalizedLottery, profitYen, recoveryYen } from './calc';
import { monthKey, monthOf, yearOf } from './date';
import type { PlayRecord } from './types';

export interface Summary {
  count: number;
  /** 投資合計（円） */
  investment: number;
  /** 回収合計（円） */
  recovery: number;
  /** 収支合計（円） */
  profit: number;
  /** 収支がプラスの記録数 */
  winCount: number;
  /** 収支がマイナスの記録数 */
  loseCount: number;
  /** 収支がちょうど 0 円の記録数（分け） */
  drawCount: number;
  /** 勝率（0〜1）。記録が無いときは null。分けは勝ちに含めない（分母には含める）。 */
  winRate: number | null;
  /** 抽選番号・応募者数の両方がある記録の数 */
  lotteryCount: number;
  /** 平均抽選番号（応募者数を100とした場合）。対象記録が無いときは null。 */
  avgLottery: number | null;
}

export interface YearSummary extends Summary {
  year: number;
}

export interface MonthSummary extends Summary {
  /** 1〜12 */
  month: number;
}

export interface MonthSection {
  /** 'YYYY-MM' */
  key: string;
  year: number;
  month: number;
  summary: Summary;
  data: PlayRecord[];
}

export function summarize(records: readonly PlayRecord[]): Summary {
  let investment = 0;
  let recovery = 0;
  let winCount = 0;
  let loseCount = 0;
  let drawCount = 0;
  let lotterySum = 0;
  let lotteryCount = 0;

  for (const r of records) {
    investment += investmentYen(r);
    recovery += recoveryYen(r);
    const p = profitYen(r);
    if (p > 0) winCount++;
    else if (p < 0) loseCount++;
    else drawCount++;

    const score = normalizedLottery(r);
    if (score !== null) {
      lotterySum += score;
      lotteryCount++;
    }
  }

  return {
    count: records.length,
    investment,
    recovery,
    profit: recovery - investment,
    winCount,
    loseCount,
    drawCount,
    winRate: records.length > 0 ? winCount / records.length : null,
    lotteryCount,
    avgLottery: lotteryCount > 0 ? lotterySum / lotteryCount : null,
  };
}

/** 記録がある年の一覧（新しい順） */
export function availableYears(records: readonly PlayRecord[]): number[] {
  const years = new Set(records.map((r) => yearOf(r.date)));
  return [...years].sort((a, b) => b - a);
}

/** 年別集計（新しい年が先頭）。記録の無い年は含めない。 */
export function summarizeByYear(records: readonly PlayRecord[]): YearSummary[] {
  return availableYears(records).map((year) => ({
    year,
    ...summarize(records.filter((r) => yearOf(r.date) === year)),
  }));
}

/** 指定年の月別集計。記録の無い月も含めた 1〜12 月を返す。 */
export function summarizeByMonth(records: readonly PlayRecord[], year: number): MonthSummary[] {
  const inYear = records.filter((r) => yearOf(r.date) === year);
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    ...summarize(inYear.filter((r) => monthOf(r.date) === i + 1)),
  }));
}

/** 記録一覧用に、新しい月が先頭・月内も新しい順で並べたセクションを返す。 */
export function groupByMonth(records: readonly PlayRecord[]): MonthSection[] {
  const sorted = [...records].sort((a, b) =>
    a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1,
  );
  const groups: PlayRecord[][] = [];
  for (const r of sorted) {
    const last = groups[groups.length - 1];
    if (last && last[0].date.slice(0, 7) === r.date.slice(0, 7)) last.push(r);
    else groups.push([r]);
  }
  return groups.map((data) => {
    const year = yearOf(data[0].date);
    const month = monthOf(data[0].date);
    return { key: monthKey(year, month), year, month, summary: summarize(data), data };
  });
}
