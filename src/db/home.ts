import { getRecentBakes, type LastBake, type RecentBakedRecipe } from './bakes';
import { countIngredients, listLowStock, type IngredientWithStock } from './ingredients';
import type { Db } from './types';

export type HomeSummary = {
  recipeCount: number;
  ingredientCount: number;
  bakesThisMonth: number;
  lowStock: IngredientWithStock[];
  lastBake: LastBake | null;
  recentRecipes: RecentBakedRecipe[];
};

export async function getHomeSummary(db: Db, now: Date = new Date()): Promise<HomeSummary> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const [recipes, bakes, ingredientCount, lowStock, recent] = await Promise.all([
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM recipes WHERE is_draft = 0'),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM bake_logs WHERE baked_at >= ?', monthStart),
    countIngredients(db),
    listLowStock(db),
    getRecentBakes(db),
  ]);
  return {
    recipeCount: recipes?.n ?? 0,
    ingredientCount,
    bakesThisMonth: bakes?.n ?? 0,
    lowStock,
    lastBake: recent.last,
    recentRecipes: recent.others,
  };
}
