import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, ListRow, Screen, SectionHeader, Text, useUndo } from '@/components';
import { addShortagesToShopping, getDateNeeds } from '@/db/orders';
import type { Db } from '@/db/types';
import { OrderRow } from '@/features/orders/OrderRow';
import { formatShortDate } from '@/lib/dates';
import { parsePickup } from '@/lib/pickup';
import { useFocusData } from '@/lib/useFocusData';
import { formatAmount } from '@/lib/units';
import { spacing } from '@/theme';

export default function DateNeedsScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const undo = useUndo();
  const loader = useCallback((db: Db) => getDateNeeds(db, date), [date]);
  const { data, db, reload } = useFocusData(loader);
  const [adding, setAdding] = useState(false);

  if (data === null) return <Screen hasHeader>{null}</Screen>;
  const { orders, needs } = data;
  const short = needs.filter((n) => n.shortBase > 0);

  async function handleAddToShopping() {
    setAdding(true);
    const count = await addShortagesToShopping(db, needs);
    await reload();
    setAdding(false);
    undo.show({ message: `${count} bahan masuk daftar belanja` });
  }

  return (
    <Screen hasHeader>
      <View style={styles.header}>
        <Text variant="title">{formatShortDate(parsePickup(`${date}T00:00`))}</Text>
        <Text color="textMuted">
          Total bahan untuk {orders.length} pesanan baru di tanggal ini, dibanding stok sekarang.
        </Text>
      </View>

      {orders.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" message="Tidak ada pesanan baru di tanggal ini." />
      ) : (
        <>
          {short.length > 0 ? (
            <Card>
              <Text variant="bodyStrong" color="accent">
                {short.length} bahan kurang
              </Text>
              <Button
                label={adding ? 'Menambahkan...' : 'Tambah ke daftar belanja'}
                icon="cart-outline"
                onPress={handleAddToShopping}
                disabled={adding}
              />
              <Button label="Buka daftar belanja" variant="text" onPress={() => router.push('/stock/shopping')} />
            </Card>
          ) : (
            <Card>
              <Text variant="bodyStrong" color="success">
                Bahan cukup untuk semua pesanan tanggal ini
              </Text>
            </Card>
          )}

          <View>
            <SectionHeader title="Bahan" />
            {needs.map((need, index) => (
              <ListRow
                key={need.ingredientId}
                title={need.name}
                titleLines={2}
                subtitle={
                  need.shortBase > 0
                    ? `Stok ${formatAmount(need.stock, need.baseUnit)}, kurang ${formatAmount(need.shortBase, need.baseUnit)}`
                    : `Stok ${formatAmount(need.stock, need.baseUnit)}`
                }
                right={
                  <Text variant="bodyStrong" color={need.shortBase > 0 ? 'accent' : 'text'}>
                    {formatAmount(need.needBase, need.baseUnit)}
                  </Text>
                }
                showDivider={index < needs.length - 1}
              />
            ))}
          </View>

          <View>
            <SectionHeader title="Pesanan" />
            {orders.map((order, index) => (
              <OrderRow key={order.id} order={order} showDivider={index < orders.length - 1} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
});
