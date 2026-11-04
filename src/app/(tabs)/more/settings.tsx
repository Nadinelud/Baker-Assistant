import * as Linking from 'expo-linking';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Input, Screen, Text, useUndo } from '@/components';
import { getLastBackupAt, summarizeBackup, type BackupFile } from '@/db/backup';
import type { Db } from '@/db/types';
import { hasWorstCaseSeed, removeWorstCase, seedWorstCase } from '@/dev/worstCaseSeed';
import { exportBackup, hasSafetyBackup, pickBackup, readSafetyBackup, restoreBackup } from '@/lib/backup';
import { formatShortDate } from '@/lib/dates';
import { deleteApiKey, getApiKey, getModel, maskKey, setApiKey, setModel } from '@/lib/aiSettings';
import { DEFAULT_GEMINI_MODEL } from '@/lib/recipeImport/gemini';
import { useFocusData } from '@/lib/useFocusData';
import { spacing } from '@/theme';

const KEY_PAGE = 'https://aistudio.google.com/apikey';

async function loadAi(db: Db) {
  const [apiKey, model] = await Promise.all([getApiKey(), getModel(db)]);
  return { apiKey, model };
}

export default function SettingsScreen() {
  return (
    <Screen hasHeader>
      <AiSettings />
      <BackupSettings />
      {__DEV__ ? <DevTools /> : null}
    </Screen>
  );
}

function AiSettings() {
  const undo = useUndo();
  const { data, db, reload } = useFocusData(loadAi);
  const [keyText, setKeyText] = useState('');
  const [modelText, setModelText] = useState<string | null>(null);

  const saveKey = useCallback(async () => {
    if (keyText.trim() === '') return;
    await setApiKey(keyText);
    setKeyText('');
    await reload();
    undo.show({ message: 'API key tersimpan' });
  }, [keyText, reload, undo]);

  if (data === null) return null;

  function confirmDeleteKey() {
    Alert.alert('Hapus API key?', 'Resep dari foto, dan dari link tanpa data terstruktur, tidak bisa dibaca sampai key diisi lagi.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          await deleteApiKey();
          await reload();
          undo.show({ message: 'API key dihapus' });
        },
      },
    ]);
  }

  async function saveModel() {
    await setModel(db, modelText ?? data!.model);
    setModelText(null);
    await reload();
    undo.show({ message: 'Model tersimpan' });
  }

  return (
    <Card title="AI untuk baca resep">
      <Text color="textMuted">
        Dipakai untuk resep dari foto, dan dari link yang tidak punya data resep terstruktur. Memakai Gemini (paket
        gratis, ada batas harian). Di paket gratis, Google bisa memakai data yang dikirim untuk memperbaiki layanannya.
      </Text>

      <View style={styles.block}>
        <Text variant="bodyStrong">API key Gemini</Text>
        {data.apiKey ? (
          <>
            <Text color="success">Tersimpan {maskKey(data.apiKey)}</Text>
            <Button label="Hapus API key" variant="text" danger onPress={confirmDeleteKey} />
          </>
        ) : (
          <Text variant="caption" color="textMuted">
            Buat key gratis di Google AI Studio, salin, lalu tempel di sini.
          </Text>
        )}
        <Input
          value={keyText}
          onChangeText={setKeyText}
          placeholder={data.apiKey ? 'Tempel key baru untuk mengganti' : 'Tempel API key'}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Button label="Simpan API key" onPress={saveKey} disabled={keyText.trim() === ''} />
        <Button label="Buka Google AI Studio" icon="open-outline" variant="text" onPress={() => Linking.openURL(KEY_PAGE)} />
      </View>

      <View style={styles.block}>
        <Input
          label="Nama model"
          value={modelText ?? data.model}
          onChangeText={setModelText}
          placeholder={DEFAULT_GEMINI_MODEL}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text variant="caption" color="textMuted">
          Bawaan: {DEFAULT_GEMINI_MODEL}. Kosongkan untuk kembali ke bawaan.
        </Text>
        {modelText !== null && modelText !== data.model ? (
          <Button label="Simpan model" variant="outline" onPress={saveModel} />
        ) : null}
      </View>
    </Card>
  );
}

async function loadBackup(db: Db) {
  return { lastBackupAt: await getLastBackupAt(db), hasSafety: hasSafetyBackup() };
}

function describeBackup(backup: BackupFile): string {
  const s = summarizeBackup(backup);
  const date = backup.exportedAt ? `Backup ${formatShortDate(new Date(backup.exportedAt))}: ` : 'Isi backup: ';
  return `${date}${s.recipes} resep, ${s.ingredients} bahan, ${s.orders} pesanan, ${s.bakes} catatan bake, ${s.photos} foto.`;
}

function BackupSettings() {
  const undo = useUndo();
  const { data, db, reload } = useFocusData(loadBackup);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'export' | 'import', task: () => Promise<void>) {
    setError(null);
    setBusy(kind);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ada yang gagal. Coba lagi.');
    } finally {
      setBusy(null);
      await reload();
    }
  }

  function confirmRestore(backup: BackupFile, title: string) {
    Alert.alert(
      title,
      `${describeBackup(backup)}

Semua data di HP ini diganti dengan isi backup. Data sekarang disimpan dulu, jadi masih bisa dikembalikan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ganti semua',
          style: 'destructive',
          onPress: () =>
            run('import', async () => {
              await restoreBackup(db, backup);
              undo.show({ message: 'Data dari backup sudah dipakai' });
            }),
        },
      ],
    );
  }

  async function startImport() {
    setError(null);
    try {
      const backup = await pickBackup(db);
      if (backup) confirmRestore(backup, 'Ganti semua data?');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'File backup gagal dibuka. Coba lagi.');
    }
  }

  async function startUndoImport() {
    setError(null);
    try {
      confirmRestore(await readSafetyBackup(db), 'Kembalikan data sebelum impor?');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Data sebelum impor gagal dibuka.');
    }
  }

  if (data === null) return null;

  return (
    <Card title="Ekspor dan impor data">
      <Text color="textMuted">
        Satu file berisi semua resep, stok, pesanan, catatan bake, dan foto. Simpan di Google Drive atau kirim ke diri
        sendiri, supaya data aman kalau HP hilang atau ganti HP. API key tidak ikut.
      </Text>
      <Text variant="caption" color="textMuted">
        {data.lastBackupAt
          ? `Terakhir dicadangkan: ${formatShortDate(new Date(data.lastBackupAt))}`
          : 'Belum pernah dicadangkan.'}
      </Text>
      <View style={styles.block}>
        <Button
          label={busy === 'export' ? 'Menyiapkan file...' : 'Ekspor data'}
          icon="share-outline"
          variant="outline"
          disabled={busy !== null}
          onPress={() => run('export', () => exportBackup(db))}
        />
        <Button
          label={busy === 'import' ? 'Mengimpor...' : 'Impor data'}
          icon="download-outline"
          variant="outline"
          disabled={busy !== null}
          onPress={startImport}
        />
        {data.hasSafety ? (
          <Button
            label="Kembalikan data sebelum impor"
            variant="text"
            disabled={busy !== null}
            onPress={startUndoImport}
          />
        ) : null}
        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

// Hanya tampil di mode pengembangan (Expo Go / dev build), tidak ada di APK.
function DevTools() {
  const undo = useUndo();
  const { data: seeded, db, reload } = useFocusData(hasWorstCaseSeed);
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<void>, message: string) {
    setBusy(true);
    try {
      await task();
      await reload();
      undo.show({ message });
    } catch (e) {
      undo.show({ message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Alat pengembangan">
      <Text variant="caption" color="textMuted">
        Data uji ekstrem: nama panjang, stok habis dan minus, banyak satuan, resep tanpa langkah, versi dan bake.
        Hapus data uji hanya menghapus data ini.
      </Text>
      <View style={styles.block}>
        {seeded ? (
          <Button
            label="Hapus data uji"
            variant="outline"
            danger
            disabled={busy}
            onPress={() => run(() => removeWorstCase(db), 'Data uji dihapus')}
          />
        ) : (
          <Button
            label="Isi data uji ekstrem"
            variant="outline"
            disabled={busy || seeded === null}
            onPress={() => run(() => seedWorstCase(db), 'Data uji ditambahkan')}
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
});
