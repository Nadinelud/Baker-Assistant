// Scaling resep: kelipatan = jumlah yang diinginkan / yield_amount;
// kebutuhan bahan = amount_base x kelipatan.

export function multiplierFor(desired: number, yieldAmount: number): number {
  if (!(yieldAmount > 0) || !(desired > 0)) return 1;
  return desired / yieldAmount;
}

export type ScalableLine = { amount: number | null; amountBase: number | null };

// Takaran kosong ("secukupnya") tetap kosong.
export function scaleLine<T extends ScalableLine>(line: T, multiplier: number): T {
  return {
    ...line,
    amount: line.amount === null ? null : line.amount * multiplier,
    amountBase: line.amountBase === null ? null : line.amountBase * multiplier,
  };
}

// Kelipatan cepat yang ditawarkan di layar resep.
export const QUICK_MULTIPLIERS = [0.5, 1, 2, 3] as const;

// "×½", "×1", "×1,5"
export function formatMultiplier(multiplier: number): string {
  if (multiplier === 0.5) return '×½';
  const rounded = Math.round(multiplier * 100) / 100;
  return `×${String(rounded).replace('.', ',')}`;
}
