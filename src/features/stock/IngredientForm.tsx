import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ChoiceChips, Input, SectionHeader, Text } from '@/components';
import type { IngredientInput } from '@/db/ingredients';
import { BASE_UNIT_OPTIONS } from '@/lib/stockLabels';
import { formatNumber, normalizeUnit, parseAmount, type BaseUnit } from '@/lib/units';
import { spacing } from '@/theme';

type ConversionDraft = { key: number; unitName: string; amountText: string };

export type IngredientFormValues = IngredientInput & { initialStock: number };

type IngredientFormProps = {
  mode: 'create' | 'edit';
  initial?: IngredientInput;
  submitLabel: string;
  onSubmit: (values: IngredientFormValues) => Promise<void>;
};

let nextKey = 1;

function textFromNumber(value: number): string {
  return value === 0 ? '' : formatNumber(value);
}

// Kosong dibaca 0. null kalau isinya bukan angka.
function parseOptional(text: string): number | null {
  return text.trim() === '' ? 0 : parseAmount(text);
}

export function IngredientForm({ mode, initial, submitLabel, onSubmit }: IngredientFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [baseUnit, setBaseUnit] = useState<BaseUnit>(initial?.baseUnit ?? 'g');
  const [minStockText, setMinStockText] = useState(textFromNumber(initial?.minStock ?? 0));
  const [initialStockText, setInitialStockText] = useState('');
  const [conversions, setConversions] = useState<ConversionDraft[]>(
    (initial?.conversions ?? []).map((c) => ({
      key: nextKey++,
      unitName: c.unitName,
      amountText: formatNumber(c.toBaseAmount),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateConversion(key: number, patch: Partial<ConversionDraft>) {
    setConversions((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  async function handleSubmit() {
    const minStock = parseOptional(minStockText);
    if (minStock === null) return setError('Batas minimum harus angka, misalnya 500.');
    const initialStock = parseOptional(initialStockText);
    if (initialStock === null) return setError('Stok sekarang harus angka, misalnya 1.000.');

    const parsedConversions = [];
    for (const c of conversions) {
      if (c.unitName.trim() === '' && c.amountText.trim() === '') continue;
      const amount = parseAmount(c.amountText);
      if (amount === null || amount <= 0) {
        return setError(`Isi berapa ${baseUnit} dalam 1 ${c.unitName.trim() || 'satuan'}.`);
      }
      parsedConversions.push({ unitName: c.unitName, toBaseAmount: amount });
    }

    setError(null);
    setSaving(true);
    try {
      await onSubmit({ name, baseUnit, minStock, conversions: parsedConversions, initialStock });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan. Coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      <Input label="Nama bahan" value={name} onChangeText={setName} placeholder="Tepung terigu" autoCapitalize="sentences" />

      <View style={styles.field}>
        <Text variant="caption" color="textMuted">
          Satuan dasar
        </Text>
        <ChoiceChips options={BASE_UNIT_OPTIONS} value={baseUnit} onChange={setBaseUnit} disabled={mode === 'edit'} />
        <Text variant="caption" color="textMuted">
          {mode === 'edit'
            ? 'Satuan dasar tidak bisa diubah karena riwayat stok tersimpan dalam satuan ini.'
            : 'Semua stok bahan ini disimpan dalam satuan ini.'}
        </Text>
      </View>

      {mode === 'create' ? (
        <Input
          label={`Stok sekarang (${baseUnit}), boleh kosong`}
          value={initialStockText}
          onChangeText={setInitialStockText}
          keyboardType="decimal-pad"
          placeholder="0"
        />
      ) : null}

      <Input
        label={`Batas minimum (${baseUnit})`}
        value={minStockText}
        onChangeText={setMinStockText}
        keyboardType="decimal-pad"
        placeholder="Kosongkan kalau tidak perlu peringatan"
      />

      <View style={styles.field}>
        <SectionHeader
          title="Konversi"
          action={{
            label: 'Tambah konversi',
            onPress: () => setConversions((list) => [...list, { key: nextKey++, unitName: '', amountText: '' }]),
          }}
        />
        <Text variant="caption" color="textMuted">
          Untuk takaran seperti cup, sdm, sdt, atau butir. Berat dan isi baku (kg, ons, liter) sudah otomatis.
        </Text>
        {conversions.map((c) => {
          const unitLabel = normalizeUnit(c.unitName) || 'satuan';
          return (
            <View key={c.key} style={styles.conversion}>
              <View style={styles.conversionRow}>
                <View style={styles.flex}>
                  <Input
                    label="1 satuan"
                    value={c.unitName}
                    onChangeText={(text) => updateConversion(c.key, { unitName: text })}
                    placeholder="cup"
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.flex}>
                  <Input
                    label={`= berapa ${baseUnit}`}
                    value={c.amountText}
                    onChangeText={(text) => updateConversion(c.key, { amountText: text })}
                    keyboardType="decimal-pad"
                    placeholder="120"
                  />
                </View>
              </View>
              <View style={styles.conversionFooter}>
                <Text variant="caption" color="textMuted">
                  1 {unitLabel} = {c.amountText.trim() || '...'} {baseUnit}
                </Text>
                <Button
                  label="Hapus"
                  variant="text"
                  danger
                  onPress={() => setConversions((list) => list.filter((x) => x.key !== c.key))}
                />
              </View>
            </View>
          );
        })}
      </View>

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
      <Button label={saving ? 'Menyimpan...' : submitLabel} onPress={handleSubmit} disabled={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.xl,
  },
  field: {
    gap: spacing.sm,
  },
  conversion: {
    gap: spacing.xs,
  },
  conversionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  conversionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flex: {
    flex: 1,
  },
});
