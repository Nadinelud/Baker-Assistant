import type { BaseUnit, IngredientConversion, IngredientUnits } from '@/lib/units';
import { normalizeUnit, roundAmount, unitFactor } from '@/lib/units';

import { nowIso, type Db } from './types';

export type Ingredient = {
  id: number;
  name: string;
  baseUnit: BaseUnit;
  minStock: number;
  createdAt: string;
};

export type IngredientWithStock = Ingredient & { stock: number };

export type IngredientDetail = IngredientWithStock & IngredientUnits;

export type IngredientInput = {
  name: string;
  baseUnit: BaseUnit;
  minStock: number;
  conversions: IngredientConversion[];
};

export class IngredientError extends Error {}

type IngredientRow = {
  id: number;
  name: string;
  base_unit: BaseUnit;
  min_stock: number;
  created_at: string;
  stock: number;
};

function fromRow(row: IngredientRow): IngredientWithStock {
  return {
    id: row.id,
    name: row.name,
    baseUnit: row.base_unit,
    minStock: row.min_stock,
    createdAt: row.created_at,
    stock: roundAmount(row.stock),
  };
}

const SELECT_WITH_STOCK = `
SELECT i.id, i.name, i.base_unit, i.min_stock, i.created_at,
       COALESCE((SELECT SUM(m.amount_base) FROM stock_movements m WHERE m.ingredient_id = i.id), 0) AS stock
FROM ingredients i`;

export function isLowStock(item: { stock: number; minStock: number }): boolean {
  return item.minStock > 0 && item.stock <= item.minStock;
}

export async function listIngredientsWithStock(db: Db): Promise<IngredientWithStock[]> {
  const rows = await db.getAllAsync<IngredientRow>(`${SELECT_WITH_STOCK} ORDER BY i.name COLLATE NOCASE`);
  return rows.map(fromRow);
}

// Bahan menipis, yang paling parah (sisa terkecil dibanding batas) lebih dulu.
export async function listLowStock(db: Db): Promise<IngredientWithStock[]> {
  const all = await listIngredientsWithStock(db);
  return all.filter(isLowStock).sort((a, b) => a.stock / a.minStock - b.stock / b.minStock);
}

export async function countIngredients(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM ingredients');
  return row?.n ?? 0;
}

export async function getConversions(db: Db, ingredientId: number): Promise<IngredientConversion[]> {
  const rows = await db.getAllAsync<{ unit_name: string; to_base_amount: number }>(
    'SELECT unit_name, to_base_amount FROM ingredient_conversions WHERE ingredient_id = ? ORDER BY id',
    ingredientId,
  );
  return rows.map((r) => ({ unitName: r.unit_name, toBaseAmount: r.to_base_amount }));
}

// Semua bahan lengkap dengan stok dan konversi (untuk layar yang memilih satuan).
export async function listIngredientDetails(db: Db): Promise<IngredientDetail[]> {
  const [ingredients, conversionRows] = await Promise.all([
    listIngredientsWithStock(db),
    db.getAllAsync<{ ingredient_id: number; unit_name: string; to_base_amount: number }>(
      'SELECT ingredient_id, unit_name, to_base_amount FROM ingredient_conversions ORDER BY id',
    ),
  ]);
  const byIngredient = new Map<number, IngredientConversion[]>();
  for (const row of conversionRows) {
    const list = byIngredient.get(row.ingredient_id) ?? [];
    list.push({ unitName: row.unit_name, toBaseAmount: row.to_base_amount });
    byIngredient.set(row.ingredient_id, list);
  }
  return ingredients.map((i) => ({ ...i, conversions: byIngredient.get(i.id) ?? [] }));
}

export async function getIngredient(db: Db, id: number): Promise<IngredientDetail | null> {
  const row = await db.getFirstAsync<IngredientRow>(`${SELECT_WITH_STOCK} WHERE i.id = ?`, id);
  if (!row) return null;
  return { ...fromRow(row), conversions: await getConversions(db, id) };
}

function cleanInput(input: IngredientInput): IngredientInput {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name === '') throw new IngredientError('Nama bahan belum diisi.');
  if (!Number.isFinite(input.minStock) || input.minStock < 0) {
    throw new IngredientError('Batas minimum tidak boleh minus.');
  }

  const seen = new Set<string>();
  const conversions = input.conversions.map((c) => {
    const unitName = normalizeUnit(c.unitName);
    if (unitName === '') throw new IngredientError('Nama satuan konversi belum diisi.');
    if (!(c.toBaseAmount > 0)) throw new IngredientError(`Isi jumlah untuk 1 ${unitName}.`);
    // Satuan baku (g, kg, ml, ...) sudah otomatis, tidak perlu konversi.
    if (unitFactor(unitName, { baseUnit: input.baseUnit, conversions: [] }) !== null) {
      throw new IngredientError(`${unitName} sudah otomatis, tidak perlu konversi.`);
    }
    if (seen.has(unitName)) throw new IngredientError(`Satuan ${unitName} tercatat dua kali.`);
    seen.add(unitName);
    return { unitName, toBaseAmount: c.toBaseAmount };
  });

  return { ...input, name, conversions };
}

async function assertNameFree(db: Db, name: string, exceptId: number | null) {
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM ingredients WHERE lower(name) = lower(?) AND id IS NOT ?',
    name,
    exceptId,
  );
  if (row) throw new IngredientError(`Bahan "${name}" sudah ada. Pakai nama lain.`);
}

async function replaceConversions(db: Db, ingredientId: number, conversions: IngredientConversion[]) {
  await db.runAsync('DELETE FROM ingredient_conversions WHERE ingredient_id = ?', ingredientId);
  for (const c of conversions) {
    await db.runAsync(
      'INSERT INTO ingredient_conversions (ingredient_id, unit_name, to_base_amount) VALUES (?, ?, ?)',
      ingredientId,
      c.unitName,
      c.toBaseAmount,
    );
  }
}

// Stok awal (kalau ada) dicatat sebagai riwayat, bukan disimpan langsung.
export async function createIngredient(db: Db, input: IngredientInput, initialStock = 0): Promise<number> {
  const clean = cleanInput(input);
  if (!Number.isFinite(initialStock) || initialStock < 0) {
    throw new IngredientError('Stok awal tidak boleh minus.');
  }
  await assertNameFree(db, clean.name, null);

  let id = 0;
  await db.withTransactionAsync(async () => {
    const createdAt = nowIso();
    const result = await db.runAsync(
      'INSERT INTO ingredients (name, base_unit, min_stock, created_at) VALUES (?, ?, ?, ?)',
      clean.name,
      clean.baseUnit,
      clean.minStock,
      createdAt,
    );
    id = result.lastInsertRowId;
    await replaceConversions(db, id, clean.conversions);
    if (initialStock > 0) {
      await db.runAsync(
        "INSERT INTO stock_movements (ingredient_id, amount_base, reason, note, created_at) VALUES (?, ?, 'adjustment', 'Stok awal', ?)",
        id,
        initialStock,
        createdAt,
      );
    }
  });
  return id;
}

// Satuan dasar tidak bisa diubah setelah bahan dibuat, karena riwayat tersimpan dalam satuan itu.
export async function updateIngredient(
  db: Db,
  id: number,
  input: Omit<IngredientInput, 'baseUnit'>,
): Promise<void> {
  const existing = await getIngredient(db, id);
  if (!existing) throw new IngredientError('Bahan tidak ditemukan.');
  const clean = cleanInput({ ...input, baseUnit: existing.baseUnit });
  await assertNameFree(db, clean.name, id);

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE ingredients SET name = ?, min_stock = ? WHERE id = ?', clean.name, clean.minStock, id);
    await replaceConversions(db, id, clean.conversions);
  });
}

// Tambah satu konversi (misalnya dari form resep: "1 cup tepung = 120 g").
export async function addConversion(db: Db, ingredientId: number, conversion: IngredientConversion): Promise<void> {
  const existing = await getIngredient(db, ingredientId);
  if (!existing) throw new IngredientError('Bahan tidak ditemukan.');
  const clean = cleanInput({ ...existing, conversions: [...existing.conversions, conversion] });
  const added = clean.conversions[clean.conversions.length - 1];
  await db.runAsync(
    'INSERT INTO ingredient_conversions (ingredient_id, unit_name, to_base_amount) VALUES (?, ?, ?)',
    ingredientId,
    added.unitName,
    added.toBaseAmount,
  );
}

// Hapus bahan beserta riwayat stoknya. Ditolak kalau bahan dipakai di resep.
export async function deleteIngredient(db: Db, id: number): Promise<void> {
  const used = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM recipe_version_ingredients WHERE ingredient_id = ?',
    id,
  );
  if (used && used.n > 0) {
    throw new IngredientError('Bahan ini dipakai di resep. Hapus dulu dari resep, lalu coba lagi.');
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM shopping_items WHERE ingredient_id = ?', id);
    await db.runAsync('DELETE FROM stock_movements WHERE ingredient_id = ?', id);
    await db.runAsync('DELETE FROM ingredients WHERE id = ?', id);
  });
}
