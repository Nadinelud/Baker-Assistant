// "Bake ini": cek kebutuhan bahan lalu "Selesai bake" = 1 bake_log + 1 movement (negatif) per bahan.
import { roundAmount, type BaseUnit } from '@/lib/units';

import { getVersionLines } from './recipes';
import { revertMovements } from './stock';
import { nowIso, type Db } from './types';

export type BakeNeed = {
  ingredientId: number;
  name: string;
  baseUnit: BaseUnit;
  needBase: number;
  stock: number;
  shortBase: number; // 0 kalau cukup
};

// Kebutuhan per bahan (baris bahan yang sama digabung) dibanding stok saat ini.
export async function getBakeNeeds(db: Db, versionId: number, multiplier: number): Promise<BakeNeed[]> {
  const lines = await getVersionLines(db, versionId);
  const needs = new Map<number, BakeNeed>();
  for (const line of lines) {
    // Bahan tanpa stok atau tanpa takaran tidak memotong stok.
    if (line.ingredientId === null || line.baseUnit === null || line.amountBase === null) continue;
    const existing = needs.get(line.ingredientId);
    const need = line.amountBase * multiplier;
    if (existing) existing.needBase += need;
    else {
      needs.set(line.ingredientId, {
        ingredientId: line.ingredientId,
        name: line.ingredientName,
        baseUnit: line.baseUnit,
        needBase: need,
        stock: 0,
        shortBase: 0,
      });
    }
  }
  for (const need of needs.values()) {
    const row = await db.getFirstAsync<{ stock: number | null }>(
      'SELECT SUM(amount_base) AS stock FROM stock_movements WHERE ingredient_id = ?',
      need.ingredientId,
    );
    need.needBase = roundAmount(need.needBase);
    need.stock = roundAmount(row?.stock ?? 0);
    need.shortBase = roundAmount(Math.max(0, need.needBase - need.stock));
  }
  return [...needs.values()];
}

export type BakeResult = { bakeLogId: number; movementIds: number[] };

// Stok boleh jadi minus (catatan stok bisa meleset; dibetulkan lewat cek stok).
export async function completeBake(db: Db, versionId: number, multiplier: number): Promise<BakeResult> {
  if (!(multiplier > 0)) throw new Error('Kelipatan harus lebih dari 0.');
  const needs = await getBakeNeeds(db, versionId, multiplier);
  // Suhu dan durasi dari resep langsung tercatat; user bisa menggantinya di layar catatan.
  const settings = await db.getFirstAsync<{ oven_temp: number | null; duration_min: number | null }>(
    'SELECT oven_temp, duration_min FROM recipe_versions WHERE id = ?',
    versionId,
  );
  let bakeLogId = 0;
  const movementIds: number[] = [];
  await db.withTransactionAsync(async () => {
    const bakedAt = nowIso();
    const result = await db.runAsync(
      'INSERT INTO bake_logs (version_id, baked_at, multiplier, oven_temp, duration_min) VALUES (?, ?, ?, ?, ?)',
      versionId,
      bakedAt,
      multiplier,
      settings?.oven_temp ?? null,
      settings?.duration_min ?? null,
    );
    bakeLogId = result.lastInsertRowId;
    for (const need of needs) {
      if (need.needBase <= 0) continue;
      const movement = await db.runAsync(
        `INSERT INTO stock_movements (ingredient_id, amount_base, reason, ref_type, ref_id, created_at)
         VALUES (?, ?, 'bake', 'bake_log', ?, ?)`,
        need.ingredientId,
        -need.needBase,
        bakeLogId,
        bakedAt,
      );
      movementIds.push(movement.lastInsertRowId);
    }
  });
  return { bakeLogId, movementIds };
}

// Tombol Batalkan setelah Selesai bake: stok dikembalikan lewat revert, catatan bake dihapus.
export async function undoBake(db: Db, result: BakeResult): Promise<void> {
  await revertMovements(db, result.movementIds);
  await db.runAsync('DELETE FROM bake_logs WHERE id = ?', result.bakeLogId);
}

// Batalkan bake dari layar catatan (tanpa menyimpan id movement di layar): cari potongan stoknya
// lewat ref_type/ref_id. Mengembalikan uri foto supaya filenya bisa dihapus.
export async function undoBakeById(db: Db, bakeLogId: number): Promise<string[]> {
  const movements = await db.getAllAsync<{ id: number }>(
    `SELECT m.id FROM stock_movements m
     WHERE m.ref_type = 'bake_log' AND m.ref_id = ? AND m.reason = 'bake'
       AND NOT EXISTS (SELECT 1 FROM stock_movements r WHERE r.reverted_of_id = m.id)`,
    bakeLogId,
  );
  const photos = await db.getAllAsync<{ uri: string }>('SELECT uri FROM bake_log_photos WHERE bake_log_id = ?', bakeLogId);
  await undoBake(db, { bakeLogId, movementIds: movements.map((m) => m.id) });
  return photos.map((p) => p.uri);
}

export type LastBake = {
  bakeLogId: number;
  recipeId: number;
  recipeName: string;
  versionNumber: number;
  bakedAt: string;
  multiplier: number;
  yieldAmount: number;
  yieldUnit: string;
  ovenTemp: number | null;
  durationMin: number | null;
  resultNote: string | null;
  photoUri: string | null;
};

export type RecentBakedRecipe = { recipeId: number; name: string; lastBakedAt: string; photoUri: string | null };

// Untuk Beranda: bake terakhir + beberapa resep lain yang baru di-bake.
export async function getRecentBakes(db: Db, otherLimit = 2): Promise<{ last: LastBake | null; others: RecentBakedRecipe[] }> {
  const last = await db.getFirstAsync<{
    id: number;
    recipe_id: number;
    name: string;
    version_number: number;
    baked_at: string;
    multiplier: number;
    yield_amount: number;
    yield_unit: string;
    oven_temp: number | null;
    duration_min: number | null;
    result_note: string | null;
    photo_uri: string | null;
  }>(`
SELECT b.id, r.id AS recipe_id, r.name, v.version_number, b.baked_at, b.multiplier, r.yield_amount, r.yield_unit,
       b.oven_temp, b.duration_min, b.result_note,
       (SELECT uri FROM bake_log_photos p WHERE p.bake_log_id = b.id ORDER BY p.id LIMIT 1) AS photo_uri
FROM bake_logs b
JOIN recipe_versions v ON v.id = b.version_id
JOIN recipes r ON r.id = v.recipe_id
ORDER BY b.baked_at DESC, b.id DESC LIMIT 1`);
  if (!last) return { last: null, others: [] };

  const others = await db.getAllAsync<{ recipe_id: number; name: string; last_baked_at: string; photo_uri: string | null }>(
    `
SELECT r.id AS recipe_id, r.name, MAX(b.baked_at) AS last_baked_at,
       (SELECT p.uri FROM bake_log_photos p JOIN bake_logs b2 ON b2.id = p.bake_log_id
          JOIN recipe_versions v2 ON v2.id = b2.version_id WHERE v2.recipe_id = r.id
          ORDER BY b2.baked_at DESC LIMIT 1) AS photo_uri
FROM bake_logs b
JOIN recipe_versions v ON v.id = b.version_id
JOIN recipes r ON r.id = v.recipe_id
WHERE r.id != ?
GROUP BY r.id
ORDER BY last_baked_at DESC LIMIT ?`,
    last.recipe_id,
    otherLimit,
  );

  return {
    last: {
      bakeLogId: last.id,
      recipeId: last.recipe_id,
      recipeName: last.name,
      versionNumber: last.version_number,
      bakedAt: last.baked_at,
      multiplier: last.multiplier,
      yieldAmount: roundAmount(last.yield_amount * last.multiplier),
      yieldUnit: last.yield_unit,
      ovenTemp: last.oven_temp,
      durationMin: last.duration_min,
      resultNote: last.result_note,
      photoUri: last.photo_uri,
    },
    others: others.map((o) => ({
      recipeId: o.recipe_id,
      name: o.name,
      lastBakedAt: o.last_baked_at,
      photoUri: o.photo_uri,
    })),
  };
}
