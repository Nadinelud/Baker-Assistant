import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { colors, sizes, type ColorName } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Hanya ikon garis (outline), ukuran seragam.
export type IconName = Extract<IoniconName, `${string}-outline`>;

type IconProps = {
  name: IconName;
  color?: ColorName;
};

export function Icon({ name, color = 'text' }: IconProps) {
  return <Ionicons name={name} size={sizes.icon} color={colors[color]} />;
}
