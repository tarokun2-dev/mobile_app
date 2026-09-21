export const colors = {
  background: '#F3F4F6',
  surface: '#FFFFFF',
  border: '#E2E5E9',
  text: '#1F2933',
  subtext: '#6B7785',
  primary: '#1F6FEB',
  onPrimary: '#FFFFFF',
  /** プラス収支 */
  plus: '#1565C0',
  /** マイナス収支・エラー・削除 */
  minus: '#D32F2F',
  disabled: '#9AA5B1',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const radius = { sm: 8, md: 12, pill: 999 };

/** 収支の値に応じた文字色 */
export function profitColor(value: number): string {
  if (Math.round(value) > 0) return colors.plus;
  if (Math.round(value) < 0) return colors.minus;
  return colors.text;
}
