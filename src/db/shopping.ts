// Daftar belanja = bahan habis/hampir habis (dihitung langsung dari stok, tidak disimpan)
// + item tersimpan di shopping_items (tambah manual, nanti juga kekurangan pesanan).
// amount_base = 0 di shopping_items berarti "tanpa jumlah".
import type { BaseUnit } from '@/lib/units';

import { listIngredientsWithStock, isLowStock, type IngredientWithStock } from './ingredients';
import { recordPurchase, revertMovements } from './stock';
import { nowIso, type Db } from './types';

export type StockStatus = 'empty' | 'low' | null;

export type ShoppingEntry = {
  ingredientId: number;
  name: string;
  baseUnit: BaseUnit;
  stock: number;
  minStock: number;
  status: StockStatus;
  // null = tanpa jumlah.
  amountBase: number | null;
  // Item tersimpan untuk bahan ini (kosong kalau masuk daftar hanya karena stoknya).
  itemIds: number[];
};

export type BoughtEntry = {
  itemId: number;
  name: string;
  baseUnit: BaseUnit;
  amountBase: number | null;
};

export type ShoppingList = {
  toBuy: ShoppingEntry[];
  bought: BoughtEntry[];
};

export function stockStatus(item: Pick<IngredientWithStock, 'stock' | 'minStock'>): StockStatus {
  if (item.stock <= 0) return 'empty';
  if (isLowStock(item)) return 'low';
  return null;
}

const STATUS_ORDER: Record<string, number> = { empty: 0, low: 1, none: 2 };

type ItemRow = { id: number; ingredient_id: number; amount_base: number; is_bought: number };

export async function getShoppingList(db: Db): Promise<ShoppingList> {
  const [ingredients, items] = await Promise.all([
    listIngredientsWithStock(db),
    db.getAllAsync<ItemRow>('SELECT id, ingredient_id, amount_base, is_bought FROM shopping_items ORDER BY id'),
  ]);
  const byId = new Map(ingredients.map((i) => [i.id, i]));

  const stored = new Map<number, { itemIds: number[]; amount: number }>();
  const bought: BoughtEntry[] = [];
  for (const item of items) {
    const ingredient = byId.get(item.ingredient_id);
    if (!ingredient) continue;
    if (item.is_bought) {
      bought.push({
        itemId: item.id,
        name: ingredient.name,
        baseUnit: ingredient.baseUnit,
        amountBase: item.amount_base > 0 ? item.amount_base : null,
      });
      continue;
    }
    const entry = stored.get(item.ingredient_id) ?? { itemIds: [], amount: 0 };
    entry.itemIds.push(item.id);
    entry.amount += item.amount_base;
    stored.set(item.ingredient_id, entry);
  }

  const toBuy: ShoppingEntry[] = [];
  for (const ingredient of ingredients) {
    const status = stockStatus(ingredient);
    const entry = stored.get(ingredient.id);
    if (!entry && status === null) continue;
    toBuy.push({
      ingredientId: ingredient.id,
      name: ingredient.name,
      baseUnit: ingredient.baseUnit,
      stock: ingredient.stock,
      minStock: ingredient.minStock,
      status,
      amountBase: entry && entry.amount > 0 ? entry.amount : null,
      itemIds: entry?.itemIds ?? [],
    });
  }
  toBuy.sort((a, b) => STATUS_ORDER[a.status ?? 'none'] - STATUS_ORDER[b.status ?? 'none']);

  return { toBuy, bought };
}

// Tambah bahan ke daftar secara manual. Kalau sudah ada (belum dibeli), tidak dobel.
export async function addShoppingItem(db: Db, ingredientId: number, amountBase: number | null = null) {
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM shopping_items WHERE ingredient_id = ? AND is_bought = 0',
    ingredientId,
  );
  if (existing) return existing.id;
  const result = await db.runAsync(
    'INSERT INTO shopping_items (ingredient_id, amount_base, is_bought, created_at) VALUES (?, ?, 0, ?)',
    ingredientId,
    amountBase ?? 0,
    nowIso(),
  );
  return result.lastInsertRowId;
}

// Kekurangan bahan untuk pesanan: pakai jumlah terbesar kalau bahan sudah ada di daftar.
export async function addShortage(db: Db, ingredientId: number, amountBase: number) {
  const existing = await db.getFirstAsync<{ id: number; amount_base: number }>(
    'SELECT id, amount_base FROM shopping_items WHERE ingredient_id = ? AND is_bought = 0',
    ingredientId,
  );
  if (existing) {
    if (amountBase > existing.amount_base) {
      await db.runAsync('UPDATE shopping_items SET amount_base = ? WHERE id = ?', amountBase, existing.id);
    }
    return existing.id;
  }
  return addShoppingItem(db, ingredientId, amountBase);
}

export type BoughtResult = { movementId: number; itemIds: number[] };

// Sudah dibeli: catat pembelian di riwayat stok, tandai item tersimpan sebagai dibeli.
// Bahan yang masuk daftar hanya karena stoknya akan hilang sendiri kalau stok sudah cukup.
export async function markBought(
  db: Db,
  entry: Pick<ShoppingEntry, 'ingredientId' | 'itemIds'>,
  amountBase: number,
): Promise<BoughtResult> {
  let movementId = 0;
  let itemIds = entry.itemIds;
  await db.withTransactionAsync(async () => {
    movementId = await recordPurchase(db, entry.ingredientId, amountBase, 'Dari daftar belanja');
    if (itemIds.length === 0) {
      // Simpan sebagai item dibeli supaya tampil di "Sudah dibeli".
      const result = await db.runAsync(
        'INSERT INTO shopping_items (ingredient_id, amount_base, is_bought, created_at) VALUES (?, ?, 1, ?)',
        entry.ingredientId,
        amountBase,
        nowIso(),
      );
      itemIds = [result.lastInsertRowId];
    } else {
      for (const id of itemIds) {
        await db.runAsync('UPDATE shopping_items SET is_bought = 1 WHERE id = ?', id);
      }
    }
  });
  return { movementId, itemIds };
}

// Kebalikan dari markBought (tombol Batalkan).
export async function undoBought(db: Db, result: BoughtResult, wasStored: boolean) {
  await revertMovements(db, [result.movementId]);
  for (const id of result.itemIds) {
    if (wasStored) await db.runAsync('UPDATE shopping_items SET is_bought = 0 WHERE id = ?', id);
    else await db.runAsync('DELETE FROM shopping_items WHERE id = ?', id);
  }
}

export async function removeShoppingItems(db: Db, itemIds: number[]) {
  for (const id of itemIds) await db.runAsync('DELETE FROM shopping_items WHERE id = ?', id);
}

export async function clearBought(db: Db) {
  await db.runAsync('DELETE FROM shopping_items WHERE is_bought = 1');
}

export async function countToBuy(db: Db): Promise<number> {
  return (await getShoppingList(db)).toBuy.length;
}
