// HANYA UNTUK PENGEMBANGAN (__DEV__): data uji terburuk yang masih realistis, untuk melihat
// apa yang rusak di layar. Masuk lewat fungsi database yang sama dengan input user.
// Id yang dibuat dicatat di settings supaya "Hapus data uji" hanya menghapus data ini.
import { completeBake } from '@/db/bakes';
import { createIngredient, deleteIngredient } from '@/db/ingredients';
import { createRecipe, deleteRecipe, getRecipe, saveRecipe } from '@/db/recipes';
import type { Db } from '@/db/types';

const SETTINGS_KEY = 'dev_worst_case_seed';

type SeedIds = { ingredients: number[]; recipes: number[] };

export async function hasWorstCaseSeed(db: Db): Promise<boolean> {
  return (await db.getFirstAsync('SELECT 1 FROM settings WHERE key = ?', SETTINGS_KEY)) !== null;
}

export async function seedWorstCase(db: Db): Promise<void> {
  const created: SeedIds = { ingredients: [], recipes: [] };
  try {
    await seed(db, created);
  } catch (error) {
    // Gagal di tengah (misalnya nama bahan sudah dipakai user): buang yang sudah terlanjur dibuat.
    await removeIds(db, created);
    throw error;
  }
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    SETTINGS_KEY,
    JSON.stringify(created),
  );
}

async function seed(db: Db, created: SeedIds): Promise<void> {
  const ing = async (
    name: string,
    baseUnit: 'g' | 'ml' | 'pcs',
    minStock: number,
    stock: number,
    conversions: { unitName: string; toBaseAmount: number }[] = [],
  ) => {
    const id = await createIngredient(db, { name, baseUnit, minStock, conversions }, stock);
    created.ingredients.push(id);
    return id;
  };

  // Nama panjang dengan merek, stok habis, stok pecahan, banyak konversi, angka ribuan.
  const flour = await ing('Tepung terigu protein rendah (Kunci Biru)', 'g', 1000, 2500, [
    { unitName: 'cup', toBaseAmount: 120 },
    { unitName: 'sdm', toBaseAmount: 8 },
    { unitName: 'sdt', toBaseAmount: 3 },
    { unitName: 'gelas belimbing', toBaseAmount: 160 },
  ]);
  const sugar = await ing('Gula pasir curah', 'g', 500, 0, [{ unitName: 'cup', toBaseAmount: 200 }]);
  const eggs = await ing('Telur ayam negeri', 'pcs', 10, 4, [{ unitName: 'butir', toBaseAmount: 1 }]);
  const butter = await ing('Mentega tawar Anchor', 'g', 0, 12500);
  const milk = await ing('Susu UHT full cream', 'ml', 0, 200.5, [{ unitName: 'gelas', toBaseAmount: 240 }]);
  const vanilla = await ing('Vanili bubuk', 'g', 0, 0.5, [{ unitName: 'sdt', toBaseAmount: 2 }]);

  const longRecipe = await createRecipe(db, {
    name: 'Bolu Pandan Gulung Isi Selai Srikaya Kukus Tanpa Mixer (Resep Nenek Sumarni)',
    yieldAmount: 1,
    yieldUnit: 'loyang ukuran 22 x 22 cm',
    steps: [
      '1) Panaskan kukusan, alasi tutupnya dengan serbet bersih supaya uap air tidak menetes ke adonan.',
      '',
      '1.5 kg tepung diayak dua kali bersama vanili, sisihkan.',
      '2 butir telur dikocok dengan gula sampai pucat, kental, dan berjejak; kalau tanpa mixer ini bisa 15 sampai 20 menit jadi sabar saja dan kocok satu arah supaya tidak turun lagi.',
      '3. Masukkan tepung bertahap sambil diaduk balik.',
    ].join('\n'),
    ingredients: [
      // Bagian, catatan panjang, bahan tanpa stok, dan tanpa takaran.
      { ingredientId: flour, amount: 2.25, unit: 'cup', section: 'Bahan A (bolu pandan kukus)', note: 'ayak dua kali bersama vanili' },
      { ingredientId: sugar, amount: 1, unit: 'cup', section: 'Bahan A (bolu pandan kukus)' },
      { ingredientId: eggs, amount: 6, unit: 'butir', section: 'Bahan A (bolu pandan kukus)', note: 'ukuran besar, suhu ruang' },
      { ingredientId: null, name: 'Air daun pandan suji kental (dari 10 lembar daun)', amount: 50, unit: 'ml', section: 'Bahan A (bolu pandan kukus)' },
      { ingredientId: butter, amount: 250, unit: 'g', section: 'Isian srikaya' },
      { ingredientId: milk, amount: 1, unit: 'gelas', section: 'Isian srikaya' },
      { ingredientId: vanilla, amount: 0.5, unit: 'sdt', section: 'Isian srikaya' },
      { ingredientId: null, name: 'Garam', amount: null, unit: null, note: 'secukupnya', section: 'Isian srikaya' },
    ],
  });
  created.recipes.push(longRecipe);
  await saveRecipe(
    db,
    longRecipe,
    {
      name: 'Bolu Pandan Gulung Isi Selai Srikaya Kukus Tanpa Mixer (Resep Nenek Sumarni)',
      yieldAmount: 1,
      yieldUnit: 'loyang ukuran 22 x 22 cm',
      steps: 'Sama seperti sebelumnya',
      ingredients: [
        { ingredientId: flour, amount: 2.5, unit: 'cup' },
        { ingredientId: sugar, amount: 0.75, unit: 'cup' },
        { ingredientId: eggs, amount: 6, unit: 'butir' },
      ],
    },
    'new_version',
    'Gula dikurangi seperempat cup karena kemanisan waktu arisan, tepung ditambah sedikit supaya tidak terlalu basah',
  );

  // Hasil jadi besar, satu bahan, tanpa langkah.
  const tiny = await createRecipe(db, {
    name: 'Kue',
    yieldAmount: 1000,
    yieldUnit: 'pcs',
    steps: '',
    ingredients: [{ ingredientId: butter, amount: 12, unit: 'g' }],
  });
  created.recipes.push(tiny);
  const draft = await createRecipe(
    db,
    {
      name: 'Coba-coba',
      yieldAmount: 1,
      yieldUnit: 'porsi',
      steps: '',
      ingredients: [{ ingredientId: vanilla, amount: 1, unit: 'g' }],
    },
    { isDraft: true },
  );
  created.recipes.push(draft);

  // Bake dengan kelipatan ganjil (stok gula jadi minus).
  const longVersion = (await getRecipe(db, longRecipe))!.activeVersionId;
  await completeBake(db, longVersion, 3);
  const tinyVersion = (await getRecipe(db, tiny))!.activeVersionId;
  await completeBake(db, tinyVersion, 0.375);
}

export async function removeWorstCase(db: Db): Promise<void> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', SETTINGS_KEY);
  if (!row) return;
  await removeIds(db, JSON.parse(row.value) as SeedIds);
  await db.runAsync('DELETE FROM settings WHERE key = ?', SETTINGS_KEY);
}

async function removeIds(db: Db, ids: SeedIds): Promise<void> {
  for (const id of ids.recipes) {
    if (await getRecipe(db, id)) await deleteRecipe(db, id);
  }
  for (const id of ids.ingredients) {
    try {
      await deleteIngredient(db, id);
    } catch {
      // Dipakai resep buatan user: biarkan.
    }
  }
}
