const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD'（ローカル日付。toISOString は UTC になるので使わない） */
export function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): string {
  return formatDateKey(now);
}

/** 'YYYY-MM-DD' → Date（ローカル 0 時）。不正な文字列は null。 */
export function parseDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // 2月30日のような存在しない日付は Date が繰り上げるので弾く
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

export function isValidDateKey(key: string): boolean {
  return parseDateKey(key) !== null;
}

/** 年月のキー 'YYYY-MM'（記録日 'YYYY-MM-DD' の先頭7文字と同じ形式） */
export function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function yearOf(key: string): number {
  return Number(key.slice(0, 4));
}

/** 1〜12 */
export function monthOf(key: string): number {
  return Number(key.slice(5, 7));
}

export function dayOf(key: string): number {
  return Number(key.slice(8, 10));
}

/** 'YYYY-MM-DD' → '2026年9月21日(月)' */
export function formatDateLong(key: string): string {
  const d = parseDateKey(key);
  if (!d) return key;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}

/** 'YYYY-MM-DD' → '21日(月)' */
export function formatDayWithWeekday(key: string): string {
  const d = parseDateKey(key);
  if (!d) return key;
  return `${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}
