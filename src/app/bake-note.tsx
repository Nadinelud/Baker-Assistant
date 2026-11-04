import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, EmptyState, IconButton, Input, Photo, Rating, Screen, SectionHeader, Text, useUndo } from '@/components';
import {
  addBakePhoto,
  deleteBakeLog,
  getBakeLog,
  getPreviousSettings,
  removeBakePhoto,
  updateBakeNotes,
  type BakeLogDetail,
  type BakePhoto,
} from '@/db/bakeLogs';
import { undoBakeById } from '@/db/bakes';
import { formatDateTime } from '@/lib/dates';
import { deletePhotoFiles, pickPhotos, takePhoto, type PickResult } from '@/lib/photos';
import { formatMultiplier } from '@/lib/scaling';
import { formatNumber, parseAmount } from '@/lib/units';
import { sizes, spacing } from '@/theme';

const MAX_PHOTOS = 6;

function textOf(value: number | null): string {
  return value === null ? '' : String(value);
}

// Kosong = null. NaN kalau isinya bukan angka (ditolak saat simpan).
function numberOf(text: string): number | null {
  if (text.trim() === '') return null;
  return parseAmount(text) ?? Number.NaN;
}

export default function BakeNoteScreen() {
  const params = useLocalSearchParams<{ id: string; fresh?: string }>();
  const id = Number(params.id);
  // fresh: baru saja "Selesai bake" (ada tombol Lewati dan Batalkan bake).
  const fresh = params.fresh === '1';
  const db = useSQLiteContext();
  const undo = useUndo();

  const [log, setLog] = useState<BakeLogDetail | null | undefined>(undefined);
  const [previous, setPrevious] = useState<{ ovenTemp: number | null; durationMin: number | null }>({
    ovenTemp: null,
    durationMin: null,
  });
  const [ovenText, setOvenText] = useState('');
  const [durationText, setDurationText] = useState('');
  const [note, setNote] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [photos, setPhotos] = useState<BakePhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Dimuat sekali (bukan setiap fokus) supaya isian yang belum disimpan tidak tertimpa
  // saat kembali dari kamera atau galeri.
  useEffect(() => {
    let active = true;
    (async () => {
      const [detail, prev] = await Promise.all([getBakeLog(db, id), getPreviousSettings(db, id)]);
      if (!active) return;
      setLog(detail);
      setPrevious(prev);
      if (detail) {
        setOvenText(textOf(detail.ovenTemp));
        setDurationText(textOf(detail.durationMin));
        setNote(detail.resultNote ?? '');
        setRating(detail.rating);
        setPhotos(detail.photos);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, id]);

  if (log === undefined) return <Screen hasHeader bottomInset>{null}</Screen>;
  if (log === null) {
    return (
      <Screen hasHeader bottomInset>
        <EmptyState icon="alert-circle-outline" message="Catatan bake ini sudah tidak ada." />
      </Screen>
    );
  }
  const current = log;

  async function addPhotos(pick: () => Promise<PickResult>) {
    setError(null);
    try {
      const result = await pick();
      if ('error' in result) return setError(result.error);
      const added: BakePhoto[] = [];
      for (const uri of result.uris) added.push({ id: await addBakePhoto(db, id, uri), uri });
      setPhotos((list) => [...list, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Foto gagal disimpan. Coba lagi.');
    }
  }

  async function removePhoto(photo: BakePhoto) {
    const uri = await removeBakePhoto(db, photo.id);
    if (uri) deletePhotoFiles([uri]);
    setPhotos((list) => list.filter((p) => p.id !== photo.id));
  }

  async function handleSave() {
    const ovenTemp = numberOf(ovenText);
    const durationMin = numberOf(durationText);
    if (Number.isNaN(ovenTemp)) return setError('Suhu oven harus angka, misalnya 170.');
    if (Number.isNaN(durationMin)) return setError('Durasi harus angka dalam menit, misalnya 35.');
    setBusy(true);
    try {
      await updateBakeNotes(db, id, { ovenTemp, durationMin, resultNote: note, rating });
      undo.show({ message: 'Tersimpan' });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan. Coba lagi.');
      setBusy(false);
    }
  }

  function confirmUndoBake() {
    Alert.alert('Batalkan bake ini?', 'Stok yang dipotong dikembalikan dan catatan ini dihapus.', [
      { text: 'Tidak', style: 'cancel' },
      {
        text: 'Batalkan bake',
        style: 'destructive',
        onPress: async () => {
          deletePhotoFiles(await undoBakeById(db, id));
          undo.show({ message: 'Bake dibatalkan, stok dikembalikan' });
          router.back();
        },
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert('Hapus catatan ini?', 'Catatan dan fotonya dihapus. Stok yang sudah terpakai tidak berubah.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          deletePhotoFiles(await deleteBakeLog(db, id));
          undo.show({ message: 'Catatan dihapus' });
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen hasHeader bottomInset>
      <View style={styles.header}>
        {fresh ? (
          <Text variant="caption" color="success">
            Bake tercatat, stok sudah dipotong.
          </Text>
        ) : null}
        <Text variant="title">{current.recipeName}</Text>
        {fresh && (current.ovenTemp !== null || current.durationMin !== null) ? (
          <Text variant="caption" color="textMuted">
            Suhu dan durasi diisi dari resep. Ganti kalau kenyataannya berbeda.
          </Text>
        ) : null}
        <Text color="textMuted">
          {formatDateTime(new Date(current.bakedAt))} · v{current.versionNumber} · {formatMultiplier(current.multiplier)} ·{' '}
          {formatNumber(current.yieldTotal)} {current.yieldUnit}
        </Text>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Foto" />
        {photos.length > 0 ? (
          <View style={styles.photos}>
            {photos.map((photo) => (
              <View key={photo.id} style={styles.photo}>
                <Photo uri={photo.uri} shape="tile" />
                <IconButton icon="trash-outline" label="Hapus foto" color="textMuted" onPress={() => removePhoto(photo)} />
              </View>
            ))}
          </View>
        ) : null}
        {photos.length < MAX_PHOTOS ? (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="Ambil foto" icon="camera-outline" variant="outline" onPress={() => addPhotos(takePhoto)} />
            </View>
            <View style={styles.flex}>
              <Button
                label="Dari galeri"
                icon="images-outline"
                variant="outline"
                onPress={() => addPhotos(() => pickPhotos(MAX_PHOTOS - photos.length))}
              />
            </View>
          </View>
        ) : (
          <Text variant="caption" color="textMuted">
            Maksimal {MAX_PHOTOS} foto per bake.
          </Text>
        )}
      </View>

      <View style={styles.row}>
        <View style={styles.flex}>
          <Input
            label="Suhu oven (°C)"
            value={ovenText}
            onChangeText={setOvenText}
            keyboardType="number-pad"
            placeholder={previous.ovenTemp ? `Terakhir ${previous.ovenTemp}` : '170'}
          />
        </View>
        <View style={styles.flex}>
          <Input
            label="Durasi (menit)"
            value={durationText}
            onChangeText={setDurationText}
            keyboardType="number-pad"
            placeholder={previous.durationMin ? `Terakhir ${previous.durationMin}` : '35'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="caption" color="textMuted">
          Nilai hasil
        </Text>
        <Rating value={rating} onChange={setRating} />
      </View>

      <Input
        label="Hasil dan ide perbaikan"
        value={note}
        onChangeText={setNote}
        placeholder={'Bagian atas retak, lain kali suhu diturunkan 10°C'}
        multiline
      />

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}

      <View style={styles.section}>
        <Button label={busy ? 'Menyimpan...' : 'Simpan catatan'} onPress={handleSave} disabled={busy} />
        {fresh ? <Button label="Lewati" variant="text" onPress={() => router.back()} /> : null}
      </View>

      <View style={styles.danger}>
        {fresh ? (
          <Button label="Batalkan bake ini" variant="text" danger onPress={confirmUndoBake} />
        ) : (
          <Button label="Hapus catatan" variant="outline" danger onPress={confirmDelete} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  section: {
    gap: spacing.sm,
  },
  photos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  photo: {
    width: sizes.photoTile,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  danger: {
    paddingTop: spacing.lg,
  },
});
