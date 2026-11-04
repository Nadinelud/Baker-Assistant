import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  AmountInput,
  Button,
  EmptyState,
  Input,
  ListRow,
  readAmount,
  Screen,
  SectionHeader,
  Text,
  useUndo,
} from '@/components';
import { addConversion, listIngredientDetails, type IngredientDetail } from '@/db/ingredients';
import { quickDeduct, revertMovements, type DeductLine } from '@/db/stock';
import { useFocusData } from '@/lib/useFocusData';
import { formatAmount, parseAmount } from '@/lib/units';
import { colors, sizes, spacing } from '@/theme';

type LineDraft = { ingredientId: number; amountText: string; unit: string; error?: string };

export default function DeductScreen() {
  const undo = useUndo();
  const { data: ingredients, db, reload } = useFocusData(listIngredientDetails);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (ingredients === null) return <Screen hasHeader bottomInset>{null}</Screen>;

  if (ingredients.length === 0) {
    return (
      <Screen hasHeader bottomInset>
        <EmptyState
          icon="cube-outline"
          message="Belum ada bahan untuk dipotong. Tambah bahan dulu."
          action={{ label: 'Tambah bahan', onPress: () => router.replace('/stock/new') }}
        />
      </Screen>
    );
  }

  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const chosen = new Set(lines.map((l) => l.ingredientId));
  const needle = query.trim().toLowerCase();
  const candidates = ingredients.filter(
    (i) => !chosen.has(i.id) && (needle === '' || i.name.toLowerCase().includes(needle)),
  );

  function updateLine(ingredientId: number, patch: Partial<LineDraft>) {
    setLines((list) => list.map((l) => (l.ingredientId === ingredientId ? { ...l, ...patch, error: undefined } : l)));
  }

  function addLine(ingredient: IngredientDetail) {
    setLines((list) => [...list, { ingredientId: ingredient.id, amountText: '', unit: ingredient.baseUnit }]);
    setQuery('');
    setFormError(null);
  }

  // Tawarkan menyimpan bahan yang barusan dipotong sebagai resep draft.
  function offerDraft() {
    const draftLines = lines.map((line) => ({
      ingredientId: line.ingredientId,
      amount: parseAmount(line.amountText) ?? 0,
      unit: line.unit,
    }));
    Alert.alert('Simpan sebagai resep draft?', 'Bahan dan jumlahnya sudah terisi, tinggal beri nama.', [
      { text: 'Tidak', style: 'cancel', onPress: () => router.back() },
      {
        text: 'Simpan draft',
        onPress: () => router.replace({ pathname: '/recipes/new', params: { draft: JSON.stringify(draftLines) } }),
      },
    ]);
  }

  async function handleSubmit() {
    if (lines.length === 0) return setFormError('Pilih minimal satu bahan.');

    const parsed: DeductLine[] = [];
    let hasError = false;
    const checked = lines.map((line) => {
      const result = readAmount(line.amountText, line.unit, byId.get(line.ingredientId)!);
      if (result.error !== null) {
        hasError = true;
        return { ...line, error: result.error };
      }
      parsed.push({ ingredientId: line.ingredientId, amountBase: result.value });
      return line;
    });
    setLines(checked);
    if (hasError) return setFormError(null);

    setSaving(true);
    try {
      const ids = await quickDeduct(db, parsed, note);
      const names = parsed.map((p) => byId.get(p.ingredientId)!.name).join(', ');
      undo.show({ message: `Stok dipotong: ${names}`, onUndo: () => revertMovements(db, ids).then(() => undefined) });
      offerDraft();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Gagal memotong stok. Coba lagi.');
      setSaving(false);
    }
  }

  return (
    <Screen hasHeader bottomInset>
      <Text color="textMuted">Untuk pemakaian di luar resep, misalnya coba-coba atau bahan rusak.</Text>

      {lines.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Dipotong" />
          {lines.map((line) => {
            const ingredient = byId.get(line.ingredientId)!;
            const result = readAmount(line.amountText, line.unit, ingredient);
            const after = result.value === null ? null : ingredient.stock - result.value;
            return (
              <View key={line.ingredientId} style={styles.line}>
                <View style={styles.lineHeader}>
                  <View style={styles.flex}>
                    <Text variant="bodyStrong">{ingredient.name}</Text>
                    <Text variant="caption" color={after !== null && after < 0 ? 'danger' : 'textMuted'}>
                      {after === null
                        ? `Stok ${formatAmount(ingredient.stock, ingredient.baseUnit)}`
                        : `Sisa jadi ${formatAmount(after, ingredient.baseUnit)}`}
                    </Text>
                  </View>
                  <Button
                    label="Hapus"
                    variant="text"
                    danger
                    onPress={() => setLines((list) => list.filter((l) => l.ingredientId !== line.ingredientId))}
                  />
                </View>
                <AmountInput
                  ingredient={ingredient}
                  ingredientName={ingredient.name}
                  onAddConversion={async (unitName, toBaseAmount) => {
                    await addConversion(db, ingredient.id, { unitName, toBaseAmount });
                    await reload();
                  }}
                  amountText={line.amountText}
                  unit={line.unit}
                  onChangeAmount={(text) => updateLine(line.ingredientId, { amountText: text })}
                  onChangeUnit={(unit) => updateLine(line.ingredientId, { unit })}
                  error={line.error}
                />
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title={lines.length === 0 ? 'Pilih bahan' : 'Tambah bahan lain'} />
        {ingredients.length > 6 ? (
          <Input value={query} onChangeText={setQuery} placeholder="Cari bahan" autoCorrect={false} />
        ) : null}
        <View>
          {candidates.length === 0 ? (
            <Text variant="caption" color="textMuted">
              {needle ? `Tidak ada bahan bernama "${query.trim()}".` : 'Semua bahan sudah dipilih.'}
            </Text>
          ) : (
            candidates.map((ingredient, index) => (
              <ListRow
                key={ingredient.id}
                icon="add-circle-outline"
                title={ingredient.name}
                subtitle={`Stok ${formatAmount(ingredient.stock, ingredient.baseUnit)}`}
                onPress={() => addLine(ingredient)}
                showChevron={false}
                showDivider={index < candidates.length - 1}
              />
            ))
          )}
        </View>
      </View>

      {lines.length > 0 ? (
        <View style={styles.section}>
          <Input label="Catatan, boleh kosong" value={note} onChangeText={setNote} placeholder="Coba resep baru" />
          {formError ? (
            <Text variant="caption" color="danger">
              {formError}
            </Text>
          ) : null}
          <Button label={saving ? 'Memotong...' : 'Potong stok'} onPress={handleSubmit} disabled={saving} />
        </View>
      ) : formError ? (
        <Text variant="caption" color="danger">
          {formError}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  line: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomWidth: sizes.borderWidth,
    borderBottomColor: colors.border,
  },
  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
});
