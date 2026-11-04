import { parseIngredientLine } from '../ingredientLine';
import { extractJsonLdRecipe, htmlToText } from '../jsonLd';
import { sectionTitle, validateAiRecipe } from '../types';

describe('parseIngredientLine', () => {
  const cases: [string, number | null, string | null, string, string | null][] = [
    ['250 gr tepung terigu', 250, 'g', 'tepung terigu', null],
    ['2 1/2 cups all-purpose flour', 2.5, 'cup', 'all-purpose flour', null],
    ['1/2 sdt garam', 0.5, 'sdt', 'garam', null],
    ['3 butir telur', 3, 'butir', 'telur', null],
    ['2 sendok makan gula pasir', 2, 'sdm', 'gula pasir', null],
    ['1,5 kg gula', 1.5, 'kg', 'gula', null],
    ['½ cup milk', 0.5, 'cup', 'milk', null],
    ['2-3 tbsp butter, melted', 2, 'sdm', 'butter', 'melted'],
    ['- 100 ml santan', 100, 'ml', 'santan', null],
    ['2 eggs', 2, null, 'eggs', null],
    ['garam secukupnya', null, null, 'garam secukupnya', null],
    ['1 cup of sugar', 1, 'cup', 'sugar', null],
    ['200g mentega', 200, 'g', 'mentega', null],
    ['2 apel malang, potong dadu kecil', 2, null, 'apel malang', 'potong dadu kecil'],
  ];
  it.each(cases)('%s', (line, amount, unit, name, note) => {
    expect(parseIngredientLine(line)).toEqual({ amount, unit, name, note, raw: line.trim(), section: null, stockName: null });
  });

  it('kata yang mirip satuan di awal nama tanpa angka tidak dianggap satuan', () => {
    expect(parseIngredientLine('c hocolate chips')).toMatchObject({ unit: null });
  });
});

const page = (jsonLd: string) => `<html><head><title>x</title>
<script type="application/ld+json">${jsonLd}</script></head><body><p>Hello</p></body></html>`;

describe('extractJsonLdRecipe', () => {
  it('membaca Recipe di dalam @graph dengan langkah HowToStep', () => {
    const html = page(
      JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage', name: 'Blog' },
          {
            '@type': ['Recipe'],
            name: 'Bolu Pandan &amp; Keju',
            recipeYield: ['1', '1 loyang'],
            recipeIngredient: ['250 gr tepung terigu', '4 butir telur'],
            recipeInstructions: [
              { '@type': 'HowToStep', text: 'Kocok telur.' },
              { '@type': 'HowToSection', name: 'Adonan', itemListElement: [{ '@type': 'HowToStep', text: 'Masukkan <b>tepung</b>.' }] },
            ],
          },
        ],
      }),
    );
    expect(extractJsonLdRecipe(html)).toEqual({
      name: 'Bolu Pandan & Keju',
      yieldAmount: 1,
      yieldUnit: 'loyang',
      ingredients: [
        { name: 'tepung terigu', amount: 250, unit: 'g', raw: '250 gr tepung terigu', note: null, section: null, stockName: null },
        { name: 'telur', amount: 4, unit: 'butir', raw: '4 butir telur', note: null, section: null, stockName: null },
      ],
      steps: ['Kocok telur.', 'Masukkan tepung .'.replace(' .', '.')],
    });
  });

  it('yield "12 servings" jadi porsi; langkah berupa teks HTML', () => {
    const html = page(
      JSON.stringify([
        {
          '@type': 'Recipe',
          name: 'Cookies',
          recipeYield: '12 servings',
          recipeIngredient: ['1 cup sugar'],
          recipeInstructions: '<p>Mix.</p><p>Bake.</p>',
        },
      ]),
    );
    expect(extractJsonLdRecipe(html)).toMatchObject({ yieldAmount: 12, yieldUnit: 'porsi', steps: ['Mix.', 'Bake.'] });
  });

  it('null kalau tidak ada Recipe atau JSON-LD rusak', () => {
    expect(extractJsonLdRecipe(page('{"@type":"Article","name":"x"}'))).toBeNull();
    expect(extractJsonLdRecipe(page('{rusak'))).toBeNull();
    expect(extractJsonLdRecipe('<html><body>Resep tanpa data</body></html>')).toBeNull();
  });
});

describe('bagian resep', () => {
  it('judul bagian di daftar bahan jadi section, bukan bahan', () => {
    const html = page(
      JSON.stringify({
        '@type': 'Recipe',
        name: 'Pai Apel',
        recipeIngredient: ['Bahan A:', '200 g tepung', '100 g mentega', 'Filling', '3 apel', 'For the topping', '2 sdm gula', 'garam secukupnya'],
      }),
    );
    const recipe = extractJsonLdRecipe(html)!;
    expect(recipe.ingredients.map((i) => [i.name, i.section])).toEqual([
      ['tepung', 'Bahan A'],
      ['mentega', 'Bahan A'],
      ['apel', 'Filling'],
      ['gula', 'Topping'],
      ['garam secukupnya', 'Topping'],
    ]);
  });

  it('nama bahan biasa tanpa takaran tidak dianggap judul', () => {
    expect(sectionTitle({ name: 'garam secukupnya', amount: null, unit: null })).toBeNull();
    expect(sectionTitle({ name: 'Kulit pai:', amount: null, unit: null })).toBe('Kulit pai');
    expect(sectionTitle({ name: 'filling', amount: null, unit: null })).toBe('Filling');
    expect(sectionTitle({ name: 'bahan kering', amount: null, unit: null })).toBe('Bahan kering');
    expect(sectionTitle({ name: 'bahan', amount: 2, unit: 'g' })).toBeNull();
  });
});

describe('htmlToText', () => {
  it('membuang script/style dan tag, menjaga baris', () => {
    const html = '<style>.a{}</style><script>var x=1</script><h1>Bolu</h1><ul><li>2 telur</li><li>gula &amp; garam</li></ul>';
    expect(htmlToText(html)).toBe('Bolu\n2 telur\ngula & garam');
  });
});

describe('validateAiRecipe', () => {
  it('menerima bentuk yang benar dan merapikan nilai', () => {
    expect(
      validateAiRecipe({
        found: true,
        name: '  Kue  Lumpur ',
        yield_amount: 20,
        yield_unit: 'buah',
        ingredients: [
          { name: 'Tepung', amount: 250, unit: 'g' },
          { name: 'Garam', amount: null, unit: null },
          { name: '', amount: 1, unit: 'g' },
          { name: 'Gula', amount: -1, unit: 'g' },
        ],
        steps: ['Aduk', '', '  Panggang '],
      }),
    ).toEqual({
      name: 'Kue Lumpur',
      yieldAmount: 20,
      yieldUnit: 'buah',
      ingredients: [
        { name: 'Tepung', amount: 250, unit: 'g', raw: '250 g Tepung', note: null, section: null, stockName: null },
        { name: 'Garam', amount: null, unit: null, raw: 'Garam', note: null, section: null, stockName: null },
        { name: 'Gula', amount: null, unit: 'g', raw: 'g Gula', note: null, section: null, stockName: null },
      ],
      steps: ['Aduk', 'Panggang'],
    });
  });

  it('nama stok hanya diterima kalau persis ada di daftar; catatan dan bagian ikut', () => {
    const recipe = validateAiRecipe(
      {
        found: true,
        name: 'Pai',
        ingredients: [
          { name: 'Filling', amount: null, unit: null },
          { name: 'telur', amount: 2, unit: 'butir', note: 'ukuran besar', stock_name: 'TELUR', section: null },
          { name: 'cinnamon powder', amount: 1, unit: 'sdt', note: null, stock_name: 'Kayu manis', section: null },
          { name: 'vanili', amount: 1, unit: 'sdt', note: null, stock_name: 'Vanila karangan AI', section: 'Lain' },
        ],
        steps: [],
      },
      ['Telur', 'Kayu manis'],
    );
    expect(recipe.ingredients.map((i) => [i.name, i.stockName, i.note, i.section])).toEqual([
      ['telur', 'Telur', 'ukuran besar', 'Filling'],
      ['cinnamon powder', 'Kayu manis', null, 'Filling'],
      ['vanili', null, null, 'Lain'],
    ]);
  });

  it('pesan jelas untuk bentuk yang salah atau bukan resep', () => {
    expect(() => validateAiRecipe('teks')).toThrow('tidak bisa dibaca');
    expect(() => validateAiRecipe({ found: false })).toThrow('Tidak ditemukan resep');
    expect(() => validateAiRecipe({ name: 'x' })).toThrow('daftar bahan');
    expect(() => validateAiRecipe({ name: 'x', ingredients: [{ name: '' }] })).toThrow('Tidak ada bahan');
  });
});
