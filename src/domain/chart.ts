import { profitYen } from './calc';
import { dayOf, monthOf, yearOf } from './date';
import { formatCompact, formatNumber } from './format';
import type { PlayRecord } from './types';

/** 棒グラフ1本ぶん（1か月 または 1日）の値 */
export interface ChartSlot {
  /** その期間の収支（円） */
  profit: number;
  /** 期間の始めからの累計（円）。まだ来ていない期間は null */
  cumulative: number | null;
  hasRecords: boolean;
}

export interface ChartTick {
  index: number;
  label: string;
}

export interface ChartData {
  slots: ChartSlot[];
  /** 横軸のラベル位置 */
  ticks: ChartTick[];
  /** 期間内に記録が1件でもあるか */
  hasData: boolean;
}

export type YearGranularity = 'month' | 'day';

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

/** 1月1日を 0 とした通し日（0 始まり） */
function dayIndexInYear(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000);
}

/**
 * 累計を描く最後の位置を決めて、各期間の累計を埋める。
 * 過去の期間は最後まで、現在の期間は今日まで、未来の期間は描かない。
 * ただし、未来の日付の記録がある場合はそこまで描く。
 */
function assemble(profits: number[], counts: number[], periodEnd: number): ChartSlot[] {
  let lastRecord = -1;
  counts.forEach((c, i) => {
    if (c > 0) lastRecord = i;
  });
  const lastSlot = Math.max(periodEnd, lastRecord);
  let running = 0;
  return profits.map((profit, i) => {
    running += profit;
    return { profit, hasRecords: counts[i] > 0, cumulative: i <= lastSlot ? running : null };
  });
}

/** 指定年の、月ごと または 日ごと の収支と累計 */
export function buildYearChart(
  records: readonly PlayRecord[],
  year: number,
  granularity: YearGranularity,
  today: Date = new Date(),
): ChartData {
  const n = granularity === 'month' ? 12 : daysInYear(year);
  const profits: number[] = new Array(n).fill(0);
  const counts: number[] = new Array(n).fill(0);

  for (const r of records) {
    if (yearOf(r.date) !== year) continue;
    const i =
      granularity === 'month' ? monthOf(r.date) - 1 : dayIndexInYear(year, monthOf(r.date), dayOf(r.date));
    profits[i] += profitYen(r);
    counts[i]++;
  }

  const thisYear = today.getFullYear();
  const todaySlot =
    granularity === 'month'
      ? today.getMonth()
      : dayIndexInYear(thisYear, today.getMonth() + 1, today.getDate());
  const periodEnd = year < thisYear ? n - 1 : year === thisYear ? todaySlot : -1;

  const ticks: ChartTick[] =
    granularity === 'month'
      ? Array.from({ length: 12 }, (_, i) => ({ index: i, label: `${i + 1}月` }))
      : Array.from({ length: 12 }, (_, i) => ({
          index: dayIndexInYear(year, i + 1, 1),
          label: `${i + 1}月`,
        }));

  return { slots: assemble(profits, counts, periodEnd), ticks, hasData: counts.some((c) => c > 0) };
}

/** 指定した年月の、日ごとの収支と累計 */
export function buildMonthChart(
  records: readonly PlayRecord[],
  year: number,
  month: number,
  today: Date = new Date(),
): ChartData {
  const n = daysInMonth(year, month);
  const profits: number[] = new Array(n).fill(0);
  const counts: number[] = new Array(n).fill(0);

  for (const r of records) {
    if (yearOf(r.date) !== year || monthOf(r.date) !== month) continue;
    const i = dayOf(r.date) - 1;
    profits[i] += profitYen(r);
    counts[i]++;
  }

  const target = year * 12 + month;
  const now = today.getFullYear() * 12 + today.getMonth() + 1;
  const periodEnd = target < now ? n - 1 : target === now ? today.getDate() - 1 : -1;

  const ticks: ChartTick[] = [1, 5, 10, 15, 20, 25, 30]
    .filter((d) => d <= n)
    .map((d) => ({ index: d - 1, label: `${d}日` }));

  return { slots: assemble(profits, counts, periodEnd), ticks, hasData: counts.some((c) => c > 0) };
}

// ------------------------------------------------------------------
// 軸と座標の計算
// ------------------------------------------------------------------

/** 横罫線の分割数。上下の罫線を含めて DIVISIONS + 1 本になる。 */
export const DIVISIONS = 4;

export interface Range {
  min: number;
  max: number;
}

export interface AxisScale {
  /** 軸の下端・上端の値 */
  lo: number;
  hi: number;
  /** 罫線1つぶんの値 */
  step: number;
}

/** 目盛りの刻み幅に使う係数（× 10^n） */
const NICE_MULTIPLIERS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** 切りのよい数（1・1.5・2・2.5・3・4・5・6・8・10 × 10^n）のうち、x 以上で最小の整数 */
function niceCeil(x: number): number {
  if (x <= 1) return 1;
  const base = 10 ** Math.floor(Math.log10(x));
  for (const m of NICE_MULTIPLIERS) {
    if (m * base >= x * (1 - 1e-12)) return Math.ceil(m * base);
  }
  return 10 * base;
}

const negOf = (r: Range) => Math.max(0, -r.min);
const posOf = (r: Range) => Math.max(0, r.max);

/** 0 より下に k 区間・上に (DIVISIONS - k) 区間とったときの軸 */
function axisFor(r: Range, k: number): AxisScale {
  const below = k > 0 ? negOf(r) / k : 0;
  const above = k < DIVISIONS ? posOf(r) / (DIVISIONS - k) : 0;
  const step = niceCeil(Math.max(below, above));
  return { lo: k === 0 ? 0 : -k * step, hi: (DIVISIONS - k) * step, step };
}

/**
 * 棒グラフ（左軸）と累計の折れ線（右軸）で、0 の高さをそろえた軸を作る。
 * 罫線は2つの軸で共通の位置になり、それぞれの軸の目盛りは切りのよい数になる。
 * 0 の位置（0 より下の区間数 k）は、どちらのデータも収まる候補のうち、
 * 軸の広さがデータの広さに最も近い（余白が最も少ない）ものを選ぶ。
 */
export function alignedAxes(bar: Range, line: Range): { bar: AxisScale; line: AxisScale } {
  const needNegative = negOf(bar) > 0 || negOf(line) > 0;
  const needPositive = posOf(bar) > 0 || posOf(line) > 0;
  const kMin = needNegative ? 1 : 0;
  const kMax = needPositive ? DIVISIONS - 1 : DIVISIONS;

  // データの広さに対する軸の広さ（小さいほど余白が少ない）
  const waste = (axis: AxisScale, r: Range) => {
    const span = negOf(r) + posOf(r);
    return span === 0 ? 0 : (axis.hi - axis.lo) / span;
  };

  let best = { k: kMin, score: Infinity };
  for (let k = kMin; k <= kMax; k++) {
    const score = waste(axisFor(bar, k), bar) + waste(axisFor(line, k), line);
    if (score < best.score - 1e-9) best = { k, score };
  }
  return { bar: axisFor(bar, best.k), line: axisFor(line, best.k) };
}

/** 軸の目盛りの表示。1万以上は「2.5万」のように短くする。 */
export function formatAxisValue(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) >= 10_000) return `${formatCompact(v / 10_000, 1)}万`;
  return formatNumber(v);
}

export interface ChartLayout {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  bars: { x: number; y: number; width: number; height: number; positive: boolean }[];
  line: { x: number; y: number }[];
  grid: { y: number; barLabel: string; lineLabel: string; isZero: boolean }[];
  xLabels: { x: number; text: string }[];
}

const MARGIN = { left: 46, right: 46, top: 10, bottom: 22 };

/** グラフの描画に必要な座標をすべて計算する（描画側はこの結果をそのまま描くだけ）。 */
export function layoutChart(data: ChartData, width: number, height: number): ChartLayout {
  const plot = {
    left: MARGIN.left,
    right: width - MARGIN.right,
    top: MARGIN.top,
    bottom: height - MARGIN.bottom,
  };
  const plotW = Math.max(1, plot.right - plot.left);
  const plotH = Math.max(1, plot.bottom - plot.top);
  const n = data.slots.length;
  const slotW = plotW / n;

  const barValues = data.slots.map((s) => s.profit);
  const lineValues = data.slots.flatMap((s) => (s.cumulative === null ? [] : [s.cumulative]));
  const rangeOf = (values: number[]): Range => ({
    min: Math.min(0, ...values),
    max: Math.max(0, ...values),
  });
  const axes = alignedAxes(rangeOf(barValues), rangeOf(lineValues));

  const yOf = (v: number, a: AxisScale) => plot.top + ((a.hi - v) / (a.hi - a.lo)) * plotH;

  const zeroY = yOf(0, axes.bar);
  const barWidth = Math.max(1, slotW * 0.66);
  const bars = data.slots.flatMap((s, i) => {
    if (s.profit === 0) return [];
    const y = yOf(s.profit, axes.bar);
    return [
      {
        x: plot.left + i * slotW + (slotW - barWidth) / 2,
        y: Math.min(y, zeroY),
        width: barWidth,
        height: Math.max(1, Math.abs(y - zeroY)),
        positive: s.profit > 0,
      },
    ];
  });

  const line = data.slots.flatMap((s, i) =>
    s.cumulative === null
      ? []
      : [{ x: plot.left + (i + 0.5) * slotW, y: yOf(s.cumulative, axes.line) }],
  );

  const grid = Array.from({ length: DIVISIONS + 1 }, (_, i) => {
    const barValue = axes.bar.hi - i * axes.bar.step;
    const lineValue = axes.line.hi - i * axes.line.step;
    return {
      y: plot.top + (i / DIVISIONS) * plotH,
      barLabel: formatAxisValue(barValue),
      lineLabel: formatAxisValue(lineValue),
      isZero: barValue === 0,
    };
  });

  const xLabels = data.ticks.map((t) => ({ x: plot.left + (t.index + 0.5) * slotW, text: t.label }));

  return { width, height, plot, bars, line, grid, xLabels };
}
