// Ekspor/impor backup: satu file .json berisi semua data + foto (base64).
// Ekspor dibagikan lewat menu bagikan Android (simpan ke Drive, WhatsApp, Files, dll.).
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  buildBackup,
  fromPhotoToken,
  mapPhotoUris,
  parseBackup,
  photoPath,
  photoUris,
  readAllTables,
  replaceAllData,
  setLastBackupAt,
  type BackupFile,
} from '@/db/backup';
import { getSchemaVersion } from '@/db/migrate';
import type { Db } from '@/db/types';
import { syncNotifications } from '@/lib/notifications';
import { dateKey } from '@/lib/pickup';

const PHOTO_DIRS = ['bake-photos', 'recipe-photos'];
// Data sebelum impor terakhir, supaya impor yang salah bisa dibatalkan.
const SAFETY_DIR = 'backups';
const SAFETY_FILE = 'sebelum-impor.json';

async function readPhoto(uri: string): Promise<string | null> {
  try {
    const file = new File(uri);
    return file.exists ? await file.base64() : null;
  } catch {
    return null;
  }
}

async function writeBackupFile(target: File, db: Db): Promise<void> {
  const backup = await buildBackup(db, readPhoto);
  if (target.exists) target.delete();
  await target.write(JSON.stringify(backup));
}

export async function exportBackup(db: Db): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Menu bagikan tidak tersedia di HP ini, jadi file backup tidak bisa dikirim.');
  }
  const file = new File(Paths.cache, `baker-assistant-${dateKey(new Date())}.json`);
  await writeBackupFile(file, db);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Simpan backup' });
  // Menu bagikan tidak memberi tahu apakah file benar-benar disimpan; anggap sudah setelah menu ditutup.
  await setLastBackupAt(db, new Date().toISOString());
}

// Buka pemilih file. null = batal.
export async function pickBackup(db: Db): Promise<BackupFile | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'application/octet-stream', 'text/plain'] });
  if (picked.canceled) return null;
  return parseBackup(await picked.result.text(), await getSchemaVersion(db));
}

function safetyFile(): File {
  return new File(Paths.document, SAFETY_DIR, SAFETY_FILE);
}

export function hasSafetyBackup(): boolean {
  return safetyFile().exists;
}

export async function readSafetyBackup(db: Db): Promise<BackupFile> {
  return parseBackup(await safetyFile().text(), await getSchemaVersion(db));
}

// Ganti semua data dengan isi backup. Data sekarang disimpan dulu sebagai cadangan di HP.
export async function restoreBackup(db: Db, backup: BackupFile): Promise<void> {
  const folder = new Directory(Paths.document, SAFETY_DIR);
  folder.create({ idempotent: true, intermediates: true });
  const safety = safetyFile();
  // Cadangan ditulis ke file sementara dulu: kalau gagal, cadangan lama tidak rusak.
  const pending = new File(folder, `${SAFETY_FILE}.tmp`);
  await writeBackupFile(pending, db);

  for (const dir of PHOTO_DIRS) new Directory(Paths.document, dir).create({ idempotent: true, intermediates: true });
  for (const [path, data] of Object.entries(backup.photos)) {
    const file = new File(Paths.document, path);
    if (file.exists) file.delete();
    await file.write(data, { encoding: 'base64' });
  }

  const tables = mapPhotoUris(backup.tables, (value) =>
    fromPhotoToken(value, (path) => new File(Paths.document, path).uri),
  );
  try {
    await replaceAllData(db, tables);
  } finally {
    await removeUnusedPhotos(db);
  }

  if (safety.exists) safety.delete();
  await pending.move(safety);
  await syncNotifications(db);
}

// Hapus file foto yang tidak dipakai data mana pun (sisa data lama setelah impor).
async function removeUnusedPhotos(db: Db): Promise<void> {
  const used = new Set(
    photoUris(await readAllTables(db))
      .map(photoPath)
      .filter((p): p is string => p !== null),
  );
  for (const dir of PHOTO_DIRS) {
    const folder = new Directory(Paths.document, dir);
    if (!folder.exists) continue;
    for (const entry of folder.list()) {
      if (entry instanceof File && !used.has(`${dir}/${entry.name}`)) {
        try {
          entry.delete();
        } catch {
          // abaikan
        }
      }
    }
  }
}
