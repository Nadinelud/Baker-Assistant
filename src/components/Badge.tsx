import { StyleSheet, View } from 'react-native';

import { colors, radius, sizes, spacing, type ColorName } from '@/theme';

import { Text } from './Text';

type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger';

const toneColor: Record<BadgeTone, ColorName> = {
  neutral: 'textMuted',
  accent: 'accent',
  success: 'success',
  danger: 'danger',
};

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
};

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const color = toneColor[tone];
  return (
    <View style={[styles.badge, { borderColor: colors[color] }]}>
      <Text variant="caption" color={color}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: sizes.borderWidth,
    borderRadius: radius.badge,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bg,
  },
});
