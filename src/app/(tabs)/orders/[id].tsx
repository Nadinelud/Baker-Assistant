import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, EmptyState, IconButton, ListRow, Screen, SectionHeader, Text, useUndo } from '@/components';
import { cancelOrder, deleteOrder, getOrder, markBaked, markDone, undoMarkBaked } from '@/db/orders';
import type { Db } from '@/db/types';
import { STATUS_LABELS } from '@/features/orders/OrderRow';
import { formatShortDate, formatTime } from '@/lib/dates';
import { syncNotifications } from '@/lib/notifications';
import { dateKey, parsePickup } from '@/lib/pickup';
import { formatMultiplier } from '@/lib/scaling';
import { useFocusData } from '@/lib/useFocusData';
import { formatNumber } from '@/lib/units';
import { spacing } from '@/theme';

async function load(db: Db, id: number) {
  return { order: await getOrder(db, id) };
}

export default function OrderDetailScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const undo = useUndo();
  const loader = useCallback((db: Db) => load(db, id), [id]);
  const { data, db, reload } = useFocusData(loader);

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
  const pickup = parsePickup(current.pickupAt);

  async function run(task: () => Promise<void>) {
    try {
      await task();
      await reload();
      syncNotifications(db);
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : String(e));
    }
  }

  function handleBaked() {
    run(async () => {
      const movementIds = await markBaked(db, id);
      undo.show({
        message: 'Ditandai sudah dibuat, stok dipotong',
        onUndo: async () => {
          await undoMarkBaked(db, id, movementIds);
          await reload();
          syncNotifications(db);
        },
      });
    });
  }

  function handleDone() {
    const note = current.stockDeducted ? '' : ' Stok bahannya dipotong sekarang karena belum ditandai sudah dibuat.';
    Alert.alert('Tandai selesai?', `Pesanan sudah diambil.${note}`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Selesai', onPress: () => run(() => markDone(db, id)) },
    ]);
  }

  function handleCancel() {
    const stockNote = current.stockDeducted ? ' Stok yang sudah dipotong tidak dikembalikan.' : '';
    Alert.alert('Batalkan pesanan ini?', `Pesanan pindah ke riwayat sebagai batal.${stockNote}`, [
      { text: 'Tidak', style: 'cancel' },
      { text: 'Batalkan pesanan', style: 'destructive', onPress: () => run(() => cancelOrder(db, id)) },
    ]);
  }

  function handleDelete() {
    Alert.alert(`Hapus pesanan ${current.customerName}?`, 'Pesanan dihapus dari riwayat. Stok tidak berubah.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteOrder(db, id);
            syncNotifications(db);
            undo.show({ message: 'Pesanan dihapus' });
            router.back();
          } catch (e) {
            Alert.alert('Gagal', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  return (
    <Screen hasHeader>
      <Stack.Screen
        options={{
          title: '',
          headerRight:
            current.status === 'new'
              ? () => (
                  <IconButton
                    icon="create-outline"
                    label="Ubah pesanan"
                    onPress={() => router.push({ pathname: '/orders/edit/[id]', params: { id } })}
                  />
                )
              : undefined,
        }}
      />

      <View style={styles.header}>
        <Text variant="title">{current.customerName}</Text>
        <Text color="textMuted">
          Diambil {formatShortDate(pickup)}, jam {formatTime(pickup)}
        </Text>
        <Badge
          label={STATUS_LABELS[current.status]}
          tone={current.status === 'baked' || current.status === 'done' ? 'success' : 'neutral'}
        />
      </View>

      <View>
        <SectionHeader title="Item" />
        {current.items.map((item, index) => (
          <ListRow
            key={item.id}
            title={item.recipeName}
            titleLines={2}
            subtitle={`${formatMultiplier(item.multiplier)} dari resep`}
            right={
              <Text variant="number">
                {formatNumber(item.quantity)}{' '}
                <Text variant="caption" color="textMuted">
                  {item.yieldUnit}
                </Text>
              </Text>
            }
            onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: item.recipeId } })}
            showDivider={index < current.items.length - 1}
          />
        ))}
      </View>

      {current.note ? (
        <Card title="Catatan">
          <Text>{current.note}</Text>
        </Card>
      ) : null}

      {current.status === 'new' ? (
        <ListRow
          icon="clipboard-outline"
          title="Cek bahan untuk tanggal ini"
          subtitle="Semua pesanan baru di tanggal yang sama"
          onPress={() => router.push({ pathname: '/orders/needs/[date]', params: { date: dateKey(current.pickupAt) } })}
          showDivider={false}
        />
      ) : null}

      {current.status === 'new' ? (
        <View style={styles.actions}>
          <Button label="Tandai sudah dibuat" icon="checkmark-outline" onPress={handleBaked} />
          <Text variant="caption" color="textMuted">
            Stok semua bahan untuk pesanan ini langsung dipotong.
          </Text>
          <Button label="Tandai selesai" variant="outline" onPress={handleDone} />
        </View>
      ) : current.status === 'baked' ? (
        <View style={styles.actions}>
          <Button label="Tandai selesai" icon="checkmark-done-outline" onPress={handleDone} />
          <Text variant="caption" color="textMuted">
            Tekan setelah pesanan diambil.
          </Text>
        </View>
      ) : null}

      {current.status === 'new' || current.status === 'baked' ? (
        <Button label="Batalkan pesanan" variant="text" danger onPress={handleCancel} />
      ) : (
        <View style={styles.actions}>
          <Text variant="caption" color="textMuted">
            Pesanan ini sudah {current.status === 'done' ? 'selesai' : 'dibatalkan'}.
          </Text>
          <Button label="Hapus pesanan" icon="trash-outline" variant="outline" danger onPress={handleDelete} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
});
