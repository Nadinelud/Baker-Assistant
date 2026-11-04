import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Screen, useUndo } from '@/components';
import { createRecipe } from '@/db/recipes';
import { RecipeForm, type RecipeFormInitial } from '@/features/recipes/RecipeForm';
import { formatNumber } from '@/lib/units';

type DraftLine = { ingredientId: number; amount: number; unit: string };

// Bahan dari potong cepat dikirim sebagai JSON di parameter "draft".
function initialFromDraft(draft: string | undefined): RecipeFormInitial | undefined {
  if (!draft) return undefined;
  try {
    const lines = JSON.parse(draft) as DraftLine[];
    return {
      name: '',
      yieldAmount: 1,
      yieldUnit: 'porsi',
      steps: '',
      lines: lines.map((l) => ({ ingredientId: l.ingredientId, amountText: formatNumber(l.amount), unit: l.unit })),
    };
  } catch {
    return undefined;
  }
}

export default function NewRecipeScreen() {
  const db = useSQLiteContext();
  const undo = useUndo();
  const { draft } = useLocalSearchParams<{ draft?: string }>();
  const initial = initialFromDraft(draft);
  const isDraft = initial !== undefined;

  return (
    <Screen hasHeader>
      <RecipeForm
        mode={isDraft ? 'draft' : 'create'}
        initial={initial}
        onSubmit={async (input) => {
          const id = await createRecipe(db, input, { isDraft });
          undo.show({ message: 'Tersimpan' });
          router.replace({ pathname: '/recipes/[id]', params: { id } });
        }}
      />
    </Screen>
  );
}
