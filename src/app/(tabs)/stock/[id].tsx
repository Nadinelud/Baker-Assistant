import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  AmountInput,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  ListRow,
  ProgressBar,
  readAmount,
  Screen,
  SectionHeader,
  Text,
  useUndo,
} from '@/components';
import { addConversion, getIngredient, isLowStock } from '@/db/ingredients';
import { canRevert, listMovements, recordPurchase, revertMovements, type Movement } from '@/db/stock';
import type { Db } from '@/db/types';
import { formatDateTime } from '@/lib/dates';
import { MOVEMENT_REASON_LABELS } from '@/lib/stockLabels';
import { useFocusData } from '@/lib/useFocusData';
import { formatAmount, formatNumber } from '@/lib/units';
import { spacing } from '@/theme';

async function loadDetail(db: Db, id: number) {
  const ingredient = await getIngredient(db, id);
  return { ingredient, movements: ingredient ? await listMovements(db, id) : [] };
}

function signedAmount(m: Movement, unit: string): string {
  const sign = m.amountBase > 0 ? '+' : '';
  return `${sign}${formatAmount(m.amountBase, unit)}`;
}

export default function IngredientDetailScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const undo = useUndo();
  const load = useCallback((db: Db) => loadDetail(db, id), [id]);
  const { data, db, reload } = useFocusData(load);

  const [amountText, setAmountText] = useState('');
  const [unit, setUnit] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (data === null) return <Screen hasHeader>{null}</Screen>;
  if (data.ingredient === null) {
    return (
      <Screen hasHeader>
        <EmptyState icon="alert-circle-outline" message="Bahan ini sudah tidak ada." />
      </Screen>
    );
  }

  const { movements } = data;
  const ingredient = data.ingredient;
  const selectedUnit = unit ?? ingredient.baseUnit;
  const low = isLowStock(ingredient);

  async function handlePurchase() {
    const result = readAmount(amountText, selectedUnit, ingredient);
    if (result.error !== null) return setError(result.error);
    setError(null);
    try {
      const movementId = await recordPurchase(db, ingredient.id, result.value, note);
      setAmountText('');
      setNote('');
      await reload();
      undo.show({
        message: `Stok ${ingredient.name} +${formatAmount(result.value, ingredient.baseUnit)}`,
        onUndo: async () => {
          await revertMovements(db, [movementId]);
          await reload();
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan. Coba lagi.');
    }
  }

  function confirmRevert(m: Movement) {
    if (!canRevert(m)) return;
    Alert.alert(
      'Batalkan perubahan ini?',
      `${MOVEMENT_REASON_LABELS[m.reason]} ${signedAmount(m, ingredient.baseUnit)} akan dibatalkan. Riwayatnya tetap tercatat.`,
      [
        { text: 'Tidak', style: 'cancel' },
        {
          text: 'Batalkan',
          onPress: async () => {
            try {
              await revertMovements(db, [m.id]);
              await reload();
            } catch (e) {
              Alert.alert('Tidak bisa dibatalkan', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  }

  return (
    <Screen hasHeader>
      <Stack.Screen
        options={{
          title: ingredient.name,
          headerRight: () => (
            <IconButton
              icon="create-outline"
              label="Ubah bahan"
              onPress={() => router.push({ pathname: '/stock/edit/[id]', params: { id: ingredient.id } })}
            />
          ),
        }}
      />

      <Card>
        <View style={styles.stockRow}>
          <Text variant="number" color={low ? 'accent' : 'text'}>
            {formatNumber(ingredient.stock)}{' '}
            <Text variant="body" color={low ? 'accent' : 'textMuted'}>
              {ingredient.baseUnit}
            </Text>
          </Text>
          {low ? <Badge label="Hampir habis" tone="accent" /> : null}
        </View>
        {ingredient.minStock > 0 ? (
          <>
            <ProgressBar value={ingredient.stock / ingredient.minStock} color={low ? 'accent' : 'success'} />
            <Text variant="caption" color="textMuted">
              Batas minimum {formatAmount(ingredient.minStock, ingredient.baseUnit)}
            </Text>
          </>
        ) : (
          <Text variant="caption" color="textMuted">
            Tanpa batas minimum. Atur lewat tombol ubah di kanan atas.
          </Text>
        )}
        {ingredient.conversions.length > 0 ? (
          <Text variant="caption" color="textMuted">
            {ingredient.conversions
              .map((c) => `1 ${c.unitName} = ${formatAmount(c.toBaseAmount, ingredient.baseUnit)}`)
              .join(' · ')}
          </Text>
        ) : null}
      </Card>

      <View style={styles.section}>
        <SectionHeader title="Tambah stok" />
        <AmountInput
          ingredient={ingredient}
          ingredientName={ingredient.name}
          onAddConversion={async (unitName, toBaseAmount) => {
            await addConversion(db, ingredient.id, { unitName, toBaseAmount });
            await reload();
          }}
          amountText={amountText}
          unit={selectedUnit}
          onChangeAmount={setAmountText}
          onChangeUnit={setUnit}
          label="Jumlah dibeli"
          error={error ?? undefined}
        />
        <Input label="Catatan, boleh kosong" value={note} onChangeText={setNote} placeholder="Beli di pasar" />
        <Button label="Tambah stok" icon="add-outline" onPress={handlePurchase} />
      </View>

      <View>
        <SectionHeader title="Riwayat" />
        {movements.length === 0 ? (
          <EmptyState icon="time-outline" message="Belum ada riwayat. Tambah stok untuk mulai mencatat." />
        ) : (
          <>
            <Text variant="caption" color="textMuted">
              Ketuk baris untuk membatalkan perubahan.
            </Text>
            {movements.map((m, index) => (
              <ListRow
                key={m.id}
                title={MOVEMENT_REASON_LABELS[m.reason]}
                subtitle={[formatDateTime(new Date(m.createdAt)), m.note].filter(Boolean).join(' · ')}
                onPress={canRevert(m) ? () => confirmRevert(m) : undefined}
                showChevron={false}
                showDivider={index < movements.length - 1}
                right={
                  <View style={styles.movementRight}>
                    <Text
                      variant="bodyStrong"
                      color={m.isReverted ? 'textMuted' : m.amountBase > 0 ? 'success' : 'text'}
                      style={m.isReverted ? styles.struck : undefined}
                    >
                      {signedAmount(m, ingredient.baseUnit)}
                    </Text>
                    {m.isReverted ? <Badge label="Dibatalkan" /> : null}
                  </View>
                }
              />
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
  movementRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
});
