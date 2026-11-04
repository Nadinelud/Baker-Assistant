// Memecah satu baris bahan dari halaman resep ("2 1/2 cups flour", "250 gr tepung terigu",
// "3 butir telur", "garam secukupnya") jadi jumlah, satuan, dan nama.
import { normalizeUnit, parseAmount } from '@/lib/units';

import type { ParsedIngredient } from './types';

// Kata satuan yang dikenali (huruf kecil) -> nama satuan yang dipakai app.
const UNIT_WORDS: Record<string, string> = {
  g: 'g', gr: 'g', grs: 'g', gram: 'g', grams: 'g', gramm: 'g',
  kg: 'kg', kilo: 'kg', kilogram: 'kg', kilograms: 'kg',
  ons: 'ons',
  mg: 'mg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', mililiter: 'ml', cc: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l', ltr: 'l',
  cup: 'cup', cups: 'cup', gelas: 'gelas', c: 'cup',
  sdm: 'sdm', tbsp: 'sdm', tbs: 'sdm', tablespoon: 'sdm', tablespoons: 'sdm',
  sdt: 'sdt', tsp: 'sdt', teaspoon: 'sdt', teaspoons: 'sdt',
  butir: 'butir', btr: 'butir',
  buah: 'buah', bh: 'buah', pcs: 'pcs', pc: 'pcs', piece: 'pcs', pieces: 'pcs',
  lembar: 'lembar', lbr: 'lembar', siung: 'siung', batang: 'batang', btg: 'batang',
  bungkus: 'bungkus', bks: 'bungkus', sachet: 'sachet', pack: 'pack', kaleng: 'kaleng', can: 'kaleng',
  oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
};

const MULTI_WORD_UNITS: [RegExp, string][] = [
  [/^sendok makan\b/i, 'sdm'],
  [/^sendok teh\b/i, 'sdt'],
];

// Urutan penting: bentuk yang lebih panjang ("2 1/2", "1/2", "2½") dicoba sebelum angka biasa.
const NUMBER = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d+\s*[¼½¾⅓⅔]|\d+(?:[.,]\d+)?|[¼½¾⅓⅔]`;
const LEADING_AMOUNT = new RegExp(String.raw`^(${NUMBER})(?:\s*(?:-|–|sampai|to)\s*(?:${NUMBER}))?\s*`, 'i');

export function parseIngredientLine(line: string): ParsedIngredient {
  const raw = line.replace(/\s+/g, ' ').trim();
  let rest = raw.replace(/^[-•*·]\s*/, '');
  let amount: number | null = null;
  let unit: string | null = null;

  const match = rest.match(LEADING_AMOUNT);
  if (match) {
    // Rentang ("2-3 sdm") memakai angka pertama.
    amount = parseAmount(match[1].replace(/(\d)\s*([¼½¾⅓⅔])/, '$1 $2'));
    rest = rest.slice(match[0].length);
  }

  for (const [pattern, name] of MULTI_WORD_UNITS) {
    if (pattern.test(rest)) {
      unit = name;
      rest = rest.replace(pattern, '');
      break;
    }
  }
  if (!unit) {
    const word = rest.match(/^([A-Za-z]+)\.?(?=\s|$)/);
    if (word && UNIT_WORDS[word[1].toLowerCase()] && (amount !== null || word[1].length > 1)) {
      unit = UNIT_WORDS[word[1].toLowerCase()];
      rest = rest.slice(word[0].length);
    }
  }

  const cleaned = rest
    .replace(/^\s*(of|dari)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Keterangan sesudah koma jadi catatan: "butter, melted" -> butter + "melted".
  const comma = cleaned.indexOf(',');
  const name = comma > 0 ? cleaned.slice(0, comma).trim() : cleaned;
  const note = comma > 0 ? cleaned.slice(comma + 1).trim() || null : null;
  return {
    name: name || raw,
    amount: amount !== null && amount > 0 ? amount : null,
    unit: unit ? normalizeUnit(unit) : null,
    raw,
    note,
    section: null,
    stockName: null,
  };
}
