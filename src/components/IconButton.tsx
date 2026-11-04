import { StyleSheet } from 'react-native';

import { sizes, spacing, type ColorName } from '@/theme';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

type IconButtonProps = {
  icon: IconName;
  // Wajib: tombol tanpa teks harus punya label untuk pembaca layar.
  label: string;
  onPress: () => void;
  color?: ColorName;
};

export function IconButton({ icon, label, onPress, color = 'text' }: IconButtonProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={spacing.sm}
      onPress={onPress}
      style={styles.button}
    >
      <Icon name={icon} color={color} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: sizes.touchMin,
    minHeight: sizes.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
