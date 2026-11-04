import { StyleSheet, View } from 'react-native';

import { colors, opacity, radius, sizes, spacing } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

type ChoiceChipsProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

// Pilihan singkat (satuan, jenis). Yang terpilih ditandai garis tebal, bukan warna isi.
export function ChoiceChips<T extends string>({ options, value, onChange, disabled = false }: ChoiceChipsProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            hitSlop={spacing.xs}
            style={[
              styles.chip,
              selected && styles.selected,
              disabled && !selected && styles.disabled,
            ]}
          >
            <Text variant={selected ? 'bodyStrong' : 'body'} color={selected ? 'text' : 'textMuted'}>
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: sizes.chip,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radius.badge,
    borderWidth: sizes.borderWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  selected: {
    borderColor: colors.text,
    backgroundColor: colors.surface,
  },
  disabled: {
    opacity: opacity.disabled,
  },
});
