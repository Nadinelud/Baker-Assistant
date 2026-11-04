/**
 * @jest-environment node
 */
import {
  addBakePhoto,
  deleteBakeLog,
  getBakeLog,
  getPreviousSettings,
  listBakeLogs,
  removeBakePhoto,
  updateBakeNotes,
} from '../bakeLogs';
import { completeBake, getRecentBakes } from '../bakes';
import { createIngredient } from '../ingredients';
import { createRecipe, getRecipe, saveRecipe } from '../recipes';
import { getCurrentStock } from '../stock';
import { createMigratedTestDb } from '../testing/createTestDb';

async function setup() {
  const { db, raw } = await createMigratedTestDb();
  const flour = await createIngredient(db, { name: 'Tepung', baseUnit: 'g', minStock: 0, conversions: [] }, 1000);
  const input = {
    name: 'Bolu',
    yieldAmount: 1,
    yieldUnit: 'loyang',
    steps: '',
    ingredients: [{ ingredientId: flour, amount: 200, unit: 'g' }],
  };
  const recipeId = await createRecipe(db, input);
  const versionId = (await getRecipe(db, recipeId))!.activeVersionId;
  return { db, raw, flour, input, recipeId, versionId };
}

describe('catatan bake', () => {
  it('mengisi suhu, durasi, hasil, dan nilai', async () => {
    const { db, versionId } = await setup();
    const { bakeLogId } = await completeBake(db, versionId, 2);

    await updateBakeNotes(db, bakeLogId, { ovenTemp: 170, durationMin: 35.4, resultNote: '  Pas, agak kering  ', rating: 4 });

    expect(await getBakeLog(db, bakeLogId)).toMatchObject({
      recipeName: 'Bolu',
      versionNumber: 1,
      multiplier: 2,
      yieldTotal: 2,
      yieldUnit: 'loyang',
      ovenTemp: 170,
      durationMin: 35,
      resultNote: 'Pas, agak kering',
      rating: 4,
      photos: [],
    });
  });

  it('boleh dikosongkan lagi, menolak nilai tidak masuk akal', async () => {
    const { db, versionId } = await setup();
    const { bakeLogId } = await completeBake(db, versionId, 1);
    await updateBakeNotes(db, bakeLogId, { ovenTemp: 170, durationMin: 30, resultNote: 'x', rating: 5 });
    await updateBakeNotes(db, bakeLogId, { ovenTemp: null, durationMin: null, resultNote: '   ', rating: null });
    expect(await getBakeLog(db, bakeLogId)).toMatchObject({ ovenTemp: null, durationMin: null, resultNote: null, rating: null });

    const empty = { ovenTemp: null, durationMin: null, resultNote: null, rating: null };
    await expect(updateBakeNotes(db, bakeLogId, { ...empty, rating: 6 })).rejects.toThrow('1 sampai 5');
    await expect(updateBakeNotes(db, bakeLogId, { ...empty, rating: 2.5 })).rejects.toThrow();
    await expect(updateBakeNotes(db, bakeLogId, { ...empty, ovenTemp: 1700 })).rejects.toThrow('Suhu');
    await expect(updateBakeNotes(db, bakeLogId, { ...empty, durationMin: 0 })).rejects.toThrow('Durasi');
    await expect(updateBakeNotes(db, 9999, empty)).rejects.toThrow('tidak ditemukan');
  });

  it('foto: tambah, urutan, hapus satu', async () => {
    const { db, versionId } = await setup();
    const { bakeLogId } = await completeBake(db, versionId, 1);
    const a = await addBakePhoto(db, bakeLogId, 'file:///a.jpg');
    await addBakePhoto(db, bakeLogId, 'file:///b.jpg');

    expect((await getBakeLog(db, bakeLogId))!.photos.map((p) => p.uri)).toEqual(['file:///a.jpg', 'file:///b.jpg']);
    expect(await removeBakePhoto(db, a)).toBe('file:///a.jpg');
    expect((await getBakeLog(db, bakeLogId))!.photos.map((p) => p.uri)).toEqual(['file:///b.jpg']);
  });

  it('riwayat terbaru dulu, bisa difilter per resep, dengan foto pertama', async () => {
    const { db, raw, input, recipeId, versionId } = await setup();
    const other = await createRecipe(db, { ...input, name: 'Nastar' });
    const r1 = await completeBake(db, versionId, 1);
    const r2 = await completeBake(db, (await getRecipe(db, other))!.activeVersionId, 1);
    raw.prepare('UPDATE bake_logs SET baked_at = ? WHERE id = ?').run('2026-11-01T08:00:00.000Z', r1.bakeLogId);
    raw.prepare('UPDATE bake_logs SET baked_at = ? WHERE id = ?').run('2026-11-02T08:00:00.000Z', r2.bakeLogId);
    await addBakePhoto(db, r1.bakeLogId, 'file:///bolu.jpg');

    const all = await listBakeLogs(db);
    expect(all.map((l) => l.recipeName)).toEqual(['Nastar', 'Bolu']);
    const bolu = await listBakeLogs(db, { recipeId });
    expect(bolu).toEqual([expect.objectContaining({ recipeName: 'Bolu', photoUri: 'file:///bolu.jpg', photoCount: 1 })]);
    expect(await listBakeLogs(db, { limit: 1 })).toHaveLength(1);

    const { last } = await getRecentBakes(db);
    expect(last).toMatchObject({ recipeName: 'Nastar', photoUri: null });
  });

  it('suhu dan durasi sebelumnya dari versi yang sama', async () => {
    const { db, input, recipeId, versionId } = await setup();
    const first = await completeBake(db, versionId, 1);
    await updateBakeNotes(db, first.bakeLogId, { ovenTemp: 175, durationMin: 40, resultNote: null, rating: null });
    const second = await completeBake(db, versionId, 1);
    expect(await getPreviousSettings(db, second.bakeLogId)).toEqual({ ovenTemp: 175, durationMin: 40 });

    await saveRecipe(db, recipeId, input, 'new_version');
    const v2 = (await getRecipe(db, recipeId))!.activeVersionId;
    const third = await completeBake(db, v2, 1);
    expect(await getPreviousSettings(db, third.bakeLogId)).toEqual({ ovenTemp: null, durationMin: null });
  });

  it('hapus catatan: foto ikut hilang, stok tetap', async () => {
    const { db, raw, flour, versionId } = await setup();
    const { bakeLogId } = await completeBake(db, versionId, 1);
    await addBakePhoto(db, bakeLogId, 'file:///a.jpg');

    expect(await deleteBakeLog(db, bakeLogId)).toEqual(['file:///a.jpg']);
    expect(await getBakeLog(db, bakeLogId)).toBeNull();
    expect(raw.prepare('SELECT COUNT(*) AS n FROM bake_log_photos').get()).toEqual({ n: 0 });
    expect(await getCurrentStock(db, flour)).toBe(800);
  });
});
