import { splitSteps } from '../steps';

describe('splitSteps', () => {
  it('satu langkah per baris, baris kosong dibuang', () => {
    expect(splitSteps('Kocok telur\n\n  Masukkan tepung  \n')).toEqual(['Kocok telur', 'Masukkan tepung']);
  });

  it('membuang nomor yang diketik user', () => {
    expect(splitSteps('1. Kocok telur\n2) Masukkan tepung\n10. Panggang')).toEqual([
      'Kocok telur',
      'Masukkan tepung',
      'Panggang',
    ]);
  });

  it('tidak memotong angka di awal langkah', () => {
    expect(splitSteps('1.5 kg tepung diayak\n2 butir telur dikocok\n3,5 sdm gula')).toEqual([
      '1.5 kg tepung diayak',
      '2 butir telur dikocok',
      '3,5 sdm gula',
    ]);
  });
});
