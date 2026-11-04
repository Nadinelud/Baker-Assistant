// Daftar migrasi berurutan. Jangan pernah mengubah migrasi yang sudah ada;
// perubahan struktur selalu jadi migrasi baru dengan versi berikutnya.

export type Migration = {
  version: number;
  sql: string;
};

export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE ingredients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  base_unit TEXT NOT NULL CHECK (base_unit IN ('g','ml','pcs')),
  min_stock REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE ingredient_aliases (
  id INTEGER PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  alias TEXT NOT NULL UNIQUE
);

CREATE TABLE ingredient_conversions (
  id INTEGER PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  unit_name TEXT NOT NULL,
  to_base_amount REAL NOT NULL,
  UNIQUE (ingredient_id, unit_name)
);

CREATE TABLE recipes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  yield_amount REAL NOT NULL,
  yield_unit TEXT NOT NULL,
  active_version_id INTEGER,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','photo','link','draft')),
  source_ref TEXT,
  is_draft INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE recipe_versions (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  change_note TEXT,
  steps TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (recipe_id, version_number)
);

CREATE TABLE recipe_version_ingredients (
  id INTEGER PRIMARY KEY,
  version_id INTEGER NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  amount REAL NOT NULL,
  unit TEXT NOT NULL,
  amount_base REAL NOT NULL
);

CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  amount_base REAL NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('purchase','bake','quick_deduct','stock_check','order','adjustment','revert')),
  ref_type TEXT,
  ref_id INTEGER,
  note TEXT,
  reverted_of_id INTEGER REFERENCES stock_movements(id),
  created_at TEXT NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_name TEXT NOT NULL,
  pickup_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','baked','done','cancelled')),
  stock_deducted INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id),
  version_id INTEGER REFERENCES recipe_versions(id),
  quantity REAL NOT NULL
);

CREATE TABLE bake_logs (
  id INTEGER PRIMARY KEY,
  version_id INTEGER NOT NULL REFERENCES recipe_versions(id),
  order_id INTEGER REFERENCES orders(id),
  baked_at TEXT NOT NULL,
  multiplier REAL NOT NULL DEFAULT 1,
  oven_temp INTEGER,
  duration_min INTEGER,
  result_note TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE bake_log_photos (
  id INTEGER PRIMARY KEY,
  bake_log_id INTEGER NOT NULL REFERENCES bake_logs(id) ON DELETE CASCADE,
  uri TEXT NOT NULL
);

CREATE TABLE shopping_items (
  id INTEGER PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  amount_base REAL NOT NULL,
  is_bought INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_stock_movements_ingredient ON stock_movements(ingredient_id);
CREATE INDEX idx_recipe_versions_recipe ON recipe_versions(recipe_id);
CREATE INDEX idx_recipe_version_ingredients_version ON recipe_version_ingredients(version_id);
CREATE INDEX idx_orders_pickup_date ON orders(pickup_date);
CREATE INDEX idx_order_items_order ON order_items(order_id);
`,
  },
  {
    // Suhu oven dan durasi per versi resep; disalin ke bake_logs saat "Selesai bake".
    version: 2,
    sql: `
ALTER TABLE recipe_versions ADD COLUMN oven_temp INTEGER;
ALTER TABLE recipe_versions ADD COLUMN duration_min INTEGER;
`,
  },
  {
    // Bahan resep: catatan ("ukuran besar"), bagian ("Filling"), bahan yang tidak dicatat di stok
    // (ingredient_id kosong, nama disimpan di baris), dan takaran boleh kosong ("secukupnya").
    // SQLite tidak bisa melonggarkan NOT NULL, jadi tabel dibangun ulang dan datanya disalin.
    version: 3,
    sql: `
CREATE TABLE recipe_version_ingredients_v3 (
  id INTEGER PRIMARY KEY,
  version_id INTEGER NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id),
  name TEXT,
  amount REAL,
  unit TEXT,
  amount_base REAL,
  note TEXT,
  section TEXT,
  CHECK (ingredient_id IS NOT NULL OR (name IS NOT NULL AND name <> ''))
);
INSERT INTO recipe_version_ingredients_v3 (id, version_id, ingredient_id, amount, unit, amount_base)
  SELECT id, version_id, ingredient_id, amount, unit, amount_base FROM recipe_version_ingredients;
DROP TABLE recipe_version_ingredients;
ALTER TABLE recipe_version_ingredients_v3 RENAME TO recipe_version_ingredients;
CREATE INDEX idx_recipe_version_ingredients_version ON recipe_version_ingredients(version_id);
CREATE INDEX idx_recipe_version_ingredients_ingredient ON recipe_version_ingredients(ingredient_id);
`,
  },
];
