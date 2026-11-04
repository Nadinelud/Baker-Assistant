/**
 * @jest-environment node
 */
import { completeBake, getBakeNeeds, getRecentBakes, undoBake, undoBakeById } from '../bakes';
import { addConversion, createIngredient, deleteIngredient, getIngredient } from '../ingredients';
import { createRecipe, deleteRecipe, getRecipe, listRecipes, saveRecipe, setActiveVersion } from '../recipes';
import { getCurrentStock, listMovements } from '../stock';
import { createMigratedTestDb } from '../testing/createTestDb';

async function setup() {
  const { db, raw } = await createMigratedTestDb();
  const flour = await createIngredient(
    db,
    { name: 'Tepung terigu', baseUnit: 'g', minStock: 0, conversions: [{ unitName: 'cup', toBaseAmount: 120 }] },
    1000,
  );
  const sugar = await createIngredient(
    db,
    { name: 'Gula', baseUnit: 'g', minStock: 0, conversions: [{ unitName: 'cup', toBaseAmount: 200 }] },
    300,
  );
  const eggs = await createIngredient(db, { name: 'Telur', baseUnit: 'pcs', minStock: 0, conversions: [] }, 10);
  const input = {
    name: 'Cupcake cokelat',
    yieldAmount: 12,
    yieldUnit: 'cupcake',
    steps: 'Kocok telur\nMasukkan tepung',
    ingredients: [
      { ingredientId: flour, amount: 2, unit: 'cup' },
      { ingredientId: sugar, amount: 1, unit: 'Cup' },
      { ingredientId: eggs, amount: 3, unit: 'pcs' },
    ],
  };
  return { db, raw, flour, sugar, eggs, input };
}

describe('resep', () => {
  it('membuat resep v1 aktif, jumlah dasar dikonversi per bahan', async () => {
    const { db, input } = await setup();
    const id = await createRecipe(db, input);
    const recipe = (await getRecipe(db, id))!;

    expect(recipe).toMatchObject({ name: 'Cupcake cokelat', yieldAmount: 12, isDraft: false, sourceType: 'manual' });
    expect(recipe.version.versionNumber).toBe(1);
    expect(recipe.activeVersionId).toBe(recipe.version.id);
    expect(recipe.version.ingredients.map((l) => [l.ingredientName, l.amount, l.unit, l.amountBase])).toEqual([
      ['Tepung terigu', 2, 'cup', 240],
      ['Gula', 1, 'cup', 200],
      ['Telur', 3, 'pcs', 3],
    ]);
  });

  it('menolak input tidak lengkap atau konversi yang belum ada', async () => {
    const { db, input, eggs } = await setup();
    await expect(createRecipe(db, { ...input, name: ' ' })).rejects.toThrow('Nama resep');
    await expect(createRecipe(db, { ...input, yieldAmount: 0 })).rejects.toThrow('Hasil jadi');
    await expect(createRecipe(db, { ...input, ingredients: [] })).rejects.toThrow('minimal satu bahan');
    await expect(
      createRecipe(db, { ...input, ingredients: [{ ingredientId: eggs, amount: 1, unit: 'butir' }] }),
    ).rejects.toThrow('Konversi butir');
    expect(await listRecipes(db)).toEqual([]);
  });

  it('konversi yang ditambah dari form resep langsung bisa dipakai', async () => {
    const { db, input, eggs } = await setup();
    await addConversion(db, eggs, { unitName: 'Butir', toBaseAmount: 1 });
    const id = await createRecipe(db, { ...input, ingredients: [{ ingredientId: eggs, amount: 2, unit: 'butir' }] });
    expect((await getRecipe(db, id))!.version.ingredients[0].amountBase).toBe(2);
    expect((await getIngredient(db, eggs))!.conversions).toEqual([{ unitName: 'butir', toBaseAmount: 1 }]);
  });

  it('simpan sebagai versi baru: v2 jadi aktif, v1 tetap ada', async () => {
    const { db, input, flour } = await setup();
    const id = await createRecipe(db, input);
    await saveRecipe(
      db,
      id,
      { ...input, ingredients: [{ ingredientId: flour, amount: 2.5, unit: 'cup' }] },
      'new_version',
      'Tepung ditambah',
    );

    const recipe = (await getRecipe(db, id))!;
    expect(recipe.version).toMatchObject({ versionNumber: 2, changeNote: 'Tepung ditambah' });
    expect(recipe.version.ingredients).toHaveLength(1);
    expect(recipe.versions.map((v) => v.versionNumber)).toEqual([2, 1]);

    const v1 = recipe.versions.find((v) => v.versionNumber === 1)!;
    const old = (await getRecipe(db, id, v1.id))!;
    expect(old.version.ingredients).toHaveLength(3);
  });

  it('perbarui versi ini: tidak membuat versi baru', async () => {
    const { db, input } = await setup();
    const id = await createRecipe(db, input);
    await saveRecipe(db, id, { ...input, name: 'Cupcake coklat', steps: 'Baru' }, 'update_version');
    const recipe = (await getRecipe(db, id))!;
    expect(recipe.name).toBe('Cupcake coklat');
    expect(recipe.versions).toHaveLength(1);
    expect(recipe.version.steps).toBe('Baru');
  });

  it('jadikan versi lama aktif', async () => {
    const { db, input } = await setup();
    const id = await createRecipe(db, input);
    await saveRecipe(db, id, input, 'new_version');
    const v1 = (await getRecipe(db, id))!.versions.find((v) => v.versionNumber === 1)!;
    await setActiveVersion(db, id, v1.id);
    expect((await getRecipe(db, id))!.version.versionNumber).toBe(1);
    await expect(setActiveVersion(db, id, 9999)).rejects.toThrow();
  });

  it('draft: tersimpan sebagai draft, jadi resep biasa setelah disimpan dari form', async () => {
    const { db, input } = await setup();
    const id = await createRecipe(db, input, { isDraft: true });
    expect((await getRecipe(db, id))!).toMatchObject({ isDraft: true, sourceType: 'draft' });
    await saveRecipe(db, id, input, 'update_version');
    expect((await getRecipe(db, id))!.isDraft).toBe(false);
  });

  it('bahan yang dipakai resep tidak bisa dihapus', async () => {
    const { db, input, flour } = await setup();
    await createRecipe(db, input);
    await expect(deleteIngredient(db, flour)).rejects.toThrow('dipakai di resep');
  });
});

describe('bake', () => {
  it('kebutuhan bahan = amount_base x kelipatan, dengan kekurangan', async () => {
    const { db, input } = await setup();
    const id = await createRecipe(db, input);
    const versionId = (await getRecipe(db, id))!.activeVersionId;

    const needs = await getBakeNeeds(db, versionId, 2);
    expect(needs.map((n) => [n.name, n.needBase, n.stock, n.shortBase])).toEqual([
      ['Tepung terigu', 480, 1000, 0],
      ['Gula', 400, 300, 100],
      ['Telur', 6, 10, 0],
    ]);
  });

  it('baris bahan yang sama digabung', async () => {
    const { db, input, flour } = await setup();
    const id = await createRecipe(db, {
      ...input,
      ingredients: [
        { ingredientId: flour, amount: 1, unit: 'cup' },
        { ingredientId: flour, amount: 100, unit: 'g' },
      ],
    });
    const needs = await getBakeNeeds(db, (await getRecipe(db, id))!.activeVersionId, 1);
    expect(needs).toEqual([expect.objectContaining({ name: 'Tepung terigu', needBase: 220 })]);
  });

  it('selesai bake: 1 bake_log + 1 movement per bahan, stok boleh minus', async () => {
    const { db, raw, input, flour, sugar, eggs } = await setup();
    const id = await createRecipe(db, input);
    const versionId = (await getRecipe(db, id))!.activeVersionId;

    const result = await completeBake(db, versionId, 2);

    expect(result.movementIds).toHaveLength(3);
    expect(await getCurrentStock(db, flour)).toBe(520);
    expect(await getCurrentStock(db, sugar)).toBe(-100);
    expect(await getCurrentStock(db, eggs)).toBe(4);
    const log = raw.prepare('SELECT version_id, multiplier FROM bake_logs WHERE id = ?').get(result.bakeLogId);
    expect(log).toEqual({ version_id: versionId, multiplier: 2 });
    const [movement] = await listMovements(db, flour);
    expect(movement).toMatchObject({ reason: 'bake', amountBase: -480 });
  });

  it('batalkan bake mengembalikan stok lewat revert dan menghapus catatan bake', async () => {
    const { db, raw, input, flour } = await setup();
    const id = await createRecipe(db, input);
    const result = await completeBake(db, (await getRecipe(db, id))!.activeVersionId, 1);
    await undoBake(db, result);

    expect(await getCurrentStock(db, flour)).toBe(1000);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM bake_logs').get()).toEqual({ n: 0 });
    const reasons = (await listMovements(db, flour)).map((m) => m.reason);
    expect(reasons).toEqual(expect.arrayContaining(['bake', 'revert']));
  });

  it('batalkan bake dari layar catatan (pakai id catatan saja)', async () => {
    const { db, raw, input, flour, sugar } = await setup();
    const id = await createRecipe(db, input);
    const result = await completeBake(db, (await getRecipe(db, id))!.activeVersionId, 1);
    raw.prepare('INSERT INTO bake_log_photos (bake_log_id, uri) VALUES (?, ?)').run(result.bakeLogId, 'file:///a.jpg');

    expect(await undoBakeById(db, result.bakeLogId)).toEqual(['file:///a.jpg']);
    expect(await getCurrentStock(db, flour)).toBe(1000);
    expect(await getCurrentStock(db, sugar)).toBe(300);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM bake_logs').get()).toEqual({ n: 0 });
  });

  it('bake terakhir dan resep lain untuk Beranda', async () => {
    const { db, raw, input } = await setup();
    const a = await createRecipe(db, input);
    const b = await createRecipe(db, { ...input, name: 'Bolu' });
    const c = await createRecipe(db, { ...input, name: 'Nastar' });
    const versionOf = async (id: number) => (await getRecipe(db, id))!.activeVersionId;

    const r1 = await completeBake(db, await versionOf(b), 1);
    const r2 = await completeBake(db, await versionOf(c), 1);
    const r3 = await completeBake(db, await versionOf(a), 2);
    raw.prepare('UPDATE bake_logs SET baked_at = ? WHERE id = ?').run('2026-11-01T08:00:00.000Z', r1.bakeLogId);
    raw.prepare('UPDATE bake_logs SET baked_at = ? WHERE id = ?').run('2026-11-02T08:00:00.000Z', r2.bakeLogId);
    raw.prepare('UPDATE bake_logs SET baked_at = ?, result_note = ? WHERE id = ?').run('2026-11-03T08:00:00.000Z', 'Pas', r3.bakeLogId);

    const { last, others } = await getRecentBakes(db);
    expect(last).toMatchObject({ recipeName: 'Cupcake cokelat', yieldAmount: 24, resultNote: 'Pas', versionNumber: 1 });
    expect(others.map((o) => o.name)).toEqual(['Nastar', 'Bolu']);

    const list = await listRecipes(db);
    expect(list.find((r) => r.id === a)!.lastBakedAt).toBe('2026-11-03T08:00:00.000Z');
  });

  it('hapus resep beserta versi dan catatan bake, riwayat stok tetap', async () => {
    const { db, raw, input, flour } = await setup();
    const id = await createRecipe(db, input);
    await completeBake(db, (await getRecipe(db, id))!.activeVersionId, 1);

    await deleteRecipe(db, id);

    expect(await getRecipe(db, id)).toBeNull();
    expect(raw.prepare('SELECT COUNT(*) AS n FROM bake_logs').get()).toEqual({ n: 0 });
    expect(raw.prepare('SELECT COUNT(*) AS n FROM recipe_version_ingredients').get()).toEqual({ n: 0 });
    expect(await getCurrentStock(db, flour)).toBe(760);
  });

  it('hapus resep ditolak kalau dipakai di pesanan', async () => {
    const { db, raw, input } = await setup();
    const id = await createRecipe(db, input);
    raw.prepare("INSERT INTO orders (id, customer_name, pickup_date, created_at) VALUES (1, 'Rina', '2026-11-05', ?)").run('2026-11-03');
    raw.prepare('INSERT INTO order_items (order_id, recipe_id, quantity) VALUES (1, ?, 24)').run(id);
    await expect(deleteRecipe(db, id)).rejects.toThrow('dipakai di pesanan');
  });
});

describe('suhu dan durasi resep', () => {
  it('tersimpan per versi dan disalin ke catatan bake', async () => {
    const { db, raw, input } = await setup();
    const id = await createRecipe(db, { ...input, ovenTemp: 170, durationMin: 22.4 });
    const v1 = (await getRecipe(db, id))!;
    expect(v1.version).toMatchObject({ ovenTemp: 170, durationMin: 22 });

    const bake = await completeBake(db, v1.activeVersionId, 1);
    expect(raw.prepare('SELECT oven_temp, duration_min FROM bake_logs WHERE id = ?').get(bake.bakeLogId)).toEqual({
      oven_temp: 170,
      duration_min: 22,
    });

    await saveRecipe(db, id, { ...input, ovenTemp: 160, durationMin: null }, 'new_version');
    const v2 = (await getRecipe(db, id))!;
    expect(v2.version).toMatchObject({ versionNumber: 2, ovenTemp: 160, durationMin: null });
    const old = (await getRecipe(db, id, v1.activeVersionId))!;
    expect(old.version.ovenTemp).toBe(170);
  });

  it('kosong tetap kosong, nilai tidak masuk akal ditolak', async () => {
    const { db, raw, input } = await setup();
    const id = await createRecipe(db, input);
    const bake = await completeBake(db, (await getRecipe(db, id))!.activeVersionId, 1);
    expect(raw.prepare('SELECT oven_temp, duration_min FROM bake_logs WHERE id = ?').get(bake.bakeLogId)).toEqual({
      oven_temp: null,
      duration_min: null,
    });
    await expect(createRecipe(db, { ...input, ovenTemp: 2000 })).rejects.toThrow('Suhu');
    await expect(createRecipe(db, { ...input, durationMin: -5 })).rejects.toThrow('Durasi');
  });

  it('perbarui versi ini mengubah suhu dan durasi versi aktif', async () => {
    const { db, input } = await setup();
    const id = await createRecipe(db, { ...input, ovenTemp: 170, durationMin: 25 });
    await saveRecipe(db, id, { ...input, ovenTemp: 180, durationMin: 20 }, 'update_version');
    expect((await getRecipe(db, id))!.version).toMatchObject({ versionNumber: 1, ovenTemp: 180, durationMin: 20 });
  });
});

describe('catatan, bagian, bahan tanpa stok, tanpa takaran', () => {
  it('tersimpan dan terbaca kembali dalam urutan', async () => {
    const { db, input, flour, eggs } = await setup();
    const id = await createRecipe(db, {
      ...input,
      ingredients: [
        { ingredientId: flour, amount: 2, unit: 'cup', section: ' Kulit ', note: 'protein rendah' },
        { ingredientId: eggs, amount: 2, unit: 'pcs', section: 'Kulit', note: '  ukuran besar ' },
        { ingredientId: null, name: ' Air  hangat ', amount: 100, unit: 'ml', section: 'Filling' },
        { ingredientId: null, name: 'Garam', amount: null, unit: null, note: 'secukupnya' },
      ],
    });
    const lines = (await getRecipe(db, id))!.version.ingredients;
    expect(lines.map((l) => [l.ingredientName, l.ingredientId === null, l.amount, l.unit, l.amountBase, l.note, l.section])).toEqual([
      ['Tepung terigu', false, 2, 'cup', 240, 'protein rendah', 'Kulit'],
      ['Telur', false, 2, 'pcs', 2, 'ukuran besar', 'Kulit'],
      ['Air hangat', true, 100, 'ml', null, null, 'Filling'],
      ['Garam', true, null, null, null, 'secukupnya', null],
    ]);
  });

  it('bahan stok tanpa takaran boleh, tidak memotong stok', async () => {
    const { db, input, flour, sugar } = await setup();
    const id = await createRecipe(db, {
      ...input,
      ingredients: [
        { ingredientId: flour, amount: 1, unit: 'cup' },
        { ingredientId: sugar, amount: null, unit: null, note: 'secukupnya' },
        { ingredientId: null, name: 'Air', amount: 50, unit: 'ml' },
      ],
    });
    const versionId = (await getRecipe(db, id))!.activeVersionId;
    const needs = await getBakeNeeds(db, versionId, 2);
    expect(needs.map((n) => [n.name, n.needBase])).toEqual([['Tepung terigu', 240]]);
    await completeBake(db, versionId, 1);
    expect(await getCurrentStock(db, flour)).toBe(880);
    expect(await getCurrentStock(db, sugar)).toBe(300);
  });

  it('satuan kosong pada bahan stok memakai satuan dasar', async () => {
    const { db, input, eggs } = await setup();
    const id = await createRecipe(db, { ...input, ingredients: [{ ingredientId: eggs, amount: 3, unit: null }] });
    expect((await getRecipe(db, id))!.version.ingredients[0]).toMatchObject({ unit: 'pcs', amountBase: 3 });
  });

  it('menolak bahan tanpa stok yang tidak bernama dan jumlah nol', async () => {
    const { db, input, flour } = await setup();
    await expect(createRecipe(db, { ...input, ingredients: [{ ingredientId: null, name: '  ', amount: 1, unit: 'g' }] })).rejects.toThrow(
      'tanpa nama',
    );
    await expect(createRecipe(db, { ...input, ingredients: [{ ingredientId: flour, amount: 0, unit: 'g' }] })).rejects.toThrow(
      'lebih dari 0',
    );
  });
});
