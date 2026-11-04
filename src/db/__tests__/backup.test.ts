/**
 * @jest-environment node
 */
import {
  buildBackup,
  fromPhotoToken,
  getLastBackupAt,
  parseBackup,
  readAllTables,
  replaceAllData,
  setLastBackupAt,
  summarizeBackup,
  type BackupFile,
} from '../backup';
import { addBakePhoto } from '../bakeLogs';
import { completeBake } from '../bakes';
import { createIngredient } from '../ingredients';
import { getSchemaVersion, migrate } from '../migrate';
import { migrations } from '../migrations';
import { createOrder } from '../orders';
import { createRecipe, getRecipe } from '../recipes';
import { getCurrentStock, revertMovements } from '../stock';
import { createMigratedTestDb, createTestDb } from '../testing/createTestDb';

const DOC = 'file:///data/user/0/app/files/';

async function setup() {
  const { db, raw } = await createMigratedTestDb();
  const flour = await createIngredient(
    db,
    { name: 'Tepung', baseUnit: 'g', minStock: 500, conversions: [{ unitName: 'cup', toBaseAmount: 120 }] },
    1000,
  );
  const recipe = await createRecipe(
    db,
    {
      name: 'Bolu',
      yieldAmount: 1,
      yieldUnit: 'loyang',
      steps: 'Aduk',
      ovenTemp: 170,
      ingredients: [
        { ingredientId: flour, amount: 2, unit: 'cup', section: 'Bahan A', note: 'ayak' },
        { ingredientId: null, name: 'Air pandan', amount: null, unit: null },
      ],
    },
    { sourceType: 'photo', sourceRef: `${DOC}recipe-photos/a.jpg\n${DOC}recipe-photos/b.jpg` },
  );
  const versionId = (await getRecipe(db, recipe))!.activeVersionId;
  const bake = await completeBake(db, versionId, 1);
  await revertMovements(db, bake.movementIds.slice(0, 1));
  await addBakePhoto(db, bake.bakeLogId, `${DOC}bake-photos/c.jpg`);
  await createOrder(db, { customerName: 'Bu Rina', pickupAt: '2026-11-05T16:00', note: '', items: [{ recipeId: recipe, quantity: 2 }] });
  await db.runAsync("INSERT INTO settings (key, value) VALUES ('ai_model', 'model-x')");
  return { db, raw, flour, recipe };
}

// File foto palsu: b.jpg tidak bisa dibaca (misalnya sudah terhapus).
const readPhoto = async (uri: string) => (uri.endsWith('b.jpg') ? null : `isi-${uri.split('/').pop()}`);

async function roundTrip(backup: BackupFile) {
  const target = await createMigratedTestDb();
  const parsed = parseBackup(JSON.stringify(backup), await getSchemaVersion(target.db));
  await replaceAllData(target.db, parsed.tables);
  return { ...target, parsed };
}

describe('backup', () => {
  it('ekspor lalu impor menghasilkan data yang sama persis', async () => {
    const { db, flour } = await setup();
    const backup = await buildBackup(db, readPhoto);
    const { db: target } = await roundTrip(backup);

    expect(await readAllTables(target)).toEqual(backup.tables);
    expect(await getCurrentStock(target, flour)).toBe(await getCurrentStock(db, flour));
    expect(summarizeBackup(backup)).toEqual({ recipes: 1, ingredients: 1, orders: 1, bakes: 1, photos: 2 });
  });

  it('foto yang terbaca jadi token, yang tidak terbaca tetap alamat lama', async () => {
    const { db } = await setup();
    const backup = await buildBackup(db, readPhoto);
    expect(backup.photos).toEqual({ 'recipe-photos/a.jpg': 'isi-a.jpg', 'bake-photos/c.jpg': 'isi-c.jpg' });
    expect(backup.tables.recipes[0].source_ref).toBe(`photo:recipe-photos/a.jpg\n${DOC}recipe-photos/b.jpg`);
    expect(backup.tables.bake_log_photos[0].uri).toBe('photo:bake-photos/c.jpg');
    expect(fromPhotoToken('photo:bake-photos/c.jpg', (p) => `file:///baru/${p}`)).toBe('file:///baru/bake-photos/c.jpg');
    expect(fromPhotoToken('file:///lama/x.jpg', () => 'salah')).toBe('file:///lama/x.jpg');
  });

  it('impor mengganti semua data lama', async () => {
    const { db } = await setup();
    const backup = await buildBackup(db, readPhoto);
    const target = await createMigratedTestDb();
    await createIngredient(target.db, { name: 'Gula', baseUnit: 'g', minStock: 0, conversions: [] }, 50);
    await replaceAllData(target.db, parseBackup(JSON.stringify(backup), 99).tables);
    const names = await target.db.getAllAsync<{ name: string }>('SELECT name FROM ingredients');
    expect(names.map((n) => n.name)).toEqual(['Tepung']);
  });

  it('tanggal backup terakhir milik HP ini: tidak diekspor dan tidak tertimpa', async () => {
    const { db } = await setup();
    await setLastBackupAt(db, '2026-10-01T00:00:00.000Z');
    const backup = await buildBackup(db, readPhoto);
    expect(backup.tables.settings.map((s) => s.key)).toEqual(['ai_model']);

    const target = await createMigratedTestDb();
    await setLastBackupAt(target.db, '2026-11-01T00:00:00.000Z');
    await replaceAllData(target.db, backup.tables);
    expect(await getLastBackupAt(target.db)).toBe('2026-11-01T00:00:00.000Z');
  });

  it('impor gagal di tengah: data lama tetap utuh', async () => {
    const { db } = await setup();
    const backup = await buildBackup(db, readPhoto);
    const target = await createMigratedTestDb();
    await createIngredient(target.db, { name: 'Gula', baseUnit: 'g', minStock: 0, conversions: [] }, 50);
    // Item pesanan menunjuk resep yang tidak ada.
    const broken = { ...backup.tables, order_items: [{ ...backup.tables.order_items[0], recipe_id: 999 }] };
    await expect(replaceAllData(target.db, broken)).rejects.toThrow();
    const names = await target.db.getAllAsync<{ name: string }>('SELECT name FROM ingredients');
    expect(names.map((n) => n.name)).toEqual(['Gula']);
  });

  it('backup dari versi database lama (v1) tetap bisa diimpor', async () => {
    const old = createTestDb();
    await migrate(old.db, migrations.slice(0, 1));
    const now = new Date().toISOString();
    await old.db.runAsync("INSERT INTO ingredients (id, name, base_unit, created_at) VALUES (1, 'Tepung', 'g', ?)", now);
    await old.db.runAsync(
      "INSERT INTO recipes (id, name, yield_amount, yield_unit, active_version_id, created_at) VALUES (1, 'Bolu', 1, 'loyang', 1, ?)",
      now,
    );
    await old.db.runAsync('INSERT INTO recipe_versions (id, recipe_id, version_number, created_at) VALUES (1, 1, 1, ?)', now);
    await old.db.runAsync(
      "INSERT INTO recipe_version_ingredients (version_id, ingredient_id, amount, unit, amount_base) VALUES (1, 1, 100, 'g', 100)",
    );
    const backup = await buildBackup(old.db, readPhoto);
    expect(backup.schemaVersion).toBe(1);

    const { db: target } = await roundTrip(backup);
    const recipe = (await getRecipe(target, 1))!;
    expect(recipe.name).toBe('Bolu');
    const line = await target.getFirstAsync<{ note: string | null; section: string | null; amount_base: number }>(
      'SELECT note, section, amount_base FROM recipe_version_ingredients',
    );
    expect(line).toEqual({ note: null, section: null, amount_base: 100 });
  });

  it('menolak file yang bukan backup atau dari app yang lebih baru', async () => {
    const { db } = await setup();
    const backup = await buildBackup(db, readPhoto);
    const version = await getSchemaVersion(db);
    expect(() => parseBackup('bukan json', version)).toThrow('bukan backup');
    expect(() => parseBackup(JSON.stringify({ app: 'lain', tables: {} }), version)).toThrow('bukan backup');
    expect(() => parseBackup(JSON.stringify({ ...backup, schemaVersion: version + 1 }), version)).toThrow('Perbarui app');
    expect(() => parseBackup(JSON.stringify({ ...backup, format: 2 }), version)).toThrow('Perbarui app');
    expect(() =>
      parseBackup(JSON.stringify({ ...backup, tables: { ...backup.tables, recipes: [{ name: { x: 1 } }] } }), version),
    ).toThrow('rusak');
  });

  it('menolak foto dengan path di luar folder foto app', async () => {
    const { db } = await setup();
    const backup = await buildBackup(db, readPhoto);
    const version = await getSchemaVersion(db);
    for (const path of ['../secret.db', 'bake-photos/../../x.jpg', 'SQLite/app.db', '/bake-photos/x.jpg', 'bake-photos/..']) {
      expect(() => parseBackup(JSON.stringify({ ...backup, photos: { [path]: 'x' } }), version)).toThrow('rusak');
    }
  });

  it('menolak kolom yang tidak dikenal', async () => {
    const { db } = await setup();
    const backup = await buildBackup(db, readPhoto);
    const target = await createMigratedTestDb();
    const bad = { ...backup.tables, ingredients: [{ ...backup.tables.ingredients[0], 'name) VALUES (1); --': 'x' }] };
    await expect(replaceAllData(target.db, bad)).rejects.toThrow('kolom');
  });
});
