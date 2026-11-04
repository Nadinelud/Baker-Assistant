import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, motion, radius, sizes, spacing } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

type UndoRequest = {
  message: string;
  // Tanpa onUndo: hanya pesan singkat, misalnya "Tersimpan".
  onUndo?: () => Promise<void> | void;
};

type UndoContextValue = {
  show: (request: UndoRequest) => void;
};

const UndoContext = createContext<UndoContextValue | null>(null);

// Masuk dari bawah dengan ease-out, keluar lebih cepat dengan pudar saja.
// "Kurangi gerak" di HP dihormati otomatis oleh Reanimated.
const ENTERING = FadeInDown.duration(motion.fast).easing(Easing.bezier(...motion.easeOut));
const EXITING = FadeOut.duration(motion.exit);

export function useUndo(): UndoContextValue {
  const value = useContext(UndoContext);
  if (!value) throw new Error('useUndo harus dipakai di dalam UndoProvider');
  return value;
}

type ShownRequest = UndoRequest & { key: number };

// Bar kecil di bawah layar dengan tombol "Batalkan", hilang sendiri setelah beberapa detik.
export function UndoProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [request, setRequest] = useState<ShownRequest | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextKey = useRef(1);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setRequest(null);
  }, []);

  const show = useCallback(
    (next: UndoRequest) => {
      if (timer.current) clearTimeout(timer.current);
      setRequest({ ...next, key: nextKey.current++ });
      timer.current = setTimeout(hide, motion.undoVisibleMs);
    },
    [hide],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function handleUndo() {
    const current = request;
    hide();
    await current?.onUndo?.();
  }

  // Di atas tab bar: inset bawah + tinggi tab bar (kira-kira) + jarak.
  const bottom = insets.bottom + sizes.touchMin + spacing.lg;

  return (
    <UndoContext.Provider value={{ show }}>
      <View style={styles.fill}>
        {children}
        {request ? (
          <Animated.View
            key={request.key}
            entering={ENTERING}
            exiting={EXITING}
            pointerEvents="box-none"
            style={[styles.wrapper, { bottom }]}
          >
            <View style={styles.bar} accessibilityLiveRegion="polite">
              <Text color="onPrimary" style={styles.message} numberOfLines={2}>
                {request.message}
              </Text>
              {request.onUndo ? (
                <PressableScale accessibilityRole="button" onPress={handleUndo} hitSlop={spacing.sm} style={styles.action}>
                  <Text variant="bodyStrong" color="onPrimary">
                    Batalkan
                  </Text>
                </PressableScale>
              ) : null}
            </View>
          </Animated.View>
        ) : null}
      </View>
    </UndoContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  wrapper: {
    position: 'absolute',
    left: sizes.screenGutter,
    right: sizes.screenGutter,
  },
  bar: {
    minHeight: sizes.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: colors.primary,
  },
  message: {
    flex: 1,
    paddingVertical: spacing.md,
  },
  action: {
    minHeight: sizes.touchMin,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
});
