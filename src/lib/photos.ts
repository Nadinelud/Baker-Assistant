// Foto hasil bake: ambil dari kamera atau galeri, lalu salin ke folder dokumen app
// (folder cache bisa dibersihkan sistem kapan saja).
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

const PHOTO_DIR = 'bake-photos';
const RECIPE_PHOTO_DIR = 'recipe-photos';
const QUALITY = 0.7; // cukup tajam untuk dilihat di HP, ukuran file kecil
// Foto untuk dibaca AI: lebih kecil supaya 4 foto tetap di bawah batas ukuran permintaan.
const IMPORT_QUALITY = 0.5;

export type PickResult = { uris: string[] } | { error: string };
export type ImportPhoto = { uri: string; base64: string };
export type ImportPickResult = { photos: ImportPhoto[] } | { error: string };

const CAMERA_DENIED = 'Izin kamera ditolak. Aktifkan lewat Pengaturan HP, atau pilih foto dari galeri.';

async function persist(sourceUri: string, dir = PHOTO_DIR): Promise<string> {
  const folder = new Directory(Paths.document, dir);
  folder.create({ idempotent: true, intermediates: true });
  const source = new File(sourceUri);
  const extension = source.extension || '.jpg';
  const target = new File(folder, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`);
  await source.copy(target);
  return target.uri;
}

export async function takePhoto(): Promise<PickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { error: CAMERA_DENIED };
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: QUALITY });
  if (result.canceled) return { uris: [] };
  return { uris: await Promise.all(result.assets.map((a) => persist(a.uri))) };
}

export async function pickPhotos(limit: number): Promise<PickResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: QUALITY,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
  });
  if (result.canceled) return { uris: [] };
  return { uris: await Promise.all(result.assets.slice(0, limit).map((a) => persist(a.uri))) };
}

// Hapus file foto dari HP. Gagal diam-diam: file yang sudah tidak ada tidak masalah.
export function deletePhotoFiles(uris: string[]): void {
  for (const uri of uris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // abaikan
    }
  }
}

// Foto resep (buku) untuk dibaca AI: base64 untuk dikirim, salinan file untuk disimpan sebagai sumber.
async function toImportPhotos(assets: ImagePicker.ImagePickerAsset[]): Promise<ImportPhoto[]> {
  const photos: ImportPhoto[] = [];
  for (const asset of assets) {
    if (!asset.base64) continue;
    photos.push({ uri: await persist(asset.uri, RECIPE_PHOTO_DIR), base64: asset.base64 });
  }
  return photos;
}

export async function takeRecipePhoto(): Promise<ImportPickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { error: CAMERA_DENIED };
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: IMPORT_QUALITY, base64: true });
  if (result.canceled) return { photos: [] };
  return { photos: await toImportPhotos(result.assets) };
}

export async function pickRecipePhotos(limit: number): Promise<ImportPickResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: IMPORT_QUALITY,
    base64: true,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
  });
  if (result.canceled) return { photos: [] };
  return { photos: await toImportPhotos(result.assets.slice(0, limit)) };
}
