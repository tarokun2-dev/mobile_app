import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MachinePicker } from '../components/MachinePicker';
import { ProfitChart } from '../components/ProfitChart';
import { Card, Chip, ProfitText, SegmentedControl, StatRow } from '../components/ui';
import { buildMonthChart, buildYearChart, type ChartData, type YearGranularity } from '../domain/chart';
import { monthKey } from '../domain/date';
import { formatDecimal1, formatPercent, formatWinLoss, formatYen } from '../domain/format';
import { ALL_MACHINES, filterByMachine, resolveFilter, type MachineFilter } from '../domain/machines';
import {
  availableYears,
  summarize,
  summarizeByMonth,
  summarizeByYear,
  type Summary,
} from '../domain/stats';
import type { PlayRecord } from '../domain/types';
import type { TabParamList } from '../navigation/types';
import { useRecords } from '../state/RecordsContext';
import { colors, spacing } from '../theme';

type Props = BottomTabScreenProps<TabParamList, 'Stats'>;

type Mode = 'lifetime' | 'year' | 'month';

const MODES = [
  { value: 'lifetime', label: '生涯' },
  { value: 'year', label: '年別' },
  { value: 'month', label: '月別' },
] as const;

const GRANULARITIES = [
  { value: 'month', label: '月ごと' },
  { value: 'day', label: '日ごと' },
] as const;

export function StatsScreen({ navigation }: Props) {
  const { records: allRecords } = useRecords();
  const [mode, setMode] = useState<Mode>('lifetime');
  const [machineFilter, setMachineFilter] = useState<MachineFilter>(ALL_MACHINES);
  const [yearChoice, setYearChoice] = useState<number | null>(null);
  const [monthChoice, setMonthChoice] = useState<number | null>(null);
  const [granularity, setGranularity] = useState<YearGranularity>('month');

  // 機種の絞り込み。編集などで対象の機種が無くなったら「すべて」に戻す。
  const filter = useMemo(() => resolveFilter(machineFilter, allRecords), [machineFilter, allRecords]);
  const records = useMemo(() => filterByMachine(allRecords, filter), [allRecords, filter]);

  const lifetime = useMemo(() => summarize(records), [records]);
  const byYear = useMemo(() => summarizeByYear(records), [records]);

  // 年は、記録がある最古〜最新の年の範囲で選ぶ（年別・月別で共通）
  const years = useMemo(() => availableYears(records), [records]);
  const newestYear = years[0] ?? new Date().getFullYear();
  const oldestYear = years[years.length - 1] ?? newestYear;
  const year = Math.min(Math.max(yearChoice ?? newestYear, oldestYear), newestYear);

  const months = useMemo(() => summarizeByMonth(records, year), [records, year]);
  const yearProfit = byYear.find((y) => y.year === year)?.profit ?? 0;
  // 月は、選ばれていなければ記録のある最も新しい月（無ければ今月）
  const latestMonthWithRecords = [...months].reverse().find((m) => m.count > 0)?.month;
  const month = monthChoice ?? latestMonthWithRecords ?? new Date().getMonth() + 1;

  const yearNav = (
    <YearNav
      year={year}
      canPrev={year > oldestYear}
      canNext={year < newestYear}
      onPrev={() => setYearChoice(year - 1)}
      onNext={() => setYearChoice(year + 1)}
    />
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <SegmentedControl options={MODES} value={mode} onChange={setMode} />
      {allRecords.length > 0 ? (
        <MachinePicker records={allRecords} value={filter} onChange={setMachineFilter} />
      ) : null}

      {allRecords.length === 0 ? (
        <Text style={styles.empty}>記録を追加すると、ここに収支が表示されます。</Text>
      ) : mode === 'lifetime' ? (
        <Card>
          <SummaryBody summary={lifetime} />
        </Card>
      ) : mode === 'year' ? (
        <>
          {yearNav}
          <YearChartCard records={records} year={year} granularity={granularity} onGranularity={setGranularity} />
          <Text style={styles.sectionLabel}>年ごとの集計</Text>
          {byYear.map((y) => (
            <Card key={y.year}>
              <Text style={styles.cardTitle}>{y.year}年</Text>
              <SummaryBody summary={y} />
            </Card>
          ))}
        </>
      ) : (
        <>
          {yearNav}
          <Card>
            <View style={styles.bigProfit}>
              <Text style={styles.bigLabel}>{year}年の収支</Text>
              <ProfitText value={yearProfit} style={styles.bigValue} />
            </View>
          </Card>

          <View style={styles.monthChips}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <Chip key={m} label={`${m}月`} selected={m === month} onPress={() => setMonthChoice(m)} />
            ))}
          </View>
          <MonthChartCard records={records} year={year} month={month} />

          <Text style={styles.sectionLabel}>月ごとの一覧（タップでその月の記録へ）</Text>
          <Card style={{ paddingVertical: spacing.sm }}>
            {months.map((m, i) => (
              // 記録のある月だけタップでき、記録タブのその年月へ移動する
              <Pressable
                key={m.month}
                disabled={m.count === 0}
                onPress={() =>
                  navigation.navigate('Records', { month: monthKey(year, m.month), nonce: Date.now() })
                }
                accessibilityRole="button"
                accessibilityLabel={`${year}年${m.month}月の記録を見る`}
                style={({ pressed }) => [
                  styles.monthRow,
                  i > 0 && styles.monthRowBorder,
                  pressed && { backgroundColor: '#F0F2F5' },
                ]}
              >
                <Text style={styles.monthName}>{m.month}月</Text>
                {m.count === 0 ? (
                  <Text style={styles.monthEmpty}>記録なし</Text>
                ) : (
                  <>
                    <Text style={styles.monthMeta}>
                      {m.count}回（{formatWinLoss(m)}）
                    </Text>
                    <ProfitText value={m.profit} style={styles.monthProfit} />
                    <Text style={styles.monthChevron}>›</Text>
                  </>
                )}
              </Pressable>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

/** 収支・投資・回収・勝率・平均抽選番号のまとまり */
function SummaryBody({ summary }: { summary: Summary }) {
  return (
    <View>
      <View style={styles.bigProfit}>
        <Text style={styles.bigLabel}>収支</Text>
        <ProfitText value={summary.profit} style={styles.bigValue} />
      </View>
      <StatRow label="投資合計">
        <Text style={styles.value}>{formatYen(summary.investment)}</Text>
      </StatRow>
      <StatRow label="回収合計">
        <Text style={styles.value}>{formatYen(summary.recovery)}</Text>
      </StatRow>
      <StatRow label="記録数">
        <Text style={styles.value}>{summary.count}回</Text>
      </StatRow>
      <StatRow label="勝率">
        <Text style={styles.value}>
          {summary.winRate === null ? '―' : `${formatPercent(summary.winRate)}（${formatWinLoss(summary)}）`}
        </Text>
      </StatRow>
      <StatRow label="平均抽選番号" note="応募者数を100とした場合">
        <Text style={styles.value}>
          {summary.avgLottery === null ? '―' : `${formatDecimal1(summary.avgLottery)}（${summary.lotteryCount}回分）`}
        </Text>
      </StatRow>
    </View>
  );
}

/** 年別: 選んだ年の、月ごと または 日ごとの収支（棒）と年の累計（折れ線） */
function YearChartCard({
  records,
  year,
  granularity,
  onGranularity,
}: {
  records: readonly PlayRecord[];
  year: number;
  granularity: YearGranularity;
  onGranularity: (g: YearGranularity) => void;
}) {
  const data = useMemo(() => buildYearChart(records, year, granularity), [records, year, granularity]);
  return (
    <ChartCard
      title={`${year}年の収支`}
      data={data}
      barLegend={granularity === 'month' ? '月ごとの収支' : '日ごとの収支'}
      emptyText={`${year}年の記録はありません`}
    >
      <SegmentedControl options={GRANULARITIES} value={granularity} onChange={onGranularity} />
    </ChartCard>
  );
}

/** 月別: 選んだ月の、日ごとの収支（棒）と月の累計（折れ線） */
function MonthChartCard({
  records,
  year,
  month,
}: {
  records: readonly PlayRecord[];
  year: number;
  month: number;
}) {
  const data = useMemo(() => buildMonthChart(records, year, month), [records, year, month]);
  return (
    <ChartCard
      title={`${year}年${month}月の収支`}
      data={data}
      barLegend="日ごとの収支"
      emptyText={`${year}年${month}月の記録はありません`}
    />
  );
}

function ChartCard({
  title,
  data,
  barLegend,
  emptyText,
  children,
}: {
  title: string;
  data: ChartData;
  barLegend: string;
  emptyText: string;
  children?: ReactNode;
}) {
  const total = data.slots.reduce((sum, s) => sum + s.profit, 0);
  return (
    <Card>
      <View style={styles.chartHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {data.hasData ? <ProfitText value={total} style={styles.chartTotal} /> : null}
      </View>
      {children ? <View style={styles.chartControl}>{children}</View> : null}
      {data.hasData ? (
        <ProfitChart data={data} barLegend={barLegend} />
      ) : (
        <Text style={styles.chartEmpty}>{emptyText}</Text>
      )}
    </Card>
  );
}

function YearNav({
  year,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  year: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.yearNav}>
      <NavButton label="◀" disabled={!canPrev} onPress={onPrev} />
      <Text style={styles.yearTitle}>{year}年</Text>
      <NavButton label="▶" disabled={!canNext} onPress={onNext} />
    </View>
  );
}

function NavButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" hitSlop={8} style={styles.navButton}>
      <Text style={[styles.navText, disabled && { color: colors.border }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  empty: { textAlign: 'center', color: colors.subtext, marginTop: spacing.xl, fontSize: 14 },
  sectionLabel: { fontSize: 13, color: colors.subtext, marginTop: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  bigProfit: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
  },
  bigLabel: { fontSize: 14, color: colors.subtext },
  bigValue: { fontSize: 28 },
  value: { fontSize: 15, color: colors.text, fontWeight: '600' },
  chartHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  chartTotal: { fontSize: 18 },
  chartControl: { marginBottom: spacing.md },
  chartEmpty: { textAlign: 'center', color: colors.subtext, fontSize: 14, paddingVertical: spacing.xl },
  yearNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  yearTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  navButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  navText: { fontSize: 18, color: colors.primary },
  monthChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  monthRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  monthRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  monthName: { width: 44, fontSize: 15, fontWeight: '600', color: colors.text },
  monthMeta: { flex: 1, fontSize: 13, color: colors.subtext },
  monthChevron: { width: 20, fontSize: 20, color: colors.disabled, textAlign: 'right' },
  monthEmpty: { flex: 1, fontSize: 12, color: colors.disabled },
  monthProfit: { fontSize: 15 },
});
