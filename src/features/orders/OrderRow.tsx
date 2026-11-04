import { router } from 'expo-router';

import { Badge, ListRow } from '@/components';
import type { OrderStatus, OrderSummary } from '@/db/orders';
import { formatShortDate, formatTime } from '@/lib/dates';
import { parsePickup } from '@/lib/pickup';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Baru',
  baked: 'Sudah dibuat',
  done: 'Selesai',
  cancelled: 'Batal',
};

type OrderRowProps = {
  order: OrderSummary;
  // Di daftar yang dikelompokkan per tanggal, cukup tampilkan jam.
  showDate?: boolean;
  showDivider?: boolean;
  now?: Date;
};

export function OrderRow({ order, showDate = false, showDivider = true, now = new Date() }: OrderRowProps) {
  const pickup = parsePickup(order.pickupAt);
  const late = order.status === 'new' && pickup < now;
  const when = showDate ? `${formatShortDate(pickup)}, ${formatTime(pickup)}` : formatTime(pickup);

  return (
    <ListRow
      title={order.customerName}
      titleLines={2}
      subtitle={`${when} · ${order.itemSummary}`}
      right={
        late ? (
          <Badge label="Lewat jam ambil" tone="accent" />
        ) : order.status === 'new' ? null : (
          <Badge label={STATUS_LABELS[order.status]} tone={order.status === 'baked' || order.status === 'done' ? 'success' : 'neutral'} />
        )
      }
      onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
      showDivider={showDivider}
    />
  );
}
