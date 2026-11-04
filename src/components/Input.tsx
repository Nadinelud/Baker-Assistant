import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, sizes, spacing, typography } from '@/theme';

import { Text } from './Text';

type InputProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  error?: string;
  // number: kotak angka sempit rata kanan, untuk di samping nama bahan.
  variant?: 'default' | 'number';
};

export function Input({ label, error, variant = 'default', ...rest }: InputProps) {
  return (
    <View style={styles.container}>
      {label ? (
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        style={[
          styles.input,
          variant === 'number' && styles.number,
          rest.multiline && styles.multiline,
          error ? styles.inputError : null,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  input: {
    ...typography.body,
    color: colors.text,
    minHeight: sizes.touchMin,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: sizes.borderWidth,
    borderColor: colors.border,
    borderRadius: radius.input,
  },
  multiline: {
    minHeight: sizes.textArea,
    textAlignVertical: 'top',
  },
  number: {
    width: sizes.numberInput,
    textAlign: 'right',
  },
  inputError: {
    borderColor: colors.danger,
  },
});
