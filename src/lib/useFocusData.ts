import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';

import type { Db } from '@/db/types';

// Memuat data dari database setiap kali layar tampil, supaya selalu terbaru
// setelah kembali dari layar lain. `load` harus stabil (fungsi di luar komponen atau useCallback).
export function useFocusData<T>(load: (db: Db) => Promise<T>) {
  const db = useSQLiteContext();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);

  const reload = useCallback(async () => {
    try {
      const result = await load(db);
      if (activeRef.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (activeRef.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [db, load]);

  useFocusEffect(
    useCallback(() => {
      activeRef.current = true;
      reload();
      return () => {
        activeRef.current = false;
      };
    }, [reload]),
  );

  return { data, error, reload, db };
}
