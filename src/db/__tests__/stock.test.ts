/**
 * @jest-environment node
 */
import { createIngredient } from '../ingredients';
import {
  canRevert,
  getCurrentStock,
  listForStockCheck,
  listMovements,
  quickDeduct,
  recordPurchase,
  recordStockCheck,
  revertMovements,
} from '../stock';
import { createMigratedTestDb } from '../testing/createTestDb';

async function setup() {
  const { db, raw } = await createMigratedTestDb();
  const flour = await createIngredient(db, { name: 'Tepung terigu', baseUnit: 'g', minStock: 500, conversions: [] });
  const sugar = await createIngredient(db, { name: 'Gula pasir', baseUnit: 'g', minStock: 0, conversions: [] });
  const eggs = await createIngredient(db, { name: 'Telur', baseUnit: 'pcs', minStock: 6, conversions: [] });
  return { db, raw, flour, sugar, eggs };
}

describe('stok dari riwayat', () => {
  it('stok awal 0 tanpa riwayat', async () => {
    const { db, flour } = await setup();
    expect(await getCurrentStock(db, flour)).toBe(0);
  });

  it('beli menambah, potong cepat mengurangi', async () => {
    const { db, flour, sugar } = await setup();
    await recordPurchase(db, flour, 1000);
    await recordPurchase(db, sugar, 500);
    await quickDeduct(db, [
      { ingredientId: flour, amountBase: 250 },
      { ingredientId: sugar, amountBase: 120 },
    ]);
    expect(await getCurrentStock(db, flour)).toBe(750);
    expect(await getCurrentStock(db, sugar)).toBe(380);
  });

  it('tidak ada kolom stok: hanya baris riwayat yang bertambah', async () => {
    const { db, raw, flour } = await setup();
    await recordPurchase(db, flour, 1000);
    await quickDeduct(db, [{ ingredientId: flour, amountBase: 100 }]);
    const rows = raw.prepare('SELECT amount_base, reason FROM stock_movements ORDER BY id').all();
    expect(rows).toEqual([
      { amount_base: 1000, reason: 'purchase' },
      { amount_base: -100, reason: 'quick_deduct' },
    ]);
  });

  it('penjumlahan desimal tidak meninggalkan sisa pecahan', async () => {
    const { db, flour } = await setup();
    await recordPurchase(db, flour, 0.1);
    await recordPurchase(db, flour, 0.2);
    expect(await getCurrentStock(db, flour)).toBe(0.3);
  });

  it('menolak jumlah 0 atau minus', async () => {
    const { db, flour } = await setup();
    await expect(recordPurchase(db, flour, 0)).rejects.toThrow();
    await expect(quickDeduct(db, [{ ingredientId: flour, amountBase: -5 }])).rejects.toThrow();
    await expect(quickDeduct(db, [])).rejects.toThrow();
  });

  it('potong cepat semua atau tidak sama sekali', async () => {
    const { db, flour } = await setup();
    await recordPurchase(db, flour, 1000);
    await expect(
      quickDeduct(db, [
        { ingredientId: flour, amountBase: 100 },
        { ingredientId: 9999, amountBase: 100 },
      ]),
    ).rejects.toThrow();
    expect(await getCurrentStock(db, flour)).toBe(1000);
  });
});

describe('cek stok', () => {
  it('menyimpan selisih sisa sebenarnya - stok tercatat', async () => {
    const { db, raw, flour, sugar } = await setup();
    await recordPurchase(db, flour, 1000);
    await recordPurchase(db, sugar, 500);

    const ids = await recordStockCheck(db, [
      { ingredientId: flour, actualBase: 940 },
      { ingredientId: sugar, actualBase: 500 },
    ]);

    expect(ids).toHaveLength(1);
    expect(await getCurrentStock(db, flour)).toBe(940);
    expect(await getCurrentStock(db, sugar)).toBe(500);
    const row = raw.prepare('SELECT amount_base, reason FROM stock_movements WHERE id = ?').get(ids[0]);
    expect(row).toEqual({ amount_base: -60, reason: 'stock_check' });
  });

  it('bisa menaikkan stok kalau ternyata lebih banyak', async () => {
    const { db, eggs } = await setup();
    await recordStockCheck(db, [{ ingredientId: eggs, actualBase: 12 }]);
    expect(await getCurrentStock(db, eggs)).toBe(12);
  });

  it('menolak sisa minus', async () => {
    const { db, eggs } = await setup();
    await expect(recordStockCheck(db, [{ ingredientId: eggs, actualBase: -1 }])).rejects.toThrow();
  });

  it('urutan: bahan yang paling sering dipakai lebih dulu, pembatalan tidak dihitung', async () => {
    const { db, flour, sugar, eggs } = await setup();
    await recordPurchase(db, sugar, 1000);
    await quickDeduct(db, [{ ingredientId: sugar, amountBase: 10 }]);
    await quickDeduct(db, [{ ingredientId: sugar, amountBase: 10 }]);
    await quickDeduct(db, [{ ingredientId: eggs, amountBase: 1 }]);
    const [revertMe] = await quickDeduct(db, [{ ingredientId: flour, amountBase: 1 }]);
    await revertMovements(db, [revertMe]);

    const items = await listForStockCheck(db);
    expect(items.map((i) => i.name)).toEqual(['Gula pasir', 'Telur', 'Tepung terigu']);
    expect(items[0]).toMatchObject({ stock: 980, usageCount: 2 });
  });
});

describe('pembatalan', () => {
  it('membuat baris berlawanan tanda dengan reverted_of_id, tanpa menghapus', async () => {
    const { db, raw, flour, sugar } = await setup();
    await recordPurchase(db, flour, 1000);
    await recordPurchase(db, sugar, 1000);
    const ids = await quickDeduct(db, [
      { ingredientId: flour, amountBase: 200 },
      { ingredientId: sugar, amountBase: 50 },
    ]);

    await revertMovements(db, ids);

    expect(await getCurrentStock(db, flour)).toBe(1000);
    expect(await getCurrentStock(db, sugar)).toBe(1000);
    const reverts = raw
      .prepare("SELECT amount_base, reverted_of_id FROM stock_movements WHERE reason = 'revert' ORDER BY id")
      .all();
    expect(reverts).toEqual([
      { amount_base: 200, reverted_of_id: ids[0] },
      { amount_base: 50, reverted_of_id: ids[1] },
    ]);
    const total = raw.prepare('SELECT COUNT(*) AS n FROM stock_movements').get() as { n: number };
    expect(total.n).toBe(6);
  });

  it('tidak bisa membatalkan dua kali atau membatalkan pembatalan', async () => {
    const { db, flour } = await setup();
    const id = await recordPurchase(db, flour, 100);
    const [revertId] = await revertMovements(db, [id]);

    await expect(revertMovements(db, [id])).rejects.toThrow();
    await expect(revertMovements(db, [revertId])).rejects.toThrow();
    expect(await getCurrentStock(db, flour)).toBe(0);
  });

  it('riwayat menandai baris yang sudah dibatalkan', async () => {
    const { db, flour } = await setup();
    const purchase = await recordPurchase(db, flour, 100, 'Pasar');
    const [deduct] = await quickDeduct(db, [{ ingredientId: flour, amountBase: 30 }]);
    await revertMovements(db, [deduct]);

    const movements = await listMovements(db, flour);
    const byId = new Map(movements.map((m) => [m.id, m]));
    expect(movements).toHaveLength(3);
    expect(byId.get(purchase)).toMatchObject({ note: 'Pasar', isReverted: false });
    expect(canRevert(byId.get(purchase)!)).toBe(true);
    expect(canRevert(byId.get(deduct)!)).toBe(false);
    const revert = movements.find((m) => m.reason === 'revert')!;
    expect(canRevert(revert)).toBe(false);
  });
});
