// Langkah resep disimpan sebagai teks, satu langkah per baris.
// Nomor yang diketik user ("1." atau "1)" diikuti spasi) dibuang supaya tidak dobel dengan nomor tampilan.
// Harus diikuti spasi, supaya angka desimal seperti "1.5 kg" tidak ikut terpotong.
export function splitSteps(steps: string): string[] {
  return steps
    .split('\n')
    .map((s) => s.trim().replace(/^\d+[.)]\s+/, ''))
    .filter(Boolean);
}
