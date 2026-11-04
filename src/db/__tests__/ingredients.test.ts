/**
 * @jest-environment node
 */
import {
  countIngredients,
  createIngredient,
  deleteIngredient,
  getIngredient,
  listIngredientsWithStock,
  listLowStock,
  updateIngredient,
} from '../ingredients';
import { getCurrentStock, listMovements, quickDeduct, recordPurchase, revertMovements } from '../stock';
import { createMigratedTestDb } from '../testing/createTestDb';

const flourInput = {
  name: 'Tepung terigu',
  baseUnit: 'g' as const,
  minStock: 500,
  conversions: [{ unitName: 'Cup', toBaseAmount: 120 }],
};

describe('bahan', () => {
  it('membuat bahan dengan konversi (nama satuan dirapikan)', async () => {
    const { db } = await createMigratedTestDb();
    const id = await createIngredient(db, { ...flourInput, name: '  Tepung   terigu ' });
    const detail = await getIngredient(db, id);
    expect(detail).toMatchObject({
      name: 'Tepung terigu',
      baseUnit: 'g',
      minStock: 500,
      stock: 0,
      conversions: [{ unitName: 'cup', toBaseAmount: 120 }],
    });
  });

  it('stok awal dicatat sebagai riwayat', async () => {
    const { db } = await createMigratedTestDb();
    const id = await createIngredient(db, flourInput, 1000);
    expect(await getCurrentStock(db, id)).toBe(1000);
    const [movement] = await listMovements(db, id);
    expect(movement).toMatchObject({ reason: 'adjustment', note: 'Stok awal', amountBase: 1000 });
  });

  it('menolak nama kosong, nama ganda (tanpa beda huruf besar), dan konversi tidak valid', async () => {
    const { db } = await createMigratedTestDb();
    await createIngredient(db, flourInput);
    await expect(createIngredient(db, { ...flourInput, name: ' ' })).rejects.toThrow('Nama bahan');
    await expect(createIngredient(db, { ...flourInput, name: 'TEPUNG TERIGU' })).rejects.toThrow('sudah ada');
    const base = { ...flourInput, name: 'Gula' };
    await expect(createIngredient(db, { ...base, conversions: [{ unitName: 'cup', toBaseAmount: 0 }] })).rejects.toThrow();
    await expect(createIngredient(db, { ...base, conversions: [{ unitName: 'kg', toBaseAmount: 1000 }] })).rejects.toThrow(
      'otomatis',
    );
    await expect(
      createIngredient(db, {
        ...base,
        conversions: [
          { unitName: 'sdm', toBaseAmount: 12 },
          { unitName: 'sendok makan', toBaseAmount: 12 },
        ],
      }),
    ).rejects.toThrow('dua kali');
    expect(await countIngredients(db)).toBe(1);
  });

  it('mengubah nama, batas, dan konversi tanpa menyentuh riwayat', async () => {
    const { db } = await createMigratedTestDb();
    const id = await createIngredient(db, flourInput, 800);
    await updateIngredient(db, id, {
      name: 'Terigu protein sedang',
      minStock: 300,
      conversions: [{ unitName: 'sdm', toBaseAmount: 8 }],
    });
    const detail = await getIngredient(db, id);
    expect(detail).toMatchObject({
      name: 'Terigu protein sedang',
      baseUnit: 'g',
      minStock: 300,
      stock: 800,
      conversions: [{ unitName: 'sdm', toBaseAmount: 8 }],
    });
  });

  it('boleh menyimpan ulang dengan nama sendiri', async () => {
    const { db } = await createMigratedTestDb();
    const id = await createIngredient(db, flourInput);
    await expect(updateIngredient(db, id, { ...flourInput, minStock: 100 })).resolves.toBeUndefined();
  });

  it('daftar bahan dengan stok, urut nama', async () => {
    const { db } = await createMigratedTestDb();
    const flour = await createIngredient(db, flourInput, 1000);
    await createIngredient(db, { name: 'air', baseUnit: 'ml', minStock: 0, conversions: [] });
    await quickDeduct(db, [{ ingredientId: flour, amountBase: 300 }]);
    const list = await listIngredientsWithStock(db);
    expect(list.map((i) => [i.name, i.stock])).toEqual([
      ['air', 0],
      ['Tepung terigu', 700],
    ]);
  });
});

describe('stok menipis', () => {
  it('stok <= batas dan batas > 0, paling parah lebih dulu', async () => {
    const { db } = await createMigratedTestDb();
    await createIngredient(db, { name: 'Mentega', baseUnit: 'g', minStock: 500, conversions: [] }, 400);
    await createIngredient(db, { name: 'Telur', baseUnit: 'pcs', minStock: 10, conversions: [] }, 2);
    await createIngredient(db, { name: 'Susu', baseUnit: 'ml', minStock: 1000, conversions: [] }, 1000);
    await createIngredient(db, { name: 'Garam', baseUnit: 'g', minStock: 0, conversions: [] });
    await createIngredient(db, { name: 'Gula', baseUnit: 'g', minStock: 500, conversions: [] }, 2000);

    const low = await listLowStock(db);
    expect(low.map((i) => i.name)).toEqual(['Telur', 'Mentega', 'Susu']);
  });
});

describe('hapus bahan', () => {
  it('menghapus bahan beserta riwayat dan konversinya', async () => {
    const { db, raw } = await createMigratedTestDb();
    const id = await createIngredient(db, flourInput, 1000);
    const [deduct] = await quickDeduct(db, [{ ingredientId: id, amountBase: 100 }]);
    await revertMovements(db, [deduct]);
    await recordPurchase(db, id, 50);

    await deleteIngredient(db, id);

    expect(await getIngredient(db, id)).toBeNull();
    const counts = raw
      .prepare(
        'SELECT (SELECT COUNT(*) FROM stock_movements) AS m, (SELECT COUNT(*) FROM ingredient_conversions) AS c',
      )
      .get();
    expect(counts).toEqual({ m: 0, c: 0 });
  });

  it('ditolak kalau bahan dipakai di resep', async () => {
    const { db, raw } = await createMigratedTestDb();
    const id = await createIngredient(db, flourInput, 1000);
    const now = '2026-11-03T00:00:00.000Z';
    raw.prepare("INSERT INTO recipes (id, name, yield_amount, yield_unit, created_at) VALUES (1, 'Bolu', 1, 'loyang', ?)").run(now);
    raw.prepare('INSERT INTO recipe_versions (id, recipe_id, version_number, created_at) VALUES (1, 1, 1, ?)').run(now);
    raw
      .prepare(
        "INSERT INTO recipe_version_ingredients (version_id, ingredient_id, amount, unit, amount_base) VALUES (1, ?, 2, 'cup', 240)",
      )
      .run(id);

    await expect(deleteIngredient(db, id)).rejects.toThrow('dipakai di resep');
    expect(await getCurrentStock(db, id)).toBe(1000);
  });
});
