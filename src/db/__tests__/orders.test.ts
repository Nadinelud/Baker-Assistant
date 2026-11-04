/**
 * @jest-environment node
 */
import { createIngredient } from '../ingredients';
import {
  addShortagesToShopping,
  cancelOrder,
  createOrder,
  deleteOrder,
  getDateNeeds,
  getOrder,
  listOrders,
  markBaked,
  markDone,
  undoMarkBaked,
  updateOrder,
} from '../orders';
import { createRecipe, deleteRecipe, getRecipe, saveRecipe } from '../recipes';
import { getShoppingList } from '../shopping';
import { getCurrentStock, listMovements } from '../stock';
import { createMigratedTestDb } from '../testing/createTestDb';

async function setup() {
  const { db, raw } = await createMigratedTestDb();
  const flour = await createIngredient(db, { name: 'Tepung', baseUnit: 'g', minStock: 0, conversions: [] }, 1000);
  const sugar = await createIngredient(db, { name: 'Gula', baseUnit: 'g', minStock: 0, conversions: [] }, 100);
  const cupcake = await createRecipe(db, {
    name: 'Cupcake',
    yieldAmount: 12,
    yieldUnit: 'cupcake',
    steps: '',
    ingredients: [
      { ingredientId: flour, amount: 240, unit: 'g' },
      { ingredientId: sugar, amount: 100, unit: 'g' },
    ],
  });
  const bolu = await createRecipe(db, {
    name: 'Bolu',
    yieldAmount: 1,
    yieldUnit: 'loyang',
    steps: '',
    ingredients: [{ ingredientId: flour, amount: 200, unit: 'g' }],
  });
  const base = { customerName: 'Bu Rina', pickupAt: '2026-11-05T16:00', note: '', items: [{ recipeId: cupcake, quantity: 24 }] };
  return { db, raw, flour, sugar, cupcake, bolu, base };
}

describe('pesanan', () => {
  it('membuat pesanan dengan item dan kelipatan', async () => {
    const { db, base, bolu } = await setup();
    const id = await createOrder(db, { ...base, items: [...base.items, { recipeId: bolu, quantity: 2 }], note: ' Tulis nama ' });
    const order = (await getOrder(db, id))!;
    expect(order).toMatchObject({ customerName: 'Bu Rina', pickupAt: '2026-11-05T16:00', status: 'new', stockDeducted: false, note: 'Tulis nama' });
    expect(order.items.map((i) => [i.recipeName, i.quantity, i.multiplier])).toEqual([
      ['Cupcake', 24, 2],
      ['Bolu', 2, 2],
    ]);
  });

  it('menolak input tidak lengkap', async () => {
    const { db, base } = await setup();
    await expect(createOrder(db, { ...base, customerName: ' ' })).rejects.toThrow('Nama pemesan');
    await expect(createOrder(db, { ...base, pickupAt: '2026-11-05' })).rejects.toThrow('tanggal dan jam');
    await expect(createOrder(db, { ...base, items: [] })).rejects.toThrow('minimal satu item');
    await expect(createOrder(db, { ...base, items: [{ recipeId: base.items[0].recipeId, quantity: 0 }] })).rejects.toThrow();
  });

  it('daftar: yang akan datang urut waktu, selesai/batal di riwayat', async () => {
    const { db, base } = await setup();
    const late = await createOrder(db, { ...base, customerName: 'B', pickupAt: '2026-11-06T09:00' });
    const early = await createOrder(db, { ...base, customerName: 'A', pickupAt: '2026-11-05T08:00' });
    const done = await createOrder(db, { ...base, customerName: 'C' });
    await markDone(db, done);

    expect((await listOrders(db, 'upcoming')).map((o) => o.id)).toEqual([early, late]);
    const past = await listOrders(db, 'past');
    expect(past).toEqual([expect.objectContaining({ id: done, status: 'done', itemSummary: '24 Cupcake' })]);
  });

  it('kebutuhan bahan per tanggal: jumlah semua pesanan baru, dibanding stok', async () => {
    const { db, base, bolu } = await setup();
    await createOrder(db, base); // 24 cupcake: tepung 480, gula 200
    await createOrder(db, { ...base, customerName: 'Dimas', pickupAt: '2026-11-05T19:00', items: [{ recipeId: bolu, quantity: 3 }] }); // tepung 600
    await createOrder(db, { ...base, pickupAt: '2026-11-06T10:00' }); // tanggal lain
    const baked = await createOrder(db, { ...base, pickupAt: '2026-11-05T07:00' });
    await markBaked(db, baked); // sudah dibuat: tidak dihitung lagi (stok sudah terpotong)

    const { orders, needs } = await getDateNeeds(db, '2026-11-05');
    expect(orders).toHaveLength(2);
    // Stok setelah pesanan "baked": tepung 1000 - 480 = 520, gula 100 - 200 = -100
    expect(needs.map((n) => [n.name, n.needBase, n.stock, n.shortBase])).toEqual([
      ['Gula', 200, -100, 300],
      ['Tepung', 1080, 520, 560],
    ]);
  });

  it('kekurangan masuk daftar belanja dengan jumlahnya, tidak dobel', async () => {
    const { db, base, sugar } = await setup();
    await createOrder(db, base);
    const { needs } = await getDateNeeds(db, '2026-11-05');
    expect(await addShortagesToShopping(db, needs)).toBe(1);
    expect(await addShortagesToShopping(db, needs)).toBe(1);

    const gula = (await getShoppingList(db)).toBuy.find((e) => e.ingredientId === sugar)!;
    expect(gula).toMatchObject({ amountBase: 100, itemIds: [expect.any(Number)] });
  });

  it('tandai sudah dibuat: stok dipotong sekali dengan alasan pesanan', async () => {
    const { db, base, flour, sugar } = await setup();
    const id = await createOrder(db, base);
    const ids = await markBaked(db, id);

    expect(ids).toHaveLength(2);
    expect(await getCurrentStock(db, flour)).toBe(520);
    expect(await getCurrentStock(db, sugar)).toBe(-100);
    expect((await getOrder(db, id))!).toMatchObject({ status: 'baked', stockDeducted: true });
    expect((await listMovements(db, flour))[0]).toMatchObject({ reason: 'order', amountBase: -480 });

    await expect(markBaked(db, id)).rejects.toThrow('sudah ditandai');
    await markDone(db, id);
    expect(await getCurrentStock(db, flour)).toBe(520);
  });

  it('batalkan "sudah dibuat" mengembalikan stok dan status', async () => {
    const { db, base, flour } = await setup();
    const id = await createOrder(db, base);
    const ids = await markBaked(db, id);
    await undoMarkBaked(db, id, ids);
    expect(await getCurrentStock(db, flour)).toBe(1000);
    expect((await getOrder(db, id))!).toMatchObject({ status: 'new', stockDeducted: false });
  });

  it('langsung selesai tanpa tandai dibuat: stok tetap dipotong', async () => {
    const { db, base, flour } = await setup();
    const id = await createOrder(db, base);
    await markDone(db, id);
    expect(await getCurrentStock(db, flour)).toBe(520);
    expect((await getOrder(db, id))!).toMatchObject({ status: 'done', stockDeducted: true });
  });

  it('batal tidak mengubah stok', async () => {
    const { db, base, flour } = await setup();
    const fresh = await createOrder(db, base);
    await cancelOrder(db, fresh);
    expect(await getCurrentStock(db, flour)).toBe(1000);

    const baked = await createOrder(db, base);
    await markBaked(db, baked);
    await cancelOrder(db, baked);
    expect(await getCurrentStock(db, flour)).toBe(520);
  });

  it('ubah hanya untuk pesanan baru; kebutuhan memakai versi aktif terbaru', async () => {
    const { db, base, cupcake, flour, sugar } = await setup();
    const id = await createOrder(db, base);
    await updateOrder(db, id, { ...base, customerName: 'Rina', items: [{ recipeId: cupcake, quantity: 12 }] });
    expect((await getOrder(db, id))!).toMatchObject({ customerName: 'Rina', items: [expect.objectContaining({ quantity: 12 })] });

    await saveRecipe(
      db,
      cupcake,
      { name: 'Cupcake', yieldAmount: 12, yieldUnit: 'cupcake', steps: '', ingredients: [{ ingredientId: flour, amount: 300, unit: 'g' }] },
      'new_version',
    );
    const { needs } = await getDateNeeds(db, '2026-11-05');
    expect(needs.map((n) => [n.name, n.needBase])).toEqual([['Tepung', 300]]);
    expect(needs.find((n) => n.ingredientId === sugar)).toBeUndefined();

    await markBaked(db, id);
    await expect(updateOrder(db, id, base)).rejects.toThrow('tidak bisa diubah');
    expect((await getRecipe(db, cupcake))!.version.versionNumber).toBe(2);
  });

  it('hapus pesanan: item ikut, riwayat stok tetap; resep di pesanan tidak bisa dihapus', async () => {
    const { db, raw, base, cupcake, flour } = await setup();
    const id = await createOrder(db, base);
    await expect(deleteRecipe(db, cupcake)).rejects.toThrow('dipakai di pesanan');
    await markBaked(db, id);
    await deleteOrder(db, id);
    expect(await getOrder(db, id)).toBeNull();
    expect(raw.prepare('SELECT COUNT(*) AS n FROM order_items').get()).toEqual({ n: 0 });
    expect(await getCurrentStock(db, flour)).toBe(520);
  });
});

describe('kebutuhan pesanan dengan bahan tanpa stok/takaran', () => {
  it('hanya bahan stok bertakaran yang dihitung dan dipotong', async () => {
    const { db, flour, sugar } = await setup();
    const recipe = await createRecipe(db, {
      name: 'Pai',
      yieldAmount: 1,
      yieldUnit: 'loyang',
      steps: '',
      ingredients: [
        { ingredientId: flour, amount: 100, unit: 'g' },
        { ingredientId: sugar, amount: null, unit: null },
        { ingredientId: null, name: 'Air', amount: 50, unit: 'ml' },
      ],
    });
    const id = await createOrder(db, { customerName: 'A', pickupAt: '2026-11-09T10:00', note: '', items: [{ recipeId: recipe, quantity: 2 }] });
    const { needs } = await getDateNeeds(db, '2026-11-09');
    expect(needs.map((n) => [n.name, n.needBase])).toEqual([['Tepung', 200]]);
    await markBaked(db, id);
    expect(await getCurrentStock(db, flour)).toBe(800);
    expect(await getCurrentStock(db, sugar)).toBe(100);
  });
});
