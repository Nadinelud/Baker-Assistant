import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, ListRow, Screen, Text } from '@/components';
import { completeBake, getBakeNeeds } from '@/db/bakes';
import { getRecipe } from '@/db/recipes';
import type { Db } from '@/db/types';
import { formatMultiplier } from '@/lib/scaling';
import { useFocusData } from '@/lib/useFocusData';
import { formatAmount, formatNumber } from '@/lib/units';
import { spacing } from '@/theme';

async function loadBake(db: Db, recipeId: number, versionId: number, multiplier: number) {
  const recipe = await getRecipe(db, recipeId, versionId);
  if (!recipe) return { recipe: null, needs: [] };
  return { recipe, needs: await getBakeNeeds(db, versionId, multiplier) };
}

export default function BakeScreen() {
  const params = useLocalSearchParams<{ recipeId: string; versionId: string; multiplier: string }>();
  const recipeId = Number(params.recipeId);
  const versionId = Number(params.versionId);
  const multiplier = Number(params.multiplier) > 0 ? Number(params.multiplier) : 1;
  const load = useCallback((db: Db) => loadBake(db, recipeId, versionId, multiplier), [recipeId, versionId, multiplier]);
  const { data, db } = useFocusData(load);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data === null) return <Screen hasHeader bottomInset>{null}</Screen>;
  const { recipe, needs } = data;
  if (!recipe) {
    return (
      <Screen hasHeader bottomInset>
        <EmptyState icon="alert-circle-outline" message="Resep ini sudah tidak ada." />
      </Screen>
    );
  }

  const short = needs.filter((n) => n.shortBase > 0);
  const total = recipe.yieldAmount * multiplier;

  async function handleDone() {
    if (!recipe) return;
    setSaving(true);
    setError(null);
    try {
      const result = await completeBake(db, versionId, multiplier);
      // Satu getar per aksi, di saat yang sama dengan hasilnya (tidak pernah satu-satunya tanda;
      // layar catatan juga menulis "Bake tercatat"). Batalkan ada di layar catatan.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace({ pathname: '/bake-note', params: { id: result.bakeLogId, fresh: '1' } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mencatat bake. Coba lagi.');
      setSaving(false);
    }
  }

  return (
    <Screen hasHeader bottomInset>
      <View style={styles.header}>
        <Text variant="title">{recipe.name}</Text>
        <Text color="textMuted">
          v{recipe.version.versionNumber} · {formatMultiplier(multiplier)} · {formatNumber(total)} {recipe.yieldUnit}
          {recipe.version.ovenTemp !== null ? ` · ${recipe.version.ovenTemp}°C` : ''}
          {recipe.version.durationMin !== null ? ` · ${recipe.version.durationMin} menit` : ''}
        </Text>
      </View>

      {short.length > 0 ? (
        <Card>
          <Text variant="bodyStrong" color="accent">
            Stok tercatat kurang untuk {short.length} bahan
          </Text>
          <Text color="textMuted">
            Bake tetap bisa dicatat. Stok bahan itu akan minus sampai kamu tambah stok atau cek stok.
          </Text>
        </Card>
      ) : null}

      <View>
        <Text variant="heading">Bahan yang dipotong</Text>
        {needs.map((need, index) => (
          <ListRow
            key={need.ingredientId}
            title={need.name}
            titleLines={2}
            subtitle={
              need.shortBase > 0
                ? `Stok ${formatAmount(need.stock, need.baseUnit)}, kurang ${formatAmount(need.shortBase, need.baseUnit)}`
                : `Stok ${formatAmount(need.stock, need.baseUnit)}`
            }
            showDivider={index < needs.length - 1}
            right={
              <Text variant="bodyStrong" color={need.shortBase > 0 ? 'accent' : 'text'}>
                {formatAmount(need.needBase, need.baseUnit)}
              </Text>
            }
          />
        ))}
      </View>

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
      <Button
        label={saving ? 'Mencatat...' : 'Selesai bake'}
        icon="checkmark-outline"
        onPress={handleDone}
        disabled={saving}
      />
      <Text variant="caption" color="textMuted">
        Tekan setelah kue selesai dibuat. Stok semua bahan di atas langsung dipotong, lalu kamu bisa isi catatan hasil.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
});
