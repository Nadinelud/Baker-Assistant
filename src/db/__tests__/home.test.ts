/**
 * @jest-environment node
 */
import { getHomeSummary } from '../home';
import { createIngredient } from '../ingredients';
import { createMigratedTestDb } from '../testing/createTestDb';

describe('getHomeSummary', () => {
  it('menghitung bahan, resep non-draft, bake bulan ini, dan stok menipis', async () => {
    const { db, raw } = await createMigratedTestDb();
    await createIngredient(db, { name: 'Mentega', baseUnit: 'g', minStock: 500, conversions: [] }, 100);
    await createIngredient(db, { name: 'Gula', baseUnit: 'g', minStock: 500, conversions: [] }, 2000);

    const now = new Date(2026, 10, 15);
    const created = '2026-11-01T00:00:00.000Z';
    raw.prepare("INSERT INTO recipes (id, name, yield_amount, yield_unit, created_at) VALUES (1, 'Bolu', 1, 'loyang', ?)").run(created);
    raw
      .prepare("INSERT INTO recipes (id, name, yield_amount, yield_unit, is_draft, created_at) VALUES (2, 'Draft', 1, 'porsi', 1, ?)")
      .run(created);
    raw.prepare('INSERT INTO recipe_versions (id, recipe_id, version_number, created_at) VALUES (1, 1, 1, ?)').run(created);
    raw.prepare('INSERT INTO bake_logs (version_id, baked_at) VALUES (1, ?)').run(new Date(2026, 10, 10).toISOString());
    raw.prepare('INSERT INTO bake_logs (version_id, baked_at) VALUES (1, ?)').run(new Date(2026, 9, 20).toISOString());

    const summary = await getHomeSummary(db, now);
    expect(summary).toMatchObject({ recipeCount: 1, ingredientCount: 2, bakesThisMonth: 1 });
    expect(summary.lowStock.map((i) => i.name)).toEqual(['Mentega']);
  });
});
