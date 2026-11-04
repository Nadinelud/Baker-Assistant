import { Tabs } from 'expo-router';

import { Icon, type IconName } from '@/components';
import { colors, sizes, typography } from '@/theme';

function tabIcon(name: IconName) {
  return ({ focused }: { focused: boolean }) => <Icon name={name} color={focused ? 'accent' : 'textMuted'} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        // Tab yang ditinggalkan kembali ke halaman awalnya, jadi menekan tab selalu membuka daftar.
        popToTopOnBlur: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: typography.caption.fontFamily, fontSize: typography.caption.fontSize },
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: sizes.borderWidth,
          elevation: 0,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Beranda', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="recipes" options={{ title: 'Resep', tabBarIcon: tabIcon('book-outline') }} />
      <Tabs.Screen name="stock" options={{ title: 'Stok', tabBarIcon: tabIcon('cube-outline') }} />
      <Tabs.Screen name="orders" options={{ title: 'Pesanan', tabBarIcon: tabIcon('receipt-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'Lainnya', tabBarIcon: tabIcon('ellipsis-horizontal-outline') }} />
    </Tabs>
  );
}
