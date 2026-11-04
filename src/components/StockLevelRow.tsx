import { StyleSheet, View } from 'react-native';

import { formatAmount, formatNumber } from '@/lib/units';
import { colors, sizes, spacing } from '@/theme';

import { ProgressBar } from './ProgressBar';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

type StockLevelRowProps = {
  name: string;
  stock: number;
  minStock: number;
  unit: string;
  onPress?: () => void;
  showDivider?: boolean;
};

// Baris stok dengan bar sisa terhadap batas minimum. Warna accent kalau menipis.
export function StockLevelRow({ name, stock, minStock, unit, onPress, showDivider = true }: StockLevelRowProps) {
  const isLow = minStock > 0 && stock <= minStock;
  const valueColor = isLow ? 'accent' : 'text';

  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.row, showDivider && styles.divider]}
    >
      <View style={styles.top}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        <Text variant="number" color={valueColor}>
          {formatNumber(stock)}{' '}
          <Text variant="caption" color={valueColor}>
            {unit}
          </Text>
        </Text>
      </View>
      {minStock > 0 ? (
        <>
          <ProgressBar value={stock / minStock} color={isLow ? 'accent' : 'success'} />
          <Text variant="caption" color="textMuted">
            Batas {formatAmount(minStock, unit)}
          </Text>
        </>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: sizes.touchMin,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  divider: {
    borderBottomWidth: sizes.borderWidth,
    borderBottomColor: colors.border,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  name: {
    flex: 1,
  },
});
