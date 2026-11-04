import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Screen, SectionHeader, Text, useUndo } from '@/components';
import { listAliases, saveAlias, type IngredientAlias } from '@/db/aliases';
import { createIngredient, listIngredientDetails, type IngredientDetail } from '@/db/ingredients';
import { createRecipe } from '@/db/recipes';
import type { Db } from '@/db/types';
import { clearPendingImport, getPendingImport } from '@/features/import/pendingImport';
import { IngredientPicker } from '@/features/recipes/IngredientPicker';
import { amountToText, RecipeForm, type LineInitial, type RecipeFormInitial } from '@/features/recipes/RecipeForm';
import { guessBaseUnit, matchIngredient, suggestMatch } from '@/lib/recipeImport/matching';
import type { ParsedIngredient } from '@/lib/recipeImport/types';
import { useFocusData } from '@/lib/useFocusData';
import { normalizeUnit, type BaseUnit } from '@/lib/units';
import { colors, sizes, spacing } from '@/theme';

// Keputusan untuk tiap bahan hasil baca.
//  stock: dicocokkan ke bahan di stok; untracked: ditulis di resep tanpa stok; skip: tidak masuk resep.
type Decision = {
  kind: 'stock' | 'untracked' | 'skip' | 'unmatched';
  ingredientId: number | null;
  note: string | null;
  // Siapa yang mencocokkan: AI, aturan di HP, nama persis sama, atau user. Yang otomatis perlu diperiksa.
  source: 'ai' | 'rule' | 'exact' | 'user' | null;
};

async function loadMatchingData(db: Db) {
  const [ingredients, aliases] = await Promise.all([listIngredientDetails(db), listAliases(db)]);
  return { ingredients, aliases };
}

function initialDecision(item: ParsedIngredient, ingredients: IngredientDetail[], aliases: IngredientAlias[]): Decision {
  if (item.stockName) {
    const byAi = ingredients.find((i) => i.name.toLowerCase() === item.stockName!.toLowerCase());
    if (byAi) return { kind: 'stock', ingredientId: byAi.id, note: item.note, source: 'ai' };
  }
  const exact = matchIngredient(item.name, ingredients, aliases);
  if (exact !== null) return { kind: 'stock', ingredientId: exact, note: item.note, source: 'exact' };
  const rule = suggestMatch(item, ingredients, aliases);
  if (rule) return { kind: 'stock', ingredientId: rule.ingredientId, note: rule.note, source: 'rule' };
  return { kind: 'unmatched', ingredientId: null, note: item.note, source: null };
}

// Urutkan per bagian sesuai kemunculan, simpan index asli.
function groupIndexes(items: ParsedIngredient[]): { section: string | null; indexes: number[] }[] {
  const groups: { section: string | null; indexes: number[] }[] = [];
  items.forEach((item, index) => {
    const group = groups.find((g) => g.section === item.section);
    if (group) group.indexes.push(index);
    else groups.push({ section: item.section, indexes: [index] });
  });
  return groups;
}

export default function ReviewImportScreen() {
  const db = useSQLiteContext();
  const undo = useUndo();
  const [pending] = useState(getPendingImport);
  const { data, reload } = useFocusData(loadMatchingData);
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [phase, setPhase] = useState<'match' | 'form'>('match');

  // Pencocokan otomatis sekali, setelah daftar bahan dimuat.
  useEffect(() => {
    if (!data || !pending || decisions) return;
    setDecisions(pending.recipe.ingredients.map((item) => initialDecision(item, data.ingredients, data.aliases)));
  }, [data, pending, decisions]);

  if (!pending) {
    return (
      <Screen hasHeader>
        <EmptyState
          icon="alert-circle-outline"
          message="Tidak ada hasil baca untuk diperiksa. Mulai lagi dari foto atau link."
          action={{ label: 'Kembali', onPress: () => router.back(), variant: 'outline' }}
        />
      </Screen>
    );
  }
  if (!data || !decisions) return <Screen hasHeader>{null}</Screen>;

  const { recipe } = pending;
  const byId = new Map(data.ingredients.map((i) => [i.id, i]));
  const unresolved = decisions.filter((d) => d.kind === 'unmatched').length;
  const autoMatched = decisions.filter((d) => d.kind === 'stock' && (d.source === 'ai' || d.source === 'rule')).length;
  const groups = groupIndexes(recipe.ingredients);
  const titled = groups.some((g) => g.section !== null);

  function decide(index: number, patch: Partial<Decision>) {
    setDecisions((list) => list!.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  async function createFor(index: number, name: string, baseUnit: BaseUnit) {
    const id = await createIngredient(db, { name, baseUnit, minStock: 0, conversions: [] });
    await reload();
    decide(index, { kind: 'stock', ingredientId: id, source: 'user' });
    setPicking(null);
  }

  if (phase === 'form') {
    const initial: RecipeFormInitial = {
      name: recipe.name,
      yieldAmount: recipe.yieldAmount,
      yieldUnit: recipe.yieldUnit ?? '',
      steps: recipe.steps.join('\n'),
      lines: recipe.ingredients.flatMap((item, index): LineInitial[] => {
        const decision = decisions[index];
        const unit = item.unit ? normalizeUnit(item.unit) : null;
        if (decision.kind === 'untracked') {
          return [
            { ingredientId: null, name: item.name, amountText: amountToText(item.amount), unit, note: decision.note, section: item.section },
          ];
        }
        const ingredient = decision.ingredientId !== null ? byId.get(decision.ingredientId) : undefined;
        if (decision.kind !== 'stock' || !ingredient) return [];
        return [
          {
            ingredientId: ingredient.id,
            amountText: amountToText(item.amount),
            unit: unit ?? ingredient.baseUnit,
            note: decision.note,
            section: item.section,
          },
        ];
      }),
    };

    return (
      <Screen hasHeader>
        <Text color="textMuted">
          Langkah terakhir: periksa nama, hasil jadi, takaran, catatan, dan langkah. Satuan yang beratnya belum diketahui
          (misalnya sdm tepung) bisa diisi langsung di bawah takarannya.
        </Text>
        <Button label="Kembali ke pencocokan bahan" variant="text" onPress={() => setPhase('match')} />
        <RecipeForm
          mode="create"
          initial={initial}
          onSubmit={async (input) => {
            const id = await createRecipe(db, input, { sourceType: pending.sourceType, sourceRef: pending.sourceRef });
            // Nama dari resep yang dicocokkan AI atau user jadi alias, supaya impor berikutnya langsung cocok tanpa AI.
            for (const [index, decision] of decisions.entries()) {
              if (decision.kind === 'stock' && decision.ingredientId !== null && (decision.source === 'user' || decision.source === 'ai')) {
                await saveAlias(db, decision.ingredientId, recipe.ingredients[index].name);
              }
            }
            clearPendingImport();
            undo.show({ message: 'Tersimpan' });
            // Layar impor dan review ditutup; kembali dari detail langsung ke daftar resep.
            router.dismissTo('/recipes');
            router.push({ pathname: '/recipes/[id]', params: { id } });
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen hasHeader>
      <View style={styles.header}>
        <Text variant="title">{recipe.name || 'Resep tanpa nama'}</Text>
        <Text color="textMuted">
          {pending.via === 'jsonld' ? 'Dibaca dari data resep di halaman.' : 'Dibaca oleh AI, periksa dengan teliti.'} Belum
          ada yang tersimpan.
        </Text>
        {pending.truncated ? (
          <Text variant="caption" color="accent">
            Halamannya sangat panjang, jadi hanya bagian awalnya yang dibaca. Periksa apakah ada bahan yang terlewat.
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Cocokkan bahan" />
        <Text variant="caption" color={unresolved > 0 ? 'accent' : 'success'}>
          {unresolved > 0 ? `${unresolved} bahan belum ditentukan` : 'Semua bahan sudah ditentukan'}
          {autoMatched > 0 ? `. ${autoMatched} dicocokkan otomatis, periksa sekilas.` : ''}
        </Text>

        {groups.map((group) => (
          <View key={group.section ?? '__none__'}>
            {titled ? (
              <Text variant="bodyStrong" color="textMuted" style={styles.groupTitle}>
                {group.section ?? 'Lainnya'}
              </Text>
            ) : null}
            {group.indexes.map((index, position) => {
              const item = recipe.ingredients[index];
              const decision = decisions[index];
              const ingredient = decision.ingredientId !== null ? byId.get(decision.ingredientId) : undefined;
              const open = picking === index;
              return (
                <View key={index} style={[styles.item, position < group.indexes.length - 1 && styles.divider]}>
                  <Text variant="bodyStrong" color={decision.kind === 'skip' ? 'textMuted' : 'text'}>
                    {item.raw}
                  </Text>

                  {decision.kind === 'stock' && ingredient ? (
                    <Text color="success">
                      Cocok: {ingredient.name}
                      {decision.source === 'ai' || decision.source === 'rule' ? ' (otomatis)' : ''}
                    </Text>
                  ) : decision.kind === 'untracked' ? (
                    <Text color="textMuted">Ditulis di resep, tidak dicatat di stok</Text>
                  ) : decision.kind === 'skip' ? (
                    <Text color="textMuted">Dilewati, tidak masuk resep</Text>
                  ) : (
                    <Text color="accent">Belum ada di stok</Text>
                  )}
                  {decision.note && decision.kind !== 'skip' ? (
                    <Text variant="caption" color="textMuted">
                      Catatan: {decision.note}
                    </Text>
                  ) : null}

                  <View style={styles.actions}>
                    {decision.kind === 'stock' || decision.kind === 'unmatched' ? (
                      <Button
                        label={open ? 'Tutup' : decision.kind === 'stock' ? 'Ganti' : 'Pilih bahan'}
                        variant="text"
                        onPress={() => setPicking(open ? null : index)}
                      />
                    ) : null}
                    {decision.kind !== 'untracked' ? (
                      <Button
                        label="Tanpa stok"
                        variant="text"
                        onPress={() => {
                          decide(index, { kind: 'untracked', ingredientId: null, source: 'user' });
                          setPicking(null);
                        }}
                      />
                    ) : null}
                    {decision.kind !== 'skip' ? (
                      <Button
                        label="Lewati"
                        variant="text"
                        onPress={() => {
                          decide(index, { kind: 'skip' });
                          setPicking(null);
                        }}
                      />
                    ) : null}
                    {decision.kind === 'untracked' || decision.kind === 'skip' ? (
                      <Button
                        label="Batal"
                        variant="text"
                        onPress={() => decide(index, initialDecision(item, data.ingredients, data.aliases))}
                      />
                    ) : null}
                  </View>

                  {open ? (
                    <Card>
                      <Text variant="caption" color="textMuted">
                        Pilih bahan yang sama di stok, buat bahan baru, atau tulis tanpa stok.
                      </Text>
                      <IngredientPicker
                        ingredients={data.ingredients}
                        excludeIds={new Set()}
                        initialQuery={item.name}
                        initialBaseUnit={guessBaseUnit(item.unit ? normalizeUnit(item.unit) : null)}
                        onPick={(picked) => {
                          decide(index, { kind: 'stock', ingredientId: picked.id, source: 'user' });
                          setPicking(null);
                        }}
                        onCreate={(name, baseUnit) => createFor(index, name, baseUnit)}
                        onAddUntracked={() => {
                          decide(index, { kind: 'untracked', ingredientId: null, source: 'user' });
                          setPicking(null);
                        }}
                      />
                    </Card>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {recipe.steps.length > 0 ? (
        <Text variant="caption" color="textMuted">
          {recipe.steps.length} langkah terbaca, bisa diperiksa di langkah berikutnya.
        </Text>
      ) : null}

      <Button label="Lanjut" icon="arrow-forward-outline" onPress={() => setPhase('form')} disabled={unresolved > 0} />
      {unresolved > 0 ? (
        <Text variant="caption" color="textMuted">
          Tentukan dulu semua bahan: pilih dari stok, tulis tanpa stok, atau lewati.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  section: {
    gap: spacing.sm,
  },
  groupTitle: {
    paddingTop: spacing.md,
  },
  item: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  divider: {
    borderBottomWidth: sizes.borderWidth,
    borderBottomColor: colors.border,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
