// Hasil baca resep yang menunggu direview. Disimpan di memori saja (bukan di database):
// resep dari AI tidak boleh tersimpan sebelum user memeriksanya.
import type { RecipeSourceType } from '@/db/recipes';
import type { ParsedRecipe } from '@/lib/recipeImport/types';

export type PendingImport = {
  recipe: ParsedRecipe;
  sourceType: Extract<RecipeSourceType, 'photo' | 'link'>;
  sourceRef: string; // URL, atau uri foto (satu per baris)
  via: 'jsonld' | 'ai';
  truncated: boolean;
};

let pending: PendingImport | null = null;

export function setPendingImport(value: PendingImport): void {
  pending = value;
}

export function getPendingImport(): PendingImport | null {
  return pending;
}

export function clearPendingImport(): void {
  pending = null;
}
