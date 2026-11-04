import { nameAlternatives, suggestMatch } from '../matching';

const stock = [
  { id: 1, name: 'Telur' },
  { id: 2, name: 'Kayu manis' },
  { id: 3, name: 'Apel' },
  { id: 4, name: 'Tepung' },
  { id: 5, name: 'Tepung terigu' },
  { id: 6, name: 'Gula pasir' },
];
const aliases = [{ ingredientId: 2, alias: 'cinnamon' }];

describe('nameAlternatives', () => {
  it('memisah garis miring, "atau", "or", dan isi kurung', () => {
    expect(nameAlternatives('Cinnamon powder/kayu manis bubuk')).toEqual(['cinnamon powder', 'kayu manis bubuk']);
    expect(nameAlternatives('gula (gula pasir)')).toEqual(['gula', 'gula pasir']);
    expect(nameAlternatives('susu atau santan')).toEqual(['susu', 'santan']);
  });
});

describe('suggestMatch', () => {
  it('awalan nama stok, sisanya jadi catatan', () => {
    expect(suggestMatch({ name: 'telur ukuran besar', note: null }, stock, aliases)).toEqual({ ingredientId: 1, note: 'ukuran besar' });
    expect(suggestMatch({ name: 'apel malang potong dadu kecil', note: null }, stock, aliases)).toEqual({
      ingredientId: 3,
      note: 'malang potong dadu kecil',
    });
  });

  it('catatan dari resep digabung', () => {
    expect(suggestMatch({ name: 'apel malang', note: 'potong dadu kecil' }, stock, aliases)).toEqual({
      ingredientId: 3,
      note: 'malang, potong dadu kecil',
    });
  });

  it('pilihan nama dan alias: "cinnamon powder/kayu manis bubuk" -> Kayu manis', () => {
    expect(suggestMatch({ name: 'Cinnamon powder/kayu manis bubuk', note: null }, stock, aliases)).toEqual({
      ingredientId: 2,
      note: 'bubuk', // "kayu manis" lebih panjang dari alias "cinnamon", jadi sisa "bubuk" yang jadi catatan
    });
    expect(suggestMatch({ name: 'gula (gula pasir)', note: null }, stock, aliases)).toEqual({ ingredientId: 6, note: null });
  });

  it('nama stok terpanjang menang; tidak menebak kalau tidak ada awalan yang cocok', () => {
    expect(suggestMatch({ name: 'tepung terigu protein tinggi', note: null }, stock, aliases)).toEqual({
      ingredientId: 5,
      note: 'protein tinggi',
    });
    expect(suggestMatch({ name: 'gula halus', note: null }, stock, aliases)).toBeNull();
    expect(suggestMatch({ name: 'telurnya', note: null }, stock, aliases)).toBeNull();
  });
});
