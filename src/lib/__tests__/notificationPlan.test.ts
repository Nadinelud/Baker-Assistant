/**
 * @jest-environment node
 */
import { createIngredient } from '@/db/ingredients';
import { createOrder, markBaked } from '@/db/orders';
import { createRecipe } from '@/db/recipes';
import { createMigratedTestDb } from '@/db/testing/createTestDb';

import { planNotifications } from '../notificationPlan';

async function setup() {
  const { db } = await createMigratedTestDb();
  const flour = await createIngredient(db, { name: 'Tepung', baseUnit: 'g', minStock: 0, conversions: [] }, 300);
  const recipe = await createRecipe(db, {
    name: 'Bolu',
    yieldAmount: 1,
    yieldUnit: 'loyang',
    steps: '',
    ingredients: [{ ingredientId: flour, amount: 200, unit: 'g' }],
  });
  return { db, flour, recipe };
}

const now = new Date(2026, 10, 1, 12, 0); // Minggu 1 Nov 2026, 12.00

describe('rencana notifikasi', () => {
  it('H-2 bahan kurang, H-1 mulai bikin, hari H jam ambil', async () => {
    const { db, recipe } = await setup();
    await createOrder(db, { customerName: 'Bu Rina', pickupAt: '2026-11-05T16:00', note: '', items: [{ recipeId: recipe, quantity: 2 }] });

    const planned = await planNotifications(db, now);
    expect(planned).toEqual([
      {
        title: 'Bahan kurang untuk pesanan Kamis, 5 Nov',
        body: 'Kurang Tepung 100 g. Cek daftar belanja.',
        date: new Date(2026, 10, 3, 19, 0),
      },
      { title: 'Besok ada 1 pesanan', body: 'Waktunya mulai bikin: 2 Bolu (Bu Rina).', date: new Date(2026, 10, 4, 8, 0) },
      { title: 'Pesanan diambil hari ini', body: 'Bu Rina jam 16.00', date: new Date(2026, 10, 5, 7, 0) },
    ]);
  });

  it('bahan cukup: tanpa notifikasi H-2; ambil pagi sekali: 1 jam sebelumnya', async () => {
    const { db, recipe } = await setup();
    await createOrder(db, { customerName: 'Dimas', pickupAt: '2026-11-05T06:30', note: '', items: [{ recipeId: recipe, quantity: 1 }] });
    const planned = await planNotifications(db, now);
    expect(planned.map((p) => p.title)).toEqual(['Besok ada 1 pesanan', 'Pesanan diambil hari ini']);
    expect(planned[1]).toMatchObject({ date: new Date(2026, 10, 5, 5, 30) });
  });

  it('pesanan sudah dibuat: hanya pengingat jam ambil; waktu yang sudah lewat dilewati', async () => {
    const { db, recipe } = await setup();
    const id = await createOrder(db, { customerName: 'A', pickupAt: '2026-11-02T15:00', note: '', items: [{ recipeId: recipe, quantity: 1 }] });
    await markBaked(db, id);
    const planned = await planNotifications(db, now);
    expect(planned).toEqual([
      { title: 'Pesanan diambil hari ini', body: 'A jam 15.00', date: new Date(2026, 10, 2, 7, 0) },
    ]);
  });

  it('ringkasan harian stok hampir habis', async () => {
    const { db } = await setup();
    await createIngredient(db, { name: 'Mentega', baseUnit: 'g', minStock: 500, conversions: [] }, 150);
    const planned = await planNotifications(db, now);
    expect(planned).toEqual([{ title: '1 bahan hampir habis', body: 'Mentega (sisa 150 g).', dailyHour: 8 }]);
  });
});
