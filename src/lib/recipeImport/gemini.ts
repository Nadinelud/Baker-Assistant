// Baca resep dengan Gemini API (paket gratis Google AI Studio) lewat REST generateContent.
// Hasil selalu divalidasi dan selalu lewat layar review sebelum disimpan.
import {
  AI_MATCH_SCHEMA,
  AI_RECIPE_SCHEMA,
  exactStockName,
  ImportError,
  validateAiRecipe,
  type ParsedIngredient,
  type ParsedRecipe,
} from './types';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 60_000;

export type AiConfig = { apiKey: string; model: string };
export type FetchFn = typeof fetch;

// Aturan pencocokan ke stok, dipakai saat membaca resep dan saat mencocokkan bahan dari halaman.
const MATCH_RULES = `Pencocokan ke stok:
- stock_name: nama dari daftar stok yang PERSIS sama tulisannya, kalau bahannya sama, termasuk terjemahan
  Inggris-Indonesia ("cinnamon powder" = "Kayu manis", "eggs" = "Telur") dan variasi ukuran, jenis, atau olahan
  ("telur ukuran besar" = "Telur", "apel malang potong dadu" = "Apel"). null kalau tidak ada yang sama.
  Jangan memaksa: bahan yang berbeda (misalnya gula halus dan gula pasir) tidak dicocokkan.
- note: keterangan yang bukan bagian dari nama stok, singkat, dalam bahasa Indonesia kalau bisa
  ("ukuran besar", "malang, potong dadu kecil", "dilelehkan"). null kalau tidak ada.`;

function recipeInstruction(stockNames: string[]): string {
  const stock = stockNames.length > 0 ? stockNames.map((n) => `- ${n}`).join('\n') : '(kosong: isi stock_name dengan null)';
  return `Kamu membaca satu resep kue atau masakan dari foto buku resep atau dari teks halaman web.
Ambil resep utamanya saja dan isi JSON sesuai skema.
- name: nama resep seperti tertulis.
- yield_amount dan yield_unit: hasil jadi, misalnya 12 dan "cupcake", atau 1 dan "loyang". null kalau tidak disebut.
- ingredients: setiap bahan sekali, urut seperti di resep.
  - name: nama bahan seperti tertulis, tanpa jumlah dan satuan.
  - amount: angka desimal (1/2 jadi 0.5, 1 1/2 jadi 1.5). null kalau tidak ada angka, misalnya "secukupnya".
  - unit: satuan singkat seperti tertulis: g, kg, ml, l, cup, sdm, sdt, butir, buah, lembar, siung, bungkus. null kalau tidak ada.
  - section: nama bagian kalau bahan dikelompokkan, misalnya "Bahan A", "Kulit", "Filling", "Topping". null kalau tidak dikelompokkan.
    Judul bagian BUKAN bahan: jangan dimasukkan sebagai item sendiri.
- steps: langkah berurutan, satu langkah per item, tanpa nomor di depan.
Jangan menambah bahan atau langkah yang tidak tertulis. Kalau tidak ada resep, isi found dengan false.

${MATCH_RULES}

Daftar stok:
${stock}`;
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

type GeminiError = { error?: { code?: number; message?: string; status?: string; details?: { reason?: string }[] } };

function errorFor(status: number, body: GeminiError): ImportError {
  const reasons = (body.error?.details ?? []).map((d) => d.reason);
  if (reasons.includes('API_KEY_INVALID') || status === 401 || status === 403) {
    return new ImportError('API key Gemini ditolak. Periksa lagi di Pengaturan, atau buat key baru di Google AI Studio.');
  }
  if (status === 429) {
    return new ImportError('Batas pemakaian gratis Gemini sedang habis. Coba lagi beberapa saat lagi (atau besok), atau isi resep manual.');
  }
  if (status === 404) {
    return new ImportError('Nama model Gemini tidak dikenal. Periksa nama model di Pengaturan.');
  }
  if (status === 400) {
    return new ImportError('Permintaan ditolak Gemini. Coba foto yang lebih kecil atau lebih sedikit, atau isi resep manual.');
  }
  return new ImportError(`Layanan Gemini sedang bermasalah (kode ${status}). Coba lagi nanti, atau isi resep manual.`);
}

// Ambil teks jawaban. Bentuk generateContent: candidates[0].content.parts[].text.
// Bentuk lain dicoba juga supaya tetap jalan kalau formatnya bergeser.
export function extractText(json: unknown): string | null {
  const body = json as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    output_text?: string;
  };
  const parts = body.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const text = parts.map((p) => p.text ?? '').join('');
    if (text.trim()) return text;
  }
  if (typeof body.output_text === 'string' && body.output_text.trim()) return body.output_text;
  return null;
}

async function withTimeout(fetchFn: FetchFn, url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) throw new ImportError('Terlalu lama menunggu jawaban. Periksa internet lalu coba lagi.');
    throw new ImportError('Tidak bisa terhubung. Periksa internet lalu coba lagi.');
  } finally {
    clearTimeout(timer);
  }
}

// Satu permintaan generateContent yang menjawab JSON sesuai skema. Mengembalikan JSON yang sudah di-parse.
async function requestJson(
  config: AiConfig,
  instruction: string,
  parts: GeminiPart[],
  schema: object,
  fetchFn: FetchFn,
): Promise<unknown> {
  if (!config.apiKey.trim()) {
    throw new ImportError('Isi API key Gemini di Pengaturan dulu supaya resep bisa dibaca AI.');
  }
  const response = await withTimeout(
    fetchFn,
    `${ENDPOINT}/${encodeURIComponent(config.model.trim() || DEFAULT_GEMINI_MODEL)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey.trim() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
      }),
    },
    TIMEOUT_MS,
  );

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // dibiarkan null: ditangani di bawah
  }
  if (!response.ok) throw errorFor(response.status, (json ?? {}) as GeminiError);

  const text = extractText(json);
  if (!text) {
    throw new ImportError('Gemini tidak memberi jawaban untuk ini. Coba foto atau link lain, atau isi resep manual.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ImportError('Hasil AI tidak bisa dibaca. Coba lagi, atau isi resep manual.');
  }
}

export async function readRecipeWithGemini(
  config: AiConfig,
  parts: GeminiPart[],
  fetchFn: FetchFn = fetch,
  stockNames: string[] = [],
): Promise<ParsedRecipe> {
  const json = await requestJson(config, recipeInstruction(stockNames), parts, AI_RECIPE_SCHEMA, fetchFn);
  return validateAiRecipe(json, stockNames);
}

export type AiMatch = { stockName: string | null; note: string | null };

// Cocokkan bahan yang sudah terbaca (misalnya dari data JSON-LD halaman) ke daftar stok.
// Hasil sejajar dengan `items`; yang tidak dijawab AI dianggap tidak cocok.
export async function matchWithGemini(
  config: AiConfig,
  items: Pick<ParsedIngredient, 'name' | 'note'>[],
  stockNames: string[],
  fetchFn: FetchFn = fetch,
): Promise<AiMatch[]> {
  const list = items.map((item, index) => `${index}. ${item.name}${item.note ? ` (${item.note})` : ''}`).join('\n');
  const instruction = `Cocokkan setiap bahan resep ke daftar stok. Jawab satu item per bahan dengan index yang sama.

${MATCH_RULES}

Daftar stok:
${stockNames.map((n) => `- ${n}`).join('\n')}`;
  const json = (await requestJson(config, instruction, [{ text: `Bahan resep:\n${list}` }], AI_MATCH_SCHEMA, fetchFn)) as {
    matches?: { index?: unknown; stock_name?: unknown; note?: unknown }[];
  };

  const result: AiMatch[] = items.map(() => ({ stockName: null, note: null }));
  for (const match of Array.isArray(json?.matches) ? json.matches : []) {
    const index = typeof match.index === 'number' ? match.index : -1;
    if (!Number.isInteger(index) || index < 0 || index >= items.length) continue;
    result[index] = {
      stockName: exactStockName(match.stock_name, stockNames),
      note: typeof match.note === 'string' && match.note.trim() ? match.note.trim() : null,
    };
  }
  return result;
}

export function photoParts(base64Jpegs: string[]): GeminiPart[] {
  return [
    ...base64Jpegs.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data } })),
    { text: base64Jpegs.length > 1 ? 'Foto-foto ini adalah halaman dari satu resep yang sama, berurutan.' : 'Baca resep di foto ini.' },
  ];
}

export function textParts(pageText: string): GeminiPart[] {
  return [{ text: `Teks halaman web:\n\n${pageText}` }];
}
