import {
  availableUnits,
  formatAmount,
  formatNumber,
  fromBase,
  needsConversion,
  normalizeUnit,
  parseAmount,
  toBase,
  unitFactor,
  type IngredientUnits,
} from '../units';

const flour: IngredientUnits = {
  baseUnit: 'g',
  conversions: [
    { unitName: 'cup', toBaseAmount: 120 },
    { unitName: 'sdm', toBaseAmount: 8 },
  ],
};

const sugar: IngredientUnits = {
  baseUnit: 'g',
  conversions: [{ unitName: 'cup', toBaseAmount: 200 }],
};

const milk: IngredientUnits = {
  baseUnit: 'ml',
  conversions: [{ unitName: 'cup', toBaseAmount: 240 }],
};

const eggs: IngredientUnits = {
  baseUnit: 'pcs',
  conversions: [{ unitName: 'butir', toBaseAmount: 1 }],
};

describe('normalizeUnit', () => {
  it('menyamakan huruf, spasi, dan ejaan lain', () => {
    expect(normalizeUnit(' Gram ')).toBe('g');
    expect(normalizeUnit('gr')).toBe('g');
    expect(normalizeUnit('Sendok  Makan')).toBe('sdm');
    expect(normalizeUnit('tsp')).toBe('sdt');
    expect(normalizeUnit('sdm.')).toBe('sdm');
    expect(normalizeUnit('Liter')).toBe('l');
    expect(normalizeUnit('butir')).toBe('butir');
  });
});

describe('toBase', () => {
  it('satuan dasar tidak berubah', () => {
    expect(toBase(250, 'g', flour)).toBe(250);
    expect(toBase(3, 'pcs', eggs)).toBe(3);
  });

  it('satuan baku berat dan volume', () => {
    expect(toBase(1.5, 'kg', flour)).toBe(1500);
    expect(toBase(2, 'ons', flour)).toBe(200);
    expect(toBase(1, 'liter', milk)).toBe(1000);
  });

  it('konversi per bahan: 1 cup tepung != 1 cup gula', () => {
    expect(toBase(1, 'cup', flour)).toBe(120);
    expect(toBase(1, 'cup', sugar)).toBe(200);
    expect(toBase(0.5, 'cup', milk)).toBe(120);
    expect(toBase(2, 'Sendok makan', flour)).toBe(16);
  });

  it('null kalau konversi belum ada atau satuan tidak cocok dengan dasar', () => {
    expect(toBase(1, 'sdt', flour)).toBeNull();
    expect(toBase(1, 'ml', flour)).toBeNull();
    expect(toBase(1, 'kg', milk)).toBeNull();
    expect(toBase(1, 'g', eggs)).toBeNull();
  });

  it('mengabaikan konversi yang tidak valid', () => {
    const broken: IngredientUnits = { baseUnit: 'g', conversions: [{ unitName: 'cup', toBaseAmount: 0 }] };
    expect(unitFactor('cup', broken)).toBeNull();
  });

  it('satuan baku menang atas konversi per bahan dengan nama sama', () => {
    const odd: IngredientUnits = { baseUnit: 'g', conversions: [{ unitName: 'kg', toBaseAmount: 5 }] };
    expect(toBase(1, 'kg', odd)).toBe(1000);
  });
});

describe('fromBase', () => {
  it('kebalikan dari toBase', () => {
    expect(fromBase(240, 'cup', flour)).toBe(2);
    expect(fromBase(1500, 'kg', flour)).toBe(1.5);
    expect(fromBase(360, 'cup', milk)).toBe(1.5);
    expect(fromBase(100, 'sdt', flour)).toBeNull();
  });
});

describe('availableUnits', () => {
  it('gabungan satuan baku dan konversi bahan, tanpa duplikat', () => {
    expect(availableUnits(flour)).toEqual(['g', 'kg', 'ons', 'sdm', 'sdt', 'cup']);
    expect(availableUnits(sugar)).toEqual(['g', 'kg', 'ons', 'sdm', 'sdt', 'cup']);
    expect(availableUnits(milk)).toEqual(['ml', 'l', 'sdm', 'sdt', 'cup']);
    expect(availableUnits(eggs)).toEqual(['pcs', 'butir']);
  });

  it('sdm/sdt otomatis untuk cairan, perlu diisi untuk padatan', () => {
    expect(toBase(2, 'sdm', milk)).toBe(30);
    expect(toBase(1, 'sdt', milk)).toBe(5);
    expect(needsConversion('sdt', flour)).toBe(true);
    expect(needsConversion('sdm', flour)).toBe(false);
    expect(needsConversion('sdm', milk)).toBe(false);
  });
});

describe('parseAmount', () => {
  it('angka bulat dan desimal dengan koma', () => {
    expect(parseAmount('250')).toBe(250);
    expect(parseAmount('1,5')).toBe(1.5);
    expect(parseAmount(' 0,25 ')).toBe(0.25);
  });

  it('titik sebagai pemisah ribuan', () => {
    expect(parseAmount('1.000')).toBe(1000);
    expect(parseAmount('12.500')).toBe(12500);
    expect(parseAmount('1.250,5')).toBe(1250.5);
  });

  it('titik dengan 1-2 angka di belakang dibaca desimal', () => {
    expect(parseAmount('1.5')).toBe(1.5);
    expect(parseAmount('0.75')).toBe(0.75);
  });

  it('pecahan', () => {
    expect(parseAmount('1/2')).toBe(0.5);
    expect(parseAmount('1 1/2')).toBe(1.5);
    expect(parseAmount('½')).toBe(0.5);
    expect(parseAmount('2 ¾')).toBe(2.75);
  });

  it('null untuk input yang tidak bisa dibaca', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1/0')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('1,2,3')).toBeNull();
    expect(parseAmount('1.2345')).toBeNull();
  });
});

describe('formatNumber', () => {
  it('format Indonesia, maksimal 2 desimal, tanpa nol di belakang', () => {
    expect(formatNumber(1500)).toBe('1.500');
    expect(formatNumber(1.5)).toBe('1,5');
    expect(formatNumber(0.333333)).toBe('0,33');
    expect(formatNumber(2)).toBe('2');
    expect(formatNumber(1234567.891)).toBe('1.234.567,89');
    expect(formatNumber(-250)).toBe('-250');
    expect(formatNumber(-0.001)).toBe('0');
  });

  it('formatAmount menempelkan satuan', () => {
    expect(formatAmount(1250, 'g')).toBe('1.250 g');
    expect(formatAmount(0.5, 'cup')).toBe('0,5 cup');
  });
});
