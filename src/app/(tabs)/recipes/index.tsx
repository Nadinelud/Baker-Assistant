import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, EmptyState, Input, ListRow, Photo, Screen, SectionHeader, Text } from '@/components';
import { listRecipes, type RecipeSummary } from '@/db/recipes';
import { formatDaysAgo } from '@/lib/dates';
import { useFocusData } from '@/lib/useFocusData';
import { formatNumber } from '@/lib/units';
import { spacing } from '@/theme';

function subtitle(recipe: RecipeSummary): string {
  const parts = [`v${recipe.versionNumber}`, `${formatNumber(recipe.yieldAmount)} ${recipe.yieldUnit}`];
  parts.push(recipe.lastBakedAt ? `di-bake ${formatDaysAgo(new Date(recipe.lastBakedAt)).toLowerCase()}` : 'belum pernah di-bake');
  return parts.join(' · ');
}

function openRecipe(id: number) {
  router.push({ pathname: '/recipes/[id]', params: { id } });
}

export default function RecipesScreen() {
  const { data: recipes } = useFocusData(listRecipes);
  const [query, setQuery] = useState('');

  if (recipes === null) return <Screen>{null}</Screen>;

  const needle = query.trim().toLowerCase();
  const visible = needle ? recipes.filter((r) => r.name.toLowerCase().includes(needle)) : recipes;
  const regular = visible.filter((r) => !r.isDraft);
  const drafts = visible.filter((r) => r.isDraft);

  return (
    <Screen>
      <Text variant="title">Resep</Text>

      {recipes.length === 0 ? (
        <>
          <EmptyState
            icon="book-outline"
            message="Belum ada resep. Tambah resep pertama kamu."
            action={{ label: 'Tambah resep', onPress: () => router.push('/recipes/new') }}
          />
          <Button label="Dari foto atau link" icon="camera-outline" variant="outline" onPress={() => router.push('/recipes/import')} />
        </>
      ) : (
        <>
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button label="Tambah resep" icon="add-outline" onPress={() => router.push('/recipes/new')} />
            </View>
            <View style={styles.flex}>
              <Button label="Foto / link" icon="camera-outline" variant="outline" onPress={() => router.push('/recipes/import')} />
            </View>
          </View>
          {recipes.length > 6 ? (
            <Input value={query} onChangeText={setQuery} placeholder="Cari resep" autoCorrect={false} />
          ) : null}

          {visible.length === 0 ? (
            <EmptyState icon="search-outline" message={`Tidak ada resep bernama "${query.trim()}".`} />
          ) : null}

          {regular.length > 0 ? (
            <View>
              {regular.map((recipe, index) => (
                <ListRow
                  key={recipe.id}
                  leading={<Photo uri={recipe.photoUri} shape="thumbnail" />}
                  title={recipe.name}
                  subtitle={subtitle(recipe)}
                  onPress={() => openRecipe(recipe.id)}
                  showDivider={index < regular.length - 1}
                />
              ))}
            </View>
          ) : null}

          {drafts.length > 0 ? (
            <View>
              <SectionHeader title="Draft" />
              <Text variant="caption" color="textMuted">
                Dari potong stok. Lengkapi lalu simpan supaya jadi resep biasa.
              </Text>
              {drafts.map((recipe, index) => (
                <ListRow
                  key={recipe.id}
                  leading={<Photo uri={recipe.photoUri} shape="thumbnail" />}
                  title={recipe.name}
                  subtitle={subtitle(recipe)}
                  right={<Badge label="Draft" />}
                  onPress={() => openRecipe(recipe.id)}
                  showDivider={index < drafts.length - 1}
                />
              ))}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
});
