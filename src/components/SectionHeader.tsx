import { StyleSheet, View } from 'react-native';

import { sizes, spacing } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

type SectionHeaderProps = {
  title: string;
  action?: {
    label: string;
    onPress: () => void;
  };
};

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="heading">{title}</Text>
      {action ? (
        <PressableScale
          accessibilityRole="button"
          onPress={action.onPress}
          hitSlop={spacing.md}
          style={styles.action}
        >
          <Text variant="caption" color="textMuted">
            {action.label}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  action: {
    minHeight: sizes.touchMin,
    justifyContent: 'center',
  },
});
