import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/theme/navigation';

// Halaman daftar selalu ada di bawah, juga saat detail dibuka dari tab lain (misalnya Beranda),
// supaya selalu ada tombol kembali ke daftar.
export const unstable_settings = { anchor: 'index' };

export default function MoreLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="bake-logs" options={{ title: 'Riwayat bake' }} />
      <Stack.Screen name="settings" options={{ title: 'Pengaturan' }} />
    </Stack>
  );
}
