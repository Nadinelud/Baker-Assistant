// Hanya untuk tes: database SQLite di memori (node:sqlite) dengan bentuk yang sama seperti expo-sqlite.
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import type { Db } from '../types';

export function createTestDb(): { db: Db; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  const db: Db = {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async getFirstAsync<T>(sql: string, ...params: (string | number | null)[]) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...params: (string | number | null)[]) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async runAsync(sql, ...params) {
      const result = raw.prepare(sql).run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async withTransactionAsync(task) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db, raw };
}

export async function createMigratedTestDb() {
  const testDb = createTestDb();
  await migrate(testDb.db);
  return testDb;
}
