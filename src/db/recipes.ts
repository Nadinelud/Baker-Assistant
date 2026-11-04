// Resep dengan versi. Jumlah bahan disimpan sesuai input (amount + unit) dan sudah
// dikonversi ke satuan dasar (amount_base) saat disimpan.
import { normalizeUnit, roundAmount, toBase, type BaseUnit } from '@/lib/units';

import { listIngredientDetails } from './ingredients';
import { nowIso, type Db } from './types';

export type RecipeSourceType = 'manual' | 'photo' | 'link' | 'draft';

// Satu baris bahan. ingredientId null = tidak dicatat di stok (nama disimpan di baris).
// amount null = tanpa takaran ("secukupnya"): tertulis di resep tapi tidak memotong stok.
export type RecipeLineInput = {
  ingredientId: number | null;
  name?: string | null;
  amount: number | null;
  unit: string | null;
  note?: string | null;
  section?: string | null;
};

export type RecipeInput = {
  name: string;
  yieldAmount: number;
  yieldUnit: string;
  steps: string;
  // Suhu oven (°C) dan durasi (menit) untuk versi ini; null = tidak diisi.
  ovenTemp?: number | null;
  durationMin?: number | null;
  ingredients: RecipeLineInput[];
};

export type RecipeLine = {
  id: number;
  ingredientId: number | null; // null = tidak dicatat di stok
  ingredientName: string;
  baseUnit: BaseUnit | null;
  amount: number | null;
  unit: string | null;
  amountBase: number | null; // null = tidak memotong stok
  note: string | null;
  section: string | null;
};

export type RecipeVersion = {
  id: number;
  versionNumber: number;
  changeNote: string | null;
  steps: string;
  ovenTemp: number | null;
  durationMin: number | null;
  createdAt: string;
  ingredients: RecipeLine[];
};

export type VersionSummary = {
  id: number;
  versionNumber: number;
  changeNote: string | null;
  createdAt: string;
  bakeCount: number;
};

export type RecipeDetail = {
  id: number;
  name: string;
  yieldAmount: number;
  yieldUnit: string;
  isDraft: boolean;
  sourceType: RecipeSourceType;
  activeVersionId: number;
  version: RecipeVersion; // versi yang sedang dilihat (bawaan: versi aktif)
  versions: VersionSummary[];
};

export type RecipeSummary = {
  id: number;
  name: string;
  yieldAmount: number;
  yieldUnit: string;
  isDraft: boolean;
  versionNumber: number;
  lastBakedAt: string | null;
  photoUri: string | null;
};

export class RecipeError extends Error {}

type ConvertedLine = {
  ingredientId: number | null;
  name: string | null;
  amount: number | null;
  unit: string | null;
  amountBase: number | null;
  note: string | null;
  section: string | null;
};

function cleanOptional(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

async function cleanRecipe(db: Db, input: RecipeInput): Promise<{ input: RecipeInput; lines: ConvertedLine[] }> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name === '') throw new RecipeError('Nama resep belum diisi.');
  if (!(input.yieldAmount > 0)) throw new RecipeError('Hasil jadi harus lebih dari 0.');
  const yieldUnit = input.yieldUnit.trim();
  if (yieldUnit === '') throw new RecipeError('Isi satuan hasil jadi, misalnya cupcake atau loyang.');
  if (input.ingredients.length === 0) throw new RecipeError('Tambahkan minimal satu bahan.');
  const ovenTemp = wholeOrNull(input.ovenTemp, 'Suhu oven', 400);
  const durationMin = wholeOrNull(input.durationMin, 'Durasi', 24 * 60);

  const ingredients = new Map((await listIngredientDetails(db)).map((i) => [i.id, i]));
  const lines = input.ingredients.map((line): ConvertedLine => {
    const note = cleanOptional(line.note);
    const section = cleanOptional(line.section);
    const unitText = cleanOptional(line.unit);
    const unit = unitText ? normalizeUnit(unitText) : null;
    if (line.amount !== null && !(line.amount > 0)) throw new RecipeError('Jumlah bahan harus lebih dari 0, atau dikosongkan.');

    // Bahan tanpa stok: cukup nama; takaran hanya untuk ditulis.
    if (line.ingredientId === null) {
      const name = cleanOptional(line.name);
      if (!name) throw new RecipeError('Ada bahan tanpa nama. Isi namanya atau hapus barisnya.');
      return { ingredientId: null, name, amount: line.amount, unit, amountBase: null, note, section };
    }

    const ingredient = ingredients.get(line.ingredientId);
    if (!ingredient) throw new RecipeError('Ada bahan yang sudah tidak ada. Pilih ulang bahannya.');
    if (line.amount === null) {
      return { ingredientId: ingredient.id, name: null, amount: null, unit, amountBase: null, note, section };
    }
    const unitOrBase = unit ?? ingredient.baseUnit;
    const amountBase = toBase(line.amount, unitOrBase, ingredient);
    if (amountBase === null) {
      throw new RecipeError(`Konversi ${unitOrBase} untuk ${ingredient.name} belum ada. Tambahkan dulu.`);
    }
    return {
      ingredientId: ingredient.id,
      name: null,
      amount: line.amount,
      unit: unitOrBase,
      amountBase: roundAmount(amountBase),
      note,
      section,
    };
  });

  return { input: { ...input, name, yieldUnit, steps: input.steps.trim(), ovenTemp, durationMin }, lines };
}

function wholeOrNull(value: number | null | undefined, label: string, max: number): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new RecipeError(`${label} tidak masuk akal.`);
  return Math.round(value);
}

async function insertVersion(
  db: Db,
  recipeId: number,
  versionNumber: number,
  input: RecipeInput,
  changeNote: string | null,
  lines: ConvertedLine[],
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO recipe_versions (recipe_id, version_number, change_note, steps, oven_temp, duration_min, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    recipeId,
    versionNumber,
    changeNote,
    input.steps,
    input.ovenTemp ?? null,
    input.durationMin ?? null,
    nowIso(),
  );
  await insertLines(db, result.lastInsertRowId, lines);
  return result.lastInsertRowId;
}

async function insertLines(db: Db, versionId: number, lines: ConvertedLine[]) {
  for (const line of lines) {
    await db.runAsync(
      `INSERT INTO recipe_version_ingredients (version_id, ingredient_id, name, amount, unit, amount_base, note, section)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      versionId,
      line.ingredientId,
      line.name,
      line.amount,
      line.unit,
      line.amountBase,
      line.note,
      line.section,
    );
  }
}

export async function createRecipe(
  db: Db,
  raw: RecipeInput,
  options: { isDraft?: boolean; sourceType?: RecipeSourceType; sourceRef?: string | null } = {},
): Promise<number> {
  const { input, lines } = await cleanRecipe(db, raw);
  const isDraft = options.isDraft ?? false;
  let recipeId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO recipes (name, yield_amount, yield_unit, source_type, source_ref, is_draft, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      input.name,
      input.yieldAmount,
      input.yieldUnit,
      options.sourceType ?? (isDraft ? 'draft' : 'manual'),
      options.sourceRef ?? null,
      isDraft ? 1 : 0,
      nowIso(),
    );
    recipeId = result.lastInsertRowId;
    const versionId = await insertVersion(db, recipeId, 1, input, null, lines);
    await db.runAsync('UPDATE recipes SET active_version_id = ? WHERE id = ?', versionId, recipeId);
  });
  return recipeId;
}

export type SaveMode = 'new_version' | 'update_version';

// Simpan perubahan dari form. Selalu mengubah versi aktif (update_version) atau membuat
// versi baru yang langsung jadi aktif (new_version). Draft yang disimpan jadi resep biasa.
export async function saveRecipe(
  db: Db,
  recipeId: number,
  raw: RecipeInput,
  mode: SaveMode,
  changeNote?: string,
): Promise<void> {
  const recipe = await db.getFirstAsync<{ active_version_id: number }>(
    'SELECT active_version_id FROM recipes WHERE id = ?',
    recipeId,
  );
  if (!recipe) throw new RecipeError('Resep tidak ditemukan.');
  const { input, lines } = await cleanRecipe(db, raw);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE recipes SET name = ?, yield_amount = ?, yield_unit = ?, is_draft = 0 WHERE id = ?',
      input.name,
      input.yieldAmount,
      input.yieldUnit,
      recipeId,
    );
    if (mode === 'new_version') {
      const max = await db.getFirstAsync<{ n: number }>(
        'SELECT MAX(version_number) AS n FROM recipe_versions WHERE recipe_id = ?',
        recipeId,
      );
      const versionId = await insertVersion(
        db,
        recipeId,
        (max?.n ?? 0) + 1,
        input,
        changeNote?.trim() || null,
        lines,
      );
      await db.runAsync('UPDATE recipes SET active_version_id = ? WHERE id = ?', versionId, recipeId);
    } else {
      await db.runAsync(
        'UPDATE recipe_versions SET steps = ?, oven_temp = ?, duration_min = ? WHERE id = ?',
        input.steps,
        input.ovenTemp ?? null,
        input.durationMin ?? null,
        recipe.active_version_id,
      );
      await db.runAsync('DELETE FROM recipe_version_ingredients WHERE version_id = ?', recipe.active_version_id);
      await insertLines(db, recipe.active_version_id, lines);
    }
  });
}

export async function setActiveVersion(db: Db, recipeId: number, versionId: number): Promise<void> {
  const result = await db.runAsync(
    'UPDATE recipes SET active_version_id = ? WHERE id = ? AND EXISTS (SELECT 1 FROM recipe_versions WHERE id = ? AND recipe_id = ?)',
    versionId,
    recipeId,
    versionId,
    recipeId,
  );
  if (result.changes === 0) throw new RecipeError('Versi tidak ditemukan.');
}

export async function getVersionLines(db: Db, versionId: number): Promise<RecipeLine[]> {
  const rows = await db.getAllAsync<{
    id: number;
    ingredient_id: number | null;
    display_name: string;
    base_unit: BaseUnit | null;
    amount: number | null;
    unit: string | null;
    amount_base: number | null;
    note: string | null;
    section: string | null;
  }>(
    `SELECT l.id, l.ingredient_id, COALESCE(i.name, l.name) AS display_name, i.base_unit,
            l.amount, l.unit, l.amount_base, l.note, l.section
     FROM recipe_version_ingredients l LEFT JOIN ingredients i ON i.id = l.ingredient_id
     WHERE l.version_id = ? ORDER BY l.id`,
    versionId,
  );
  return rows.map((r) => ({
    id: r.id,
    ingredientId: r.ingredient_id,
    ingredientName: r.display_name,
    baseUnit: r.base_unit,
    amount: r.amount,
    unit: r.unit,
    amountBase: r.amount_base,
    note: r.note,
    section: r.section,
  }));
}

export async function getRecipe(db: Db, recipeId: number, versionId?: number): Promise<RecipeDetail | null> {
  const recipe = await db.getFirstAsync<{
    id: number;
    name: string;
    yield_amount: number;
    yield_unit: string;
    is_draft: number;
    source_type: RecipeSourceType;
    active_version_id: number;
  }>('SELECT id, name, yield_amount, yield_unit, is_draft, source_type, active_version_id FROM recipes WHERE id = ?', recipeId);
  if (!recipe) return null;

  const versions = await db.getAllAsync<{
    id: number;
    version_number: number;
    change_note: string | null;
    steps: string | null;
    oven_temp: number | null;
    duration_min: number | null;
    created_at: string;
    bake_count: number;
  }>(
    `SELECT v.id, v.version_number, v.change_note, v.steps, v.oven_temp, v.duration_min, v.created_at,
            (SELECT COUNT(*) FROM bake_logs b WHERE b.version_id = v.id) AS bake_count
     FROM recipe_versions v WHERE v.recipe_id = ? ORDER BY v.version_number DESC`,
    recipeId,
  );
  const shown = versions.find((v) => v.id === (versionId ?? recipe.active_version_id)) ?? versions[0];
  if (!shown) return null;

  return {
    id: recipe.id,
    name: recipe.name,
    yieldAmount: recipe.yield_amount,
    yieldUnit: recipe.yield_unit,
    isDraft: recipe.is_draft === 1,
    sourceType: recipe.source_type,
    activeVersionId: recipe.active_version_id,
    version: {
      id: shown.id,
      versionNumber: shown.version_number,
      changeNote: shown.change_note,
      steps: shown.steps ?? '',
      ovenTemp: shown.oven_temp,
      durationMin: shown.duration_min,
      createdAt: shown.created_at,
      ingredients: await getVersionLines(db, shown.id),
    },
    versions: versions.map((v) => ({
      id: v.id,
      versionNumber: v.version_number,
      changeNote: v.change_note,
      createdAt: v.created_at,
      bakeCount: v.bake_count,
    })),
  };
}

// Foto terbaru dari catatan bake resep ini (tahap 4).
const LATEST_PHOTO = `(SELECT p.uri FROM bake_log_photos p JOIN bake_logs b ON b.id = p.bake_log_id
  JOIN recipe_versions v ON v.id = b.version_id WHERE v.recipe_id = r.id ORDER BY b.baked_at DESC, p.id DESC LIMIT 1)`;

export async function listRecipes(db: Db): Promise<RecipeSummary[]> {
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    yield_amount: number;
    yield_unit: string;
    is_draft: number;
    version_number: number | null;
    last_baked_at: string | null;
    photo_uri: string | null;
  }>(`
SELECT r.id, r.name, r.yield_amount, r.yield_unit, r.is_draft,
       (SELECT version_number FROM recipe_versions WHERE id = r.active_version_id) AS version_number,
       (SELECT MAX(b.baked_at) FROM bake_logs b JOIN recipe_versions v ON v.id = b.version_id WHERE v.recipe_id = r.id) AS last_baked_at,
       ${LATEST_PHOTO} AS photo_uri
FROM recipes r
ORDER BY r.name COLLATE NOCASE`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    yieldAmount: r.yield_amount,
    yieldUnit: r.yield_unit,
    isDraft: r.is_draft === 1,
    versionNumber: r.version_number ?? 1,
    lastBakedAt: r.last_baked_at,
    photoUri: r.photo_uri,
  }));
}

// Hapus resep, semua versi, dan catatan bake-nya. Riwayat stok dari bake tetap ada.
// Mengembalikan uri foto catatan bake supaya filenya bisa dihapus dari HP.
export async function deleteRecipe(db: Db, recipeId: number): Promise<string[]> {
  const used = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM order_items WHERE recipe_id = ?', recipeId);
  if (used && used.n > 0) {
    throw new RecipeError('Resep ini dipakai di pesanan. Hapus dulu dari pesanan, lalu coba lagi.');
  }
  const photos = await db.getAllAsync<{ uri: string }>(
    `SELECT p.uri FROM bake_log_photos p JOIN bake_logs b ON b.id = p.bake_log_id
     JOIN recipe_versions v ON v.id = b.version_id WHERE v.recipe_id = ?`,
    recipeId,
  );
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM bake_logs WHERE version_id IN (SELECT id FROM recipe_versions WHERE recipe_id = ?)',
      recipeId,
    );
    await db.runAsync('DELETE FROM recipes WHERE id = ?', recipeId);
  });
  return photos.map((p) => p.uri);
}
