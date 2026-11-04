import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Screen, Text, useUndo } from '@/components';
import { deleteIngredient, getIngredient, updateIngredient } from '@/db/ingredients';
import type { Db } from '@/db/types';
import { IngredientForm } from '@/features/stock/IngredientForm';
import { useFocusData } from '@/lib/useFocusData';
import { spacing } from '@/theme';

export default function EditIngredientScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const undo = useUndo();
  const load = useCallback((db: Db) => getIngredient(db, id), [id]);
  const { data: ingredient, db } = useFocusData(load);

  function confirmDelete() {
    if (!ingredient) return;
    Alert.alert(
      `Hapus ${ingredient.name}?`,
      'Bahan dan seluruh riwayat stoknya akan dihapus. Ini tidak bisa dibatalkan.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIngredient(db, id);
              undo.show({ message: `${ingredient.name} dihapus` });
              router.dismissTo('/stock');
            } catch (e) {
              Alert.alert('Tidak bisa dihapus', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  }

  if (!ingredient) return <Screen hasHeader>{null}</Screen>;

  return (
    <Screen hasHeader>
      <IngredientForm
        mode="edit"
        initial={ingredient}
        submitLabel="Simpan perubahan"
        onSubmit={async ({ name, minStock, conversions }) => {
          await updateIngredient(db, id, { name, minStock, conversions });
          undo.show({ message: 'Tersimpan' });
          router.back();
        }}
      />
      <View style={styles.danger}>
        <Text variant="caption" color="textMuted">
          Menghapus bahan juga menghapus seluruh riwayat stoknya.
        </Text>
        <Button label="Hapus bahan" variant="outline" danger onPress={confirmDelete} />
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
