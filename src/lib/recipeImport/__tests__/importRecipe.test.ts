import { extractText, readRecipeWithGemini } from '../gemini';
import { importFromLink, importFromPhotos, MAX_PAGE_TEXT, normalizeUrl } from '../importRecipe';

const ai = { apiKey: 'test-key', model: 'gemini-test' };

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

function htmlResponse(html: string, status = 200): Response {
  return { ok: status === 200, status, text: async () => html, json: async () => ({}) } as Response;
}

const aiRecipe = {
  found: true,
  name: 'Brownies',
  yield_amount: 1,
  yield_unit: 'loyang',
  ingredients: [{ name: 'Tepung', amount: 100, unit: 'g' }],
  steps: ['Aduk', 'Panggang'],
};

function geminiOk(body = aiRecipe): Response {
  return jsonResponse(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] }, finishReason: 'STOP' }] });
}

describe('readRecipeWithGemini', () => {
  it('mengirim permintaan yang benar dan memvalidasi hasil', async () => {
    const fetchFn = jest.fn(async () => geminiOk());
    const recipe = await readRecipeWithGemini(ai, [{ text: 'x' }], fetchFn as unknown as typeof fetch);

    expect(recipe).toMatchObject({ name: 'Brownies', yieldAmount: 1, ingredients: [{ name: 'Tepung', amount: 100, unit: 'g' }] });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents[0].parts).toEqual([{ text: 'x' }]);
  });

  it('pesan jelas untuk key salah, batas gratis, model salah, error server', async () => {
    const run = (response: Response) => readRecipeWithGemini(ai, [{ text: 'x' }], (async () => response) as unknown as typeof fetch);
    await expect(run(jsonResponse(400, { error: { code: 400, details: [{ reason: 'API_KEY_INVALID' }] } }))).rejects.toThrow('API key Gemini ditolak');
    await expect(run(jsonResponse(429, { error: { code: 429 } }))).rejects.toThrow('Batas pemakaian gratis');
    await expect(run(jsonResponse(404, { error: { code: 404 } }))).rejects.toThrow('Nama model');
    await expect(run(jsonResponse(503, {}))).rejects.toThrow('kode 503');
  });

  it('jawaban kosong atau bukan JSON', async () => {
    const run = (response: Response) => readRecipeWithGemini(ai, [{ text: 'x' }], (async () => response) as unknown as typeof fetch);
    await expect(run(jsonResponse(200, { candidates: [{ finishReason: 'SAFETY' }] }))).rejects.toThrow('tidak memberi jawaban');
    await expect(run(jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'bukan json' }] } }] }))).rejects.toThrow('tidak bisa dibaca');
    await expect(run(geminiOk({ ...aiRecipe, found: false }))).rejects.toThrow('Tidak ditemukan resep');
  });

  it('tanpa internet dan tanpa API key', async () => {
    const offline = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await expect(readRecipeWithGemini(ai, [{ text: 'x' }], offline)).rejects.toThrow('Tidak bisa terhubung');
    await expect(readRecipeWithGemini({ apiKey: ' ', model: 'm' }, [{ text: 'x' }], offline)).rejects.toThrow('Isi API key');
  });

  it('extractText juga menerima output_text', () => {
    expect(extractText({ output_text: '{"a":1}' })).toBe('{"a":1}');
    expect(extractText({})).toBeNull();
  });
});

describe('importFromLink', () => {
  const recipePage = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Recipe',
    name: 'Nastar',
    recipeIngredient: ['250 g tepung'],
    recipeInstructions: 'Campur.',
  })}</script>`;

  it('JSON-LD + API key: AI hanya mencocokkan bahan ke stok; kalau gagal tetap jalan', async () => {
    const page = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe',
      name: 'Pie',
      recipeIngredient: ['2 large eggs', '1 tsp cinnamon powder'],
    })}</script>`;
    const matchResponse = jsonResponse(200, {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  matches: [
                    { index: 0, stock_name: 'Telur', note: 'ukuran besar' },
                    { index: 1, stock_name: 'Bukan di daftar', note: 'x' },
                    { index: 9, stock_name: 'Telur', note: null },
                  ],
                }),
              },
            ],
          },
        },
      ],
    });
    const fetchFn = jest.fn().mockResolvedValueOnce(htmlResponse(page)).mockResolvedValueOnce(matchResponse);
    const result = await importFromLink('https://a.com/pie', ai, fetchFn as unknown as typeof fetch, ['Telur', 'Kayu manis']);
    expect(result.recipe.ingredients.map((i) => [i.name, i.stockName, i.note])).toEqual([
      ['large eggs', 'Telur', 'ukuran besar'],
      ['cinnamon powder', null, null],
    ]);
    const sent = JSON.parse((fetchFn.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(sent.systemInstruction.parts[0].text).toContain('- Kayu manis');

    const failing = jest.fn().mockResolvedValueOnce(htmlResponse(page)).mockResolvedValueOnce(jsonResponse(429, {}));
    const fallback = await importFromLink('https://a.com/pie', ai, failing as unknown as typeof fetch, ['Telur']);
    expect(fallback.recipe.ingredients.map((i) => i.stockName)).toEqual([null, null]);
  });

  it('memakai JSON-LD tanpa memanggil AI (tanpa API key pun jalan)', async () => {
    const fetchFn = jest.fn(async () => htmlResponse(recipePage));
    const result = await importFromLink('contoh.com/nastar', null, fetchFn as unknown as typeof fetch);
    expect(result).toMatchObject({ via: 'jsonld', recipe: { name: 'Nastar' } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe('https://contoh.com/nastar');
  });

  it('tanpa JSON-LD: ke AI kalau ada key, pesan jelas kalau tidak ada', async () => {
    const page = `<h1>Brownies</h1><p>${'Bahan: 100 g tepung. '.repeat(5)}</p>`;
    await expect(importFromLink('https://a.com/x', null, (async () => htmlResponse(page)) as unknown as typeof fetch)).rejects.toThrow(
      'tidak punya data resep terstruktur',
    );

    const fetchFn = jest.fn().mockResolvedValueOnce(htmlResponse(page)).mockResolvedValueOnce(geminiOk());
    const result = await importFromLink('https://a.com/x', ai, fetchFn as unknown as typeof fetch);
    expect(result).toMatchObject({ via: 'ai', truncated: false, recipe: { name: 'Brownies' } });
  });

  it('teks halaman yang sangat panjang dipotong dan ditandai', async () => {
    const page = `<p>${'x '.repeat(MAX_PAGE_TEXT)}</p>`;
    const fetchFn = jest.fn().mockResolvedValueOnce(htmlResponse(page)).mockResolvedValueOnce(geminiOk());
    const result = await importFromLink('https://a.com/x', ai, fetchFn as unknown as typeof fetch);
    expect(result.truncated).toBe(true);
    const sent = JSON.parse((fetchFn.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(sent.contents[0].parts[0].text.length).toBeLessThan(MAX_PAGE_TEXT + 100);
  });

  it('link tidak valid dan halaman error', async () => {
    expect(() => normalizeUrl('bukan link')).toThrow('Link tidak valid');
    await expect(importFromLink('https://a.com/x', ai, (async () => htmlResponse('', 404)) as unknown as typeof fetch)).rejects.toThrow(
      'kode 404',
    );
  });
});

describe('importFromPhotos', () => {
  it('beberapa foto dikirim sebagai satu resep, bersama daftar stok', async () => {
    const fetchFn = jest.fn(async () => geminiOk());
    await importFromPhotos(['AAA', 'BBB'], ai, fetchFn as unknown as typeof fetch, ['Telur']);
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.contents[0].parts.slice(0, 2)).toEqual([
      { inlineData: { mimeType: 'image/jpeg', data: 'AAA' } },
      { inlineData: { mimeType: 'image/jpeg', data: 'BBB' } },
    ]);
    expect(body.contents[0].parts[2].text).toContain('satu resep yang sama');
    expect(body.systemInstruction.parts[0].text).toContain('- Telur');
  });

  it('tanpa foto atau tanpa API key', async () => {
    await expect(importFromPhotos([], ai)).rejects.toThrow('minimal satu foto');
    await expect(importFromPhotos(['AAA'], null)).rejects.toThrow('Isi API key');
  });
});
