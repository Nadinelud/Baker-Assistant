import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, EmptyState, ListRow, Screen, SectionHeader, Text } from '@/components';
import { listOrders, type OrderSummary } from '@/db/orders';
import type { Db } from '@/db/types';
import { OrderRow } from '@/features/orders/OrderRow';
import { formatRelativeDay } from '@/lib/dates';
import { dateKey, parsePickup } from '@/lib/pickup';
import { useFocusData } from '@/lib/useFocusData';

function loadUpcoming(db: Db) {
  return listOrders(db, 'upcoming');
}

function groupByDate(orders: OrderSummary[]): [string, OrderSummary[]][] {
  const groups = new Map<string, OrderSummary[]>();
  for (const order of orders) {
    const key = dateKey(order.pickupAt);
    groups.set(key, [...(groups.get(key) ?? []), order]);
  }
  return [...groups];
}

export default function OrdersScreen() {
  const { data: orders } = useFocusData(loadUpcoming);

  if (orders === null) return <Screen>{null}</Screen>;
  const groups = groupByDate(orders);

  return (
    <Screen>
      <Text variant="title">Pesanan</Text>

      {orders.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          message="Belum ada pesanan. Catat pesanan pertama kamu."
          action={{ label: 'Tambah pesanan', onPress: () => router.push('/orders/new') }}
        />
      ) : (
        <>
          <Button label="Tambah pesanan" icon="add-outline" onPress={() => router.push('/orders/new')} />
          {groups.map(([key, list]) => {
            const hasNew = list.some((o) => o.status === 'new');
            return (
              <View key={key}>
                <SectionHeader
                  title={formatRelativeDay(parsePickup(`${key}T00:00`))}
                  action={
                    hasNew
                      ? { label: 'Cek bahan', onPress: () => router.push({ pathname: '/orders/needs/[date]', params: { date: key } }) }
                      : undefined
                  }
                />
                {list.map((order, index) => (
                  <OrderRow key={order.id} order={order} showDivider={index < list.length - 1} />
                ))}
              </View>
            );
          })}
        </>
      )}

      <ListRow icon="time-outline" title="Riwayat pesanan" subtitle="Selesai dan batal" onPress={() => router.push('/orders/past')} showDivider={false} />
    </Screen>
  );
}
