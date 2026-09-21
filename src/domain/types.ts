/** 入力単位: 金額(円) / 枚数(メダル) / 玉数(パチンコ玉) */
export type Unit = 'yen' | 'medal' | 'ball';

export const UNITS: readonly Unit[] = ['yen', 'medal', 'ball'];

/** 1回の遊技記録 */
export interface PlayRecord {
  id: number;
  /** YYYY-MM-DD（端末のローカル日付） */
  date: string;
  unit: Unit;
  /** 投資（unit で指定した単位） */
  investment: number;
  /** 回収（unit で指定した単位） */
  recovery: number;
  /** 貸しレート: 1000円あたりに借りられる枚数/玉数（46枚貸し → 46）。金額入力のときは null */
  lendPer1000: number | null;
  /**
   * 換金レート: 1000円に交換できる枚数/玉数（56枚交換 → 56）。
   * null は等価（貸しレートと同じ）。金額入力のときも null。
   */
  exchangePer1000: number | null;
  /** 抽選番号。抽選がなかった記録は null */
  lotteryNumber: number | null;
  /** 応募者数。抽選がなかった記録は null */
  applicants: number | null;
  /** 主に遊んだ機種。未入力は空文字 */
  machine: string;
}

export type RecordInput = Omit<PlayRecord, 'id'>;
