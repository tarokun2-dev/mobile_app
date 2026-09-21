export type RootStackParamList = {
  Tabs: undefined;
  /** id 指定で編集、省略で新規追加 */
  RecordForm: { id?: number } | undefined;
};

export type TabParamList = {
  /**
   * month: 一覧をスクロールさせたい年月 'YYYY-MM'。
   * nonce: 同じ月を続けて選んでも毎回スクロールさせるための値（呼び出しごとに変える）。
   */
  Records: { month?: string; nonce?: number } | undefined;
  Stats: undefined;
};
