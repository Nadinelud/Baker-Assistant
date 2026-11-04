import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, EmptyState, Input, Screen, Text, useUndo } from '@/components';
import { listForStockCheck, recordStockCheck, revertMovements, type StockCheckEntry } from '@/db/stock';
import { useFocusData } from '@/lib/useFocusData';
import { formatAmount, formatNumber, parseAmount, roundAmount } from '@/lib/units';
import { colors, sizes, spacing } from '@/theme';

export default function StockCheckScreen() {
  const undo = useUndo();
  const { data: items, db } = useFocusData(listForStockCheck);
  const [actuals, setActuals] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (items === null) return <Screen hasHeader bottomInset>{null}</Screen>;

  if (items.length === 0) {
    return (
      <Screen hasHeader bottomInset>
        <EmptyState
          icon="clipboard-outline"
          message="Belum ada bahan untuk dicek. Tambah bahan dulu."
          action={{ label: 'Tambah bahan', onPress: () => router.replace('/stock/new') }}
        />
      </Screen>
    );
  }

  async function handleSubmit() {
    if (!items) return;
    const entries: StockCheckEntry[] = [];
    for (const item of items) {
      const text = actuals[item.id]?.trim();
      if (!text) continue;
      const value = parseAmount(text);
      if (value === null) return setError(`Sisa ${item.name} harus angka, misalnya 250 atau 1,5.`);
      entries.push({ ingredientId: item.id, actualBase: value });
    }
    if (entries.length === 0) return setError('Isi sisa sebenarnya untuk minimal satu bahan.');

    setError(null);
    setSaving(true);
    try {
      const ids = await recordStockCheck(db, entries);
      undo.show(
        ids.length === 0
          ? { message: 'Tersimpan. Semua stok sudah sesuai.' }
          : {
              message: `Cek stok tersimpan, ${ids.length} bahan disesuaikan`,
              onUndo: () => revertMovements(db, ids).then(() => undefined),
            },
      );
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan. Coba lagi.');
      setSaving(false);
    }
  }

  return (
    <Screen hasHeader bottomInset>
      <Text color="textMuted">
        Hitung sisa di dapur, lalu ketik angkanya. Bahan yang dikosongkan tidak berubah. Yang paling sering dipakai ada
        di atas.
      </Text>

      <View>
        {items.map((item, index) => {
          const value = parseAmount(actuals[item.id] ?? '');
          const diff = value === null ? null : roundAmount(value - item.stock);
          return (
            <View key={item.id} style={[styles.row, index < items.length - 1 && styles.divider]}>
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="caption" color="textMuted">
                  Tercatat {formatAmount(item.stock, item.baseUnit)}
                  {diff !== null && diff !== 0
                    ? ` · selisih ${diff > 0 ? '+' : ''}${formatAmount(diff, item.baseUnit)}`
                    : ''}
                </Text>
              </View>
              <View style={styles.inputWrap}>
                <Input
                  variant="number"
                  value={actuals[item.id] ?? ''}
                  onChangeText={(text) => setActuals((prev) => ({ ...prev, [item.id]: text }))}
                  keyboardType="decimal-pad"
                  placeholder={formatNumber(item.stock)}
                  accessibilityLabel={`Sisa sebenarnya ${item.name} dalam ${item.baseUnit}`}
                />
                <Text variant="caption" color="textMuted">
                  {item.baseUnit}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
      <Button label={saving ? 'Menyimpan...' : 'Simpan cek stok'} onPress={handleSubmit} disabled={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: sizes.touchMin,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  divider: {
    borderBottomWidth: sizes.borderWidth,
    borderBottomColor: colors.border,
  },
  flex: {
    flex: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
