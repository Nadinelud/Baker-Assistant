// Nama lain untuk bahan yang sama ("terigu" -> "Tepung terigu"). Disimpan saat user mencocokkan
// bahan di layar review impor, supaya impor berikutnya langsung cocok.
import { normalizeName } from '@/lib/recipeImport/matching';

import type { Db } from './types';

export type IngredientAlias = { ingredientId: number; alias: string };

export async function listAliases(db: Db): Promise<IngredientAlias[]> {
  const rows = await db.getAllAsync<{ ingredient_id: number; alias: string }>(
    'SELECT ingredient_id, alias FROM ingredient_aliases ORDER BY id',
  );
  return rows.map((r) => ({ ingredientId: r.ingredient_id, alias: r.alias }));
}

// Kalau alias sudah dipakai bahan lain, dipindahkan ke bahan ini (pilihan terakhir user yang berlaku).
export async function saveAlias(db: Db, ingredientId: number, rawAlias: string): Promise<void> {
  const alias = normalizeName(rawAlias);
  if (alias === '') return;
  const ingredient = await db.getFirstAsync<{ name: string }>('SELECT name FROM ingredients WHERE id = ?', ingredientId);
  if (!ingredient || normalizeName(ingredient.name) === alias) return;
  await db.runAsync(
    `INSERT INTO ingredient_aliases (ingredient_id, alias) VALUES (?, ?)
     ON CONFLICT(alias) DO UPDATE SET ingredient_id = excluded.ingredient_id`,
    ingredientId,
    alias,
  );
}
