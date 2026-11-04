import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type EmptyStateProps = {
  icon: IconName;
  message: string;
  // Satu ajakan yang jelas, misalnya "Tambah resep".
  action?: {
    label: string;
    onPress: () => void;
    variant?: 'primary' | 'outline';
  };
};

export function EmptyState({ icon, message, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Icon name={icon} color="textMuted" />
      <Text color="textMuted" style={styles.message}>
        {message}
      </Text>
      {action ? (
        <Button label={action.label} onPress={action.onPress} variant={action.variant ?? 'primary'} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  message: {
    textAlign: 'center',
  },
});
