import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, sizes, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

type ListRowProps = {
  title: string;
  // Jumlah baris judul sebelum terpotong. 2 untuk layar yang tidak punya tempat lain
  // untuk membaca nama lengkap (misalnya bahan di detail resep).
  titleLines?: number;
  subtitle?: string;
  icon?: IconName;
  // Isi kiri selain ikon, misalnya <Photo shape="thumbnail" />.
  leading?: ReactNode;
  // Isi kanan, misalnya angka stok atau Badge.
  right?: ReactNode;
  onPress?: () => void;
  // Panah kanan untuk baris yang membuka layar lain. Bawaan: tampil kalau ada onPress.
  showChevron?: boolean;
  showDivider?: boolean;
};

export function ListRow({
  title,
  titleLines = 1,
  subtitle,
  icon,
  leading,
  right,
  onPress,
  showChevron = !!onPress,
  showDivider = true,
}: ListRowProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.row, showDivider && styles.divider]}
    >
      {icon ? <Icon name={icon} color="textMuted" /> : null}
      {leading}
      <View style={styles.main}>
        <Text variant="bodyStrong" numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {showChevron ? <Icon name="chevron-forward-outline" color="textMuted" /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: sizes.touchMin,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  divider: {
    borderBottomWidth: sizes.borderWidth,
    borderBottomColor: colors.border,
  },
  main: {
    flex: 1,
    gap: spacing.xs,
  },
});
