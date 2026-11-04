// Catatan hasil bake: suhu, durasi, hasil + ide perbaikan, nilai 1-5, dan foto.
// Menghapus catatan tidak mengubah stok (bahan memang sudah terpakai).
import { roundAmount } from '@/lib/units';

import type { Db } from './types';

export type BakePhoto = { id: number; uri: string };

export type BakeLogDetail = {
  id: number;
  recipeId: number;
  recipeName: string;
  versionId: number;
  versionNumber: number;
  bakedAt: string;
  multiplier: number;
  yieldTotal: number;
  yieldUnit: string;
  ovenTemp: number | null;
  durationMin: number | null;
  resultNote: string | null;
  rating: number | null;
  photos: BakePhoto[];
};

export type BakeLogSummary = Omit<BakeLogDetail, 'photos'> & { photoUri: string | null; photoCount: number };

export type BakeNotesInput = {
  ovenTemp: number | null;
  durationMin: number | null;
  resultNote: string | null;
  rating: number | null;
};

export class BakeLogError extends Error {}

type Row = {
  id: number;
  recipe_id: number;
  recipe_name: string;
  version_id: number;
  version_number: number;
  baked_at: string;
  multiplier: number;
  yield_amount: number;
  yield_unit: string;
  oven_temp: number | null;
  duration_min: number | null;
  result_note: string | null;
  rating: number | null;
  photo_uri: string | null;
  photo_count: number;
};

const SELECT = `
SELECT b.id, r.id AS recipe_id, r.name AS recipe_name, v.id AS version_id, v.version_number,
       b.baked_at, b.multiplier, r.yield_amount, r.yield_unit,
       b.oven_temp, b.duration_min, b.result_note, b.rating,
       (SELECT uri FROM bake_log_photos p WHERE p.bake_log_id = b.id ORDER BY p.id LIMIT 1) AS photo_uri,
       (SELECT COUNT(*) FROM bake_log_photos p WHERE p.bake_log_id = b.id) AS photo_count
FROM bake_logs b
JOIN recipe_versions v ON v.id = b.version_id
JOIN recipes r ON r.id = v.recipe_id`;

function fromRow(row: Row): BakeLogSummary {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    recipeName: row.recipe_name,
    versionId: row.version_id,
    versionNumber: row.version_number,
    bakedAt: row.baked_at,
    multiplier: row.multiplier,
    yieldTotal: roundAmount(row.yield_amount * row.multiplier),
    yieldUnit: row.yield_unit,
    ovenTemp: row.oven_temp,
    durationMin: row.duration_min,
    resultNote: row.result_note,
    rating: row.rating,
    photoUri: row.photo_uri,
    photoCount: row.photo_count,
  };
}

export async function listBakeLogs(db: Db, options: { recipeId?: number; limit?: number } = {}) {
  const where = options.recipeId !== undefined ? 'WHERE r.id = ?' : '';
  const params = options.recipeId !== undefined ? [options.recipeId] : [];
  const limit = options.limit !== undefined ? `LIMIT ${Math.floor(options.limit)}` : '';
  const rows = await db.getAllAsync<Row>(`${SELECT} ${where} ORDER BY b.baked_at DESC, b.id DESC ${limit}`, ...params);
  return rows.map(fromRow);
}

export async function getBakeLog(db: Db, id: number): Promise<BakeLogDetail | null> {
  const row = await db.getFirstAsync<Row>(`${SELECT} WHERE b.id = ?`, id);
  if (!row) return null;
  const photos = await db.getAllAsync<BakePhoto>(
    'SELECT id, uri FROM bake_log_photos WHERE bake_log_id = ? ORDER BY id',
    id,
  );
  const { photoUri: _, photoCount: __, ...rest } = fromRow(row);
  return { ...rest, photos };
}

// Suhu dan durasi dari bake sebelumnya untuk versi yang sama (jadi contoh di form).
export async function getPreviousSettings(
  db: Db,
  bakeLogId: number,
): Promise<{ ovenTemp: number | null; durationMin: number | null }> {
  const row = await db.getFirstAsync<{ oven_temp: number | null; duration_min: number | null }>(
    `SELECT p.oven_temp, p.duration_min FROM bake_logs p
     JOIN bake_logs b ON b.id = ? AND p.version_id = b.version_id
     WHERE p.id != b.id AND (p.oven_temp IS NOT NULL OR p.duration_min IS NOT NULL)
     ORDER BY p.baked_at DESC, p.id DESC LIMIT 1`,
    bakeLogId,
  );
  return { ovenTemp: row?.oven_temp ?? null, durationMin: row?.duration_min ?? null };
}

function checkWhole(value: number | null, label: string, max: number) {
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new BakeLogError(`${label} tidak masuk akal.`);
  return Math.round(value);
}

export async function updateBakeNotes(db: Db, id: number, input: BakeNotesInput): Promise<void> {
  const ovenTemp = checkWhole(input.ovenTemp, 'Suhu oven', 400);
  const durationMin = checkWhole(input.durationMin, 'Durasi', 24 * 60);
  const rating = input.rating;
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
    throw new BakeLogError('Nilai harus 1 sampai 5.');
  }
  const result = await db.runAsync(
    'UPDATE bake_logs SET oven_temp = ?, duration_min = ?, result_note = ?, rating = ? WHERE id = ?',
    ovenTemp,
    durationMin,
    input.resultNote?.trim() || null,
    rating,
    id,
  );
  if (result.changes === 0) throw new BakeLogError('Catatan bake tidak ditemukan.');
}

export async function addBakePhoto(db: Db, bakeLogId: number, uri: string): Promise<number> {
  const result = await db.runAsync('INSERT INTO bake_log_photos (bake_log_id, uri) VALUES (?, ?)', bakeLogId, uri);
  return result.lastInsertRowId;
}

// Mengembalikan uri supaya file fotonya bisa ikut dihapus.
export async function removeBakePhoto(db: Db, photoId: number): Promise<string | null> {
  const row = await db.getFirstAsync<{ uri: string }>('SELECT uri FROM bake_log_photos WHERE id = ?', photoId);
  await db.runAsync('DELETE FROM bake_log_photos WHERE id = ?', photoId);
  return row?.uri ?? null;
}

// Hapus catatan dan fotonya. Stok tidak berubah. Mengembalikan uri foto untuk dihapus dari HP.
export async function deleteBakeLog(db: Db, id: number): Promise<string[]> {
  const photos = await db.getAllAsync<{ uri: string }>('SELECT uri FROM bake_log_photos WHERE bake_log_id = ?', id);
  await db.runAsync('DELETE FROM bake_logs WHERE id = ?', id);
  return photos.map((p) => p.uri);
}
