import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '../components/DateField';
import { Button, Card, Chip, ProfitText, SegmentedControl } from '../components/ui';
import {
  DEFAULT_LEND,
  EXCHANGE_PRESETS,
  LEND_PRESETS,
  normalizedLottery,
  profitYen,
  UNIT_LABEL,
  UNIT_SUFFIX,
  yenPerUnit,
} from '../domain/calc';
import { todayKey } from '../domain/date';
import { formatCompact, formatDecimal1 } from '../domain/format';
import type { PlayRecord, Unit } from '../domain/types';
import { UNITS } from '../domain/types';
import {
  parseInvestmentText,
  parseRecoveryText,
  tryParseDecimal,
  tryParseInteger,
  validateForm,
  type FormErrors,
} from '../domain/validation';
import type { RootStackParamList } from '../navigation/types';
import { useRecords } from '../state/RecordsContext';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RecordForm'>;

type NonYen = Exclude<Unit, 'yen'>;
type RateText = { lend: string; exchange: string };
type RateTexts = Record<NonYen, RateText>;

/** 「-」を打てる数字キーボード（number-pad にはマイナスキーが無い） */
const SIGNED_KEYBOARD = Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric';

const UNIT_OPTIONS = UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] }));
const MAX_MACHINE_SUGGESTIONS = 6;

export function RecordFormScreen({ navigation, route }: Props) {
  const editingId = route.params?.id;
  const { records, addRecord, updateRecord, removeRecord, dismissedMachines, dismissMachine } =
    useRecords();
  // 画面下端のナビゲーションバー（3ボタンなど）に、一番下のボタンが隠れないようにする
  const insets = useSafeAreaInsets();
  const editing = useMemo(
    () => (editingId === undefined ? undefined : records.find((r) => r.id === editingId)),
    [records, editingId],
  );

  // 初期値は最初の描画時に一度だけ決める（保存中に records が更新されても入力を上書きしない）
  const [initial] = useState(() => buildInitial(editing, records));
  const [saving, setSaving] = useState(false);

  // 編集対象が見つからない場合は閉じる。自分で削除した直後は削除処理側で閉じるので除外する。
  useEffect(() => {
    if (editingId !== undefined && !editing && !saving) navigation.goBack();
  }, [editingId, editing, saving, navigation]);

  const [date, setDate] = useState(initial.date);
  const [unit, setUnit] = useState<Unit>(initial.unit);
  const [rates, setRates] = useState<RateTexts>(initial.rates);
  const [investment, setInvestment] = useState(initial.investment);
  const [recovery, setRecovery] = useState(initial.recovery);
  const [lotteryNumber, setLotteryNumber] = useState(initial.lotteryNumber);
  const [applicants, setApplicants] = useState(initial.applicants);
  const [machine, setMachine] = useState(initial.machine);
  const [errors, setErrors] = useState<FormErrors>({});

  const isYen = unit === 'yen';
  const rate: RateText = isYen ? { lend: '', exchange: '' } : rates[unit];
  const suffix = UNIT_SUFFIX[unit];

  const setRate = (patch: Partial<RateText>) => {
    if (unit === 'yen') return;
    setRates((r) => ({ ...r, [unit]: { ...r[unit], ...patch } }));
  };

  const clearError = (key: keyof FormErrors) => setErrors((e) => ({ ...e, [key]: undefined }));

  const lendValue = tryParseDecimal(rate.lend);
  const exchangeText = rate.exchange.trim();
  const exchangeValue = exchangeText === '' ? null : tryParseDecimal(rate.exchange);

  const previewProfit = useMemo(() => {
    // 投資・回収とも未入力のうちは表示しない。片方だけ入力したときは、空欄を 0 として計算する。
    if (investment.trim() === '' && recovery.trim() === '') return null;
    const inv = parseInvestmentText(investment);
    const rec = parseRecoveryText(recovery);
    if (inv === null || rec === null) return null;
    if (isYen) {
      return profitYen({ unit, investment: inv, recovery: rec, lendPer1000: null, exchangePer1000: null });
    }
    // 貸しレートが未入力・不正、または換金レートが不正（空欄=等価は可）のときは表示しない
    if (lendValue === null || lendValue <= 0) return null;
    if (exchangeText !== '' && (exchangeValue === null || exchangeValue <= 0)) return null;
    return profitYen({
      unit,
      investment: inv,
      recovery: rec,
      lendPer1000: lendValue,
      exchangePer1000: exchangeValue,
    });
  }, [investment, recovery, isYen, unit, lendValue, exchangeText, exchangeValue]);

  const previewLottery = useMemo(() => {
    const ln = tryParseInteger(lotteryNumber);
    const ap = tryParseInteger(applicants);
    if (ln === null || ap === null || ap < 1 || ln < 1 || ln > ap) return null;
    return normalizedLottery({ lotteryNumber: ln, applicants: ap });
  }, [lotteryNumber, applicants]);

  const machineSuggestions = useMemo(() => {
    const q = machine.trim();
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of records) {
      const name = r.machine;
      if (!name || seen.has(name) || name === q || dismissedMachines.has(name)) continue;
      if (q && !name.includes(q)) continue;
      seen.add(name);
      result.push(name);
      if (result.length >= MAX_MACHINE_SUGGESTIONS) break;
    }
    return result;
  }, [records, machine, dismissedMachines]);

  // 候補の長押し: 入力候補から外す（過去の記録の機種名は変わらない）
  const confirmDismissMachine = (name: string) => {
    Alert.alert(
      `「${name}」を候補から削除しますか？`,
      '入力候補に表示されなくなります。過去の記録や収支は変わりません。この機種で再び記録すると、候補に戻ります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            dismissMachine(name).catch((e) =>
              Alert.alert('削除できませんでした', e instanceof Error ? e.message : String(e)),
            );
          },
        },
      ],
    );
  };

  const save = async () => {
    const result = validateForm({
      date,
      unit,
      investment,
      recovery,
      lendPer1000: rate.lend,
      exchangePer1000: rate.exchange,
      lotteryNumber,
      applicants,
      machine,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      if (editing) await updateRecord(editing.id, result.value);
      else await addRecord(result.value);
      navigation.goBack();
    } catch (e) {
      setSaving(false);
      Alert.alert('保存できませんでした', e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = () => {
    if (!editing) return;
    Alert.alert('この記録を削除しますか？', '削除すると元に戻せません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await removeRecord(editing.id);
            navigation.goBack();
          } catch (e) {
            setSaving(false);
            Alert.alert('削除できませんでした', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl * 2 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Card>
          <Field label="日付" error={errors.date}>
            <DateField
              value={date}
              onChange={(v) => {
                setDate(v);
                clearError('date');
              }}
            />
          </Field>

          <Field label="入力単位">
            <SegmentedControl options={UNIT_OPTIONS} value={unit} onChange={setUnit} />
          </Field>

          {!isYen ? (
            <>
              <Field label="貸しレート（1000円あたり）" error={errors.lendPer1000}>
                <View style={styles.chips}>
                  {LEND_PRESETS[unit].map((p) => (
                    <Chip
                      key={p}
                      label={`${p}${suffix}貸し`}
                      selected={rate.lend === String(p)}
                      onPress={() => {
                        setRate({ lend: String(p) });
                        clearError('lendPer1000');
                      }}
                    />
                  ))}
                </View>
                <NumberInput
                  value={rate.lend}
                  onChangeText={(t) => {
                    setRate({ lend: t });
                    clearError('lendPer1000');
                  }}
                  suffix={`${suffix}貸し`}
                  keyboardType="decimal-pad"
                  invalid={!!errors.lendPer1000}
                />
                {lendValue !== null && lendValue > 0 ? (
                  <Text style={styles.rateHint}>
                    1{suffix} ≒ {formatCompact(yenPerUnit(lendValue), 2)}円で借りる
                  </Text>
                ) : null}
              </Field>

              <Field label="換金レート（1000円あたり）" error={errors.exchangePer1000}>
                <View style={styles.chips}>
                  <Chip
                    label="等価"
                    selected={exchangeText === ''}
                    onPress={() => {
                      setRate({ exchange: '' });
                      clearError('exchangePer1000');
                    }}
                  />
                  {EXCHANGE_PRESETS[unit].map((p) => (
                    <Chip
                      key={p}
                      label={`${p}${suffix}交換`}
                      selected={rate.exchange === String(p)}
                      onPress={() => {
                        setRate({ exchange: String(p) });
                        clearError('exchangePer1000');
                      }}
                    />
                  ))}
                </View>
                <NumberInput
                  value={rate.exchange}
                  onChangeText={(t) => {
                    setRate({ exchange: t });
                    clearError('exchangePer1000');
                  }}
                  suffix={`${suffix}交換`}
                  placeholder="等価"
                  keyboardType="decimal-pad"
                  invalid={!!errors.exchangePer1000}
                />
                {exchangeText === '' && lendValue !== null && lendValue > 0 ? (
                  <Text style={styles.rateHint}>
                    等価：1{suffix} ≒ {formatCompact(yenPerUnit(lendValue), 2)}円で換金
                  </Text>
                ) : null}
                {exchangeText !== '' && exchangeValue !== null && exchangeValue > 0 ? (
                  <Text style={styles.rateHint}>
                    1{suffix} ≒ {formatCompact(yenPerUnit(exchangeValue), 2)}円で換金
                  </Text>
                ) : null}
              </Field>
            </>
          ) : null}

          <Field label="投資" error={errors.investment}>
            <NumberInput
              value={investment}
              onChangeText={(t) => {
                setInvestment(t);
                clearError('investment');
              }}
              suffix={suffix}
              invalid={!!errors.investment}
            />
          </Field>

          <Field label="回収" error={errors.recovery}>
            <NumberInput
              value={recovery}
              onChangeText={(t) => {
                setRecovery(t);
                clearError('recovery');
              }}
              suffix={suffix}
              keyboardType={SIGNED_KEYBOARD}
              invalid={!!errors.recovery}
            />
          </Field>

          <Text style={styles.hint}>投資・回収は空欄なら 0 として保存します。回収はマイナスも入力できます。</Text>

          <View style={styles.preview}>
            <Text style={styles.previewLabel}>収支{isYen ? '' : '（円換算）'}</Text>
            {previewProfit === null ? (
              <Text style={styles.previewEmpty}>―</Text>
            ) : (
              <ProfitText value={previewProfit} style={styles.previewValue} />
            )}
          </View>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>抽選（任意）</Text>
          <Text style={styles.hint}>抽選がなかった日は、抽選番号・応募者数とも空欄のままで保存できます。</Text>
          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <Field label="抽選番号" error={errors.lotteryNumber}>
                <NumberInput
                  value={lotteryNumber}
                  onChangeText={(t) => {
                    setLotteryNumber(t);
                    clearError('lotteryNumber');
                    clearError('applicants');
                  }}
                  suffix="番"
                  invalid={!!errors.lotteryNumber}
                />
              </Field>
            </View>
            <View style={styles.pairItem}>
              <Field label="応募者数" error={errors.applicants}>
                <NumberInput
                  value={applicants}
                  onChangeText={(t) => {
                    setApplicants(t);
                    clearError('lotteryNumber');
                    clearError('applicants');
                  }}
                  suffix="人"
                  invalid={!!errors.applicants}
                />
              </Field>
            </View>
          </View>
          {previewLottery !== null ? (
            <Text style={styles.hint}>応募者数を100とすると、抽選番号は {formatDecimal1(previewLottery)} です。</Text>
          ) : null}
        </Card>

        <Card style={styles.section}>
          <Field label="主に遊んだ機種（任意）" error={errors.machine}>
            <TextInput
              value={machine}
              onChangeText={(t) => {
                setMachine(t);
                clearError('machine');
              }}
              placeholder="例：北斗の拳"
              placeholderTextColor={colors.disabled}
              style={[styles.input, !!errors.machine && styles.inputInvalid]}
              returnKeyType="done"
              maxLength={80}
            />
            {machineSuggestions.length > 0 ? (
              <View style={[styles.chips, { marginTop: spacing.sm, marginBottom: 0 }]}>
                {machineSuggestions.map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    onPress={() => {
                      setMachine(name);
                      clearError('machine');
                    }}
                    onLongPress={() => confirmDismissMachine(name)}
                  />
                ))}
              </View>
            ) : null}
            {machineSuggestions.length > 0 ? (
              <Text style={styles.rateHint}>候補を長押しすると、候補から削除できます。</Text>
            ) : null}
          </Field>
        </Card>

        {Object.values(errors).some(Boolean) ? (
          <Text style={styles.formError}>入力内容を確認してください。</Text>
        ) : null}

        <View style={styles.actions}>
          <Button label={editing ? '変更を保存' : '記録する'} onPress={save} disabled={saving} />
          {editing ? <Button label="この記録を削除" variant="danger" onPress={confirmDelete} disabled={saving} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function buildInitial(editing: PlayRecord | undefined, records: readonly PlayRecord[]) {
  // 単位ごとの「前回のレート」。新規入力のときにレートを毎回打たなくて済むようにする。
  const lastRate = (u: NonYen): RateText => {
    const found = records.find((r) => r.unit === u && r.lendPer1000 !== null);
    return found ? toRateText(found) : { lend: String(DEFAULT_LEND[u]), exchange: '' };
  };
  const rates: RateTexts = { medal: lastRate('medal'), ball: lastRate('ball') };

  if (editing) {
    if (editing.unit !== 'yen') rates[editing.unit] = toRateText(editing);
    return {
      date: editing.date,
      unit: editing.unit,
      rates,
      investment: String(editing.investment),
      recovery: String(editing.recovery),
      lotteryNumber: editing.lotteryNumber === null ? '' : String(editing.lotteryNumber),
      applicants: editing.applicants === null ? '' : String(editing.applicants),
      machine: editing.machine,
    };
  }
  return {
    date: todayKey(),
    unit: (records[0]?.unit ?? 'yen') as Unit,
    rates,
    investment: '',
    recovery: '',
    lotteryNumber: '',
    applicants: '',
    machine: '',
  };
}

function toRateText(r: Pick<PlayRecord, 'lendPer1000' | 'exchangePer1000'>): RateText {
  return {
    lend: r.lendPer1000 === null ? '' : formatCompact(r.lendPer1000),
    exchange: r.exchangePer1000 === null ? '' : formatCompact(r.exchangePer1000),
  };
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function NumberInput({
  value,
  onChangeText,
  suffix,
  invalid,
  placeholder = '0',
  keyboardType = 'number-pad',
}: {
  value: string;
  onChangeText: (text: string) => void;
  suffix: string;
  invalid?: boolean;
  placeholder?: string;
  keyboardType?: 'number-pad' | 'decimal-pad' | 'numbers-and-punctuation' | 'numeric';
}) {
  return (
    <View style={[styles.inputRow, invalid && styles.inputInvalid]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.disabled}
        style={styles.numberInput}
        selectTextOnFocus
      />
      <Text style={styles.suffix}>{suffix}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  section: { gap: 0 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  hint: { fontSize: 12, color: colors.subtext, lineHeight: 18, marginBottom: spacing.sm },
  field: { marginBottom: spacing.md },
  label: { fontSize: 13, color: colors.subtext, marginBottom: 6 },
  error: { fontSize: 12, color: colors.minus, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  input: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  inputInvalid: { borderColor: colors.minus },
  numberInput: { flex: 1, fontSize: 18, color: colors.text, textAlign: 'right', paddingVertical: 8 },
  suffix: { minWidth: 56, fontSize: 14, color: colors.subtext, marginLeft: spacing.sm },
  rateHint: { fontSize: 12, color: colors.subtext, marginTop: 6 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  previewLabel: { fontSize: 14, color: colors.subtext },
  previewValue: { fontSize: 22 },
  previewEmpty: { fontSize: 22, color: colors.disabled },
  pair: { flexDirection: 'row', gap: spacing.md },
  pairItem: { flex: 1 },
  formError: { color: colors.minus, fontSize: 14, textAlign: 'center' },
  actions: { gap: spacing.md, marginTop: spacing.sm },
});
