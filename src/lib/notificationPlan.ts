// Apa saja notifikasi yang dijadwalkan, dihitung dari data saat ini (tanpa efek samping, bisa dites).
//  - H-2 19.00: bahan yang masih kurang untuk pesanan tanggal itu (hanya kalau ada yang kurang)
//  - H-1 08.00: pengingat mulai membuat pesanan besok
//  - Hari H 07.00 (atau 1 jam sebelum ambil kalau lebih pagi): jam ambil tiap pesanan
//  - Setiap hari 08.00: ringkasan bahan hampir habis (hanya kalau ada)
import { listLowStock } from '@/db/ingredients';
import { getDateNeeds, listOrders, type OrderSummary } from '@/db/orders';
import type { Db } from '@/db/types';

import { formatShortDayMonth, formatTime } from './dates';
import { addDays, atTime, dateKey, parsePickup } from './pickup';
import { formatAmount } from './units';

export const NOTIFY_TIMES = {
  shortageDaysBefore: 2,
  shortageHour: 19,
  makeDaysBefore: 1,
  makeHour: 8,
  pickupHour: 7,
  lowStockHour: 8,
} as const;

export type PlannedNotification = { title: string; body: string; date: Date } | { title: string; body: string; dailyHour: number };

function listNames(parts: string[], max = 3): string {
  if (parts.length <= max) return parts.join(', ');
  return `${parts.slice(0, max).join(', ')}, dan ${parts.length - max} lainnya`;
}

// Murni (tanpa efek samping) supaya bisa dites: apa saja yang akan dijadwalkan.
export async function planNotifications(db: Db, now: Date = new Date()): Promise<PlannedNotification[]> {
  const planned: PlannedNotification[] = [];
  const upcoming = (await listOrders(db, 'upcoming')).filter((o) => parsePickup(o.pickupAt) > now);

  const byDate = new Map<string, OrderSummary[]>();
  for (const order of upcoming) {
    const key = dateKey(order.pickupAt);
    byDate.set(key, [...(byDate.get(key) ?? []), order]);
  }

  for (const [key, orders] of byDate) {
    const day = parsePickup(`${key}T00:00`);
    const label = formatShortDayMonth(day);
    const newOrders = orders.filter((o) => o.status === 'new');

    const shortageAt = atTime(addDays(day, -NOTIFY_TIMES.shortageDaysBefore), NOTIFY_TIMES.shortageHour);
    if (shortageAt > now && newOrders.length > 0) {
      const short = (await getDateNeeds(db, key)).needs.filter((n) => n.shortBase > 0);
      if (short.length > 0) {
        planned.push({
          title: `Bahan kurang untuk pesanan ${label}`,
          body: `Kurang ${listNames(short.map((n) => `${n.name} ${formatAmount(n.shortBase, n.baseUnit)}`))}. Cek daftar belanja.`,
          date: shortageAt,
        });
      }
    }

    const makeAt = atTime(addDays(day, -NOTIFY_TIMES.makeDaysBefore), NOTIFY_TIMES.makeHour);
    if (makeAt > now && newOrders.length > 0) {
      planned.push({
        title: `Besok ada ${newOrders.length} pesanan`,
        body: `Waktunya mulai bikin: ${listNames(newOrders.map((o) => `${o.itemSummary} (${o.customerName})`), 2)}.`,
        date: makeAt,
      });
    }

    const firstPickup = parsePickup(orders[0].pickupAt);
    const morning = atTime(day, NOTIFY_TIMES.pickupHour);
    const oneHourBefore = new Date(firstPickup.getTime() - 60 * 60 * 1000);
    const pickupAt = oneHourBefore < morning ? oneHourBefore : morning;
    if (pickupAt > now) {
      planned.push({
        title: orders.length === 1 ? 'Pesanan diambil hari ini' : `${orders.length} pesanan diambil hari ini`,
        body: listNames(orders.map((o) => `${o.customerName} jam ${formatTime(parsePickup(o.pickupAt))}`), 4),
        date: pickupAt,
      });
    }
  }

  const low = await listLowStock(db);
  if (low.length > 0) {
    planned.push({
      title: `${low.length} bahan hampir habis`,
      body: `${listNames(low.map((i) => `${i.name} (sisa ${formatAmount(i.stock, i.baseUnit)})`))}.`,
      dailyHour: NOTIFY_TIMES.lowStockHour,
    });
  }

  return planned;
}

