// Pesanan: tanggal+jam ambil, item (resep + jumlah hasil jadi), kebutuhan bahan per tanggal.
// Saat ditandai "sudah dibuat", stok dipotong sekali (reason 'order', stock_deducted = 1).
import { dateKey } from '@/lib/pickup';
import { roundAmount, type BaseUnit } from '@/lib/units';

import { addShortage } from './shopping';
import { revertMovements } from './stock';
import { nowIso, type Db } from './types';

export type OrderStatus = 'new' | 'baked' | 'done' | 'cancelled';

export type OrderItemInput = { recipeId: number; quantity: number };

export type OrderInput = {
  customerName: string;
  pickupAt: string; // "YYYY-MM-DDTHH:mm" waktu lokal
  note: string;
  items: OrderItemInput[];
};

export type OrderItem = {
  id: number;
  recipeId: number;
  recipeName: string;
  quantity: number;
  yieldAmount: number;
  yieldUnit: string;
  multiplier: number;
};

export type OrderDetail = {
  id: number;
  customerName: string;
  pickupAt: string;
  status: OrderStatus;
  stockDeducted: boolean;
  note: string | null;
  items: OrderItem[];
};

export type OrderSummary = Omit<OrderDetail, 'items'> & { itemSummary: string };

export type IngredientNeed = {
  ingredientId: number;
  name: string;
  baseUnit: BaseUnit;
  needBase: number;
  stock: number;
  shortBase: number;
};

export class OrderError extends Error {}

const PICKUP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function clean(input: OrderInput): OrderInput {
  const customerName = input.customerName.trim().replace(/\s+/g, ' ');
  if (customerName === '') throw new OrderError('Nama pemesan belum diisi.');
  if (!PICKUP_PATTERN.test(input.pickupAt)) throw new OrderError('Pilih tanggal dan jam ambil.');
  if (input.items.length === 0) throw new OrderError('Tambahkan minimal satu item.');
  input.items.forEach((item) => {
    if (!(item.quantity > 0)) throw new OrderError('Jumlah item harus lebih dari 0.');
  });
  return { ...input, customerName, note: input.note.trim() };
}

async function insertItems(db: Db, orderId: number, items: OrderItemInput[]) {
  for (const item of items) {
    await db.runAsync(
      'INSERT INTO order_items (order_id, recipe_id, version_id, quantity) VALUES (?, ?, NULL, ?)',
      orderId,
      item.recipeId,
      item.quantity,
    );
  }
}

export async function createOrder(db: Db, raw: OrderInput): Promise<number> {
  const input = clean(raw);
  let id = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      "INSERT INTO orders (customer_name, pickup_date, status, note, created_at) VALUES (?, ?, 'new', ?, ?)",
      input.customerName,
      input.pickupAt,
      input.note || null,
      nowIso(),
    );
    id = result.lastInsertRowId;
    await insertItems(db, id, input.items);
  });
  return id;
}

// Hanya pesanan yang belum dibuat yang bisa diubah (stoknya belum dipotong).
export async function updateOrder(db: Db, id: number, raw: OrderInput): Promise<void> {
  const order = await getOrder(db, id);
  if (!order) throw new OrderError('Pesanan tidak ditemukan.');
  if (order.status !== 'new') throw new OrderError('Pesanan yang sudah dibuat atau selesai tidak bisa diubah.');
  const input = clean(raw);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE orders SET customer_name = ?, pickup_date = ?, note = ? WHERE id = ?',
      input.customerName,
      input.pickupAt,
      input.note || null,
      id,
    );
    await db.runAsync('DELETE FROM order_items WHERE order_id = ?', id);
    await insertItems(db, id, input.items);
  });
}

type ItemRow = {
  id: number;
  order_id: number;
  recipe_id: number;
  name: string;
  quantity: number;
  yield_amount: number;
  yield_unit: string;
};

async function getItems(db: Db, orderIds: number[]): Promise<Map<number, OrderItem[]>> {
  const byOrder = new Map<number, OrderItem[]>();
  if (orderIds.length === 0) return byOrder;
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT oi.id, oi.order_id, r.id AS recipe_id, r.name, oi.quantity, r.yield_amount, r.yield_unit
     FROM order_items oi JOIN recipes r ON r.id = oi.recipe_id
     WHERE oi.order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY oi.id`,
    ...orderIds,
  );
  for (const row of rows) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push({
      id: row.id,
      recipeId: row.recipe_id,
      recipeName: row.name,
      quantity: row.quantity,
      yieldAmount: row.yield_amount,
      yieldUnit: row.yield_unit,
      multiplier: row.yield_amount > 0 ? row.quantity / row.yield_amount : 1,
    });
    byOrder.set(row.order_id, list);
  }
  return byOrder;
}

type OrderRow = {
  id: number;
  customer_name: string;
  pickup_date: string;
  status: OrderStatus;
  stock_deducted: number;
  note: string | null;
};

function orderFromRow(row: OrderRow, items: OrderItem[]): OrderDetail {
  return {
    id: row.id,
    customerName: row.customer_name,
    pickupAt: row.pickup_date,
    status: row.status,
    stockDeducted: row.stock_deducted === 1,
    note: row.note,
    items,
  };
}

export function summarizeItems(items: OrderItem[]): string {
  return items.map((i) => `${roundAmount(i.quantity)} ${i.recipeName}`).join(', ');
}

export async function getOrder(db: Db, id: number): Promise<OrderDetail | null> {
  const row = await db.getFirstAsync<OrderRow>(
    'SELECT id, customer_name, pickup_date, status, stock_deducted, note FROM orders WHERE id = ?',
    id,
  );
  if (!row) return null;
  return orderFromRow(row, (await getItems(db, [id])).get(id) ?? []);
}

// upcoming: belum selesai (baru / sudah dibuat), paling dekat dulu. past: selesai / batal, terbaru dulu.
export async function listOrders(db: Db, scope: 'upcoming' | 'past'): Promise<OrderSummary[]> {
  const rows = await db.getAllAsync<OrderRow>(
    scope === 'upcoming'
      ? "SELECT id, customer_name, pickup_date, status, stock_deducted, note FROM orders WHERE status IN ('new','baked') ORDER BY pickup_date, id"
      : "SELECT id, customer_name, pickup_date, status, stock_deducted, note FROM orders WHERE status IN ('done','cancelled') ORDER BY pickup_date DESC, id DESC",
  );
  const items = await getItems(db, rows.map((r) => r.id));
  return rows.map((row) => {
    const list = items.get(row.id) ?? [];
    const { items: _, ...order } = orderFromRow(row, list);
    return { ...order, itemSummary: summarizeItems(list) };
  });
}

// Kebutuhan bahan per bahan untuk sekumpulan pesanan, memakai versi aktif tiap resep.
async function needsForOrders(db: Db, orderIds: number[]): Promise<IngredientNeed[]> {
  if (orderIds.length === 0) return [];
  const rows = await db.getAllAsync<{
    ingredient_id: number;
    name: string;
    base_unit: BaseUnit;
    need: number;
  }>(
    `SELECT l.ingredient_id, i.name, i.base_unit, SUM(l.amount_base * oi.quantity / r.yield_amount) AS need
     FROM order_items oi
     JOIN recipes r ON r.id = oi.recipe_id
     JOIN recipe_version_ingredients l ON l.version_id = COALESCE(oi.version_id, r.active_version_id)
     JOIN ingredients i ON i.id = l.ingredient_id
     WHERE oi.order_id IN (${orderIds.map(() => '?').join(',')})
       AND l.amount_base IS NOT NULL -- bahan tanpa takaran tidak dihitung
     GROUP BY l.ingredient_id
     ORDER BY i.name COLLATE NOCASE`,
    ...orderIds,
  );
  const needs: IngredientNeed[] = [];
  for (const row of rows) {
    const stockRow = await db.getFirstAsync<{ stock: number | null }>(
      'SELECT SUM(amount_base) AS stock FROM stock_movements WHERE ingredient_id = ?',
      row.ingredient_id,
    );
    const needBase = roundAmount(row.need);
    const stock = roundAmount(stockRow?.stock ?? 0);
    needs.push({
      ingredientId: row.ingredient_id,
      name: row.name,
      baseUnit: row.base_unit,
      needBase,
      stock,
      shortBase: roundAmount(Math.max(0, needBase - stock)),
    });
  }
  return needs;
}

export type DateNeeds = { dateKey: string; orders: OrderSummary[]; needs: IngredientNeed[] };

// Semua pesanan berstatus "baru" pada tanggal itu, kebutuhannya dijumlah lalu dibanding stok saat ini.
export async function getDateNeeds(db: Db, key: string): Promise<DateNeeds> {
  const orders = (await listOrders(db, 'upcoming')).filter((o) => o.status === 'new' && dateKey(o.pickupAt) === key);
  return { dateKey: key, orders, needs: await needsForOrders(db, orders.map((o) => o.id)) };
}

export async function addShortagesToShopping(db: Db, needs: IngredientNeed[]): Promise<number> {
  const short = needs.filter((n) => n.shortBase > 0);
  for (const need of short) await addShortage(db, need.ingredientId, need.shortBase);
  return short.length;
}

// Potong stok untuk satu pesanan, sekali saja. Stok boleh jadi minus.
async function deductForOrder(db: Db, orderId: number): Promise<number[]> {
  const needs = await needsForOrders(db, [orderId]);
  const ids: number[] = [];
  const createdAt = nowIso();
  for (const need of needs) {
    if (need.needBase <= 0) continue;
    const result = await db.runAsync(
      `INSERT INTO stock_movements (ingredient_id, amount_base, reason, ref_type, ref_id, created_at)
       VALUES (?, ?, 'order', 'order', ?, ?)`,
      need.ingredientId,
      -need.needBase,
      orderId,
      createdAt,
    );
    ids.push(result.lastInsertRowId);
  }
  await db.runAsync('UPDATE orders SET stock_deducted = 1 WHERE id = ?', orderId);
  return ids;
}

export async function markBaked(db: Db, id: number): Promise<number[]> {
  const order = await getOrder(db, id);
  if (!order) throw new OrderError('Pesanan tidak ditemukan.');
  if (order.status !== 'new') throw new OrderError('Pesanan ini sudah ditandai dibuat.');
  let ids: number[] = [];
  await db.withTransactionAsync(async () => {
    if (!order.stockDeducted) ids = await deductForOrder(db, id);
    await db.runAsync("UPDATE orders SET status = 'baked' WHERE id = ?", id);
  });
  return ids;
}

// Tombol Batalkan setelah "Tandai sudah dibuat".
export async function undoMarkBaked(db: Db, id: number, movementIds: number[]): Promise<void> {
  await revertMovements(db, movementIds);
  await db.runAsync("UPDATE orders SET status = 'new', stock_deducted = 0 WHERE id = ?", id);
}

// Selesai (sudah diambil). Kalau lupa menandai "sudah dibuat", stok dipotong sekarang.
export async function markDone(db: Db, id: number): Promise<void> {
  const order = await getOrder(db, id);
  if (!order) throw new OrderError('Pesanan tidak ditemukan.');
  if (order.status === 'done' || order.status === 'cancelled') return;
  await db.withTransactionAsync(async () => {
    if (!order.stockDeducted) await deductForOrder(db, id);
    await db.runAsync("UPDATE orders SET status = 'done' WHERE id = ?", id);
  });
}

// Batal. Stok tidak berubah: kalau sudah dibuat, bahannya memang sudah terpakai.
export async function cancelOrder(db: Db, id: number): Promise<void> {
  await db.runAsync("UPDATE orders SET status = 'cancelled' WHERE id = ?", id);
}

export async function deleteOrder(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM orders WHERE id = ?', id);
}
