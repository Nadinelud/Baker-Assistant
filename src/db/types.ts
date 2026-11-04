// Bagian dari SQLiteDatabase (expo-sqlite) yang dipakai kode database.
// Dibuat sebagai tipe kecil supaya bisa dites dengan SQLite bawaan Node.
export type BindValue = string | number | null;

export type Db = {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string, ...params: BindValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: BindValue[]): Promise<T[]>;
  runAsync(sql: string, ...params: BindValue[]): Promise<{ lastInsertRowId: number; changes: number }>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

export function nowIso(): string {
  return new Date().toISOString();
}
