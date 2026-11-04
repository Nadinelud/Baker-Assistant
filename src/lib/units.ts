// Satuan dan konversi. Semua jumlah disimpan dalam satuan dasar bahan (g, ml, pcs);
// konversi hanya dipakai saat input dan tampilan.

export type BaseUnit = 'g' | 'ml' | 'pcs';

export const BASE_UNITS: readonly BaseUnit[] = ['g', 'ml', 'pcs'];

// Konversi per bahan dari tabel ingredient_conversions, misal tepung: cup -> 120.
export type IngredientConversion = {
  unitName: string;
  toBaseAmount: number;
};

export type IngredientUnits = {
  baseUnit: BaseUnit;
  conversions: IngredientConversion[];
};

// Satuan baku yang sama untuk semua bahan (berat dan volume pasti).
// Untuk bahan cair, sendok takar adalah volume pasti (1 sdm = 15 ml, 1 sdt = 5 ml).
// Untuk bahan padat, berat 1 sdm/sdt/cup beda per bahan, jadi disimpan per bahan.
const STANDARD_UNITS: Record<BaseUnit, Record<string, number>> = {
  g: { g: 1, kg: 1000, ons: 100 },
  ml: { ml: 1, l: 1000, sdm: 15, sdt: 5 },
  pcs: { pcs: 1 },
};

// Selalu ditawarkan untuk bahan padat; kalau konversinya belum ada, user diminta mengisinya sekali.
const SUGGESTED_UNITS: Record<BaseUnit, string[]> = {
  g: ['sdm', 'sdt'],
  ml: [],
  pcs: [],
};

// Ejaan lain yang sering muncul, dipetakan ke nama satuan baku.
const UNIT_SPELLINGS: Record<string, string> = {
  gr: 'g',
  gram: 'g',
  kilogram: 'kg',
  liter: 'l',
  ltr: 'l',
  mililiter: 'ml',
  'sendok makan': 'sdm',
  tbsp: 'sdm',
  'sendok teh': 'sdt',
  tsp: 'sdt',
};

export function normalizeUnit(unit: string): string {
  const cleaned = unit.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
  return UNIT_SPELLINGS[cleaned] ?? cleaned;
}

// Berapa satuan dasar dalam 1 `unit` untuk bahan ini. null = belum ada konversinya.
export function unitFactor(unit: string, ingredient: IngredientUnits): number | null {
  const name = normalizeUnit(unit);
  const standard = STANDARD_UNITS[ingredient.baseUnit][name];
  if (standard !== undefined) return standard;

  const custom = ingredient.conversions.find((c) => normalizeUnit(c.unitName) === name);
  if (custom && custom.toBaseAmount > 0) return custom.toBaseAmount;

  return null;
}

export function toBase(amount: number, unit: string, ingredient: IngredientUnits): number | null {
  const factor = unitFactor(unit, ingredient);
  return factor === null ? null : amount * factor;
}

export function fromBase(amountBase: number, unit: string, ingredient: IngredientUnits): number | null {
  const factor = unitFactor(unit, ingredient);
  return factor === null ? null : amountBase / factor;
}

// Satuan yang bisa dipilih saat input untuk bahan ini (sebagian mungkin belum punya konversi,
// lihat needsConversion).
export function availableUnits(ingredient: IngredientUnits): string[] {
  const standard = Object.keys(STANDARD_UNITS[ingredient.baseUnit]);
  const custom = ingredient.conversions.map((c) => normalizeUnit(c.unitName));
  return [...new Set([...standard, ...SUGGESTED_UNITS[ingredient.baseUnit], ...custom])];
}

export function needsConversion(unit: string, ingredient: IngredientUnits): boolean {
  return unitFactor(unit, ingredient) === null;
}

const FRACTION_CHARS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

// Membaca angka yang diketik user atau dari resep: "1,5", "1.000", "1/2", "1 1/2", "½".
// Mengikuti kebiasaan Indonesia: koma = desimal, titik = pemisah ribuan.
// Satu titik dengan 1-2 angka di belakangnya ("1.5") tetap dibaca desimal.
export function parseAmount(input: string): number | null {
  let text = input.trim().replace(/\s+/g, ' ');
  if (text === '') return null;

  for (const [char, value] of Object.entries(FRACTION_CHARS)) {
    if (text.endsWith(char)) {
      const whole = text.slice(0, -char.length).trim();
      const wholeValue = whole === '' ? 0 : parseAmount(whole);
      return wholeValue === null ? null : wholeValue + value;
    }
  }

  const mixed = text.match(/^(\d+) (\d+)\/(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    return denominator === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / denominator;
  }

  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }

  if (text.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*,\d+$|^\d+,\d+$/.test(text)) return null;
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  } else if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

// Menghindari sisa pecahan kecil dari penjumlahan desimal (0,1 + 0,2).
export function roundAmount(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

// Format angka untuk tampilan: maksimal 2 desimal, koma desimal, titik ribuan.
export function formatNumber(value: number, maxDecimals = 2): string {
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor) / factor;
  const negative = rounded < 0;
  const [intPart, decPart] = Math.abs(rounded).toFixed(maxDecimals).split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = (decPart ?? '').replace(/0+$/, '');
  const result = decimals ? `${withThousands},${decimals}` : withThousands;
  return negative && result !== '0' ? `-${result}` : result;
}

export function formatAmount(amount: number, unit: string): string {
  return `${formatNumber(amount)} ${unit}`;
}
