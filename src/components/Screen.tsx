import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, sizes, spacing } from '@/theme';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  // true kalau layar punya header Stack (header sudah menangani area status bar).
  hasHeader?: boolean;
  // true untuk layar tanpa tab bar, supaya isi tidak tertutup tombol navigasi HP.
  bottomInset?: boolean;
};

export function Screen({ children, scroll = true, hasHeader = false, bottomInset = false }: ScreenProps) {
  const edges: Edge[] = [];
  if (!hasHeader) edges.push('top');
  if (bottomInset) edges.push('bottom');

  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: sizes.screenGutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  fill: {
    flex: 1,
  },
});
