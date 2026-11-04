import { StyleSheet, View } from 'react-native';

import { formatNumber } from '@/lib/units';
import { colors, radius, sizes, spacing } from '@/theme';

import { Text } from './Text';

type Stat = {
  value: number;
  label: string;
};

type StatStripProps = {
  stats: Stat[];
};

export function StatStrip({ stats }: StatStripProps) {
  return (
    <View style={styles.strip}>
      {stats.map((stat, index) => (
        <View key={stat.label} style={[styles.item, index > 0 && styles.separator]}>
          <Text variant="number">{formatNumber(stat.value)}</Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {stat.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: sizes.borderWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  separator: {
    borderLeftWidth: sizes.borderWidth,
    borderLeftColor: colors.border,
  },
});
