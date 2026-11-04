// Satu-satunya sumber nilai desain. Layar dan komponen tidak boleh menulis
// warna, ukuran huruf, jarak, atau radius langsung; selalu ambil dari sini.

export const colors = {
  bg: '#FFFFFF',
  surface: '#FBF5F1',
  surfaceMuted: '#F3E7DF', // tempat foto kosong, jalur bar stok
  border: '#EADFD7',
  text: '#2B1E18',
  textMuted: '#8A766B',
  primary: '#2B1E18', // tombol utama (espresso)
  onPrimary: '#FFFFFF',
  accent: '#B84A2E', // hanya untuk peringatan dan item aktif
  onAccent: '#FFFFFF',
  success: '#4F7230',
  danger: '#A32D2D',
} as const;

export type ColorName = keyof typeof colors;

// Nama keluarga font harus sama dengan kunci yang dimuat di useFonts (src/app/_layout.tsx).
export const fonts = {
  display: 'Fraunces_500Medium',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
} as const;

export const typography = {
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  number: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30 },
} as const;

export type TypographyVariant = keyof typeof typography;

// Skala jarak: hanya 4, 8, 12, 16, 24, 32.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  card: 12,
  button: 12,
  input: 12,
  badge: 999,
} as const;

export const sizes = {
  touchMin: 48, // tinggi area sentuh minimal (dp)
  button: 52,
  chip: 40, // ditambah hitSlop supaya area sentuh tetap 48
  numberInput: 120, // lebar kotak angka di samping nama bahan
  textArea: 120, // tinggi minimal isian banyak baris
  icon: 22,
  thumbnail: 44,
  photoTile: 96, // foto di catatan bake
  photo: 120,
  progressBar: 4,
  screenGutter: spacing.lg,
  borderWidth: 1,
} as const;

export const motion = {
  press: 120, // umpan balik tekan
  exit: 150, // keluar lebih cepat dari masuk
  fast: 200,
  normal: 250,
  undoVisibleMs: 5000, // lama bar "Batalkan" tampil
  pressScale: 0.97,
  // Kurva bezier (dipakai lewat cubicBezier / Easing.bezier dari Reanimated).
  easeOut: [0.23, 1, 0.32, 1] as const,
  easeInOut: [0.77, 0, 0.175, 1] as const,
} as const;

export const opacity = {
  pressed: 0.7,
  disabled: 0.4,
} as const;

export const theme = { colors, fonts, typography, spacing, radius, sizes, motion, opacity };
export default theme;
