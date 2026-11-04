import { StyleSheet, View } from 'react-native';

import { colors, radius, sizes, spacing } from '@/theme';

import { Badge } from './Badge';
import { Icon } from './Icon';
import { Photo } from './Photo';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

type PhotoCardProps = {
  title: string;
  meta: string;
  photoUri?: string | null;
  badge?: string;
  note?: string | null;
  onPress?: () => void;
};

// Kartu sorotan dengan foto, misalnya resep yang terakhir di-bake.
export function PhotoCard({ title, meta, photoUri, badge, note, onPress }: PhotoCardProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={styles.card}
    >
      <Photo uri={photoUri} shape="banner" />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="heading" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {badge ? <Badge label={badge} /> : null}
        </View>
        <Text variant="caption" color="textMuted">
          {meta}
        </Text>
        {note ? (
          <View style={styles.note}>
            <Icon name="document-text-outline" color="textMuted" />
            <Text style={styles.noteText} numberOfLines={2}>
              {note}
            </Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: sizes.borderWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: sizes.borderWidth,
    borderTopColor: colors.border,
  },
  noteText: {
    flex: 1,
  },
});
