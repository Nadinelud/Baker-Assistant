import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  ChoiceChips,
  EmptyState,
  Icon,
  IconButton,
  Input,
  ListRow,
  Screen,
  SectionHeader,
  Text,
  useUndo,
} from '@/components';
import { listBakeLogs } from '@/db/bakeLogs';
import { getRecipe, setActiveVersion } from '@/db/recipes';
import type { Db } from '@/db/types';
import { BakeLogRow } from '@/features/bakes/BakeLogRow';
import { RecipeIngredientList } from '@/features/recipes/RecipeIngredientList';
import { formatDateTime } from '@/lib/dates';
import { formatMultiplier, multiplierFor, QUICK_MULTIPLIERS } from '@/lib/scaling';
import { splitSteps } from '@/lib/steps';
import { useFocusData } from '@/lib/useFocusData';
import { formatNumber, parseAmount } from '@/lib/units';
import { spacing } from '@/theme';

const RECENT_LOGS = 5;

async function loadDetail(db: Db, id: number, versionId?: number) {
  const recipe = await getRecipe(db, id, versionId);
  return { recipe, logs: recipe ? await listBakeLogs(db, { recipeId: id, limit: RECENT_LOGS }) : [] };
}

export default function RecipeDetailScreen() {
  const params = useLocalSearchParams<{ id: string; version?: string }>();
  const id = Number(params.id);
  const versionId = params.version ? Number(params.version) : undefined;
  const undo = useUndo();
  const load = useCallback((db: Db) => loadDetail(db, id, versionId), [id, versionId]);
  const { data, db, reload } = useFocusData(load);
  const [desiredText, setDesiredText] = useState<string | null>(null);

  if (data === null) return <Screen hasHeader>{null}</Screen>;
  const { recipe, logs } = data;
  if (!recipe) {
    return (
      <Screen hasHeader>
        <EmptyState icon="alert-circle-outline" message="Resep ini sudah tidak ada." />
      </Screen>
    );
  }

  const recipeId = recipe.id;
  const { version } = recipe;
  const isActive = version.id === recipe.activeVersionId;
  const desired = desiredText === null ? recipe.yieldAmount : (parseAmount(desiredText) ?? recipe.yieldAmount);
  const multiplier = multiplierFor(desired, recipe.yieldAmount);
  const quickValue = QUICK_MULTIPLIERS.find((m) => Math.abs(m - multiplier) < 1e-9);
  const steps = splitSteps(version.steps);

  async function makeActive() {
    try {
      await setActiveVersion(db, recipeId, version.id);
      router.setParams({ version: undefined });
      await reload();
      undo.show({ message: `v${version.versionNumber} sekarang versi aktif` });
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen hasHeader>
      <Stack.Screen
        options={{
          title: '',
          headerRight: isActive
            ? () => (
                <IconButton
                  icon="create-outline"
                  label="Ubah resep"
                  onPress={() => router.push({ pathname: '/recipes/edit/[id]', params: { id: recipe.id } })}
                />
              )
            : undefined,
        }}
      />

      <Text variant="title">{recipe.name}</Text>

      <View style={styles.meta}>
        <Badge label={`v${version.versionNumber}${isActive ? '' : ' (bukan versi aktif)'}`} />
        {recipe.isDraft ? <Badge label="Draft" tone="accent" /> : null}
      </View>
      {version.ovenTemp !== null || version.durationMin !== null ? (
        <View style={styles.oven}>
          <Icon name="flame-outline" color="textMuted" />
          <Text color="textMuted">
            {[
              version.ovenTemp !== null ? `${version.ovenTemp}°C` : null,
              version.durationMin !== null ? `${version.durationMin} menit` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      ) : null}

      {!isActive ? (
        <Card>
          <Text>Kamu sedang melihat versi lama. Bake dan scaling memakai versi ini.</Text>
          <Button label="Jadikan versi aktif" variant="outline" onPress={makeActive} />
        </Card>
      ) : null}

      <Card title="Mau bikin berapa?">
        <View style={styles.scaleRow}>
          <Input
            variant="number"
            value={desiredText ?? formatNumber(recipe.yieldAmount)}
            onChangeText={setDesiredText}
            keyboardType="decimal-pad"
            accessibilityLabel={`Jumlah ${recipe.yieldUnit} yang mau dibuat`}
          />
          <Text style={styles.flex}>{recipe.yieldUnit}</Text>
          <Text variant="number">{formatMultiplier(multiplier)}</Text>
        </View>
        <ChoiceChips
          options={QUICK_MULTIPLIERS.map((m) => ({ value: String(m), label: formatMultiplier(m) }))}
          value={quickValue === undefined ? '' : String(quickValue)}
          onChange={(value) => setDesiredText(formatNumber(recipe.yieldAmount * Number(value)))}
        />
        <Text variant="caption" color="textMuted">
          Resep asli untuk {formatNumber(recipe.yieldAmount)} {recipe.yieldUnit}.
        </Text>
      </Card>

      <RecipeIngredientList lines={version.ingredients} multiplier={multiplier} />

      <Button
        label="Bake ini"
        icon="flame-outline"
        onPress={() =>
          router.push({
            pathname: '/bake',
            params: { recipeId: recipe.id, versionId: version.id, multiplier: String(multiplier) },
          })
        }
      />

      <View style={styles.section}>
        <SectionHeader title="Langkah" />
        {steps.length === 0 ? (
          <Text color="textMuted">Belum ada langkah. Tambahkan lewat tombol ubah di kanan atas.</Text>
        ) : (
          steps.map((step, index) => (
            <View key={index} style={styles.step}>
              <Text variant="bodyStrong" color="textMuted" style={styles.stepNumber}>
                {index + 1}
              </Text>
              <Text style={styles.flex}>{step}</Text>
            </View>
          ))
        )}
      </View>


      <View>
        <SectionHeader
          title="Riwayat bake"
          action={logs.length > 0 ? { label: 'Semua', onPress: () => router.push('/more/bake-logs') } : undefined}
        />
        {logs.length === 0 ? (
          <Text color="textMuted">Belum pernah di-bake. Catatan hasil muncul di sini setelah Selesai bake.</Text>
        ) : (
          logs.map((log, index) => (
            <BakeLogRow key={log.id} log={log} showRecipe={false} showDivider={index < logs.length - 1} />
          ))
        )}
      </View>

      <View>
        <SectionHeader title="Versi" />
        {recipe.versions.map((v, index) => {
          const parts = [formatDateTime(new Date(v.createdAt))];
          if (v.bakeCount > 0) parts.push(`di-bake ${v.bakeCount}x`);
          if (v.changeNote) parts.unshift(v.changeNote);
          return (
            <ListRow
              key={v.id}
              title={`v${v.versionNumber}`}
              subtitle={parts.join(' · ')}
              right={
                v.id === recipe.activeVersionId ? (
                  <Badge label="Aktif" tone="success" />
                ) : v.id === version.id ? (
                  <Badge label="Dilihat" />
                ) : null
              }
              onPress={
                v.id === version.id
                  ? undefined
                  : () => router.setParams({ version: v.id === recipe.activeVersionId ? undefined : String(v.id) })
              }
              showDivider={index < recipe.versions.length - 1}
            />
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  oven: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scaleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  section: {
    gap: spacing.md,
  },
  step: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stepNumber: {
    minWidth: spacing.xl,
  },
});
