import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { ProfitText } from '../components/ui';
import { describeRate, profitYen, UNIT_SUFFIX } from '../domain/calc';
import { formatDayWithWeekday } from '../domain/date';
import { formatNumber, formatYen } from '../domain/format';
import { groupByMonth, type MonthSection } from '../domain/stats';
import type { PlayRecord } from '../domain/types';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { useRecords } from '../state/RecordsContext';
import { colors, radius, spacing } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Records'>,
  NativeStackScreenProps<RootStackParamList>
>;

const MAX_SCROLL_RETRIES = 5;

export function RecordListScreen({ navigation, route }: Props) {
  const { records } = useRecords();
  const sections = useMemo(() => groupByMonth(records), [records]);
  const listRef = useRef<SectionList<PlayRecord, MonthSection>>(null);
  const scrollRetries = useRef(0);

  const openForm = (id?: number) => navigation.navigate('RecordForm', id === undefined ? undefined : { id });

  // 収支タブの月別から来たとき、その年月の見出しまでスクロールする。
  // nonce が変わるたびに動かすことで、同じ月を続けて選んでも毎回移動できる。
  const targetMonth = route.params?.month;
  const targetNonce = route.params?.nonce;
  const targetSectionIndex = targetMonth ? sections.findIndex((s) => s.key === targetMonth) : -1;
  useEffect(() => {
    if (targetSectionIndex < 0) return;
    scrollRetries.current = 0;
    listRef.current?.scrollToLocation({
      sectionIndex: targetSectionIndex,
      itemIndex: 0, // 0 は月の見出し行
      viewPosition: 0,
      animated: false,
    });
  }, [targetNonce]); // 月を選び直したとき（nonce の変化）だけ動かす

  return (
    <View style={styles.container}>
      <SectionList
        ref={listRef}
        // 遠い月は行の高さが未測定でスクロール先を特定できないため、概算位置へ移動してから再試行する
        onScrollToIndexFailed={(info) => {
          if (scrollRetries.current++ >= MAX_SCROLL_RETRIES || targetSectionIndex < 0) return;
          listRef.current
            ?.getScrollResponder()
            ?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
          setTimeout(() => {
            listRef.current?.scrollToLocation({
              sectionIndex: targetSectionIndex,
              itemIndex: 0,
              viewPosition: 0,
              animated: false,
            });
          }, 100);
        }}
        sections={sections}
        keyExtractor={(r) => String(r.id)}
        stickySectionHeadersEnabled
        contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>まだ記録がありません</Text>
            <Text style={styles.emptyBody}>右下の「＋」から、最初の収支を記録しましょう。</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {section.year}年{section.month}月
            </Text>
            <Text style={styles.sectionMeta}>{section.summary.count}回　</Text>
            <ProfitText value={section.summary.profit} style={styles.sectionProfit} />
          </View>
        )}
        renderItem={({ item }) => <RecordRow record={item} onPress={() => openForm(item.id)} />}
      />
      <Pressable
        onPress={() => openForm()}
        accessibilityRole="button"
        accessibilityLabel="記録を追加"
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>
    </View>
  );
}

function RecordRow({ record, onPress }: { record: PlayRecord; onPress: () => void }) {
  const suffix = UNIT_SUFFIX[record.unit];
  const detail =
    record.unit === 'yen'
      ? `投資 ${formatYen(record.investment)} / 回収 ${formatYen(record.recovery)}`
      : `投資 ${formatNumber(record.investment)}${suffix} / 回収 ${formatNumber(record.recovery)}${suffix}`;
  const rateText = describeRate(record);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#F0F2F5' }]}>
      <Text style={styles.day}>{formatDayWithWeekday(record.date)}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.machine} numberOfLines={1}>
          {record.machine || '機種未入力'}
        </Text>
        <Text style={styles.detail} numberOfLines={2}>
          {detail}
        </Text>
        {rateText ? <Text style={styles.detail}>{rateText}</Text> : null}
        {record.lotteryNumber !== null && record.applicants !== null ? (
          <Text style={styles.detail}>
            抽選 {record.lotteryNumber}番 / {record.applicants}人
          </Text>
        ) : null}
      </View>
      <ProfitText value={profitYen(record)} style={styles.rowProfit} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: 96 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  emptyBody: { fontSize: 14, color: colors.subtext, textAlign: 'center', lineHeight: 21 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  sectionMeta: { fontSize: 12, color: colors.subtext },
  sectionProfit: { fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  day: { width: 60, fontSize: 14, color: colors.subtext },
  rowBody: { flex: 1, paddingRight: spacing.sm },
  machine: { fontSize: 15, fontWeight: '600', color: colors.text },
  detail: { fontSize: 12, color: colors.subtext, marginTop: 2 },
  rowProfit: { fontSize: 16 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: { color: colors.onPrimary, fontSize: 30, lineHeight: 34 },
});
