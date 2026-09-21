import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '../components/ui';
import {
  backupFileName,
  MAX_BACKUP_BYTES,
  parseBackup,
  planImport,
  serializeBackup,
  summarizeBackup,
  type Backup,
  type ImportMode,
} from '../domain/backup';
import { formatDateLong } from '../domain/date';
import type { RecordInput } from '../domain/types';
import { useRecords } from '../state/RecordsContext';
import { colors, spacing } from '../theme';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function BackupScreen() {
  const { records, dismissedMachines, importRecords } = useRecords();
  const [busy, setBusy] = useState(false);

  // ------------------------------------------------------------ 書き出し
  const onExport = async () => {
    if (records.length === 0) {
      Alert.alert('書き出す記録がありません', '記録を追加してから、もう一度お試しください。');
      return;
    }
    setBusy(true);
    try {
      const now = new Date();
      const file = new File(Paths.cache, backupFileName(now));
      if (file.exists) file.delete();
      file.create();
      file.write(serializeBackup(records, [...dismissedMachines], now));

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('共有できません', 'この端末では、ファイルの共有を利用できません。');
        return;
      }
      // 共有メニューが開く（ドライブ・メール・ファイルへ保存など、保存先はそこで選ぶ）
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: 'バックアップを保存',
      });
    } catch (e) {
      Alert.alert('書き出せませんでした', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------ 読み込み
  const onImport = async () => {
    let backup: Backup;
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*', // 端末によって .json の種類判定が違うため絞り込まず、中身で確認する
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (asset.size != null && asset.size > MAX_BACKUP_BYTES) {
        Alert.alert('読み込めませんでした', 'ファイルが大きすぎます。バックアップのファイルを選んでください。');
        return;
      }
      const result = parseBackup(await new File(asset.uri).text());
      if (!result.ok) {
        Alert.alert('読み込めませんでした', result.error);
        return;
      }
      backup = result;
    } catch (e) {
      Alert.alert('読み込めませんでした', errorText(e));
      return;
    } finally {
      setBusy(false);
    }
    askHowToImport(backup);
  };

  const askHowToImport = (backup: Backup) => {
    const summary = summarizeBackup(backup.records);
    if (summary.count === 0 || !summary.firstDate || !summary.lastDate) {
      Alert.alert('記録がありません', 'このファイルには、記録が入っていません。');
      return;
    }
    const range =
      summary.firstDate === summary.lastDate
        ? formatDateLong(summary.firstDate)
        : `${formatDateLong(summary.firstDate)} 〜 ${formatDateLong(summary.lastDate)}`;

    Alert.alert(
      'バックアップを読み込みます',
      `${summary.count}件の記録\n${range}\n\n` +
        '【追加】いまの記録は残し、まだ無い記録だけを加えます。\n' +
        `【置き換え】いまの記録（${records.length}件）を消して、このファイルの内容にします。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '置き換え', style: 'destructive', onPress: () => confirmReplace(backup) },
        { text: '追加', onPress: () => runImport(backup, 'add') },
      ],
    );
  };

  const confirmReplace = (backup: Backup) => {
    Alert.alert(
      '記録を置き換えますか？',
      `いまの${records.length}件の記録をすべて削除して、ファイルの${backup.records.length}件に置き換えます。この操作は元に戻せません。\n\n` +
        '先に「バックアップを書き出す」で、いまの記録を保存しておくと安心です。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '置き換える', style: 'destructive', onPress: () => runImport(backup, 'replace') },
      ],
    );
  };

  const runImport = async (backup: Backup, mode: ImportMode) => {
    const { toAdd, skipped }: { toAdd: RecordInput[]; skipped: number } = planImport(records, backup.records, mode);
    if (mode === 'add' && toAdd.length === 0) {
      Alert.alert('追加する記録がありません', `ファイルの${skipped}件は、すべて登録済みでした。`);
      return;
    }
    setBusy(true);
    try {
      await importRecords(toAdd, { mode, dismissedMachines: backup.dismissedMachines });
      Alert.alert(
        '読み込みました',
        mode === 'add'
          ? `${toAdd.length}件を追加しました。${skipped > 0 ? `\n（登録済みの${skipped}件は追加していません）` : ''}`
          : `${toAdd.length}件の記録に置き換えました。`,
      );
    } catch (e) {
      Alert.alert('読み込めませんでした', `${errorText(e)}\n\n記録は変更されていません。`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.title}>バックアップを書き出す</Text>
        <Text style={styles.body}>
          いまの記録（{records.length}件）をファイルにして、共有メニューから保存先を選べます。Google ドライブやメールなどに保存しておけば、機種変更のときに記録を戻せます。
        </Text>
        <View style={styles.action}>
          <Button label="バックアップを書き出す" onPress={onExport} disabled={busy} />
        </View>
      </Card>

      <Card>
        <Text style={styles.title}>バックアップを読み込む</Text>
        <Text style={styles.body}>
          書き出したファイルを選んで、記録を戻します。いまの記録に「追加」するか、「置き換え」るかを選べます。
        </Text>
        <View style={styles.action}>
          <Button label="バックアップを読み込む" onPress={onImport} disabled={busy} />
        </View>
      </Card>

      <Text style={styles.note}>
        ファイルには、収支の記録がそのまま入っています。保存先や共有先には、ご注意ください。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  body: { fontSize: 14, color: colors.subtext, lineHeight: 21 },
  action: { marginTop: spacing.lg },
  note: { fontSize: 12, color: colors.subtext, lineHeight: 18, textAlign: 'center' },
});
