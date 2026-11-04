import { addDays, atTime, dateKey, parsePickup, toPickupString } from '../pickup';

describe('waktu ambil', () => {
  it('format lokal tanpa zona waktu, bolak-balik', () => {
    const date = new Date(2026, 10, 5, 16, 5);
    expect(toPickupString(date)).toBe('2026-11-05T16:05');
    expect(parsePickup('2026-11-05T16:05').getTime()).toBe(date.getTime());
  });

  it('urutan teks sama dengan urutan waktu', () => {
    const values = ['2026-11-05T16:00', '2026-11-05T08:00', '2026-12-01T07:30', '2026-11-10T09:00'];
    expect([...values].sort()).toEqual(['2026-11-05T08:00', '2026-11-05T16:00', '2026-11-10T09:00', '2026-12-01T07:30']);
  });

  it('kunci tanggal, tambah hari lewat akhir bulan, jam tertentu', () => {
    expect(dateKey('2026-11-05T16:00')).toBe('2026-11-05');
    expect(dateKey(new Date(2026, 0, 9, 23, 59))).toBe('2026-01-09');
    expect(toPickupString(addDays(new Date(2026, 10, 30, 10, 0), 2))).toBe('2026-12-02T10:00');
    expect(toPickupString(atTime(new Date(2026, 10, 5, 16, 0), 19))).toBe('2026-11-05T19:00');
  });
});
