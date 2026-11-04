// Resep dari link: cari data terstruktur schema.org/Recipe (JSON-LD) di HTML dulu.
// Gratis dan akurat; AI hanya dipakai kalau ini tidak ada.
import { parseAmount } from '@/lib/units';

import { parseIngredientLine } from './ingredientLine';
import { applySections, type ParsedRecipe } from './types';

type Json = unknown;

function isRecord(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function clean(value: Json): string {
  if (typeof value !== 'string') return '';
  return decodeEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function hasRecipeType(node: Record<string, Json>): boolean {
  const type = node['@type'];
  return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
}

// Cari node Recipe di dalam JSON-LD (bisa array, @graph, atau bersarang).
function findRecipe(node: Json, depth = 0): Record<string, Json> | null {
  if (depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipe(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(node)) return null;
  if (hasRecipeType(node)) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
    const found = findRecipe(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function parseYield(value: Json): { amount: number | null; unit: string | null } {
  const candidates = Array.isArray(value) ? value : [value];
  // Pilih yang ada satuannya ("12 cupcakes") kalau ada, selain itu angka saja.
  let fallback: { amount: number | null; unit: string | null } = { amount: null, unit: null };
  for (const candidate of candidates) {
    const text = typeof candidate === 'number' ? String(candidate) : clean(candidate);
    const match = text.match(/(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!match) continue;
    const amount = parseAmount(match[1]);
    const unit = match[2].replace(/^(servings?|porsi|serves|yield|makes)\s*/i, '').trim() || null;
    const result = { amount, unit: unit ?? (/serv|porsi/i.test(text) ? 'porsi' : null) };
    if (result.unit) return result;
    fallback = result;
  }
  return fallback;
}

function parseSteps(value: Json, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === 'string') {
    return value
      .replace(/<\/(p|li)>|<br\s*\/?>/gi, '\n')
      .split('\n')
      .map(clean)
      .filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap((item) => parseSteps(item, depth + 1));
  if (isRecord(value)) {
    if (value.itemListElement) return parseSteps(value.itemListElement, depth + 1); // HowToSection
    const text = clean(value.text) || clean(value.name);
    return text ? [text] : [];
  }
  return [];
}

function extractJsonLdBlocks(html: string): Json[] {
  const blocks: Json[] = [];
  const pattern = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch {
      // JSON-LD rusak di halaman: lewati blok ini.
    }
  }
  return blocks;
}

// null kalau halaman tidak punya data Recipe yang berisi bahan.
export function extractJsonLdRecipe(html: string): ParsedRecipe | null {
  for (const block of extractJsonLdBlocks(html)) {
    const recipe = findRecipe(block);
    if (!recipe) continue;
    const lines = Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient
      : Array.isArray(recipe.ingredients)
        ? recipe.ingredients
        : [];
    const ingredients = applySections(lines.map(clean).filter(Boolean).map(parseIngredientLine));
    if (ingredients.length === 0) continue;
    const { amount, unit } = parseYield(recipe.recipeYield);
    return {
      name: clean(recipe.name),
      yieldAmount: amount,
      yieldUnit: unit,
      ingredients,
      steps: parseSteps(recipe.recipeInstructions),
    };
  }
  return null;
}

// Teks halaman untuk dikirim ke AI kalau JSON-LD tidak ada.
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|tr|br)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
