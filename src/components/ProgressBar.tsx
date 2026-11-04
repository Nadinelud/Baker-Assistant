import { StyleSheet, View } from 'react-native';

import { colors, radius, sizes, type ColorName } from '@/theme';

type ProgressBarProps = {
  // 0 sampai 1; nilai di luar rentang dipotong.
  value: number;
  color?: ColorName;
};

export function ProgressBar({ value, color = 'accent' }: ProgressBarProps) {
  const percent = Math.min(Math.max(value, 0), 1) * 100;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors[color] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: sizes.progressBar,
    borderRadius: radius.badge,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  fill: {
    height: sizes.progressBar,
    borderRadius: radius.badge,
  },
});
