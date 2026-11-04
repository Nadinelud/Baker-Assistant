import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, DateTimeField, EmptyState, Input, ListRow, SectionHeader, Text } from '@/components';
import type { OrderInput } from '@/db/orders';
import { listRecipes } from '@/db/recipes';
import { parsePickup, toPickupString } from '@/lib/pickup';
import { useFocusData } from '@/lib/useFocusData';
import { formatNumber, parseAmount } from '@/lib/units';
import { colors, sizes, spacing } from '@/theme';

type ItemDraft = { key: number; recipeId: number; quantityText: string };

export type OrderFormInitial = {
  customerName: string;
  pickupAt: string | null;
  note: string;
  items: { recipeId: number; quantity: number }[];
};

type OrderFormProps = {
  initial?: OrderFormInitial;
  submitLabel: string;
  onSubmit: (input: OrderInput) => Promise<void>;
};

let nextKey = 1;
const SHOWN_WITHOUT_SEARCH = 6;

export function OrderForm({ initial, submitLabel, onSubmit }: OrderFormProps) {
  const { data: recipes } = useFocusData(listRecipes);
  const [customerName, setCustomerName] = useState(initial?.customerName ?? '');
  const [pickup, setPickup] = useState<Date | null>(initial?.pickupAt ? parsePickup(initial.pickupAt) : null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [items, setItems] = useState<ItemDraft[]>(() =>
    (initial?.items ?? []).map((i) => ({ key: nextKey++, recipeId: i.recipeId, quantityText: formatNumber(i.quantity) })),
  );
  const [query, setQuery] = useState('');
  const [itemErrors, setItemErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (recipes === null) return null;
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const chosen = new Set(items.map((i) => i.recipeId));
  const needle = query.trim().toLowerCase();
  const matches = recipes.filter((r) => !chosen.has(r.id) && (needle === '' || r.name.toLowerCase().includes(needle)));
  const shown = needle ? matches : matches.slice(0, SHOWN_WITHOUT_SEARCH);

  function addItem(recipeId: number) {
    const recipe = byId.get(recipeId);
    setItems((list) => [...list, { key: nextKey++, recipeId, quantityText: recipe ? formatNumber(recipe.yieldAmount) : '' }]);
    setQuery('');
  }

  async function handleSubmit() {
    if (!pickup) return setError('Pilih tanggal dan jam ambil.');
    const errors: Record<number, string> = {};
    const parsed = items.map((item) => {
      const quantity = parseAmount(item.quantityText);
      if (quantity === null || quantity <= 0) errors[item.key] = 'Isi jumlah dengan angka, misalnya 24.';
      return { recipeId: item.recipeId, quantity: quantity ?? 0 };
    });
    setItemErrors(errors);
    if (Object.keys(errors).length > 0) return setError('Periksa jumlah item yang ditandai.');

    setError(null);
    setSaving(true);
    try {
      await onSubmit({ customerName, pickupAt: toPickupString(pickup), note, items: parsed });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan. Coba lagi.');
      setSaving(false);
    }
  }

  if (recipes.length === 0) {
    return <EmptyState icon="book-outline" message="Belum ada resep. Tambah resep dulu supaya bisa dipesan." />;
  }

  return (
    <View style={styles.form}>
      <Input label="Nama pemesan" value={customerName} onChangeText={setCustomerName} placeholder="Bu Rina" />
      <DateTimeField label="Diambil" value={pickup} onChange={setPickup} />

      <View style={styles.section}>
        <SectionHeader title="Item" />
        {items.length === 0 ? (
          <Text variant="caption" color="textMuted">
            Belum ada item. Pilih resep di bawah.
          </Text>
        ) : null}
        {items.map((item) => {
          const recipe = byId.get(item.recipeId);
          if (!recipe) return null;
          const quantity = parseAmount(item.quantityText);
          return (
            <View key={item.key} style={styles.item}>
              <View style={styles.itemHeader}>
                <Text variant="bodyStrong" style={styles.flex} numberOfLines={2}>
                  {recipe.name}
                </Text>
                <Button
                  label="Hapus"
                  variant="text"
                  danger
                  onPress={() => setItems((list) => list.filter((i) => i.key !== item.key))}
                />
              </View>
              <View style={styles.quantityRow}>
                <Input
                  variant="number"
                  value={item.quantityText}
                  onChangeText={(text) => {
                    setItems((list) => list.map((i) => (i.key === item.key ? { ...i, quantityText: text } : i)));
                    setItemErrors(({ [item.key]: _, ...rest }) => rest);
                  }}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Jumlah ${recipe.name}`}
                  error={itemErrors[item.key]}
                />
                <Text style={styles.flex}>{recipe.yieldUnit}</Text>
              </View>
              {quantity !== null && quantity > 0 ? (
                <Text variant="caption" color="textMuted">
                  ×{formatNumber(quantity / recipe.yieldAmount)} dari resep ({formatNumber(recipe.yieldAmount)}{' '}
                  {recipe.yieldUnit})
                </Text>
              ) : null}
            </View>
          );
        })}

        <View style={styles.picker}>
          {recipes.length > SHOWN_WITHOUT_SEARCH ? (
            <Input value={query} onChangeText={setQuery} placeholder="Cari resep" autoCorrect={false} />
          ) : null}
          {shown.map((recipe, index) => (
            <ListRow
              key={recipe.id}
              icon="add-circle-outline"
              title={recipe.name}
              subtitle={`${formatNumber(recipe.yieldAmount)} ${recipe.yieldUnit} per resep`}
              onPress={() => addItem(recipe.id)}
              showChevron={false}
              showDivider={index < shown.length - 1}
            />
          ))}
          {needle && shown.length === 0 ? (
            <Text variant="caption" color="textMuted">
              Tidak ada resep bernama "{query.trim()}".
            </Text>
          ) : null}
        </View>
      </View>

      <Input label="Catatan, boleh kosong" value={note} onChangeText={setNote} placeholder="Tulisan di kue: Selamat ulang tahun" />

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
      <Button label={saving ? 'Menyimpan...' : submitLabel} onPress={handleSubmit} disabled={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  item: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomWidth: sizes.borderWidth,
    borderBottomColor: colors.border,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  picker: {
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
