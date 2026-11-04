/**
 * @jest-environment node
 */
import { createIngredient } from '../ingredients';
import {
  addShoppingItem,
  clearBought,
  getShoppingList,
  markBought,
  removeShoppingItems,
  undoBought,
} from '../shopping';
import { getCurrentStock, quickDeduct } from '../stock';
import { createMigratedTestDb } from '../testing/createTestDb';

async function setup() {
  const { db, raw } = await createMigratedTestDb();
  const butter = await createIngredient(db, { name: 'Mentega', baseUnit: 'g', minStock: 500, conversions: [] }, 150);
  const eggs = await createIngredient(db, { name: 'Telur', baseUnit: 'pcs', minStock: 0, conversions: [] }, 0);
  const sugar = await createIngredient(db, { name: 'Gula', baseUnit: 'g', minStock: 500, conversions: [] }, 2000);
  return { db, raw, butter, eggs, sugar };
}

describe('daftar belanja', () => {
  it('otomatis memuat bahan habis lalu hampir habis, tanpa jumlah', async () => {
    const { db } = await setup();
    const list = await getShoppingList(db);
    expect(list.toBuy.map((e) => [e.name, e.status, e.amountBase, e.itemIds])).toEqual([
      ['Telur', 'empty', null, []],
      ['Mentega', 'low', null, []],
    ]);
    expect(list.bought).toEqual([]);
  });

  it('bahan yang stoknya turun masuk sendiri', async () => {
    const { db, sugar } = await setup();
    await quickDeduct(db, [{ ingredientId: sugar, amountBase: 1600 }]);
    const names = (await getShoppingList(db)).toBuy.map((e) => e.name);
    expect(names).toContain('Gula');
  });

  it('tambah manual: bahan aman ikut masuk, tidak dobel, bahan menipis digabung', async () => {
    const { db, butter, sugar } = await setup();
    await addShoppingItem(db, sugar);
    await addShoppingItem(db, sugar);
    await addShoppingItem(db, butter, 1000);

    const list = await getShoppingList(db);
    expect(list.toBuy.map((e) => [e.name, e.status, e.amountBase, e.itemIds.length])).toEqual([
      ['Telur', 'empty', null, 0],
      ['Mentega', 'low', 1000, 1],
      ['Gula', null, null, 1],
    ]);
  });

  it('sudah dibeli (dari stok): stok bertambah, hilang dari perlu dibeli, tampil di sudah dibeli', async () => {
    const { db, butter } = await setup();
    const entry = (await getShoppingList(db)).toBuy.find((e) => e.ingredientId === butter)!;

    await markBought(db, entry, 1000);

    expect(await getCurrentStock(db, butter)).toBe(1150);
    const list = await getShoppingList(db);
    expect(list.toBuy.map((e) => e.name)).toEqual(['Telur']);
    expect(list.bought).toEqual([expect.objectContaining({ name: 'Mentega', amountBase: 1000 })]);
  });

  it('sudah dibeli tapi masih kurang: tetap di perlu dibeli', async () => {
    const { db, butter } = await setup();
    const entry = (await getShoppingList(db)).toBuy.find((e) => e.ingredientId === butter)!;
    await markBought(db, entry, 100);
    const list = await getShoppingList(db);
    expect(list.toBuy.map((e) => e.name)).toContain('Mentega');
  });

  it('batalkan pembelian mengembalikan stok dan daftar', async () => {
    const { db, butter, sugar } = await setup();
    await addShoppingItem(db, sugar);
    const before = await getShoppingList(db);

    const butterEntry = before.toBuy.find((e) => e.ingredientId === butter)!;
    const sugarEntry = before.toBuy.find((e) => e.ingredientId === sugar)!;
    const r1 = await markBought(db, butterEntry, 1000);
    const r2 = await markBought(db, sugarEntry, 500);
    await undoBought(db, r1, butterEntry.itemIds.length > 0);
    await undoBought(db, r2, sugarEntry.itemIds.length > 0);

    expect(await getCurrentStock(db, butter)).toBe(150);
    expect(await getCurrentStock(db, sugar)).toBe(2000);
    expect(await getShoppingList(db)).toEqual(before);
  });

  it('hapus item manual dan bersihkan yang sudah dibeli', async () => {
    const { db, sugar, butter } = await setup();
    const id = await addShoppingItem(db, sugar);
    await removeShoppingItems(db, [id]);
    expect((await getShoppingList(db)).toBuy.map((e) => e.name)).not.toContain('Gula');

    const entry = (await getShoppingList(db)).toBuy.find((e) => e.ingredientId === butter)!;
    await markBought(db, entry, 1000);
    await clearBought(db);
    expect((await getShoppingList(db)).bought).toEqual([]);
    expect(await getCurrentStock(db, butter)).toBe(1150);
  });
});
