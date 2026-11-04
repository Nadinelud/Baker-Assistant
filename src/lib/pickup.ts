// Waktu ambil pesanan disimpan sebagai waktu lokal "YYYY-MM-DDTHH:mm" (tanpa zona waktu),
// supaya urutan teks = urutan waktu dan "tanggal" = 10 karakter pertama.

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toPickupString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parsePickup(value: string): Date {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function dateKey(value: string | Date): string {
  return (typeof value === 'string' ? value : toPickupString(value)).slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Jam tertentu pada tanggal yang sama.
export function atTime(date: Date, hours: number, minutes = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
}
