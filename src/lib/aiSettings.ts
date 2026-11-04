// Pengaturan AI: API key Gemini di SecureStore (tidak pernah di database atau di kode),
// nama model di tabel settings supaya mudah diganti.
import * as SecureStore from 'expo-secure-store';

import type { Db } from '@/db/types';

import { DEFAULT_GEMINI_MODEL, type AiConfig } from './recipeImport/gemini';

const API_KEY = 'gemini_api_key';
const MODEL_KEY = 'ai_model';

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY);
}

export async function setApiKey(value: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY, value.trim());
}

export async function deleteApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY);
}

export async function getModel(db: Db): Promise<string> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', MODEL_KEY);
  return row?.value || DEFAULT_GEMINI_MODEL;
}

export async function setModel(db: Db, model: string): Promise<void> {
  const value = model.trim();
  if (value === '' || value === DEFAULT_GEMINI_MODEL) {
    await db.runAsync('DELETE FROM settings WHERE key = ?', MODEL_KEY);
  } else {
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', MODEL_KEY, value);
  }
}

// null kalau API key belum diisi.
export async function getAiConfig(db: Db): Promise<AiConfig | null> {
  const apiKey = await getApiKey();
  if (!apiKey) return null;
  return { apiKey, model: await getModel(db) };
}

// "••••abcd" untuk ditampilkan; key lengkap tidak pernah ditampilkan.
export function maskKey(key: string): string {
  return key.length <= 4 ? '••••' : `••••${key.slice(-4)}`;
}
