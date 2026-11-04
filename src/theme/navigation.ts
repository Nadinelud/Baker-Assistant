// Opsi header Stack yang sama untuk semua layar bertumpuk.
import { colors, typography } from './index';

export const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerTitleStyle: { fontFamily: typography.heading.fontFamily, fontSize: typography.heading.fontSize },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
} as const;
