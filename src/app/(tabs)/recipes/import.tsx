import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, IconButton, Input, Photo, Screen, SectionHeader, Text } from '@/components';
import { listIngredientsWithStock } from '@/db/ingredients';
import type { Db } from '@/db/types';
import { setPendingImport } from '@/features/import/pendingImport';
import { getAiConfig, getApiKey } from '@/lib/aiSettings';
import { deletePhotoFiles, pickRecipePhotos, takeRecipePhoto, type ImportPhoto, type ImportPickResult } from '@/lib/photos';
import { importFromLink, importFromPhotos, normalizeUrl, type ImportResult } from '@/lib/recipeImport/importRecipe';
import { useFocusData } from '@/lib/useFocusData';
import { sizes, spacing } from '@/theme';

const MAX_PHOTOS = 4;

// Nama bahan di stok ikut dikirim ke AI supaya bahan resep langsung dicocokkan.
async function getStockNames(db: Db): Promise<string[]> {
  return (await listIngredientsWithStock(db)).map((i) => i.name);
}

async function hasKey(_db: Db) {
  return (await getApiKey()) !== null;
}

export default function ImportRecipeScreen() {
  const { data: keySaved, db } = useFocusData(hasKey);
  const [photos, setPhotos] = useState<ImportPhoto[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<'photo' | 'link' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addPhotos(pick: () => Promise<ImportPickResult>) {
    setError(null);
    try {
      const result = await pick();
      if ('error' in result) return setError(result.error);
      setPhotos((list) => [...list, ...result.photos].slice(0, MAX_PHOTOS));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Foto gagal dibuka. Coba lagi.');
    }
  }

  function removePhoto(photo: ImportPhoto) {
    deletePhotoFiles([photo.uri]);
    setPhotos((list) => list.filter((p) => p.uri !== photo.uri));
  }

  async function run(kind: 'photo' | 'link', task: () => Promise<ImportResult>, sourceRef: string) {
    setError(null);
    setBusy(kind);
    try {
      const result = await task();
      setPendingImport({
        recipe: result.recipe,
        sourceType: kind,
        sourceRef,
        via: result.via,
        truncated: result.truncated,
      });
      router.push('/recipes/review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resep gagal dibaca. Coba lagi, atau isi manual.');
    } finally {
      setBusy(null);
    }
  }

  async function readPhotos() {
    const ai = await getAiConfig(db);
    const stockNames = await getStockNames(db);
    run(
      'photo',
      () => importFromPhotos(photos.map((p) => p.base64), ai, fetch, stockNames),
      photos.map((p) => p.uri).join('\n'),
    );
  }

  async function readLink() {
    let normalized: string;
    try {
      normalized = normalizeUrl(url);
    } catch (e) {
      return setError(e instanceof Error ? e.message : 'Link tidak valid.');
    }
    const ai = await getAiConfig(db);
    const stockNames = await getStockNames(db);
    run('link', () => importFromLink(normalized, ai, fetch, stockNames), normalized);
  }

  return (
    <Screen hasHeader>
      <Text color="textMuted">
        Hasil baca selalu kamu periksa dulu sebelum disimpan. Kalau ada yang salah, bisa dibetulkan di langkah berikutnya.
      </Text>

      {keySaved === false ? (
        <Card>
          <Text variant="bodyStrong">AI belum aktif</Text>
          <Text color="textMuted">
            Resep dari foto butuh API key Gemini (gratis). Link dari situs resep besar biasanya tetap bisa dibaca tanpa
            AI.
          </Text>
          <Button label="Buka Pengaturan" variant="outline" onPress={() => router.push('/more/settings')} />
        </Card>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Dari foto buku" />
        <Text variant="caption" color="textMuted">
          Sampai {MAX_PHOTOS} foto untuk satu resep, misalnya kalau resepnya terpotong di dua halaman.
        </Text>
        {photos.length > 0 ? (
          <View style={styles.photos}>
            {photos.map((photo) => (
              <View key={photo.uri} style={styles.photo}>
                <Photo uri={photo.uri} shape="tile" />
                <IconButton icon="trash-outline" label="Hapus foto" color="textMuted" onPress={() => removePhoto(photo)} />
              </View>
            ))}
          </View>
        ) : null}
        {photos.length < MAX_PHOTOS ? (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="Ambil foto" icon="camera-outline" variant="outline" onPress={() => addPhotos(takeRecipePhoto)} />
            </View>
            <View style={styles.flex}>
              <Button
                label="Dari galeri"
                icon="images-outline"
                variant="outline"
                onPress={() => addPhotos(() => pickRecipePhotos(MAX_PHOTOS - photos.length))}
              />
            </View>
          </View>
        ) : null}
        {photos.length > 0 ? (
          <Button
            label={busy === 'photo' ? 'Membaca resep...' : 'Baca resep dari foto'}
            icon="sparkles-outline"
            onPress={readPhotos}
            disabled={busy !== null}
          />
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Dari link" />
        <Input
          value={url}
          onChangeText={(text) => {
            setUrl(text);
            setError(null);
          }}
          placeholder="https://contoh.com/resep-bolu"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Button
          label={busy === 'link' ? 'Mengambil resep...' : 'Ambil resep dari link'}
          icon="link-outline"
          variant={photos.length > 0 ? 'outline' : 'primary'}
          onPress={readLink}
          disabled={busy !== null || url.trim() === ''}
        />
      </View>

      {busy ? (
        <Text variant="caption" color="textMuted">
          Biasanya 5 sampai 20 detik.
        </Text>
      ) : null}
      {error ? (
        <View style={styles.section}>
          <Text variant="caption" color="danger">
            {error}
          </Text>
          <Button label="Isi resep manual" variant="text" onPress={() => router.replace('/recipes/new')} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
