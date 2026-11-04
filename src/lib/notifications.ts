// Notifikasi lokal (tanpa server). Isi notifikasi dihitung saat dijadwalkan, jadi semua jadwal
// dihitung ulang (syncNotifications) setiap app dibuka, ditutup, dan setelah pesanan berubah.
// Apa yang dijadwalkan ada di notificationPlan.ts.
import * as Notifications from 'expo-notifications';

import type { Db } from '@/db/types';

import { planNotifications } from './notificationPlan';

const CHANNEL_ID = 'pengingat';

export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Pengingat pesanan dan stok',
    importance: Notifications.AndroidImportance.HIGH,
  }).catch(() => {});
}

// Minta izin sekali (dipanggil saat pesanan pertama disimpan). true kalau diizinkan.
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

let syncing: Promise<void> | null = null;

// Hapus semua jadwal lama lalu jadwalkan ulang dari data terbaru. Diam saja kalau belum diizinkan.
export function syncNotifications(db: Db): Promise<void> {
  // Satu sinkron dalam satu waktu; yang berikutnya menunggu supaya jadwal tidak dobel.
  const run = async () => {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    const planned = await planNotifications(db);
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const item of planned) {
      await Notifications.scheduleNotificationAsync({
        content: { title: item.title, body: item.body },
        trigger:
          'date' in item
            ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.date, channelId: CHANNEL_ID }
            : {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: item.dailyHour,
                minute: 0,
                channelId: CHANNEL_ID,
              },
      });
    }
  };
  syncing = (syncing ?? Promise.resolve()).then(run, run).catch(() => {});
  return syncing;
}
