import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/theme/navigation';

// Halaman daftar selalu ada di bawah, juga saat detail dibuka dari tab lain (misalnya Beranda),
// supaya selalu ada tombol kembali ke daftar.
export const unstable_settings = { anchor: 'index' };

export default function StockLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="new" options={{ title: 'Tambah bahan' }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Ubah bahan' }} />
      <Stack.Screen name="shopping" options={{ title: 'Daftar belanja' }} />
    </Stack>
  );
}
