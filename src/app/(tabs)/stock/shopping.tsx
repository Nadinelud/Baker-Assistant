import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AmountInput,
  Badge,
  Button,
  EmptyState,
  Icon,
  Input,
  ListRow,
  readAmount,
  Screen,
  SectionHeader,
  Text,
  useUndo,
} from '@/components';
import { addConversion, listIngredientDetails } from '@/db/ingredients';
import {
  addShoppingItem,
  clearBought,
  getShoppingList,
  markBought,
  removeShoppingItems,
  undoBought,
  type ShoppingEntry,
} from '@/db/shopping';
import type { Db } from '@/db/types';
import { useFocusData } from '@/lib/useFocusData';
import { formatAmount, formatNumber } from '@/lib/units';
import { colors, sizes, spacing } from '@/theme';

async function loadShopping(db: Db) {
  const [list, ingredients] = await Promise.all([getShoppingList(db), listIngredientDetails(db)]);
  return { list, ingredients };
}

function entrySubtitle(entry: ShoppingEntry): string {
  const stock = `sisa ${formatAmount(entry.stock, entry.baseUnit)}`;
  if (entry.status === 'empty') return 'Stok habis';
  if (entry.status === 'low') return `Hampir habis, ${stock}`;
  return `Ditambah manual, ${stock}`;
}

export default function ShoppingScreen() {
  const undo = useUndo();
  const { data, db, reload } = useFocusData(loadShopping);
  const [openId, setOpenId] = useState<number | null>(null);
  const [amountText, setAmountText] = useState('');
  const [unit, setUnit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  if (data === null) return <Screen hasHeader>{null}</Screen>;

  const { list, ingredients } = data;
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const onList = new Set(list.toBuy.map((e) => e.ingredientId));
  const needle = query.trim().toLowerCase();
  const candidates = ingredients.filter(
    (i) => !onList.has(i.id) && (needle === '' || i.name.toLowerCase().includes(needle)),
  );

  function toggle(entry: ShoppingEntry) {
    if (openId === entry.ingredientId) return setOpenId(null);
    setOpenId(entry.ingredientId);
    setAmountText(entry.amountBase === null ? '' : formatNumber(entry.amountBase));
    setUnit(entry.baseUnit);
    setError(null);
  }

  async function handleBought(entry: ShoppingEntry) {
    const ingredient = byId.get(entry.ingredientId)!;
    const amount = readAmount(amountText, unit, ingredient);
    if (amount.error !== null) return setError(amount.error);
    try {
      const wasStored = entry.itemIds.length > 0;
      const result = await markBought(db, entry, amount.value);
      setOpenId(null);
      await reload();
      undo.show({
        message: `${entry.name} +${formatAmount(amount.value, entry.baseUnit)} masuk stok`,
        onUndo: async () => {
          await undoBought(db, result, wasStored);
          await reload();
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan. Coba lagi.');
    }
  }

  async function handleRemove(entry: ShoppingEntry) {
    await removeShoppingItems(db, entry.itemIds);
    setOpenId(null);
    await reload();
  }

  async function handleAdd(ingredientId: number) {
    await addShoppingItem(db, ingredientId);
    setPicking(false);
    setQuery('');
    await reload();
  }

  async function handleClearBought() {
    await clearBought(db);
    await reload();
  }

  return (
    <Screen hasHeader>
      <Text color="textMuted">Bahan yang habis atau hampir habis masuk ke sini sendiri. Ketuk bahan setelah dibeli.</Text>

      <View>
        <SectionHeader
          title="Perlu dibeli"
          action={
            ingredients.length > 0
              ? { label: picking ? 'Tutup' : 'Tambah bahan', onPress: () => setPicking((p) => !p) }
              : undefined
          }
        />

        {picking ? (
          <View style={styles.picker}>
            {ingredients.length > 6 ? (
              <Input value={query} onChangeText={setQuery} placeholder="Cari bahan" autoCorrect={false} />
            ) : null}
            {candidates.length === 0 ? (
              <Text variant="caption" color="textMuted">
                {needle ? `Tidak ada bahan bernama "${query.trim()}".` : 'Semua bahan sudah ada di daftar.'}
              </Text>
            ) : (
              candidates.map((ingredient, index) => (
                <ListRow
                  key={ingredient.id}
                  icon="add-circle-outline"
                  title={ingredient.name}
                  subtitle={`Stok ${formatAmount(ingredient.stock, ingredient.baseUnit)}`}
                  onPress={() => handleAdd(ingredient.id)}
                  showChevron={false}
                  showDivider={index < candidates.length - 1}
                />
              ))
            )}
          </View>
        ) : null}

        {list.toBuy.length === 0 ? (
          <EmptyState
            icon="cart-outline"
            message={
              ingredients.length === 0
                ? 'Belum ada bahan. Tambah bahan di tab Stok dulu.'
                : 'Tidak ada yang perlu dibeli. Semua stok aman.'
            }
          />
        ) : (
          list.toBuy.map((entry, index) => {
            const open = openId === entry.ingredientId;
            const ingredient = byId.get(entry.ingredientId);
            return (
              <View
                key={entry.ingredientId}
                style={[styles.entry, index < list.toBuy.length - 1 && styles.divider]}
              >
                <ListRow
                  leading={<Icon name="ellipse-outline" color="textMuted" />}
                  title={entry.name}
                  subtitle={entrySubtitle(entry)}
                  onPress={() => toggle(entry)}
                  showChevron={false}
                  showDivider={false}
                  right={
                    entry.amountBase !== null ? (
                      <Text variant="bodyStrong">{formatAmount(entry.amountBase, entry.baseUnit)}</Text>
                    ) : entry.status === 'empty' ? (
                      <Badge label="Habis" tone="accent" />
                    ) : entry.status === 'low' ? (
                      <Badge label="Hampir habis" tone="accent" />
                    ) : null
                  }
                />
                {open && ingredient ? (
                  <View style={styles.form}>
                    <AmountInput
                      ingredient={ingredient}
                      ingredientName={ingredient.name}
                      onAddConversion={async (unitName, toBaseAmount) => {
                        await addConversion(db, ingredient.id, { unitName, toBaseAmount });
                        await reload();
                      }}
                      amountText={amountText}
                      unit={unit}
                      onChangeAmount={(text) => {
                        setAmountText(text);
                        setError(null);
                      }}
                      onChangeUnit={setUnit}
                      label="Jumlah dibeli"
                      error={error ?? undefined}
                    />
                    <Button label="Sudah dibeli" icon="checkmark-outline" onPress={() => handleBought(entry)} />
                    {entry.itemIds.length > 0 ? (
                      <Button label="Hapus dari daftar" variant="text" danger onPress={() => handleRemove(entry)} />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      {list.bought.length > 0 ? (
        <View>
          <SectionHeader title="Sudah dibeli" action={{ label: 'Bersihkan', onPress: handleClearBought }} />
          {list.bought.map((item, index) => (
            <ListRow
              key={item.itemId}
              leading={<Icon name="checkmark-circle-outline" color="success" />}
              title={item.name}
              subtitle={item.amountBase !== null ? formatAmount(item.amountBase, item.baseUnit) : undefined}
              showDivider={index < list.bought.length - 1}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  picker: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  entry: {
    paddingBottom: spacing.xs,
  },
  divider: {
    borderBottomWidth: sizes.borderWidth,
    borderBottomColor: colors.border,
  },
  form: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
});
