import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  EmptyState,
  ListRow,
  Photo,
  PhotoCard,
  Screen,
  SectionHeader,
  StatStrip,
  StockLevelRow,
  Text,
} from '@/components';
import type { LastBake } from '@/db/bakes';
import { getHomeSummary } from '@/db/home';
import { formatDaysAgo, formatLongDate } from '@/lib/dates';
import { formatMultiplier } from '@/lib/scaling';
import { formatNumber } from '@/lib/units';
import { useFocusData } from '@/lib/useFocusData';
import { spacing } from '@/theme';

const LOW_STOCK_LIMIT = 5;

function lastBakeMeta(bake: LastBake): string {
  const parts = [formatDaysAgo(new Date(bake.bakedAt)), `${formatNumber(bake.yieldAmount)} ${bake.yieldUnit}`];
  if (bake.multiplier !== 1) parts.push(formatMultiplier(bake.multiplier));
  if (bake.ovenTemp !== null && bake.durationMin !== null) parts.push(`${bake.ovenTemp}°C, ${bake.durationMin} menit`);
  return parts.join(' · ');
}

function openRecipe(id: number) {
  router.push({ pathname: '/recipes/[id]', params: { id } });
}

export default function HomeScreen() {
  const { data: summary } = useFocusData(getHomeSummary);

  if (summary === null) return <Screen>{null}</Screen>;

  const lowStock = summary.lowStock.slice(0, LOW_STOCK_LIMIT);
  const moreLow = summary.lowStock.length - lowStock.length;

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="caption" color="textMuted">
          {formatLongDate(new Date())}
        </Text>
        <Text variant="title">Hari ini di dapur</Text>
      </View>

      <View style={styles.block}>
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button label="Tambah resep" icon="add-outline" onPress={() => router.push('/recipes/new')} />
          </View>
          <View style={styles.action}>
            <Button label="Potong stok" icon="remove-outline" variant="outline" onPress={() => router.push('/deduct')} />
          </View>
        </View>
        <StatStrip
          stats={[
            { value: summary.recipeCount, label: 'resep' },
            { value: summary.ingredientCount, label: 'bahan' },
            { value: summary.bakesThisMonth, label: 'bake bulan ini' },
          ]}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Terakhir di-bake"
          action={summary.recipeCount > 0 ? { label: 'Semua resep', onPress: () => router.push('/recipes') } : undefined}
        />
        {summary.lastBake === null ? (
          <EmptyState
            icon="book-outline"
            message={
              summary.recipeCount === 0
                ? 'Belum ada resep. Resep yang terakhir di-bake akan muncul di sini.'
                : 'Belum ada yang di-bake. Buka resep lalu tekan Bake ini.'
            }
          />
        ) : (
          <View>
            <PhotoCard
              title={summary.lastBake.recipeName}
              badge={`v${summary.lastBake.versionNumber}`}
              meta={lastBakeMeta(summary.lastBake)}
              note={summary.lastBake.resultNote}
              photoUri={summary.lastBake.photoUri}
              onPress={() => openRecipe(summary.lastBake!.recipeId)}
            />
            {summary.recentRecipes.map((recipe, index) => (
              <ListRow
                key={recipe.recipeId}
                leading={<Photo uri={recipe.photoUri} shape="thumbnail" />}
                title={recipe.name}
                subtitle={formatDaysAgo(new Date(recipe.lastBakedAt))}
                onPress={() => openRecipe(recipe.recipeId)}
                showDivider={index < summary.recentRecipes.length - 1}
              />
            ))}
          </View>
        )}
      </View>

      <View>
        <SectionHeader
          title="Hampir habis"
          action={moreLow > 0 ? { label: `${moreLow} lainnya`, onPress: () => router.push('/stock') } : undefined}
        />
        {summary.ingredientCount === 0 ? (
          <Text color="textMuted">Belum ada bahan. Tambah bahan di tab Stok.</Text>
        ) : lowStock.length === 0 ? (
          <Text color="textMuted">Semua stok aman.</Text>
        ) : (
          lowStock.map((item, index) => (
            <StockLevelRow
              key={item.id}
              name={item.name}
              stock={item.stock}
              minStock={item.minStock}
              unit={item.baseUnit}
              onPress={() => router.push({ pathname: '/stock/[id]', params: { id: item.id } })}
              showDivider={index < lowStock.length - 1}
            />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  block: {
    gap: spacing.lg,
  },
  section: {
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  action: {
    flex: 1,
  },
});
