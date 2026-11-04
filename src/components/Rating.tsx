import { StyleSheet, View } from 'react-native';

import { sizes } from '@/theme';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

const STARS = [1, 2, 3, 4, 5] as const;

type RatingProps = {
  value: number | null;
  // Tanpa onChange: hanya tampilan.
  onChange?: (value: number | null) => void;
};

// Nilai 1-5 dengan bintang garis: yang terpilih berwarna espresso, sisanya garis tipis.
// Menekan bintang yang sama lagi menghapus nilai.
export function Rating({ value, onChange }: RatingProps) {
  return (
    <View style={styles.row} accessibilityLabel={value ? `Nilai ${value} dari 5` : 'Belum dinilai'}>
      {STARS.map((star) => {
        const filled = value !== null && star <= value;
        const icon = <Icon name="star-outline" color={filled ? 'primary' : 'border'} />;
        if (!onChange) return <View key={star}>{icon}</View>;
        return (
          <PressableScale
            key={star}
            accessibilityRole="button"
            accessibilityLabel={`Nilai ${star}`}
            accessibilityState={{ selected: value === star }}
            onPress={() => onChange(value === star ? null : star)}
            style={styles.star}
          >
            {icon}
          </PressableScale>
        );
      })}
      {onChange ? (
        <Text variant="caption" color="textMuted">
          {value ? `${value} dari 5` : 'Ketuk untuk menilai'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    minWidth: sizes.touchMin,
    minHeight: sizes.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
