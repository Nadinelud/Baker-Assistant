import { StyleSheet, View } from 'react-native';

import { ListRow, SectionHeader, Text } from '@/components';
import type { RecipeLine } from '@/db/recipes';
import { scaleLine } from '@/lib/scaling';
import { formatAmount, formatNumber } from '@/lib/units';
import { spacing } from '@/theme';

type RecipeIngredientListProps = {
  lines: RecipeLine[];
  multiplier: number;
};

// Kelompokkan per bagian sesuai urutan kemunculan; bahan tanpa bagian di kelompok tanpa judul.
export function groupBySection(lines: RecipeLine[]): { section: string | null; lines: RecipeLine[] }[] {
  const groups: { section: string | null; lines: RecipeLine[] }[] = [];
  for (const line of lines) {
    const group = groups.find((g) => g.section === line.section);
    if (group) group.lines.push(line);
    else groups.push({ section: line.section, lines: [line] });
  }
  return groups;
}

function amountText(line: RecipeLine): string {
  if (line.amount === null) return 'secukupnya';
  return line.unit ? formatAmount(line.amount, line.unit) : formatNumber(line.amount);
}

export function RecipeIngredientList({ lines, multiplier }: RecipeIngredientListProps) {
  const groups = groupBySection(lines);
  const titled = groups.some((g) => g.section !== null);

  return (
    <View style={styles.list}>
      <SectionHeader title="Bahan" />
      {groups.map((group) => (
        <View key={group.section ?? '__none__'}>
          {titled ? (
            <Text variant="bodyStrong" color="textMuted" style={styles.groupTitle}>
              {group.section ?? 'Lainnya'}
            </Text>
          ) : null}
          {group.lines.map((raw, index) => {
            const line = scaleLine(raw, multiplier);
            const tracked = line.ingredientId !== null;
            const showBase = tracked && line.amountBase !== null && line.baseUnit !== null && line.unit !== line.baseUnit;
            const subtitle = [line.note, tracked ? null : 'tidak dicatat di stok'].filter(Boolean).join(' · ');
            return (
              <ListRow
                key={line.id}
                title={line.ingredientName}
                titleLines={2}
                subtitle={subtitle || undefined}
                showDivider={index < group.lines.length - 1}
                right={
                  <View style={styles.amount}>
                    <Text variant="bodyStrong" color={line.amount === null ? 'textMuted' : 'text'}>
                      {amountText(line)}
                    </Text>
                    {showBase ? (
                      <Text variant="caption" color="textMuted">
                        {formatAmount(line.amountBase!, line.baseUnit!)}
                      </Text>
                    ) : null}
                  </View>
                }
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
  },
  groupTitle: {
    paddingTop: spacing.md,
  },
  amount: {
    alignItems: 'flex-end',
  },
});
