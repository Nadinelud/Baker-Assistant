import { View } from 'react-native';

import { EmptyState, Screen } from '@/components';
import { listOrders } from '@/db/orders';
import type { Db } from '@/db/types';
import { OrderRow } from '@/features/orders/OrderRow';
import { useFocusData } from '@/lib/useFocusData';

function loadPast(db: Db) {
  return listOrders(db, 'past');
}

export default function PastOrdersScreen() {
  const { data: orders } = useFocusData(loadPast);

  if (orders === null) return <Screen hasHeader>{null}</Screen>;

  return (
    <Screen hasHeader>
      {orders.length === 0 ? (
        <EmptyState icon="time-outline" message="Belum ada pesanan yang selesai atau batal." />
      ) : (
        <View>
          {orders.map((order, index) => (
            <OrderRow key={order.id} order={order} showDate showDivider={index < orders.length - 1} />
          ))}
        </View>
      )}
    </Screen>
  );
}
