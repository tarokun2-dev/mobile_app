import { isValidDateKey } from './date';
import type { RecordInput, Unit } from './types';

/** 入力フォームの値（数値も文字列のまま保持する） */
export interface FormValues {
  date: string;
  unit: Unit;
  investment: string;
  recovery: string;
  /** 貸しレート（1000円あたりの枚数/玉数） */
  lendPer1000: string;
  /** 換金レート（1000円あたりの枚数/玉数）。空欄は等価。 */
  exchangePer1000: string;
  lotteryNumber: string;
  applicants: string;
  machine: string;
}

export type FormErrors = Partial<Record<keyof FormValues, string>>;

export type ValidationResult =
  | { ok: true; value: RecordInput }
  | { ok: false; errors: FormErrors };

const MAX_AMOUNT = 999_999_999;
const MAX_PER_1000 = 100_000;
const MAX_LOTTERY = 999_999;
const MAX_MACHINE_LENGTH = 50;

/**
 * 全角数字・全角ピリオド・全角/長音のマイナス・カンマ・空白を正規化する（日本語IMEでの入力対策）。
 * 全角モードで「-」を打つと長音「ー」になるため、それもマイナスとして扱う。
 */
export function normalizeNumberText(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, '.')
    .replace(/[−－ー―‐]/g, '-')
    .replace(/[,，、\s]/g, '');
}

function parseInteger(text: string): number | null {
  const t = normalizeNumberText(text);
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

/** マイナスも許す整数（回収用） */
function parseSignedInteger(text: string): number | null {
  const t = normalizeNumberText(text);
  if (!/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

function parseDecimal(text: string): number | null {
  const t = normalizeNumberText(text);
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 収支プレビュー等のために、入力途中でも数値として読める場合だけ値を返す。 */
export function tryParseInteger(text: string): number | null {
  return text.trim() === '' ? null : parseInteger(text);
}

export function tryParseDecimal(text: string): number | null {
  return text.trim() === '' ? null : parseDecimal(text);
}

/** 投資の入力値。空欄は 0。読めなければ null。 */
export function parseInvestmentText(text: string): number | null {
  return text.trim() === '' ? 0 : parseInteger(text);
}

/** 回収の入力値（マイナス可）。空欄は 0。読めなければ null。 */
export function parseRecoveryText(text: string): number | null {
  return text.trim() === '' ? 0 : parseSignedInteger(text);
}

export function validateForm(v: FormValues): ValidationResult {
  const errors: FormErrors = {};

  if (!isValidDateKey(v.date)) {
    errors.date = '日付を選択してください';
  }

  // 投資・回収は空欄なら 0。回収だけマイナスも入力できる。
  const investment = parseInvestmentText(v.investment);
  if (investment === null || investment > MAX_AMOUNT) {
    errors.investment = '0以上の整数で入力してください';
  }

  const recovery = parseRecoveryText(v.recovery);
  if (recovery === null || Math.abs(recovery) > MAX_AMOUNT) {
    errors.recovery = '整数で入力してください（マイナスも可）';
  }

  // 金額入力のときは貸し・換金レートを使わない（画面に残っている値は無視する）
  let lendPer1000: number | null = null;
  let exchangePer1000: number | null = null;
  if (v.unit !== 'yen') {
    const lend = parseDecimal(v.lendPer1000);
    if (v.lendPer1000.trim() === '') {
      errors.lendPer1000 = '貸しレートを入力してください';
    } else if (lend === null || lend <= 0 || lend > MAX_PER_1000) {
      errors.lendPer1000 = '0より大きい数値で入力してください';
    } else {
      lendPer1000 = lend;
    }

    // 空欄は等価
    if (v.exchangePer1000.trim() !== '') {
      const exchange = parseDecimal(v.exchangePer1000);
      if (exchange === null || exchange <= 0 || exchange > MAX_PER_1000) {
        errors.exchangePer1000 = '0より大きい数値で入力してください（等価の場合は空欄）';
      } else {
        exchangePer1000 = exchange;
      }
    }
  }

  // 抽選番号と応募者数は「どちらも空」か「どちらも入力」のどちらか
  let lotteryNumber: number | null = null;
  let applicants: number | null = null;
  const hasLottery = v.lotteryNumber.trim() !== '';
  const hasApplicants = v.applicants.trim() !== '';
  if (hasLottery || hasApplicants) {
    const ln = parseInteger(v.lotteryNumber);
    const ap = parseInteger(v.applicants);
    if (!hasLottery) {
      errors.lotteryNumber = '応募者数を入力した場合は抽選番号も入力してください';
    } else if (ln === null || ln < 1 || ln > MAX_LOTTERY) {
      errors.lotteryNumber = '1以上の整数で入力してください';
    }
    if (!hasApplicants) {
      errors.applicants = '抽選番号を入力した場合は応募者数も入力してください';
    } else if (ap === null || ap < 1 || ap > MAX_LOTTERY) {
      errors.applicants = '1以上の整数で入力してください';
    }
    if (!errors.lotteryNumber && !errors.applicants && ln !== null && ap !== null) {
      if (ln > ap) {
        errors.lotteryNumber = '抽選番号は応募者数以下にしてください';
      } else {
        lotteryNumber = ln;
        applicants = ap;
      }
    }
  }

  const machine = v.machine.trim();
  if (machine.length > MAX_MACHINE_LENGTH) {
    errors.machine = `機種名は${MAX_MACHINE_LENGTH}文字以内で入力してください`;
  }

  if (Object.keys(errors).length > 0 || investment === null || recovery === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      date: v.date,
      unit: v.unit,
      investment,
      recovery,
      lendPer1000,
      exchangePer1000,
      lotteryNumber,
      applicants,
      machine,
    },
  };
}
