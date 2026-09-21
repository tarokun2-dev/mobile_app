/** 3桁区切り。toLocaleString はエンジン差があるため自前で実装する。 */
export function formatNumber(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1,234円 */
export function formatYen(n: number): string {
  return `${formatNumber(n)}円`;
}

/** 収支表示。プラスには + を付ける。 +1,234円 / -1,234円 / ±0円 */
export function formatProfit(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return '±0円';
  return `${rounded > 0 ? '+' : ''}${formatNumber(rounded)}円`;
}

/** 小数1桁（平均抽選番号など） */
export function formatDecimal1(n: number): string {
  return n.toFixed(1);
}

/** 0〜1 の割合を 66.7% のように表示 */
export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** 勝敗の表示。7勝3負1分 */
export function formatWinLoss(s: { winCount: number; loseCount: number; drawCount: number }): string {
  return `${s.winCount}勝${s.loseCount}負${s.drawCount}分`;
}

/** 余計な小数を出さない表示。4 → "4"、21.7391304 → "21.7391" */
export function formatCompact(n: number, digits = 4): string {
  return String(Number(n.toFixed(digits)));
}
