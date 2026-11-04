/**
 * @jest-environment node
 */
import { guessBaseUnit, matchIngredient } from '@/lib/recipeImport/matching';

import { listAliases, saveAlias } from '../aliases';
import { createIngredient, deleteIngredient, listIngredientsWithStock } from '../ingredients';
import { createMigratedTestDb } from '../testing/createTestDb';

describe('pencocokan bahan', () => {
  it('cocok ke nama (tanpa beda huruf besar dan spasi), lalu ke alias', async () => {
    const { db } = await createMigratedTestDb();
    const flour = await createIngredient(db, { name: 'Tepung terigu', baseUnit: 'g', minStock: 0, conversions: [] });
    const sugar = await createIngredient(db, { name: 'Gula pasir', baseUnit: 'g', minStock: 0, conversions: [] });
    await saveAlias(db, flour, '  TERIGU ');
    const ingredients = await listIngredientsWithStock(db);
    const aliases = await listAliases(db);

    expect(matchIngredient('tepung  TERIGU', ingredients, aliases)).toBe(flour);
    expect(matchIngredient('terigu', ingredients, aliases)).toBe(flour);
    expect(matchIngredient('Gula Pasir', ingredients, aliases)).toBe(sugar);
    expect(matchIngredient('gula halus', ingredients, aliases)).toBeNull();
    expect(matchIngredient('  ', ingredients, aliases)).toBeNull();
  });

  it('alias yang sama dipindah ke pilihan terakhir; alias = nama bahan tidak disimpan', async () => {
    const { db } = await createMigratedTestDb();
    const a = await createIngredient(db, { name: 'Mentega', baseUnit: 'g', minStock: 0, conversions: [] });
    const b = await createIngredient(db, { name: 'Margarin', baseUnit: 'g', minStock: 0, conversions: [] });
    await saveAlias(db, a, 'butter');
    await saveAlias(db, b, 'Butter');
    await saveAlias(db, a, 'mentega');
    expect(await listAliases(db)).toEqual([{ ingredientId: b, alias: 'butter' }]);
  });

  it('alias ikut terhapus bersama bahannya', async () => {
    const { db } = await createMigratedTestDb();
    const a = await createIngredient(db, { name: 'Mentega', baseUnit: 'g', minStock: 0, conversions: [] });
    await saveAlias(db, a, 'butter');
    await deleteIngredient(db, a);
    expect(await listAliases(db)).toEqual([]);
  });

  it('tebakan satuan dasar dari satuan resep', () => {
    expect(guessBaseUnit('cup')).toBe('g');
    expect(guessBaseUnit('ml')).toBe('ml');
    expect(guessBaseUnit('butir')).toBe('pcs');
    expect(guessBaseUnit(null)).toBe('g');
  });
});
