import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ChoiceChips, Input, ListRow, Text } from '@/components';
import type { IngredientDetail } from '@/db/ingredients';
import { BASE_UNIT_OPTIONS } from '@/lib/stockLabels';
import { formatAmount, type BaseUnit } from '@/lib/units';
import { spacing } from '@/theme';

type IngredientPickerProps = {
  ingredients: IngredientDetail[];
  excludeIds: Set<number>;
  onPick: (ingredient: IngredientDetail) => void;
  // Kalau ada: bahan yang belum ada bisa dibuat langsung dari sini.
  onCreate?: (name: string, baseUnit: BaseUnit) => Promise<void>;
  // Kalau ada: bahan bisa ditulis di resep tanpa dicatat di stok (misalnya air, es batu).
  onAddUntracked?: (name: string) => void;
  // Isian awal kotak cari dan satuan dasar bahan baru (misalnya dari hasil impor resep).
  initialQuery?: string;
  initialBaseUnit?: BaseUnit;
};

const SHOWN_WITHOUT_SEARCH = 6;

export function IngredientPicker({
  ingredients,
  excludeIds,
  onPick,
  onCreate,
  onAddUntracked,
  initialQuery = '',
  initialBaseUnit = 'g',
}: IngredientPickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const [newBaseUnit, setNewBaseUnit] = useState<BaseUnit>(initialBaseUnit);
  const [error, setError] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const available = ingredients.filter((i) => !excludeIds.has(i.id));
  const matches = needle ? available.filter((i) => i.name.toLowerCase().includes(needle)) : available;
  const shown = needle ? matches : matches.slice(0, SHOWN_WITHOUT_SEARCH);
  const exactExists = ingredients.some((i) => i.name.toLowerCase() === needle);
  const canCreate = !!onCreate && needle !== '' && !exactExists;

  async function handleCreate() {
    if (!onCreate) return;
    try {
      await onCreate(query, newBaseUnit);
      setQuery('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat bahan. Coba lagi.');
    }
  }

  return (
    <View style={styles.container}>
      {onCreate || ingredients.length > SHOWN_WITHOUT_SEARCH ? (
        <Input
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setError(null);
          }}
          placeholder={onCreate ? 'Cari atau ketik bahan baru' : 'Cari bahan'}
          autoCorrect={false}
        />
      ) : null}

      <View>
        {shown.map((ingredient, index) => (
          <ListRow
            key={ingredient.id}
            icon="add-circle-outline"
            title={ingredient.name}
            subtitle={`Stok ${formatAmount(ingredient.stock, ingredient.baseUnit)}`}
            onPress={() => {
              onPick(ingredient);
              setQuery('');
            }}
            showChevron={false}
            showDivider={index < shown.length - 1}
          />
        ))}
        {!needle && matches.length > shown.length ? (
          <Text variant="caption" color="textMuted">
            {matches.length - shown.length} bahan lain, ketik untuk mencari.
          </Text>
        ) : null}
        {needle && shown.length === 0 && !canCreate ? (
          <Text variant="caption" color="textMuted">
            Tidak ada bahan bernama "{query.trim()}".
          </Text>
        ) : null}
      </View>

      {canCreate ? (
        <View style={styles.create}>
          <Text variant="bodyStrong">Bahan baru: {query.trim()}</Text>
          <Text variant="caption" color="textMuted">
            Pilih satuan dasar. Stok awalnya 0, bisa diisi nanti di tab Stok.
          </Text>
          <ChoiceChips options={BASE_UNIT_OPTIONS} value={newBaseUnit} onChange={setNewBaseUnit} />
          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}
          <Button label="Buat bahan" icon="add-outline" variant="outline" onPress={handleCreate} />
        </View>
      ) : null}

      {onAddUntracked && needle !== '' ? (
        <View style={styles.create}>
          <Button
            label={`Tulis "${query.trim()}" tanpa stok`}
            icon="document-text-outline"
            variant="text"
            onPress={() => {
              onAddUntracked(query.trim());
              setQuery('');
            }}
          />
          <Text variant="caption" color="textMuted">
            Tertulis di resep, tidak dicatat dan tidak dipotong dari stok. Cocok untuk air atau es batu.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  create: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
});
