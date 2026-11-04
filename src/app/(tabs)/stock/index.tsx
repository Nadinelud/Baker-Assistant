import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  EmptyState,
  Input,
  ListRow,
  Screen,
  SectionHeader,
  StockLevelRow,
  Text,
} from '@/components';
import { isLowStock, listIngredientsWithStock } from '@/db/ingredients';
import { countToBuy } from '@/db/shopping';
import type { Db } from '@/db/types';
import { useFocusData } from '@/lib/useFocusData';
import { spacing } from '@/theme';

async function loadStock(db: Db) {
  const [ingredients, shoppingCount] = await Promise.all([listIngredientsWithStock(db), countToBuy(db)]);
  return { ingredients, shoppingCount };
}

export default function StockScreen() {
  const { data } = useFocusData(loadStock);
  const [query, setQuery] = useState('');

  if (data === null) return <Screen>{null}</Screen>;

  const { ingredients, shoppingCount } = data;

  const lowCount = ingredients.filter(isLowStock).length;
  const needle = query.trim().toLowerCase();
  const visible = needle ? ingredients.filter((i) => i.name.toLowerCase().includes(needle)) : ingredients;

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="title">Stok</Text>
        {lowCount > 0 ? <Badge label={`${lowCount} hampir habis`} tone="accent" /> : null}
      </View>

      {ingredients.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          message="Belum ada bahan. Tambah bahan pertama kamu."
          action={{ label: 'Tambah bahan', onPress: () => router.push('/stock/new') }}
        />
      ) : (
        <>
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label="Potong stok" icon="remove-outline" onPress={() => router.push('/deduct')} />
            </View>
            <View style={styles.action}>
              <Button
                label="Cek stok"
                icon="clipboard-outline"
                variant="outline"
                onPress={() => router.push('/stock-check')}
              />
            </View>
          </View>

          <ListRow
            icon="cart-outline"
            title="Daftar belanja"
            subtitle={shoppingCount > 0 ? `${shoppingCount} bahan perlu dibeli` : 'Semua stok aman'}
            onPress={() => router.push('/stock/shopping')}
            showDivider={false}
          />

          <View>
            <SectionHeader
              title="Bahan"
              action={{ label: 'Tambah bahan', onPress: () => router.push('/stock/new') }}
            />
            {ingredients.length > 6 ? (
              <Input value={query} onChangeText={setQuery} placeholder="Cari bahan" autoCorrect={false} />
            ) : null}
            {visible.length === 0 ? (
              <EmptyState icon="search-outline" message={`Tidak ada bahan bernama "${query.trim()}".`} />
            ) : (
              visible.map((item, index) => (
                <StockLevelRow
                  key={item.id}
                  name={item.name}
                  stock={item.stock}
                  minStock={item.minStock}
                  unit={item.baseUnit}
                  onPress={() => router.push({ pathname: '/stock/[id]', params: { id: item.id } })}
                  showDivider={index < visible.length - 1}
                />
              ))
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  action: {
    flex: 1,
  },
});
