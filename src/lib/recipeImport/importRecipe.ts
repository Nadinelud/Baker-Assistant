// Alur impor: link (JSON-LD dulu, AI kalau tidak ada) dan foto (AI).
import { matchWithGemini, photoParts, readRecipeWithGemini, textParts, type AiConfig, type FetchFn } from './gemini';
import { extractJsonLdRecipe, htmlToText } from './jsonLd';
import { ImportError, type ParsedRecipe } from './types';

const PAGE_TIMEOUT_MS = 20_000;
// Teks halaman yang dikirim ke AI dibatasi (komentar dan iklan di bawah resep tidak perlu).
// Resepnya sendiri hampir selalu ada di bagian awal halaman.
export const MAX_PAGE_TEXT = 60_000;

export type ImportResult = { recipe: ParsedRecipe; via: 'jsonld' | 'ai'; truncated: boolean };

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes('.')) throw new Error('host');
    return url.toString();
  } catch {
    throw new ImportError('Link tidak valid. Salin alamat lengkap halaman resepnya, misalnya https://...');
  }
}

async function fetchPage(url: string, fetchFn: FetchFn): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'text/html' } });
    if (!response.ok) {
      throw new ImportError(`Halaman tidak bisa dibuka (kode ${response.status}). Periksa linknya, atau isi resep manual.`);
    }
    return await response.text();
  } catch (e) {
    if (e instanceof ImportError) throw e;
    if (controller.signal.aborted) throw new ImportError('Halaman terlalu lama dibuka. Periksa internet lalu coba lagi.');
    throw new ImportError('Halaman tidak bisa dibuka. Periksa internet dan linknya, lalu coba lagi.');
  } finally {
    clearTimeout(timer);
  }
}

// Bahan dari data halaman belum dicocokkan ke stok: minta AI mencocokkan kalau ada API key.
// Gagal tidak masalah: layar review tetap mencocokkan dengan aturan sederhana di HP.
async function withAiMatches(recipe: ParsedRecipe, ai: AiConfig | null, stockNames: string[], fetchFn: FetchFn) {
  if (!ai || !ai.apiKey.trim() || stockNames.length === 0) return recipe;
  try {
    const matches = await matchWithGemini(ai, recipe.ingredients, stockNames, fetchFn);
    return {
      ...recipe,
      ingredients: recipe.ingredients.map((item, i) => ({
        ...item,
        stockName: matches[i].stockName ?? item.stockName,
        note: matches[i].stockName ? (matches[i].note ?? item.note) : item.note,
      })),
    };
  } catch {
    return recipe;
  }
}

export async function importFromLink(
  input: string,
  ai: AiConfig | null,
  fetchFn: FetchFn = fetch,
  stockNames: string[] = [],
): Promise<ImportResult> {
  const url = normalizeUrl(input);
  const html = await fetchPage(url, fetchFn);

  const structured = extractJsonLdRecipe(html);
  if (structured) {
    return { recipe: await withAiMatches(structured, ai, stockNames, fetchFn), via: 'jsonld', truncated: false };
  }

  if (!ai || !ai.apiKey.trim()) {
    throw new ImportError(
      'Halaman ini tidak punya data resep terstruktur. Isi API key Gemini di Pengaturan supaya AI bisa membacanya, atau isi resep manual.',
    );
  }
  const text = htmlToText(html);
  if (text.length < 40) throw new ImportError('Halaman ini hampir tidak berisi teks. Coba link lain, atau isi resep manual.');
  const truncated = text.length > MAX_PAGE_TEXT;
  const recipe = await readRecipeWithGemini(ai, textParts(text.slice(0, MAX_PAGE_TEXT)), fetchFn, stockNames);
  return { recipe, via: 'ai', truncated };
}

export async function importFromPhotos(
  base64Jpegs: string[],
  ai: AiConfig | null,
  fetchFn: FetchFn = fetch,
  stockNames: string[] = [],
): Promise<ImportResult> {
  if (base64Jpegs.length === 0) throw new ImportError('Pilih minimal satu foto resep.');
  if (!ai) throw new ImportError('Isi API key Gemini di Pengaturan dulu supaya resep bisa dibaca AI.');
  const recipe = await readRecipeWithGemini(ai, photoParts(base64Jpegs), fetchFn, stockNames);
  return { recipe, via: 'ai', truncated: false };
}
