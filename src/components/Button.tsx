import { StyleSheet, View } from 'react-native';

import { colors, opacity, radius, sizes, spacing, type ColorName } from '@/theme';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

// primary: satu-satunya tombol berisi warna per layar (espresso). Tombol lain pakai outline atau text.
type ButtonVariant = 'primary' | 'outline' | 'text';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  danger = false,
  disabled = false,
}: ButtonProps) {
  const contentColor: ColorName =
    variant === 'primary' ? 'onPrimary' : danger ? 'danger' : 'text';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'primary' && danger && styles.primaryDanger,
        variant === 'outline' && styles.outline,
        variant === 'outline' && danger && styles.outlineDanger,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.content}>
        {icon ? <Icon name={icon} color={contentColor} /> : null}
        <Text
          variant="bodyStrong"
          color={contentColor}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: sizes.button,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  primaryDanger: {
    backgroundColor: colors.danger,
  },
  outline: {
    borderWidth: sizes.borderWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  outlineDanger: {
    borderColor: colors.danger,
  },
  content: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  disabled: {
    opacity: opacity.disabled,
  },
});
