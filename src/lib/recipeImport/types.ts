// Hasil baca resep (dari JSON-LD, Gemini, atau parser teks), sebelum direview user.
// Tidak pernah langsung disimpan: selalu lewat layar review.

export type ParsedIngredient = {
  name: string;
  amount: number | null; // null = tidak ada angka ("secukupnya")
  unit: string | null;
  raw: string; // teks asli, ditampilkan di layar review
  note: string | null; // keterangan di luar nama stok: "ukuran besar", "potong dadu kecil"
  section: string | null; // bagian resep: "Bahan A", "Filling", "Topping"
  stockName: string | null; // nama bahan di stok yang cocok menurut AI (persis dari daftar), atau null
};

export type ParsedRecipe = {
  name: string;
  yieldAmount: number | null;
  yieldUnit: string | null;
  ingredients: ParsedIngredient[];
  steps: string[];
};

export class ImportError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function positiveOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

// Judul bagian yang kadang ikut terbaca sebagai bahan ("Filling", "Bahan A:", "For the topping").
const SECTION_WORDS =
  /^(bahan|isian|filling|topping|frosting|icing|glaze|olesan|lapisan|adonan|kulit|crust|dough|batter|sauce|saus|vla|crumble|streusel|garnish|hiasan|cream|krim|base|dasar)\b/i;

export function sectionTitle(ingredient: Pick<ParsedIngredient, 'name' | 'amount' | 'unit'>): string | null {
  if (ingredient.amount !== null || ingredient.unit !== null) return null;
  const text = ingredient.name.trim();
  const words = text.replace(/:$/, '').split(/\s+/);
  const isTitle =
    text.endsWith(':') || /^(for the|for|untuk)\s/i.test(text) || (SECTION_WORDS.test(text) && words.length <= 3);
  if (!isTitle) return null;
  const title = text
    .replace(/:$/, '')
    .replace(/^(for the|for|untuk)\s+/i, '')
    .trim();
  return title ? title.charAt(0).toUpperCase() + title.slice(1) : null;
}

// Ubah baris judul bagian jadi `section` untuk bahan-bahan sesudahnya.
export function applySections(items: ParsedIngredient[]): ParsedIngredient[] {
  const result: ParsedIngredient[] = [];
  let current: string | null = null;
  for (const item of items) {
    const title = sectionTitle(item);
    if (title) {
      current = title;
      continue;
    }
    result.push({ ...item, section: item.section ?? current });
  }
  return result;
}

// Nama stok dari AI hanya dipakai kalau persis ada di daftar (tanpa beda huruf besar).
export function exactStockName(value: unknown, stockNames: string[]): string | null {
  const text = cleanText(value).toLowerCase();
  if (!text) return null;
  return stockNames.find((n) => n.toLowerCase() === text) ?? null;
}

// Validasi JSON dari AI. Melempar ImportError dengan pesan yang jelas kalau bentuknya salah.
export function validateAiRecipe(json: unknown, stockNames: string[] = []): ParsedRecipe {
  if (!isRecord(json)) throw new ImportError('Hasil AI tidak bisa dibaca. Coba lagi, atau isi resep manual.');
  if (json.found === false) {
    throw new ImportError('Tidak ditemukan resep di sini. Pastikan foto atau halamannya berisi resep.');
  }
  const name = cleanText(json.name);
  if (!Array.isArray(json.ingredients)) {
    throw new ImportError('Hasil AI tidak berisi daftar bahan. Coba lagi, atau isi resep manual.');
  }

  const items: ParsedIngredient[] = [];
  for (const item of json.ingredients) {
    if (!isRecord(item)) continue;
    const ingredientName = cleanText(item.name);
    if (ingredientName === '') continue;
    const amount = positiveOrNull(item.amount);
    const unit = cleanText(item.unit) || null;
    const note = cleanText(item.note) || null;
    items.push({
      name: ingredientName,
      amount,
      unit,
      raw: [amount !== null ? String(amount) : null, unit, ingredientName, note ? `(${note})` : null].filter(Boolean).join(' '),
      note,
      section: cleanText(item.section) || null,
      stockName: exactStockName(item.stock_name, stockNames),
    });
  }
  const ingredients = applySections(items);
  if (ingredients.length === 0) {
    throw new ImportError('Tidak ada bahan yang terbaca. Coba foto yang lebih jelas, atau isi resep manual.');
  }

  const steps = Array.isArray(json.steps) ? json.steps.map(cleanText).filter(Boolean) : [];
  return {
    name,
    yieldAmount: positiveOrNull(json.yield_amount),
    yieldUnit: cleanText(json.yield_unit) || null,
    ingredients,
    steps,
  };
}

const AI_INGREDIENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    amount: { type: 'NUMBER', nullable: true },
    unit: { type: 'STRING', nullable: true },
    note: { type: 'STRING', nullable: true },
    section: { type: 'STRING', nullable: true },
    stock_name: { type: 'STRING', nullable: true },
  },
  required: ['name', 'amount', 'unit', 'note', 'section', 'stock_name'],
} as const;

// Skema JSON yang diminta dari AI (format responseSchema Gemini, subset OpenAPI).
export const AI_RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    found: { type: 'BOOLEAN', description: 'false kalau tidak ada resep' },
    name: { type: 'STRING' },
    yield_amount: { type: 'NUMBER', nullable: true },
    yield_unit: { type: 'STRING', nullable: true },
    ingredients: { type: 'ARRAY', items: AI_INGREDIENT_SCHEMA },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['found', 'name', 'yield_amount', 'yield_unit', 'ingredients', 'steps'],
} as const;

// Untuk mencocokkan bahan dari halaman (JSON-LD) ke stok dengan AI.
export const AI_MATCH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    matches: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          index: { type: 'INTEGER' },
          stock_name: { type: 'STRING', nullable: true },
          note: { type: 'STRING', nullable: true },
        },
        required: ['index', 'stock_name', 'note'],
      },
    },
  },
  required: ['matches'],
} as const;
