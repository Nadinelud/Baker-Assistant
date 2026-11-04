import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Screen, useUndo } from '@/components';
import { createIngredient } from '@/db/ingredients';
import { IngredientForm } from '@/features/stock/IngredientForm';

export default function NewIngredientScreen() {
  const db = useSQLiteContext();
  const undo = useUndo();

  return (
    <Screen hasHeader>
      <IngredientForm
        mode="create"
        submitLabel="Simpan bahan"
        onSubmit={async ({ initialStock, ...input }) => {
          await createIngredient(db, input, initialStock);
          undo.show({ message: 'Tersimpan' });
          router.back();
        }}
      />
    </Screen>
  );
}
