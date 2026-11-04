# Baker Assistant (Android)

App personal untuk mencatat resep, mengelola stok bahan, dan mengatur pesanan kue.
Dipakai pribadi oleh satu orang (tanpa login, tanpa server). Platform: **Android saja** untuk sekarang.

## Aturan utama (WAJIB diikuti)

1. **Stok selalu lewat riwayat.** Jangan pernah menyimpan atau mengubah angka stok langsung. Setiap perubahan = 1 baris di `stock_movements`. Stok saat ini = `SUM(amount_base)` per bahan.
2. **Semua jumlah disimpan dalam satuan dasar bahan** (`g`, `ml`, atau `pcs`). Konversi (cup, sdm, sdt, dll.) hanya dilakukan saat input dan tampilan.
3. **Konversi satuan disimpan per bahan** (1 cup tepung != 1 cup gula).
4. **Hasil AI selalu lewat layar review.** Resep dari foto/link tidak boleh langsung tersimpan; user cek dan koreksi dulu.
5. **Jangan buat fitur yang ada di daftar "Ditunda".**
6. **Bahasa UI: Indonesia.** Nama kode (tabel, variabel, fungsi): Inggris.
7. **Offline-first.** Semua fitur inti harus jalan tanpa internet. Hanya fitur AI yang butuh internet.
8. Jaga kode tetap sederhana. Hindari library tambahan kalau tidak perlu.
9. **Ikuti bagian "Desain"** di bawah. Semua gaya lewat `src/theme`, tanpa nilai tulis langsung.

## Cakupan

**Masuk:**
- Resep: tambah manual, dari foto buku, dari link
- Versi resep (v1, v2, ...)
- Scaling resep dan konversi satuan
- Stok bahan: potong cepat tanpa resep, cek stok berkala, peringatan stok menipis
- Pesanan: tanggal ambil, item, total kebutuhan bahan, cek "bahan cukup?"
- Catatan hasil bake (dengan foto)
- Daftar belanja otomatis (tanpa harga): bahan habis/hampir habis + kekurangan untuk pesanan + tambah manual
- Ekspor dan impor data (backup)

**Ditunda (JANGAN dibuat sekarang):**
- Harga beli, HPP, harga jual, laporan untung rugi
- Rekomendasi "bisa bikin apa dari stok" (menunggu resep sudah banyak)
- Timer dan mode baca di dapur (tidak akan dibuat)
- Sinkronisasi cloud, login, iPhone

Kolom harga bisa ditambah belakangan lewat migrasi; tidak perlu disiapkan sekarang.

## Teknologi

- **React Native + Expo** (TypeScript), Android
- **expo-sqlite** untuk database lokal
- **expo-router** untuk navigasi
- **expo-image-picker** untuk foto (kamera dan galeri)
- **expo-notifications** (notifikasi lokal) untuk pengingat pesanan dan stok menipis
- **expo-secure-store** untuk menyimpan API key (Gemini)
- **expo-file-system + expo-sharing** untuk ekspor/impor backup
- **Gemini API** (paket gratis Google AI Studio, REST `generateContent`, tanpa library tambahan) untuk baca resep dari foto, dan sebagai cadangan untuk link. Dipilih user karena gratis (Claude API tidak punya paket gratis). Model bawaan `gemini-3.5-flash-lite`. Catatan: di paket gratis Google bisa memakai data yang dikirim untuk perbaikan layanan.
- Build APK: GitHub Actions (`.github/workflows/release-apk.yml`), tanpa akun Expo. Push tag `vX.Y.Z` -> tes, `expo prebuild`, `gradlew assembleRelease`, lalu APK masuk GitHub Releases. Dipilih user supaya APK bisa diunduh dari GitHub. Untuk tes harian pakai `npx expo start` + Expo Go.

API key Gemini dimasukkan user di layar Pengaturan, disimpan di SecureStore. Jangan di-hardcode dan jangan di-commit.

## Build APK

- Folder `android/` tidak di-commit; dibuat ulang oleh `expo prebuild` di GitHub Actions. Ubah konfigurasi native lewat `app.json` / config plugin, bukan file di `android/`.
- `plugins/withReleaseSigning.js`: APK release ditandatangani kunci dari environment (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`); versi dari `APP_VERSION_NAME` (tag tanpa `v`) dan `APP_VERSION_CODE` (`github.run_number`, selalu naik).
- GitHub Secrets: `ANDROID_KEYSTORE_BASE64` (isi file kunci, base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- **Kunci tanda tangan tidak boleh hilang atau berganti.** APK dengan kunci lain tidak bisa memperbarui app yang terpasang (harus hapus app = data hilang). Simpan file kunci + password di luar repo dan buat cadangannya. Jangan pernah commit file kunci (`*.keystore`, `*.jks` ada di `.gitignore`).
- Membuat kunci (sekali saja), dari Git Bash:
  `"/c/Program Files/Android/Android Studio/jbr/bin/keytool.exe" -genkeypair -v -storetype PKCS12 -keystore baker-release.keystore -alias baker -keyalg RSA -keysize 2048 -validity 10000`
  lalu `base64 -w0 baker-release.keystore` untuk isi secret `ANDROID_KEYSTORE_BASE64`.
- Ikon: kocokan espresso di latar krem (`assets/`), ikon notifikasi putih `assets/notification-icon.png`.

## Struktur data (SQLite)

```sql
CREATE TABLE ingredients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  base_unit TEXT NOT NULL CHECK (base_unit IN ('g','ml','pcs')),
  min_stock REAL NOT NULL DEFAULT 0,      -- dalam satuan dasar; 0 = tanpa peringatan
  created_at TEXT NOT NULL
);

-- nama lain untuk bahan yang sama ("terigu", "tepung terigu")
CREATE TABLE ingredient_aliases (
  id INTEGER PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  alias TEXT NOT NULL UNIQUE
);

-- konversi per bahan, misal tepung: cup -> 120 (g)
CREATE TABLE ingredient_conversions (
  id INTEGER PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  unit_name TEXT NOT NULL,                -- cup, sdm, sdt, butir, dll.
  to_base_amount REAL NOT NULL,
  UNIQUE (ingredient_id, unit_name)
);

CREATE TABLE recipes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  yield_amount REAL NOT NULL,             -- hasil jadi, misal 12
  yield_unit TEXT NOT NULL,               -- cupcake, loyang, porsi
  active_version_id INTEGER,              -- versi yang dipakai sekarang
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','photo','link','draft')),
  source_ref TEXT,                        -- URL atau path foto
  is_draft INTEGER NOT NULL DEFAULT 0,    -- 1 = dibuat otomatis dari "potong cepat"
  created_at TEXT NOT NULL
);

CREATE TABLE recipe_versions (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  change_note TEXT,
  steps TEXT,
  oven_temp INTEGER,                      -- migrasi v2: suhu oven (°C) versi ini
  duration_min INTEGER,                   -- migrasi v2: durasi (menit) versi ini
  created_at TEXT NOT NULL,
  UNIQUE (recipe_id, version_number)
);

-- migrasi v3: dibangun ulang supaya bahan boleh tanpa stok / tanpa takaran
CREATE TABLE recipe_version_ingredients (
  id INTEGER PRIMARY KEY,
  version_id INTEGER NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id),  -- NULL = tidak dicatat di stok
  name TEXT,                              -- nama untuk bahan tanpa stok
  amount REAL,                            -- sesuai input user; NULL = tanpa takaran ("secukupnya")
  unit TEXT,                              -- satuan input (cup, g, dll.)
  amount_base REAL,                       -- dikonversi ke satuan dasar; NULL = tidak memotong stok
  note TEXT,                              -- catatan bahan ("ukuran besar", "potong dadu kecil")
  section TEXT,                           -- bagian resep ("Bahan A", "Filling", "Topping")
  CHECK (ingredient_id IS NOT NULL OR (name IS NOT NULL AND name <> ''))
);

-- RIWAYAT STOK: satu-satunya sumber kebenaran stok
CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  amount_base REAL NOT NULL,              -- positif = masuk, negatif = keluar
  reason TEXT NOT NULL CHECK (reason IN ('purchase','bake','quick_deduct','stock_check','order','adjustment','revert')),
  ref_type TEXT,                          -- 'bake_log', 'order', dll.
  ref_id INTEGER,
  note TEXT,
  reverted_of_id INTEGER REFERENCES stock_movements(id),
  created_at TEXT NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_name TEXT NOT NULL,
  pickup_date TEXT NOT NULL,              -- waktu lokal "YYYY-MM-DDTHH:mm" (tanggal + jam ambil)
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','baked','done','cancelled')),
  stock_deducted INTEGER NOT NULL DEFAULT 0,  -- cegah stok terpotong dua kali
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id),
  version_id INTEGER REFERENCES recipe_versions(id),  -- NULL = pakai versi aktif
  quantity REAL NOT NULL                  -- jumlah hasil jadi, misal 24 cupcake
                                          -- kelipatan = quantity / recipes.yield_amount
);

CREATE TABLE bake_logs (
  id INTEGER PRIMARY KEY,
  version_id INTEGER NOT NULL REFERENCES recipe_versions(id),
  order_id INTEGER REFERENCES orders(id),
  baked_at TEXT NOT NULL,
  multiplier REAL NOT NULL DEFAULT 1,
  oven_temp INTEGER,                      -- derajat C
  duration_min INTEGER,
  result_note TEXT,                       -- hasil dan ide perbaikan
  rating INTEGER CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE bake_log_photos (
  id INTEGER PRIMARY KEY,
  bake_log_id INTEGER NOT NULL REFERENCES bake_logs(id) ON DELETE CASCADE,
  uri TEXT NOT NULL
);

CREATE TABLE shopping_items (
  id INTEGER PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  amount_base REAL NOT NULL,
  is_bought INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Gunakan sistem migrasi sederhana (tabel `schema_version`) supaya struktur bisa diubah nanti tanpa menghapus data.

## Logika penting

- **Stok saat ini:** `SELECT SUM(amount_base) FROM stock_movements WHERE ingredient_id = ?`
- **Menipis:** stok saat ini <= `min_stock` (dan `min_stock` > 0)
- **Scaling:** kelipatan = jumlah yang diinginkan / `yield_amount`; kebutuhan bahan = `amount_base` x kelipatan
- **Bake:** saat "Selesai bake", buat 1 `bake_log` + 1 `stock_movements` (negatif) per bahan, `reason = 'bake'`. Setelah itu tawarkan isi catatan hasil.
- **Potong cepat:** buat `stock_movements` dengan `reason = 'quick_deduct'`, lalu tawarkan "Simpan sebagai resep draft?" (bahan sudah terisi, `is_draft = 1`).
- **Cek stok:** user mengetik sisa sebenarnya; selisih (sisa sebenarnya - stok tercatat) disimpan sebagai movement `reason = 'stock_check'`. Tampilkan bahan yang paling sering dipakai lebih dulu.
- **Pembatalan:** jangan hapus movement. Buat movement baru berlawanan tanda, `reason = 'revert'`, isi `reverted_of_id`.
- **Stok awal** saat bahan dibuat dicatat sebagai movement `reason = 'adjustment'`, catatan "Stok awal".
- **Satuan dasar bahan tidak bisa diubah** setelah dibuat (riwayat tersimpan dalam satuan itu).
- **Hapus bahan:** setelah konfirmasi, bahan dihapus beserta seluruh riwayat stok dan item belanjanya. Ditolak kalau bahan dipakai di resep.
- **Resep draft:** setelah potong cepat, tawarkan "Simpan sebagai resep draft?" (bahan terisi, `is_draft = 1`, `source_type = 'draft'`). Draft yang disimpan lewat form ubah jadi resep biasa (`is_draft = 0`).
- **Versi resep:** saat menyimpan perubahan, user memilih "Simpan sebagai versi baru" (dengan catatan perubahan, langsung jadi aktif) atau "Perbarui versi ini" (untuk salah ketik). Versi lama bisa dilihat dan dijadikan aktif lagi. Nama dan hasil jadi ada di level resep, bukan per versi.
- **Satuan baru dari form resep** (misalnya "1 cup = 120 g") langsung disimpan ke `ingredient_conversions` bahan itu. Bahan baru bisa dibuat dari form resep (stok awal 0).
- **Bake:** "Bake ini" memakai versi yang sedang dilihat dan kelipatan dari scaling. Stok boleh jadi minus; bahan yang kurang ditandai sebelum "Selesai bake". Setelah selesai ada "Batalkan" (revert movement + hapus bake_log) dan satu getar halus.
- **Hapus resep:** setelah konfirmasi, resep + semua versi + catatan bake dihapus; riwayat stok dari bake tetap. Ditolak kalau resep dipakai di pesanan.
- **Catatan bake:** setelah "Selesai bake" langsung ke layar catatan (suhu, durasi, nilai 1-5, hasil + ide perbaikan, maks. 6 foto) dengan "Lewati" dan "Batalkan bake ini". Suhu/durasi bake sebelumnya untuk versi yang sama jadi contoh di isian.
- **Nilai** ditampilkan sebagai bintang garis: terpilih berwarna `primary`, sisanya `border`.
- **Foto** diambil dengan expo-image-picker (kualitas 0,7) lalu disalin ke `Paths.document/bake-photos` (expo-file-system). File foto ikut dihapus saat foto, catatan, atau resep dihapus.
- **Hapus catatan bake** tidak mengubah stok (bahan memang sudah terpakai).
- **Peringatan stok menipis** di dalam app (Beranda, Stok) + notifikasi ringkasan harian jam 08.00 (hanya kalau ada yang menipis).
- **Suhu dan durasi** disimpan per versi resep dan disalin ke `bake_logs` saat "Selesai bake"; di layar catatan sudah terisi dan bisa diganti.
- **Notifikasi pesanan** (lokal, expo-notifications): H-2 jam 19.00 bahan yang masih kurang (hanya kalau ada), H-1 jam 08.00 pengingat mulai membuat, hari H jam 07.00 (atau 1 jam sebelum ambil kalau lebih pagi) jam ambil. Isi dihitung saat dijadwalkan, jadi semua jadwal dihitung ulang saat app dibuka/ditinggalkan dan setelah pesanan berubah. Izin diminta saat pesanan pertama disimpan.
- **Status pesanan:** "Tandai sudah dibuat" memotong stok (bisa Batalkan sebentar). "Tandai selesai" langsung dari status baru juga memotong stok kalau belum. Batal tidak mengembalikan stok. Pesanan hanya bisa diubah selama berstatus baru. Item memakai versi aktif resep (`version_id` NULL).
- **Kekurangan pesanan ke daftar belanja:** jumlah = kekurangan; kalau bahan sudah ada di daftar, dipakai jumlah terbesar.
- **Daftar belanja** = (1) bahan habis (stok <= 0) atau hampir habis, dihitung langsung dari stok dan tidak disimpan, tanpa jumlah; (2) item di `shopping_items` (tambah manual, dan kekurangan pesanan di tahap 5). `amount_base = 0` di `shopping_items` berarti tanpa jumlah. Satu bahan tampil sekali.
- **Sudah dibeli:** user mengisi jumlah yang dibeli, lalu tercatat movement `reason = 'purchase'` dan item ditandai `is_bought = 1`. Bisa dibatalkan (revert + kembalikan item). Bahan yang masuk karena stok hilang sendiri dari daftar kalau stok sudah di atas batas.
- **Kebutuhan bahan pesanan:** untuk semua pesanan dengan `pickup_date` tertentu (status `new`), jumlahkan kebutuhan bahan per bahan, bandingkan dengan stok saat ini, tampilkan yang kurang. Tombol "Tambah ke daftar belanja" memasukkan selisihnya.
- **Pesanan dibuat:** saat status jadi `baked` dan `stock_deducted = 0`, potong stok (`reason = 'order'`), lalu set `stock_deducted = 1`.
- **Pencocokan nama bahan (impor resep):** urutannya (1) AI: daftar nama bahan stok ikut dikirim ke Gemini, AI mengisi `stock_name` (harus persis dari daftar, termasuk terjemahan Inggris-Indonesia dan variasi ukuran/olahan) + `note`; untuk resep dari data JSON-LD ada panggilan AI khusus pencocokan kalau ada API key; (2) nama persis / alias (huruf kecil, tanpa spasi berlebih); (3) aturan di HP: pilihan nama ("a/b", "a atau b", isi kurung) dan awalan nama stok utuh ("telur ukuran besar" -> Telur, sisanya jadi catatan; nama stok terpanjang menang). Yang dicocokkan otomatis ditandai "(otomatis)" di layar review. Sisanya: pilih bahan, buat bahan baru, tulis tanpa stok, atau lewati. Pencocokan oleh AI dan user disimpan sebagai alias.
- **Bahan resep tanpa stok:** tertulis di resep dan ikut scaling, tapi tidak memotong stok dan tidak masuk kebutuhan pesanan/bake. Bahan stok tanpa takaran ("secukupnya") juga tidak memotong stok.
- **Bagian resep:** `section` per baris; detail resep dan layar review mengelompokkan per bagian sesuai urutan kemunculan. Judul bagian yang terbaca sebagai bahan ("Filling", "Bahan A:", "For the topping", tanpa takaran) diubah jadi `section` untuk bahan sesudahnya. Bahan yang sama boleh muncul di beberapa bagian.
- **sdm/sdt:** untuk bahan cair otomatis (1 sdm = 15 ml, 1 sdt = 5 ml). Untuk bahan padat chip sdm/sdt selalu ditawarkan; kalau beratnya belum diketahui, user mengisi "1 sdm <bahan> = ... g" sekali dan disimpan ke `ingredient_conversions` bahan itu.

- **Backup (ekspor):** satu file `.json` berisi semua tabel (kecuali pengaturan milik HP ini: `last_backup_at`) + semua foto (base64, kunci = path relatif seperti `bake-photos/x.jpg`; di data ditulis `photo:<path>`). Dibagikan lewat menu bagikan Android (expo-sharing). API key tidak ikut. Tanggal backup terakhir tampil di Pengaturan (tanpa notifikasi).
- **Backup (impor):** pilih file (`File.pickFileAsync`), validasi (`app`, `format`, `schemaVersion` tidak lebih baru dari app, isi tabel, path foto hanya di folder foto app), tampilkan ringkasan, lalu "Ganti semua" setelah konfirmasi. Data sekarang disimpan dulu ke `Paths.document/backups/sebelum-impor.json` (bisa dikembalikan dari Pengaturan). Penggantian data dalam satu transaksi (gagal = data lama utuh); backup dari versi database lama tetap bisa (kolom baru diisi bawaannya). Foto yang tidak dipakai lagi dihapus, notifikasi dijadwal ulang.

## Resep dari foto dan link

- **Link:** ambil HTML halaman, cari data terstruktur `schema.org/Recipe` (JSON-LD) dulu. Kalau ada, pakai itu (gratis dan akurat, tanpa API key). Kalau tidak ada, kirim teks halaman (maks. 60.000 karakter, ditandai di review kalau terpotong) ke Gemini.
- **Foto:** sampai 4 foto untuk satu resep, dikirim sekaligus ke Gemini (vision, kualitas 0,5). Minta hasil dalam **JSON saja** (responseSchema) dengan bentuk: `name`, `yield_amount`, `yield_unit`, `ingredients[{name, amount, unit, note, section, stock_name}]`, `steps[]`.
- Validasi JSON sebelum dipakai. Kalau gagal, tampilkan pesan error yang jelas dan izinkan coba lagi atau isi manual.
- Setelah itu: layar review dua langkah: (1) tentukan tiap bahan, dikelompokkan per bagian (cocok ke stok, tulis tanpa stok, atau lewati), (2) form resep biasa untuk koreksi takaran/langkah, lalu simpan dengan `source_type` photo/link. Hasil baca hanya di memori sampai disimpan. Bahan yang dicocokkan manual disimpan sebagai alias.
- Nama model Gemini disimpan di Pengaturan supaya mudah diganti.

## Desain (WAJIB konsisten)

Tema: **putih bersih + aksen terakota**, terasa hangat seperti toko roti, tapi rapi dan tidak ramai. Target: tidak terlihat seperti template AI atau app generik.

### Satu sumber kebenaran
- Semua nilai desain ada di satu file: `src/theme/index.ts` (warna, font, ukuran huruf, jarak, sudut, ukuran sentuh).
- **Dilarang** menulis warna hex, ukuran huruf, jarak, atau radius langsung di layar atau komponen. Selalu ambil dari tema.
- Buat komponen dasar yang dipakai ulang di semua layar (`Screen`, `Text`, `Button`, `Card`, `ListRow`, `EmptyState`, `Input`, `Badge`, plus `Icon`, `Photo`, `PhotoCard`, `SectionHeader`, `StatStrip`, `ProgressBar`, `StockLevelRow`). Layar tidak boleh membuat gaya tombol atau kartu sendiri.
- Kalau butuh nilai baru, tambahkan ke tema dulu, lalu pakai.

### Warna
| Nama token | Nilai | Dipakai untuk |
|---|---|---|
| `bg` | `#FFFFFF` | latar semua layar |
| `surface` | `#FBF5F1` | kartu, blok info, input |
| `surfaceMuted` | `#F3E7DF` | tempat foto kosong, jalur bar stok |
| `border` | `#EADFD7` | garis tipis (1 px) |
| `text` | `#2B1E18` | teks utama |
| `textMuted` | `#8A766B` | label, keterangan, placeholder |
| `primary` | `#2B1E18` | isi tombol utama (espresso) |
| `onPrimary` | `#FFFFFF` | teks di atas `primary` |
| `accent` | `#B84A2E` | peringatan stok menipis, item aktif (tab) |
| `onAccent` | `#FFFFFF` | teks di atas `accent` |
| `success` | `#4F7230` | status selesai / stok cukup |
| `danger` | `#A32D2D` | hapus, error |

Aturan warna:
- Tombol utama berisi warna `primary` (espresso), bukan terakota. Terakota sebagai isi tombol terasa "darurat".
- Aksen terakota hanya untuk hal yang perlu perhatian (stok menipis) dan item aktif. Jangan dipakai sebagai hiasan atau isi tombol.
- Maksimal **satu tombol utama berisi warna per layar**. Tombol lain pakai gaya garis tipis (outline) atau teks saja.
- Tanpa gradasi, tanpa bayangan tebal, tanpa warna neon. Kedalaman cukup dari garis tipis `border`.
- Mode terang saja untuk sekarang. Tapi semua warna tetap lewat token supaya mode gelap bisa ditambah nanti.

### Font
- Judul dan angka besar: **Fraunces** (weight 500).
- Semua teks lain: **DM Sans** (weight 400 dan 500).
- Pasang lewat `@expo-google-fonts/fraunces` dan `@expo-google-fonts/dm-sans`. Tahan layar splash sampai font selesai dimuat.

| Gaya | Font | Ukuran |
|---|---|---|
| `title` | Fraunces 500 | 28 |
| `heading` | Fraunces 500 | 20 |
| `body` | DM Sans 400 | 16 |
| `bodyStrong` | DM Sans 500 | 16 |
| `caption` | DM Sans 400 | 13 |
| `number` (stok, jumlah) | Fraunces 500 | 24 |

Tidak ada ukuran huruf di bawah 13.

### Jarak, sudut, ukuran
- Skala jarak: 4, 8, 12, 16, 24, 32. Tidak boleh angka lain.
- Radius: kartu dan tombol 12, input 12, badge 999.
- Area sentuh minimal **48 dp** tinggi (tangan sering kotor tepung). Tombol 52.
- Margin samping layar 16.

### Pola tampilan
- Daftar bahan dan stok: baris dengan garis pemisah tipis, bukan kartu bertumpuk.
- Angka penting (sisa stok, jumlah pesanan, kelipatan resep) tampil besar dengan gaya `number`.
- Ikon: satu set ikon garis (outline) saja, ukuran seragam (22). Tanpa emoji di UI.
- Setiap daftar punya tampilan kosong yang ramah dengan satu ajakan jelas, misalnya "Belum ada resep. Tambah resep pertama kamu."
- Aksi berbahaya (hapus) selalu minta konfirmasi, dan aksi penting yang bisa dibatalkan (potong stok) menampilkan "Batalkan" sebentar.
- Gerak halus saja (200 sampai 250 ms). Tanpa animasi dekoratif. Pakai Reanimated (bukan `Animated` bawaan), kurva ease-out kuat dari `motion.easeOut`, keluar lebih cepat dari masuk, dan hormati "kurangi gerak".
- Semua yang bisa ditekan memakai `PressableScale` (mengecil ke 0,97 saat jari menyentuh). Getar (expo-haptics) maksimal satu per aksi penting, tidak pernah jadi satu-satunya tanda.
- Skill desain yang dipakai: `emil-design-eng`, `animate-expo`, `break-ui` (uji data ekstrem lewat tombol "Isi data uji ekstrem" di Pengaturan, hanya mode pengembangan).

### Teks UI
- Bahasa Indonesia, kalimat biasa dan singkat.
- Tombol diawali kata kerja: "Tambah resep", "Selesai bake", "Simpan".
- Tanpa tanda seru berlebihan, tanpa "berhasil!" setelah setiap aksi. Cukup "Tersimpan".
- Pesan error: sebut apa yang terjadi lalu apa yang bisa dilakukan.

### Contoh Beranda (acuan)
- Atas: tanggal kecil (`caption`, `textMuted`), lalu judul "Hari ini di dapur" (`title`).
- Tombol cepat berdampingan: "Tambah resep" (utama, `primary`) dan "Potong stok" (outline).
- Strip angka di `surface`: jumlah resep, bahan, dan bake bulan ini (gaya `number`).
- "Terakhir di-bake": kartu foto (`PhotoCard`) dengan nama resep, versi, waktu, suhu/durasi, dan catatan hasil; di bawahnya 2 resep lain dengan foto kecil.
- "Hampir habis": baris stok dengan bar sisa terhadap batas minimum. Angka dan bar stok menipis berwarna `accent`.
- Tidak ada pesanan dan tidak ada tombol "Bake ini" di Beranda (tombol itu hanya di Resep).

## Layar

Tab bawah: Beranda, Resep, Stok, Pesanan, Lainnya.

- **Beranda:** resep terakhir di-bake, bahan hampir habis, strip angka, tombol cepat (Tambah resep, Potong stok)
- **Resep:** daftar, detail, versi, scaling, tombol "Bake ini", tambah (manual / foto / link)
- **Stok:** daftar bahan, tambah bahan, potong, cek stok, riwayat per bahan
- **Pesanan:** daftar per tanggal, detail, kebutuhan bahan
- **Belanja** (dibuka dari Stok): bahan habis/hampir habis otomatis, tambah manual, ketuk untuk isi jumlah dibeli (stok bertambah), bagian "Sudah dibeli"
- **Riwayat bake** (di Lainnya, juga 5 terakhir di detail resep): catatan dan foto
- **Pengaturan** (di Lainnya): API key, nama model, ekspor/impor data

## Urutan pengerjaan

Kerjakan satu tahap per sesi, dan pastikan jalan sebelum lanjut.

1. **Fondasi:** proyek Expo, navigasi, `src/theme` + komponen dasar (sesuai bagian Desain), database + migrasi, helper satuan dan konversi
2. **Stok:** bahan, riwayat stok, potong cepat, cek stok, peringatan menipis
3. **Resep manual:** buat resep, scaling, tombol "Bake ini", versi resep
4. **Catatan bake:** catatan hasil dan foto
5. **Pesanan:** pesanan, kebutuhan bahan, cek cukup/tidak, daftar belanja, notifikasi
6. **Resep dari foto dan link:** parsing AI, layar review, pencocokan bahan
7. **Backup:** ekspor dan impor data
8. **Build APK** untuk dipasang di HP (GitHub Actions -> GitHub Releases)

## Cara kerja dengan Claude Code

- Tulis tes untuk logika inti (stok dari riwayat, konversi satuan, scaling, kebutuhan bahan pesanan) karena kesalahan di sini berarti stok salah.
- Jelaskan perubahan besar sebelum mengerjakannya, terutama yang menyentuh struktur database.
- Kalau ada keputusan yang tidak ada di dokumen ini, tanyakan dulu, jangan menebak.
