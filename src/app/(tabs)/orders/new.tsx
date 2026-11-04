import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Screen, useUndo } from '@/components';
import { createOrder } from '@/db/orders';
import { OrderForm } from '@/features/orders/OrderForm';
import { ensureNotificationPermission, syncNotifications } from '@/lib/notifications';

export default function NewOrderScreen() {
  const db = useSQLiteContext();
  const undo = useUndo();

  return (
    <Screen hasHeader>
      <OrderForm
        submitLabel="Simpan pesanan"
        onSubmit={async (input) => {
          const id = await createOrder(db, input);
          // Izin notifikasi diminta saat pesanan pertama, supaya pengingatnya jalan.
          await ensureNotificationPermission().catch(() => false);
          syncNotifications(db);
          undo.show({ message: 'Tersimpan' });
          router.replace({ pathname: '/orders/[id]', params: { id } });
        }}
      />
    </Screen>
  );
}
