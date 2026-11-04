import { formatMultiplier, multiplierFor, scaleLine } from '../scaling';

describe('multiplierFor', () => {
  it('jumlah diinginkan dibagi hasil jadi resep', () => {
    expect(multiplierFor(24, 12)).toBe(2);
    expect(multiplierFor(6, 12)).toBe(0.5);
    expect(multiplierFor(18, 12)).toBe(1.5);
  });

  it('nilai tidak masuk akal kembali ke 1', () => {
    expect(multiplierFor(0, 12)).toBe(1);
    expect(multiplierFor(10, 0)).toBe(1);
    expect(multiplierFor(-3, 12)).toBe(1);
  });
});

describe('scaleLine', () => {
  it('mengalikan jumlah input dan jumlah dasar, field lain tetap', () => {
    const line = { name: 'Tepung', amount: 2, unit: 'cup', amountBase: 240 };
    expect(scaleLine(line, 1.5)).toEqual({ name: 'Tepung', amount: 3, unit: 'cup', amountBase: 360 });
  });
});

describe('formatMultiplier', () => {
  it('format singkat dengan koma', () => {
    expect(formatMultiplier(0.5)).toBe('×½');
    expect(formatMultiplier(2)).toBe('×2');
    expect(formatMultiplier(1.5)).toBe('×1,5');
    expect(formatMultiplier(1 / 3)).toBe('×0,33');
  });
});
