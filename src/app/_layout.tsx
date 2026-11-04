import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { UndoProvider } from '@/components';
import { DATABASE_NAME } from '@/db';
import { migrate } from '@/db/migrate';
import { configureNotifications, syncNotifications } from '@/lib/notifications';
import { stackScreenOptions } from '@/theme/navigation';

SplashScreen.preventAutoHideAsync();
configureNotifications();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_500Medium,
    DMSans_400Regular,
    DMSans_500Medium,
  });

  // Tahan splash sampai font siap (atau gagal dimuat, supaya app tetap bisa dibuka).
  if (!fontsLoaded && !fontError) return null;

  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
      <HideSplashWhenReady />
      <NotificationSync />
      <StatusBar style="dark" />
      <UndoProvider>
        <Stack screenOptions={stackScreenOptions}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="deduct" options={{ title: 'Potong stok' }} />
          <Stack.Screen name="stock-check" options={{ title: 'Cek stok' }} />
          <Stack.Screen name="bake" options={{ title: 'Bake' }} />
          <Stack.Screen name="bake-note" options={{ title: 'Catatan bake' }} />
        </Stack>
      </UndoProvider>
    </SQLiteProvider>
  );
}

// Jadwal notifikasi dihitung ulang saat app dibuka dan saat ditinggalkan (data terbaru).
function NotificationSync() {
  const db = useSQLiteContext();
  useEffect(() => {
    syncNotifications(db);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') syncNotifications(db);
    });
    return () => subscription.remove();
  }, [db]);
  return null;
}

// SQLiteProvider baru merender anak setelah migrasi selesai.
function HideSplashWhenReady() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return null;
}
