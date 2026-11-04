// Backup: seluruh isi database jadi satu objek JSON, dan sebaliknya (ganti semua data).
// Bagian file (baca/tulis foto, bagikan file) ada di src/lib/backup.ts supaya bagian ini bisa dites.
import { getSchemaVersion } from './migrate';
import type { BindValue, Db } from './types';

export const BACKUP_APP = 'baker-assistant';
export const BACKUP_FORMAT = 1;

// Urutan isi (induk dulu). Hapus memakai urutan terbalik.
export const BACKUP_TABLES = [
  'ingredients',
  'ingredient_aliases',
  'ingredient_conversions',
  'recipes',
  'recipe_versions',
  'recipe_version_ingredients',
  'stock_movements',
  'orders',
  'order_items',
  'bake_logs',
  'bake_log_photos',
  'shopping_items',
  'settings',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
export type Row = Record<string, BindValue>;
export type BackupTables = Record<BackupTable, Row[]>;

export type BackupFile = {
  app: typeof BACKUP_APP;
  format: number;
  schemaVersion: number;
  exportedAt: string;
  tables: BackupTables;
  // path relatif foto (misalnya "bake-photos/123.jpg") -> isi base64
  photos: Record<string, string>;
};

// Pengaturan milik HP ini saja: tidak ikut diekspor dan tidak tertimpa saat impor.
export const LAST_BACKUP_KEY = 'last_backup_at';
const LOCAL_SETTINGS = [LAST_BACKUP_KEY];

// Foto di backup ditulis sebagai "photo:<folder>/<nama file>" supaya bisa dipulihkan di HP lain.
const PHOTO_TOKEN = 'photo:';
const PHOTO_PATH = /(?:^|\/)((?:bake-photos|recipe-photos)\/[^/.][^/]*)$/;

export async function readAllTables(db: Db): Promise<BackupTables> {
  const tables = {} as BackupTables;
  for (const table of BACKUP_TABLES) {
    const rows = await db.getAllAsync<Row>(`SELECT * FROM ${table} ORDER BY rowid`);
    tables[table] = table === 'settings' ? rows.filter((r) => !LOCAL_SETTINGS.includes(String(r.key))) : rows;
  }
  return tables;
}

// Semua alamat foto yang dipakai data: foto catatan bake dan foto buku resep.
export function photoUris(tables: BackupTables): string[] {
  const uris = tables.bake_log_photos.map((p) => String(p.uri));
  for (const recipe of tables.recipes) {
    if (recipe.source_type === 'photo' && typeof recipe.source_ref === 'string') {
      uris.push(...recipe.source_ref.split('\n').filter((u) => u !== ''));
    }
  }
  return uris;
}

export function photoPath(uri: string): string | null {
  return PHOTO_PATH.exec(uri)?.[1] ?? null;
}

// Ganti setiap alamat foto lewat `map` (alamat yang tidak diganti dibiarkan apa adanya).
export function mapPhotoUris(tables: BackupTables, map: (uri: string) => string): BackupTables {
  return {
    ...tables,
    bake_log_photos: tables.bake_log_photos.map((p) => ({ ...p, uri: map(String(p.uri)) })),
    recipes: tables.recipes.map((r) =>
      r.source_type === 'photo' && typeof r.source_ref === 'string'
        ? { ...r, source_ref: r.source_ref.split('\n').map((u) => (u === '' ? u : map(u))).join('\n') }
        : r,
    ),
  };
}

// Alamat foto di HP -> token backup, untuk foto yang isinya berhasil dibaca.
export function toPhotoToken(uri: string, saved: Record<string, string>): string {
  const path = photoPath(uri);
  return path && path in saved ? PHOTO_TOKEN + path : uri;
}

// Token backup -> alamat file di HP ini.
export function fromPhotoToken(value: string, resolve: (path: string) => string): string {
  return value.startsWith(PHOTO_TOKEN) ? resolve(value.slice(PHOTO_TOKEN.length)) : value;
}

export async function buildBackup(
  db: Db,
  readPhoto: (uri: string) => Promise<string | null>,
): Promise<BackupFile> {
  const raw = await readAllTables(db);
  const photos: Record<string, string> = {};
  for (const uri of photoUris(raw)) {
    const path = photoPath(uri);
    if (!path || path in photos) continue;
    const data = await readPhoto(uri);
    if (data !== null) photos[path] = data;
  }
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    schemaVersion: await getSchemaVersion(db),
    exportedAt: new Date().toISOString(),
    tables: mapPhotoUris(raw, (uri) => toPhotoToken(uri, photos)),
    photos,
  };
}

const NOT_BACKUP = 'File ini bukan backup Baker Assistant. Pilih file .json hasil "Ekspor data".';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCell(value: unknown): value is BindValue {
  return value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

// Cek bentuk file sebelum menyentuh database. Pesan error sudah siap ditampilkan.
export function parseBackup(text: string, currentSchemaVersion: number): BackupFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(NOT_BACKUP);
  }
  if (!isObject(json) || json.app !== BACKUP_APP || !isObject(json.tables)) throw new Error(NOT_BACKUP);
  if (typeof json.format !== 'number' || json.format > BACKUP_FORMAT) {
    throw new Error('Backup ini dibuat versi app yang lebih baru. Perbarui app dulu, lalu impor lagi.');
  }
  if (typeof json.schemaVersion !== 'number' || json.schemaVersion < 1) throw new Error(NOT_BACKUP);
  if (json.schemaVersion > currentSchemaVersion) {
    throw new Error('Backup ini dibuat versi app yang lebih baru. Perbarui app dulu, lalu impor lagi.');
  }

  const tables = {} as BackupTables;
  for (const table of BACKUP_TABLES) {
    const rows = json.tables[table] ?? [];
    if (!Array.isArray(rows) || !rows.every((r) => isObject(r) && Object.values(r).every(isCell))) {
      throw new Error('Isi backup rusak (tabel ' + table + '). Coba file backup yang lain.');
    }
    tables[table] = rows as Row[];
  }

  const photos: Record<string, string> = {};
  if (json.photos !== undefined) {
    if (!isObject(json.photos)) throw new Error('Isi backup rusak (foto). Coba file backup yang lain.');
    for (const [path, data] of Object.entries(json.photos)) {
      // Hanya nama file di folder foto app: tidak bisa menulis ke tempat lain.
      if (photoPath(path) !== path || typeof data !== 'string') {
        throw new Error('Isi backup rusak (foto). Coba file backup yang lain.');
      }
      photos[path] = data;
    }
  }

  return {
    app: BACKUP_APP,
    format: json.format,
    schemaVersion: json.schemaVersion,
    exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : '',
    tables,
    photos,
  };
}

export type BackupSummary = { recipes: number; ingredients: number; orders: number; bakes: number; photos: number };

export function summarizeBackup(backup: BackupFile): BackupSummary {
  return {
    recipes: backup.tables.recipes.length,
    ingredients: backup.tables.ingredients.length,
    orders: backup.tables.orders.length,
    bakes: backup.tables.bake_logs.length,
    photos: Object.keys(backup.photos).length,
  };
}

// Ganti seluruh isi database dengan isi backup, dalam satu transaksi (gagal = data lama utuh).
// Backup dari versi app lama tetap bisa: kolom yang ditambah belakangan diisi bawaannya.
export async function replaceAllData(db: Db, tables: BackupTables): Promise<void> {
  const columns = new Map<BackupTable, Set<string>>();
  for (const table of BACKUP_TABLES) {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    columns.set(table, new Set(info.map((c) => c.name)));
    for (const row of tables[table]) {
      for (const key of Object.keys(row)) {
        if (!columns.get(table)!.has(key)) {
          throw new Error('Isi backup rusak (kolom ' + key + ' di ' + table + '). Coba file backup yang lain.');
        }
      }
    }
  }

  await db.withTransactionAsync(async () => {
    // Relasi antartabel dicek saat transaksi selesai, bukan per baris.
    await db.execAsync('PRAGMA defer_foreign_keys = ON;');
    for (const table of [...BACKUP_TABLES].reverse()) {
      if (table === 'settings') {
        await db.runAsync(
          `DELETE FROM settings WHERE key NOT IN (${LOCAL_SETTINGS.map(() => '?').join(', ')})`,
          ...LOCAL_SETTINGS,
        );
      } else {
        await db.runAsync(`DELETE FROM ${table}`);
      }
    }
    for (const table of BACKUP_TABLES) {
      for (const row of tables[table]) {
        if (table === 'settings' && LOCAL_SETTINGS.includes(String(row.key))) continue;
        const keys = Object.keys(row);
        if (keys.length === 0) continue;
        await db.runAsync(
          `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          ...keys.map((k) => row[k]),
        );
      }
    }
  });
}

export async function getLastBackupAt(db: Db): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', LAST_BACKUP_KEY);
  return row?.value ?? null;
}

export async function setLastBackupAt(db: Db, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', LAST_BACKUP_KEY, value);
}
