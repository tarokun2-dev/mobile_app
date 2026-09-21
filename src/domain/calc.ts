import { formatCompact } from './format';
import type { PlayRecord, Unit } from './types';

type NonYen = Exclude<Unit, 'yen'>;
type Amounts = Pick<PlayRecord, 'unit' | 'investment' | 'recovery' | 'lendPer1000' | 'exchangePer1000'>;
type Lottery = Pick<PlayRecord, 'lotteryNumber' | 'applicants'>;

export const UNIT_LABEL: Record<Unit, string> = {
  yen: '金額',
  medal: '枚数',
  ball: '玉数',
};

/** 数量の単位（円 / 枚 / 玉） */
export const UNIT_SUFFIX: Record<Unit, string> = {
  yen: '円',
  medal: '枚',
  ball: '玉',
};

/** 貸しレートの候補（1000円あたりの枚数/玉数） */
export const LEND_PRESETS: Record<NonYen, readonly number[]> = {
  medal: [46, 47, 50],
  ball: [250, 500, 1000],
};

/** 換金レートの候補（1000円あたりの枚数/玉数）。「等価」は別ボタンで選ぶ。 */
export const EXCHANGE_PRESETS: Record<NonYen, readonly number[]> = {
  medal: [50, 55, 56],
  ball: [275, 280],
};

export const DEFAULT_LEND: Record<NonYen, number> = {
  medal: 46,
  ball: 250,
};

/** 1単位あたりの円（1000円あたり n 枚 → 1000 ÷ n 円） */
export function yenPerUnit(per1000: number): number {
  return 1000 / per1000;
}

/**
 * 数量を円に換算する。合計が記録ごとの表示と食い違わないよう、記録単位で四捨五入する。
 * 回収はマイナスもあり得るので、符号によらず対称に四捨五入する（-2.5 → -3、-0 は 0）。
 */
export function toYen(amount: number, per1000: number): number {
  const yen = (amount * 1000) / per1000;
  const rounded = Math.sign(yen) * Math.round(Math.abs(yen));
  return rounded === 0 ? 0 : rounded; // -0 を +0 にそろえる
}

/** 投資（円）。貸しレートで換算する。 */
export function investmentYen(r: Amounts): number {
  if (r.unit === 'yen' || r.lendPer1000 === null) return r.investment;
  return toYen(r.investment, r.lendPer1000);
}

/** 回収（円）。換金レートで換算する（等価のときは貸しレートと同じ）。 */
export function recoveryYen(r: Amounts): number {
  if (r.unit === 'yen' || r.lendPer1000 === null) return r.recovery;
  return toYen(r.recovery, r.exchangePer1000 ?? r.lendPer1000);
}

/** 収支（円）= 回収 - 投資 */
export function profitYen(r: Amounts): number {
  return recoveryYen(r) - investmentYen(r);
}

/** 「46枚貸し・等価」「46枚貸し・56枚交換」。金額入力は空文字。 */
export function describeRate(r: Pick<PlayRecord, 'unit' | 'lendPer1000' | 'exchangePer1000'>): string {
  if (r.unit === 'yen' || r.lendPer1000 === null) return '';
  const s = UNIT_SUFFIX[r.unit];
  const exchange = r.exchangePer1000 === null ? '等価' : `${formatCompact(r.exchangePer1000)}${s}交換`;
  return `${formatCompact(r.lendPer1000)}${s}貸し・${exchange}`;
}

/**
 * 応募者数を 100 としたときの抽選番号。
 * 抽選番号または応募者数が無い記録は null。
 */
export function normalizedLottery(r: Lottery): number | null {
  if (r.lotteryNumber == null || r.applicants == null || r.applicants <= 0) {
    return null;
  }
  return (r.lotteryNumber / r.applicants) * 100;
}
