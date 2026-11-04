import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Input, readAmount, SectionHeader, Text } from '@/components';
import { addConversion, createIngredient, listIngredientDetails } from '@/db/ingredients';
import type { RecipeInput, RecipeLineInput, SaveMode } from '@/db/recipes';
import { useFocusData } from '@/lib/useFocusData';
import { formatNumber, parseAmount } from '@/lib/units';
import { sizes, spacing } from '@/theme';

import { IngredientPicker } from './IngredientPicker';
import { RecipeLineEditor, type LineDraft } from './RecipeLineEditor';

export type { LineDraft } from './RecipeLineEditor';

// Isian awal satu baris; kolom yang tidak diisi dianggap kosong.
export type LineInitial = {
  ingredientId: number | null;
  name?: string;
  amountText: string;
  unit: string | null;
  note?: string | null;
  section?: string | null;
};

export type RecipeFormInitial = {
  name: string;
  yieldAmount: number | null;
  yieldUnit: string;
  steps: string;
  ovenTemp?: number | null;
  durationMin?: number | null;
  lines: LineInitial[];
};

type RecipeFormProps = {
  // create: resep baru. draft: dari potong cepat. edit: ubah versi aktif atau buat versi baru.
  mode: 'create' | 'draft' | 'edit';
  initial?: RecipeFormInitial;
  onSubmit: (input: RecipeInput, saveMode: SaveMode, changeNote: string) => Promise<void>;
};

let nextKey = 1;

function toDraft(line: LineInitial): LineDraft {
  return {
    key: nextKey++,
    ingredientId: line.ingredientId,
    name: line.name ?? '',
    amountText: line.amountText,
    unit: line.unit ?? '',
    note: line.note ?? '',
    section: line.section ?? '',
  };
}

// Bahan baru ikut bagian baris terakhir, supaya bahan satu bagian tetap berurutan.
// Bahan yang sama boleh dipakai lagi di bagian lain (misalnya gula di kulit dan di topping).
function lastSection(lines: LineDraft[]): string {
  return lines.length > 0 ? lines[lines.length - 1].section : '';
}

// Ubah format "1.5"/"1,5" jadi teks isian.
export function amountToText(amount: number | null): string {
  return amount === null ? '' : formatNumber(amount);
}

export function RecipeForm({ mode, initial, onSubmit }: RecipeFormProps) {
  const db = useSQLiteContext();
  const { data: ingredients, reload } = useFocusData(listIngredientDetails);

  const [name, setName] = useState(initial?.name ?? '');
  const [yieldText, setYieldText] = useState(initial?.yieldAmount ? formatNumber(initial.yieldAmount) : '');
  const [yieldUnit, setYieldUnit] = useState(initial?.yieldUnit ?? '');
  const [steps, setSteps] = useState(initial?.steps ?? '');
  const [ovenText, setOvenText] = useState(initial?.ovenTemp ? String(initial.ovenTemp) : '');
  const [durationText, setDurationText] = useState(initial?.durationMin ? String(initial.durationMin) : '');
  const [lines, setLines] = useState<LineDraft[]>(() => (initial?.lines ?? []).map(toDraft));
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});
  const [changeNote, setChangeNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (ingredients === null) return null;
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const sections = [...new Set(lines.map((l) => l.section.trim()).filter(Boolean))];

  function updateLine(key: number, patch: Partial<LineDraft>) {
    setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setLineErrors(({ [key]: _, ...rest }) => rest);
  }

  function addLine(line: LineInitial) {
    setLines((list) => [...list, toDraft({ ...line, section: line.section ?? lastSection(list) })]);
  }

  async function handleCreateIngredient(ingredientName: string, baseUnit: 'g' | 'ml' | 'pcs') {
    const id = await createIngredient(db, { name: ingredientName, baseUnit, minStock: 0, conversions: [] });
    await reload();
    addLine({ ingredientId: id, amountText: '', unit: baseUnit });
  }

  async function handleSubmit(saveMode: SaveMode) {
    const yieldAmount = parseAmount(yieldText);
    if (yieldAmount === null || yieldAmount <= 0) return setError('Isi hasil jadi dengan angka, misalnya 12.');
    const ovenTemp = ovenText.trim() === '' ? null : parseAmount(ovenText);
    if (ovenTemp === null && ovenText.trim() !== '') return setError('Suhu oven harus angka, misalnya 170.');
    const durationMin = durationText.trim() === '' ? null : parseAmount(durationText);
    if (durationMin === null && durationText.trim() !== '') return setError('Durasi harus angka dalam menit, misalnya 35.');

    const errors: Record<number, string> = {};
    const parsed: RecipeLineInput[] = lines.map((line) => {
      const empty = line.amountText.trim() === '';
      const amount = empty ? null : parseAmount(line.amountText);
      const base = { note: line.note, section: line.section };
      if (line.ingredientId === null) {
        if (line.name.trim() === '') errors[line.key] = 'Isi nama bahan, atau hapus barisnya.';
        else if (!empty && (amount === null || amount <= 0)) errors[line.key] = 'Jumlah harus angka, atau dikosongkan.';
        return { ingredientId: null, name: line.name, amount, unit: line.unit, ...base };
      }
      const ingredient = byId.get(line.ingredientId);
      if (!ingredient) errors[line.key] = 'Bahan sudah tidak ada.';
      else if (!empty) {
        const result = readAmount(line.amountText, line.unit, ingredient);
        if (result.error !== null) errors[line.key] = result.error;
      }
      return { ingredientId: line.ingredientId, amount, unit: line.unit || null, ...base };
    });
    setLineErrors(errors);
    if (Object.keys(errors).length > 0) return setError('Periksa bahan yang ditandai.');

    setError(null);
    setSaving(true);
    try {
      await onSubmit({ name, yieldAmount, yieldUnit, steps, ovenTemp, durationMin, ingredients: parsed }, saveMode, changeNote);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan. Coba lagi.');
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      {mode === 'draft' ? (
        <Text color="textMuted">Bahan sudah terisi dari potong stok tadi. Beri nama dan hasil jadinya.</Text>
      ) : null}

      <Input label="Nama resep" value={name} onChangeText={setName} placeholder="Cupcake cokelat" />

      <View style={styles.row}>
        <View style={styles.yieldAmount}>
          <Input label="Hasil jadi" value={yieldText} onChangeText={setYieldText} keyboardType="decimal-pad" placeholder="12" />
        </View>
        <View style={styles.flex}>
          <Input label="Satuan" value={yieldUnit} onChangeText={setYieldUnit} placeholder="cupcake" autoCapitalize="none" />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.flex}>
          <Input
            label="Suhu oven (°C), boleh kosong"
            value={ovenText}
            onChangeText={setOvenText}
            keyboardType="number-pad"
            placeholder="170"
          />
        </View>
        <View style={styles.flex}>
          <Input
            label="Durasi (menit), boleh kosong"
            value={durationText}
            onChangeText={setDurationText}
            keyboardType="number-pad"
            placeholder="35"
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Bahan" />
        {lines.length === 0 ? (
          <Text variant="caption" color="textMuted">
            Belum ada bahan. Pilih atau ketik bahan di bawah.
          </Text>
        ) : null}
        {lines.map((line) => (
          <RecipeLineEditor
            key={line.key}
            line={line}
            ingredient={line.ingredientId !== null ? byId.get(line.ingredientId) : undefined}
            sections={sections}
            error={lineErrors[line.key]}
            onChange={(patch) => updateLine(line.key, patch)}
            onRemove={() => setLines((list) => list.filter((l) => l.key !== line.key))}
            onAddConversion={async (unitName, toBaseAmount) => {
              if (line.ingredientId === null) return;
              await addConversion(db, line.ingredientId, { unitName, toBaseAmount });
              await reload();
            }}
          />
        ))}

        <IngredientPicker
          ingredients={ingredients}
          excludeIds={new Set()}
          onPick={(ingredient) => addLine({ ingredientId: ingredient.id, amountText: '', unit: ingredient.baseUnit })}
          onCreate={handleCreateIngredient}
          onAddUntracked={(untrackedName) => addLine({ ingredientId: null, name: untrackedName, amountText: '', unit: null })}
        />
      </View>

      <Input
        label="Langkah"
        value={steps}
        onChangeText={setSteps}
        placeholder={'Satu langkah per baris, misalnya:\nKocok telur dan gula sampai mengembang'}
        multiline
      />

      {mode === 'edit' ? (
        <Input
          label="Catatan perubahan (untuk versi baru), boleh kosong"
          value={changeNote}
          onChangeText={setChangeNote}
          placeholder="Gula dikurangi 20 g"
        />
      ) : null}

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}

      {mode === 'edit' ? (
        <View style={styles.section}>
          <Button
            label={saving ? 'Menyimpan...' : 'Simpan sebagai versi baru'}
            onPress={() => handleSubmit('new_version')}
            disabled={saving}
          />
          <Button
            label="Perbarui versi ini"
            variant="outline"
            onPress={() => handleSubmit('update_version')}
            disabled={saving}
          />
          <Text variant="caption" color="textMuted">
            Perbarui versi ini untuk salah ketik. Versi baru untuk perubahan resep yang mau kamu bandingkan.
          </Text>
        </View>
      ) : (
        <Button
          label={saving ? 'Menyimpan...' : mode === 'draft' ? 'Simpan draft' : 'Simpan resep'}
          onPress={() => handleSubmit('update_version')}
          disabled={saving}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  yieldAmount: {
    width: sizes.numberInput,
  },
  flex: {
    flex: 1,
  },
});
