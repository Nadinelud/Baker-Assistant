/**
 * @jest-environment node
 */
import { createIngredient, listIngredientsWithStock } from '@/db/ingredients';
import { listRecipes } from '@/db/recipes';
import { createMigratedTestDb } from '@/db/testing/createTestDb';

import { hasWorstCaseSeed, removeWorstCase, seedWorstCase } from '../worstCaseSeed';

describe('data uji ekstrem', () => {
  it('bisa diisi lalu dihapus tanpa menyentuh data user', async () => {
    const { db } = await createMigratedTestDb();
    await createIngredient(db, { name: 'Garam', baseUnit: 'g', minStock: 0, conversions: [] }, 100);

    await seedWorstCase(db);
    expect(await hasWorstCaseSeed(db)).toBe(true);
    expect((await listRecipes(db)).length).toBe(3);

    await removeWorstCase(db);
    expect(await hasWorstCaseSeed(db)).toBe(false);
    expect(await listRecipes(db)).toEqual([]);
    expect((await listIngredientsWithStock(db)).map((i) => i.name)).toEqual(['Garam']);
  });

  it('gagal di tengah: tidak meninggalkan sisa', async () => {
    const { db } = await createMigratedTestDb();
    await createIngredient(db, { name: 'Vanili bubuk', baseUnit: 'g', minStock: 0, conversions: [] });
    await expect(seedWorstCase(db)).rejects.toThrow('sudah ada');
    expect((await listIngredientsWithStock(db)).map((i) => i.name)).toEqual(['Vanili bubuk']);
    expect(await hasWorstCaseSeed(db)).toBe(false);
  });
});
