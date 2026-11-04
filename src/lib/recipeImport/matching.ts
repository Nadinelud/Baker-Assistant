// Pencocokan nama bahan hasil impor ke bahan yang ada: huruf kecil, tanpa spasi berlebih,
// cocokkan ke ingredients.name lalu ingredient_aliases. Tidak cocok = ditandai di layar review.

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

type StockEntry = { id: number; name: string };
type AliasEntry = { ingredientId: number; alias: string };

export function matchIngredient(name: string, ingredients: StockEntry[], aliases: AliasEntry[]): number | null {
  const key = normalizeName(name);
  if (key === '') return null;
  const byName = ingredients.find((i) => normalizeName(i.name) === key);
  if (byName) return byName.id;
  const byAlias = aliases.find((a) => normalizeName(a.alias) === key);
  if (byAlias && ingredients.some((i) => i.id === byAlias.ingredientId)) return byAlias.ingredientId;
  return null;
}

// Pilihan nama dalam satu baris: "cinnamon powder/kayu manis bubuk", "gula (gula pasir)", "susu atau santan".
export function nameAlternatives(name: string): string[] {
  const inParens = [...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  const withoutParens = name.replace(/\([^)]*\)/g, ' ');
  const parts = withoutParens.split(/\s*\/\s*|\s+atau\s+|\s+or\s+/i);
  return [...new Set([...parts, ...inParens].map(normalizeName).filter(Boolean))];
}

function joinNotes(...notes: (string | null | undefined)[]): string | null {
  const text = notes
    .map((n) => (n ?? '').trim())
    .filter(Boolean)
    .join(', ');
  return text || null;
}

export type MatchSuggestion = { ingredientId: number; note: string | null };

// Aturan sederhana di HP (tanpa AI):
//  1. salah satu pilihan nama persis sama dengan nama stok / alias;
//  2. nama diawali nama stok utuh ("telur ukuran besar" -> Telur, sisanya jadi catatan).
// Nama stok terpanjang yang cocok dipilih ("tepung terigu protein tinggi" -> Tepung terigu, bukan Tepung).
export function suggestMatch(
  item: { name: string; note: string | null },
  ingredients: StockEntry[],
  aliases: AliasEntry[],
): MatchSuggestion | null {
  const alternatives = nameAlternatives(item.name);
  for (const alt of alternatives) {
    const id = matchIngredient(alt, ingredients, aliases);
    if (id !== null) return { ingredientId: id, note: item.note };
  }

  const known = new Set(ingredients.map((i) => i.id));
  const entries = [
    ...ingredients.map((i) => ({ id: i.id, key: normalizeName(i.name) })),
    ...aliases.filter((a) => known.has(a.ingredientId)).map((a) => ({ id: a.ingredientId, key: normalizeName(a.alias) })),
  ].filter((e) => e.key !== '');

  let best: { id: number; key: string; alt: string } | null = null;
  for (const alt of alternatives) {
    for (const entry of entries) {
      if (alt.startsWith(`${entry.key} `) && (!best || entry.key.length > best.key.length)) {
        best = { ...entry, alt };
      }
    }
  }
  if (!best) return null;
  const rest = best.alt.slice(best.key.length).replace(/^[\s,-]+/, '');
  return { ingredientId: best.id, note: joinNotes(rest, item.note) };
}

// Tebakan satuan dasar untuk bahan baru dari satuan di resep (user tetap bisa mengganti).
export function guessBaseUnit(unit: string | null): 'g' | 'ml' | 'pcs' {
  if (!unit) return 'g';
  if (['ml', 'l', 'gelas'].includes(unit)) return 'ml';
  if (['butir', 'buah', 'pcs', 'lembar', 'siung', 'batang', 'bungkus', 'sachet', 'pack', 'kaleng'].includes(unit)) return 'pcs';
  return 'g';
}
