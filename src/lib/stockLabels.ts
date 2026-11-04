import type { MovementReason } from '@/db/stock';
import type { BaseUnit } from '@/lib/units';

export const MOVEMENT_REASON_LABELS: Record<MovementReason, string> = {
  purchase: 'Beli',
  bake: 'Bake',
  quick_deduct: 'Potong cepat',
  stock_check: 'Cek stok',
  order: 'Pesanan',
  adjustment: 'Penyesuaian',
  revert: 'Pembatalan',
};

export const BASE_UNIT_OPTIONS: readonly { value: BaseUnit; label: string }[] = [
  { value: 'g', label: 'gram (g)' },
  { value: 'ml', label: 'mililiter (ml)' },
  { value: 'pcs', label: 'buah (pcs)' },
];
