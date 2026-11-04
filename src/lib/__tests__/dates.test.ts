import { formatDateTime, formatDaysAgo, formatLongDate, formatRelativeDay, formatShortDate, formatTime } from '../dates';

describe('formatLongDate', () => {
  it('hari, tanggal, bulan, tahun dalam bahasa Indonesia', () => {
    expect(formatLongDate(new Date(2026, 10, 3))).toBe('Selasa, 3 November 2026');
    expect(formatLongDate(new Date(2027, 0, 1))).toBe('Jumat, 1 Januari 2027');
  });
});

describe('formatRelativeDay', () => {
  const today = new Date(2026, 10, 3, 21, 30);

  it('hari ini, besok, kemarin', () => {
    expect(formatRelativeDay(new Date(2026, 10, 3, 8), today)).toBe('Hari ini');
    expect(formatRelativeDay(new Date(2026, 10, 4, 1), today)).toBe('Besok');
    expect(formatRelativeDay(new Date(2026, 10, 2), today)).toBe('Kemarin');
  });

  it('tanggal lain dengan nama hari dan bulan singkat', () => {
    expect(formatRelativeDay(new Date(2026, 10, 5), today)).toBe('Kamis, 5 Nov');
  });
});

describe('formatDaysAgo', () => {
  const today = new Date(2026, 10, 3, 9);

  it('hari ini, kemarin, hari dan minggu lalu', () => {
    expect(formatDaysAgo(new Date(2026, 10, 3, 7), today)).toBe('Hari ini');
    expect(formatDaysAgo(new Date(2026, 10, 2, 23), today)).toBe('Kemarin');
    expect(formatDaysAgo(new Date(2026, 9, 31), today)).toBe('3 hari lalu');
    expect(formatDaysAgo(new Date(2026, 9, 27), today)).toBe('1 minggu lalu');
    expect(formatDaysAgo(new Date(2026, 9, 13), today)).toBe('3 minggu lalu');
  });

  it('lebih dari 4 minggu memakai tanggal', () => {
    expect(formatDaysAgo(new Date(2026, 9, 5), today)).toBe('5 Okt 2026');
  });
});

describe('formatDateTime', () => {
  it('tanggal singkat dan jam dengan titik', () => {
    expect(formatDateTime(new Date(2026, 10, 3, 14, 5))).toBe('3 Nov 2026, 14.05');
    expect(formatDateTime(new Date(2026, 0, 9, 7, 0))).toBe('9 Jan 2026, 07.00');
  });
});

describe('formatTime dan formatShortDate', () => {
  it('jam dengan titik, tanggal singkat dengan hari', () => {
    expect(formatTime(new Date(2026, 10, 5, 7, 5))).toBe('07.05');
    expect(formatShortDate(new Date(2026, 10, 5))).toBe('Kamis, 5 Nov 2026');
  });
});
