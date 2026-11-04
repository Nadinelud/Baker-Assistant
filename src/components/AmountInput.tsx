import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  availableUnits,
  formatAmount,
  needsConversion,
  parseAmount,
  toBase,
  type IngredientUnits,
} from '@/lib/units';
import { spacing } from '@/theme';

import { Button } from './Button';
import { ChoiceChips } from './ChoiceChips';
import { Input } from './Input';
import { Text } from './Text';

type AmountInputProps = {
  ingredient: IngredientUnits;
  amountText: string;
  unit: string;
  onChangeAmount: (text: string) => void;
  onChangeUnit: (unit: string) => void;
  label?: string;
  error?: string;
  // Untuk satuan yang belum punya konversi (misalnya sdm tepung): user mengisi sekali,
  // lalu disimpan ke bahan itu. Tanpa ini, satuan tersebut tetap bisa dipilih tapi ditolak saat simpan.
  ingredientName?: string;
  onAddConversion?: (unitName: string, toBaseAmount: number) => Promise<void>;
};

// Jumlah + pilihan satuan untuk satu bahan. Menampilkan hasil konversi ke satuan dasar.
export function AmountInput({
  ingredient,
  amountText,
  unit,
  onChangeAmount,
  onChangeUnit,
  label,
  error,
  ingredientName,
  onAddConversion,
}: AmountInputProps) {
  const [conversionText, setConversionText] = useState('');
  const [conversionError, setConversionError] = useState<string | null>(null);
  const units = availableUnits(ingredient);
  if (!units.includes(unit)) units.push(unit);
  const amount = parseAmount(amountText);
  const base = amount === null ? null : toBase(amount, unit, ingredient);
  const showPreview = base !== null && unit !== ingredient.baseUnit;
  const missing = needsConversion(unit, ingredient);

  async function saveConversion() {
    const value = parseAmount(conversionText);
    if (value === null || value <= 0) return setConversionError(`Isi berapa ${ingredient.baseUnit} dalam 1 ${unit}.`);
    try {
      await onAddConversion?.(unit, value);
      setConversionText('');
      setConversionError(null);
    } catch (e) {
      setConversionError(e instanceof Error ? e.message : 'Gagal menyimpan satuan.');
    }
  }

  return (
    <View style={styles.container}>
      <Input
        label={label}
        value={amountText}
        onChangeText={onChangeAmount}
        keyboardType="decimal-pad"
        placeholder="0"
        error={error}
      />
      {units.length > 1 ? (
        <ChoiceChips options={units.map((u) => ({ value: u, label: u }))} value={unit} onChange={onChangeUnit} />
      ) : null}
      {missing && onAddConversion ? (
        <View style={styles.conversion}>
          <Text variant="caption" color="accent">
            Berat 1 {unit} {ingredientName ?? 'bahan ini'} belum diketahui. Isi sekali, nanti dipakai terus.
          </Text>
          <View style={styles.row}>
            <Text>1 {unit} =</Text>
            <Input
              variant="number"
              value={conversionText}
              onChangeText={(text) => {
                setConversionText(text);
                setConversionError(null);
              }}
              keyboardType="decimal-pad"
              placeholder={unit === 'sdt' ? '3' : '8'}
              accessibilityLabel={`Berapa ${ingredient.baseUnit} dalam 1 ${unit}`}
            />
            <Text style={styles.flex}>{ingredient.baseUnit}</Text>
            <Button label="Simpan" variant="outline" onPress={saveConversion} />
          </View>
          {conversionError ? (
            <Text variant="caption" color="danger">
              {conversionError}
            </Text>
          ) : null}
        </View>
      ) : null}
      {showPreview ? (
        <Text variant="caption" color="textMuted">
          = {formatAmount(base, ingredient.baseUnit)}
        </Text>
      ) : null}
    </View>
  );
}

// Membaca isi AmountInput jadi jumlah dalam satuan dasar. null + pesan kalau belum valid.
export function readAmount(
  amountText: string,
  unit: string,
  ingredient: IngredientUnits,
): { value: number; error: null } | { value: null; error: string } {
  const amount = parseAmount(amountText);
  if (amount === null) return { value: null, error: 'Isi jumlah dengan angka, misalnya 250 atau 1,5.' };
  if (amount <= 0) return { value: null, error: 'Jumlah harus lebih dari 0.' };
  const base = toBase(amount, unit, ingredient);
  if (base === null) return { value: null, error: `Isi dulu berat 1 ${unit} untuk bahan ini.` };
  return { value: base, error: null };
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  conversion: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
