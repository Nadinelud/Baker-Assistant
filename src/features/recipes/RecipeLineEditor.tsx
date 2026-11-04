import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AmountInput, Badge, Button, ChoiceChips, Input, Text } from '@/components';
import type { IngredientDetail } from '@/db/ingredients';
import { normalizeUnit, parseAmount } from '@/lib/units';
import { colors, sizes, spacing } from '@/theme';

// Satu baris bahan di form resep. ingredientId null = tidak dicatat di stok (nama ditulis bebas).
export type LineDraft = {
  key: number;
  ingredientId: number | null;
  name: string; // hanya untuk bahan tanpa stok
  amountText: string; // kosong = tanpa takaran ("secukupnya")
  unit: string;
  note: string;
  section: string;
};

type RecipeLineEditorProps = {
  line: LineDraft;
  ingredient: IngredientDetail | undefined;
  sections: string[]; // bagian yang sudah dipakai di resep ini, untuk dipilih cepat
  error?: string;
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
  onAddConversion: (unitName: string, toBaseAmount: number) => Promise<void>;
};

const NO_SECTION = '__none__';

export function RecipeLineEditor({ line, ingredient, sections, error, onChange, onRemove, onAddConversion }: RecipeLineEditorProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [unitDraft, setUnitDraft] = useState<{ name: string; amount: string; error?: string } | null>(null);
  const tracked = line.ingredientId !== null;
  const summary = [line.section ? `Bagian: ${line.section}` : null, line.note ? `Catatan: ${line.note}` : null]
    .filter(Boolean)
    .join(' · ');

  async function saveCustomUnit() {
    if (!unitDraft) return;
    const amount = parseAmount(unitDraft.amount);
    if (unitDraft.name.trim() === '') return setUnitDraft({ ...unitDraft, error: 'Isi nama satuannya, misalnya cup.' });
    if (amount === null || amount <= 0) return setUnitDraft({ ...unitDraft, error: 'Isi jumlahnya dengan angka.' });
    try {
      await onAddConversion(unitDraft.name, amount);
      onChange({ unit: normalizeUnit(unitDraft.name) });
      setUnitDraft(null);
    } catch (e) {
      setUnitDraft({ ...unitDraft, error: e instanceof Error ? e.message : 'Gagal menyimpan satuan.' });
    }
  }

  return (
    <View style={styles.line}>
      <View style={styles.header}>
        {tracked ? (
          <Text variant="bodyStrong" style={styles.flex} numberOfLines={2}>
            {ingredient?.name ?? 'Bahan sudah tidak ada'}
          </Text>
        ) : (
          <View style={styles.flex}>
            <Badge label="Tidak dicatat di stok" />
          </View>
        )}
        <Button label="Hapus" variant="text" danger onPress={onRemove} />
      </View>

      {tracked && ingredient ? (
        <>
          <AmountInput
            ingredient={ingredient}
            ingredientName={ingredient.name}
            amountText={line.amountText}
            unit={line.unit}
            onChangeAmount={(text) => onChange({ amountText: text })}
            onChangeUnit={(unit) => onChange({ unit })}
            onAddConversion={onAddConversion}
            error={error}
          />
          {line.amountText.trim() === '' ? (
            <Text variant="caption" color="textMuted">
              Tanpa takaran (misalnya secukupnya): tertulis di resep, tidak memotong stok.
            </Text>
          ) : null}
        </>
      ) : null}

      {!tracked ? (
        <>
          <Input value={line.name} onChangeText={(text) => onChange({ name: text })} placeholder="Nama bahan, misalnya air es" />
          <View style={styles.row}>
            <Input
              variant="number"
              value={line.amountText}
              onChangeText={(text) => onChange({ amountText: text })}
              keyboardType="decimal-pad"
              placeholder="Jumlah"
              accessibilityLabel="Jumlah, boleh kosong"
            />
            <View style={styles.flex}>
              <Input value={line.unit} onChangeText={(text) => onChange({ unit: text })} placeholder="Satuan, boleh kosong" autoCapitalize="none" />
            </View>
          </View>
          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}
        </>
      ) : null}

      {summary && !detailOpen ? (
        <Text variant="caption" color="textMuted">
          {summary}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button label={detailOpen ? 'Tutup catatan' : 'Catatan & bagian'} variant="text" onPress={() => setDetailOpen((o) => !o)} />
        {tracked ? (
          <Button
            label="Satuan lain"
            variant="text"
            onPress={() => setUnitDraft(unitDraft ? null : { name: '', amount: '' })}
          />
        ) : null}
      </View>

      {unitDraft && ingredient ? (
        <View style={styles.block}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Input
                label="1 satuan"
                value={unitDraft.name}
                onChangeText={(text) => setUnitDraft({ ...unitDraft, name: text, error: undefined })}
                placeholder="cup"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.flex}>
              <Input
                label={`= berapa ${ingredient.baseUnit}`}
                value={unitDraft.amount}
                onChangeText={(text) => setUnitDraft({ ...unitDraft, amount: text, error: undefined })}
                keyboardType="decimal-pad"
                placeholder="120"
              />
            </View>
          </View>
          <Text variant="caption" color={unitDraft.error ? 'danger' : 'textMuted'}>
            {unitDraft.error ?? `Disimpan ke bahan ${ingredient.name}, jadi bisa dipakai di resep lain.`}
          </Text>
          <Button label="Simpan satuan" variant="outline" onPress={saveCustomUnit} />
        </View>
      ) : null}

      {detailOpen ? (
        <View style={styles.block}>
          <Input
            label="Catatan, boleh kosong"
            value={line.note}
            onChangeText={(text) => onChange({ note: text })}
            placeholder="ukuran besar, potong dadu kecil"
          />
          <Text variant="caption" color="textMuted">
            Bagian resep, boleh kosong
          </Text>
          {sections.length > 0 ? (
            <ChoiceChips
              options={[{ value: NO_SECTION, label: 'Tanpa bagian' }, ...sections.map((s) => ({ value: s, label: s }))]}
              value={line.section.trim() === '' ? NO_SECTION : line.section}
              onChange={(value) => onChange({ section: value === NO_SECTION ? '' : value })}
            />
          ) : null}
          <Input value={line.section} onChangeText={(text) => onChange({ section: text })} placeholder="Bahan A, Filling, Topping" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: sizes.borderWidth,
    borderBottomColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  block: {
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
