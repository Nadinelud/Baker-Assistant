/**
 * @jest-environment node
 */
// Tes memakai SQLite bawaan Node (node:sqlite) untuk menjalankan SQL migrasi sungguhan.
import { getSchemaVersion, migrate } from '../migrate';
import { migrations, type Migration } from '../migrations';
import { createTestDb } from '../testing/createTestDb';

const now = '2026-11-03T00:00:00.000Z';
const latest = migrations[migrations.length - 1].version;

describe('migrate', () => {
  it('membuat semua tabel dan mencatat versi', async () => {
    const { db, raw } = createTestDb();
    await migrate(db);

    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(
      expect.arrayContaining([
        'bake_log_photos',
        'bake_logs',
        'ingredient_aliases',
        'ingredient_conversions',
        'ingredients',
        'order_items',
        'orders',
        'recipe_version_ingredients',
        'recipe_versions',
        'recipes',
        'schema_version',
        'settings',
        'shopping_items',
        'stock_movements',
      ]),
    );
    expect(await getSchemaVersion(db)).toBe(latest);
  });

  it('aman dijalankan berulang kali', async () => {
    const { db, raw } = createTestDb();
    await migrate(db);
    await migrate(db);
    const count = raw.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number };
    expect(count.n).toBe(migrations.length);
  });

  it('hanya menjalankan migrasi baru dan tidak menghapus data', async () => {
    const { db, raw } = createTestDb();
    await migrate(db);
    raw
      .prepare("INSERT INTO ingredients (name, base_unit, created_at) VALUES ('Tepung terigu', 'g', ?)")
      .run(now);

    const extra: Migration = { version: latest + 1, sql: 'ALTER TABLE ingredients ADD COLUMN note TEXT;' };
    await migrate(db, [...migrations, extra]);

    expect(await getSchemaVersion(db)).toBe(latest + 1);
    const row = raw.prepare('SELECT name, note FROM ingredients').get() as { name: string; note: null };
    expect(row).toEqual({ name: 'Tepung terigu', note: null });
  });

  it('membatalkan migrasi yang gagal tanpa mengubah versi', async () => {
    const { db } = createTestDb();
    await migrate(db);
    const broken: Migration = { version: latest + 1, sql: 'CREATE TABLE x (id INTEGER); SELECT * FROM tidak_ada;' };

    await expect(migrate(db, [...migrations, broken])).rejects.toThrow();
    expect(await getSchemaVersion(db)).toBe(latest);
  });

  it('v1 ke v2: resep lama tetap ada, suhu dan durasi kosong', async () => {
    const { db, raw } = createTestDb();
    await migrate(db, migrations.slice(0, 1));
    raw.prepare("INSERT INTO recipes (id, name, yield_amount, yield_unit, created_at) VALUES (1, 'Bolu', 1, 'loyang', ?)").run(now);
    raw.prepare('INSERT INTO recipe_versions (id, recipe_id, version_number, created_at) VALUES (1, 1, 1, ?)').run(now);

    await migrate(db);

    expect(await getSchemaVersion(db)).toBe(latest);
    const row = raw.prepare('SELECT version_number, oven_temp, duration_min FROM recipe_versions').get();
    expect(row).toEqual({ version_number: 1, oven_temp: null, duration_min: null });
  });

  it('v2 ke v3: baris bahan resep lama tersalin utuh, kolom baru kosong', async () => {
    const { db, raw } = createTestDb();
    await migrate(db, migrations.slice(0, 2));
    raw.prepare("INSERT INTO ingredients (id, name, base_unit, created_at) VALUES (1, 'Tepung', 'g', ?)").run(now);
    raw.prepare("INSERT INTO recipes (id, name, yield_amount, yield_unit, created_at) VALUES (1, 'Bolu', 1, 'loyang', ?)").run(now);
    raw.prepare('INSERT INTO recipe_versions (id, recipe_id, version_number, created_at) VALUES (1, 1, 1, ?)').run(now);
    raw
      .prepare("INSERT INTO recipe_version_ingredients (id, version_id, ingredient_id, amount, unit, amount_base) VALUES (7, 1, 1, 2, 'cup', 240)")
      .run();

    await migrate(db);

    expect(await getSchemaVersion(db)).toBe(latest);
    expect(raw.prepare('SELECT * FROM recipe_version_ingredients').all()).toEqual([
      { id: 7, version_id: 1, ingredient_id: 1, name: null, amount: 2, unit: 'cup', amount_base: 240, note: null, section: null },
    ]);
    // Foreign key dan cascade tetap jalan setelah tabel dibangun ulang.
    expect(() => raw.prepare('INSERT INTO recipe_version_ingredients (version_id, ingredient_id) VALUES (1, 999)').run()).toThrow();
    raw.prepare('DELETE FROM recipes WHERE id = 1').run();
    expect(raw.prepare('SELECT COUNT(*) AS n FROM recipe_version_ingredients').get()).toEqual({ n: 0 });
  });

  it('v3: baris tanpa stok wajib punya nama', async () => {
    const { db, raw } = createTestDb();
    await migrate(db);
    raw.prepare("INSERT INTO recipes (id, name, yield_amount, yield_unit, created_at) VALUES (1, 'Bolu', 1, 'loyang', ?)").run(now);
    raw.prepare('INSERT INTO recipe_versions (id, recipe_id, version_number, created_at) VALUES (1, 1, 1, ?)').run(now);
    expect(() => raw.prepare('INSERT INTO recipe_version_ingredients (version_id) VALUES (1)').run()).toThrow();
    expect(() => raw.prepare("INSERT INTO recipe_version_ingredients (version_id, name) VALUES (1, '')").run()).toThrow();
    raw.prepare("INSERT INTO recipe_version_ingredients (version_id, name) VALUES (1, 'Air')").run();
  });

  it('menolak data di luar aturan CHECK dan foreign key', async () => {
    const { db, raw } = createTestDb();
    await migrate(db);

    expect(() =>
      raw.prepare("INSERT INTO ingredients (name, base_unit, created_at) VALUES ('Gula', 'cup', ?)").run(now),
    ).toThrow();
    expect(() =>
      raw
        .prepare("INSERT INTO stock_movements (ingredient_id, amount_base, reason, created_at) VALUES (999, 10, 'purchase', ?)")
        .run(now),
    ).toThrow();
  });

  it('stok saat ini dihitung dari jumlah riwayat', async () => {
    const { db, raw } = createTestDb();
    await migrate(db);
    raw.prepare("INSERT INTO ingredients (id, name, base_unit, created_at) VALUES (1, 'Gula', 'g', ?)").run(now);
    const insert = raw.prepare(
      'INSERT INTO stock_movements (ingredient_id, amount_base, reason, created_at) VALUES (1, ?, ?, ?)',
    );
    insert.run(1000, 'purchase', now);
    insert.run(-250, 'bake', now);
    insert.run(-30, 'stock_check', now);

    const row = raw
      .prepare('SELECT SUM(amount_base) AS stock FROM stock_movements WHERE ingredient_id = ?')
      .get(1) as { stock: number };
    expect(row.stock).toBe(720);
  });
});
