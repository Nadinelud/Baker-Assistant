// Stok selalu lewat riwayat: setiap perubahan = 1 baris di stock_movements.
// Stok saat ini = SUM(amount_base). Pembatalan = baris baru berlawanan tanda.
import { roundAmount, type BaseUnit } from '@/lib/units';

import { nowIso, type Db } from './types';

export type MovementReason =
  | 'purchase'
  | 'bake'
  | 'quick_deduct'
  | 'stock_check'
  | 'order'
  | 'adjustment'
  | 'revert';

export type Movement = {
  id: number;
  ingredientId: number;
  amountBase: number;
  reason: MovementReason;
  note: string | null;
  revertedOfId: number | null;
  isReverted: boolean;
  createdAt: string;
};

export class StockError extends Error {}

export async function getCurrentStock(db: Db, ingredientId: number): Promise<number> {
  const row = await db.getFirstAsync<{ stock: number | null }>(
    'SELECT SUM(amount_base) AS stock FROM stock_movements WHERE ingredient_id = ?',
    ingredientId,
  );
  return roundAmount(row?.stock ?? 0);
}

type NewMovement = {
  ingredientId: number;
  amountBase: number;
  reason: MovementReason;
  note?: string | null;
  refType?: string | null;
  refId?: number | null;
  revertedOfId?: number | null;
};

async function insertMovement(db: Db, m: NewMovement): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO stock_movements (ingredient_id, amount_base, reason, ref_type, ref_id, note, reverted_of_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    m.ingredientId,
    m.amountBase,
    m.reason,
    m.refType ?? null,
    m.refId ?? null,
    m.note?.trim() || null,
    m.revertedOfId ?? null,
    nowIso(),
  );
  return result.lastInsertRowId;
}

function assertPositive(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new StockError('Jumlah harus lebih dari 0.');
}

export async function recordPurchase(db: Db, ingredientId: number, amountBase: number, note?: string) {
  assertPositive(amountBase);
  return insertMovement(db, { ingredientId, amountBase, reason: 'purchase', note });
}

export type DeductLine = { ingredientId: number; amountBase: number };

// Potong cepat tanpa resep. Semua baris tersimpan bersama atau tidak sama sekali.
export async function quickDeduct(db: Db, lines: DeductLine[], note?: string): Promise<number[]> {
  if (lines.length === 0) throw new StockError('Pilih minimal satu bahan.');
  lines.forEach((line) => assertPositive(line.amountBase));

  const ids: number[] = [];
  await db.withTransactionAsync(async () => {
    for (const line of lines) {
      ids.push(
        await insertMovement(db, {
          ingredientId: line.ingredientId,
          amountBase: -line.amountBase,
          reason: 'quick_deduct',
          note,
        }),
      );
    }
  });
  return ids;
}

export type StockCheckEntry = { ingredientId: number; actualBase: number };

// Cek stok: simpan selisih (sisa sebenarnya - stok tercatat). Bahan tanpa selisih dilewati.
export async function recordStockCheck(db: Db, entries: StockCheckEntry[]): Promise<number[]> {
  entries.forEach((e) => {
    if (!Number.isFinite(e.actualBase) || e.actualBase < 0) throw new StockError('Sisa tidak boleh minus.');
  });

  const ids: number[] = [];
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      const current = await getCurrentStock(db, entry.ingredientId);
      const diff = roundAmount(entry.actualBase - current);
      if (diff === 0) continue;
      ids.push(await insertMovement(db, { ingredientId: entry.ingredientId, amountBase: diff, reason: 'stock_check' }));
    }
  });
  return ids;
}

type MovementRow = {
  id: number;
  ingredient_id: number;
  amount_base: number;
  reason: MovementReason;
  note: string | null;
  reverted_of_id: number | null;
  is_reverted: number;
  created_at: string;
};

const SELECT_MOVEMENT = `
SELECT m.id, m.ingredient_id, m.amount_base, m.reason, m.note, m.reverted_of_id, m.created_at,
       EXISTS (SELECT 1 FROM stock_movements r WHERE r.reverted_of_id = m.id) AS is_reverted
FROM stock_movements m`;

function movementFromRow(row: MovementRow): Movement {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    amountBase: row.amount_base,
    reason: row.reason,
    note: row.note,
    revertedOfId: row.reverted_of_id,
    isReverted: row.is_reverted === 1,
    createdAt: row.created_at,
  };
}

export async function listMovements(db: Db, ingredientId: number): Promise<Movement[]> {
  const rows = await db.getAllAsync<MovementRow>(
    `${SELECT_MOVEMENT} WHERE m.ingredient_id = ? ORDER BY m.created_at DESC, m.id DESC`,
    ingredientId,
  );
  return rows.map(movementFromRow);
}

export function canRevert(movement: Movement): boolean {
  return movement.reason !== 'revert' && !movement.isReverted;
}

// Batalkan beberapa perubahan sekaligus (misalnya semua baris dari satu potong cepat).
export async function revertMovements(db: Db, movementIds: number[]): Promise<number[]> {
  const ids: number[] = [];
  await db.withTransactionAsync(async () => {
    for (const id of movementIds) {
      const row = await db.getFirstAsync<MovementRow>(`${SELECT_MOVEMENT} WHERE m.id = ?`, id);
      if (!row) throw new StockError('Perubahan stok tidak ditemukan.');
      const movement = movementFromRow(row);
      if (movement.reason === 'revert') throw new StockError('Pembatalan tidak bisa dibatalkan lagi.');
      if (movement.isReverted) throw new StockError('Perubahan ini sudah dibatalkan.');
      ids.push(
        await insertMovement(db, {
          ingredientId: movement.ingredientId,
          amountBase: -movement.amountBase,
          reason: 'revert',
          revertedOfId: movement.id,
        }),
      );
    }
  });
  return ids;
}

export type StockCheckItem = {
  id: number;
  name: string;
  baseUnit: BaseUnit;
  stock: number;
  usageCount: number;
};

// Untuk layar cek stok: bahan yang paling sering dipakai (keluar) lebih dulu.
export async function listForStockCheck(db: Db): Promise<StockCheckItem[]> {
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    base_unit: BaseUnit;
    stock: number;
    usage_count: number;
  }>(`
SELECT i.id, i.name, i.base_unit,
       COALESCE((SELECT SUM(m.amount_base) FROM stock_movements m WHERE m.ingredient_id = i.id), 0) AS stock,
       (SELECT COUNT(*) FROM stock_movements m
         WHERE m.ingredient_id = i.id AND m.amount_base < 0
           AND m.reason IN ('bake', 'quick_deduct', 'order')
           AND NOT EXISTS (SELECT 1 FROM stock_movements r WHERE r.reverted_of_id = m.id)) AS usage_count
FROM ingredients i
ORDER BY usage_count DESC, i.name COLLATE NOCASE`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    baseUnit: r.base_unit,
    stock: roundAmount(r.stock),
    usageCount: r.usage_count,
  }));
}
