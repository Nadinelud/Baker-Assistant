import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, EmptyState, Screen, Text, useUndo } from '@/components';
import { deleteOrder, getOrder, updateOrder } from '@/db/orders';
import type { Db } from '@/db/types';
import { OrderForm } from '@/features/orders/OrderForm';
import { syncNotifications } from '@/lib/notifications';
import { useFocusData } from '@/lib/useFocusData';
import { spacing } from '@/theme';

async function load(db: Db, id: number) {
  return { order: await getOrder(db, id) };
}

export default function EditOrderScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const undo = useUndo();
  const loader = useCallback((db: Db) => load(db, id), [id]);
  const { data, db } = useFocusData(loader);

  if (data === null) return <Screen hasHeader>{null}</Screen>;
  const { order } = data;
  if (!order) {
    return (
      <Screen hasHeader>
        <EmptyState icon="alert-circle-outline" message="Pesanan ini sudah tidak ada." />
      </Screen>
    );
  }
  const current = order;

  function confirmDelete() {
    Alert.alert(`Hapus pesanan ${current.customerName}?`, 'Pesanan dihapus. Stok yang sudah dipotong tidak berubah.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          await deleteOrder(db, id);
          syncNotifications(db);
          undo.show({ message: 'Pesanan dihapus' });
          router.dismissTo('/orders');
        },
      },
    ]);
  }

  return (
    <Screen hasHeader>
      <OrderForm
        initial={{
          customerName: current.customerName,
          pickupAt: current.pickupAt,
          note: current.note ?? '',
          items: current.items.map((i) => ({ recipeId: i.recipeId, quantity: i.quantity })),
        }}
        submitLabel="Simpan perubahan"
        onSubmit={async (input) => {
          await updateOrder(db, id, input);
          syncNotifications(db);
          undo.show({ message: 'Tersimpan' });
          router.back();
        }}
      />
      <View style={styles.danger}>
        <Text variant="caption" color="textMuted">
          Pesanan yang tidak jadi sebaiknya ditandai batal supaya tetap tercatat. Hapus hanya untuk salah input.
        </Text>
        <Button label="Hapus pesanan" variant="outline" danger onPress={confirmDelete} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  danger: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
});
