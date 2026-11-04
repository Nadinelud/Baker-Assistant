import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Screen, Text, useUndo } from '@/components';
import { deleteRecipe, getRecipe, saveRecipe } from '@/db/recipes';
import type { Db } from '@/db/types';
import { amountToText, RecipeForm } from '@/features/recipes/RecipeForm';
import { deletePhotoFiles } from '@/lib/photos';
import { useFocusData } from '@/lib/useFocusData';
import { spacing } from '@/theme';

export default function EditRecipeScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const undo = useUndo();
  const load = useCallback((db: Db) => getRecipe(db, id), [id]);
  const { data: recipe, db } = useFocusData(load);

  if (!recipe) return <Screen hasHeader>{null}</Screen>;

  function confirmDelete() {
    if (!recipe) return;
    Alert.alert(
      `Hapus ${recipe.name}?`,
      'Resep, semua versi, dan catatan bake-nya akan dihapus. Riwayat stok tidak berubah. Ini tidak bisa dibatalkan.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              deletePhotoFiles(await deleteRecipe(db, id));
              undo.show({ message: `${recipe.name} dihapus` });
              router.dismissTo('/recipes');
            } catch (e) {
              Alert.alert('Tidak bisa dihapus', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  }

  return (
    <Screen hasHeader>
      <Text variant="caption" color="textMuted">
        Mengubah v{recipe.version.versionNumber} (versi aktif)
      </Text>
      <RecipeForm
        mode="edit"
        initial={{
          name: recipe.name,
          yieldAmount: recipe.yieldAmount,
          yieldUnit: recipe.yieldUnit,
          steps: recipe.version.steps,
          ovenTemp: recipe.version.ovenTemp,
          durationMin: recipe.version.durationMin,
          lines: recipe.version.ingredients.map((l) => ({
            ingredientId: l.ingredientId,
            name: l.ingredientId === null ? l.ingredientName : undefined,
            amountText: amountToText(l.amount),
            unit: l.unit,
            note: l.note,
            section: l.section,
          })),
        }}
        onSubmit={async (input, saveMode, changeNote) => {
          await saveRecipe(db, id, input, saveMode, changeNote);
          undo.show({ message: saveMode === 'new_version' ? 'Tersimpan sebagai versi baru' : 'Tersimpan' });
          router.back();
        }}
      />
      <View style={styles.danger}>
        <Text variant="caption" color="textMuted">
          Menghapus resep juga menghapus semua versi dan catatan bake-nya.
        </Text>
        <Button label="Hapus resep" variant="outline" danger onPress={confirmDelete} />
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
