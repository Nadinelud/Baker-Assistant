import { useState, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';

import { motion, opacity, spacing } from '@/theme';

type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

const EASE_OUT = cubicBezier(...motion.easeOut);
const PRESS_RETENTION = { top: spacing.lg, left: spacing.lg, right: spacing.lg, bottom: spacing.lg };

// Semua yang bisa ditekan: mengecil sedikit saat jari menyentuh (bukan saat dilepas),
// supaya terasa langsung didengar. Dengan "kurangi gerak" aktif, cukup meredup.
export function PressableScale({ style, children, disabled, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  const active = pressed && !disabled;

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      pressRetentionOffset={PRESS_RETENTION}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [{ scale: active && !reduced ? motion.pressScale : 1 }],
            opacity: active && reduced ? opacity.pressed : undefined,
            transitionProperty: reduced ? 'opacity' : 'transform',
            transitionDuration: motion.press,
            transitionTimingFunction: EASE_OUT,
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
