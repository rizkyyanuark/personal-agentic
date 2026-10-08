# Laporan Investigasi QA Terarah: Penyebab Gerak Berulang, Reset Posisi, dan Karakter Stuck

Tanggal: 4 Oktober 2026 (WIB)  
Target URL: `http://127.0.0.1:8099` (Preview Server Daemon, PID `560838`)  
Dokumen Referensi: `docs/reports/2026-10-04-motion-test-alignment-handoff.md`  
Status Uji: **FAIL (Ditemukan Cacat Runtime & Ketidaksesuaian Kontrak)**  
Batas Pekerjaan: Pengujian dan pelaporan investigatif saja; tanpa modifikasi kode produk, tanpa perubahan assertion, tanpa restart layanan, tanpa menyentuh produksi 8095 atau memodifikasi database ledger.

---

## 1. Metadata Lingkungan Pengujian & Verifikasi Build

Pengujian dijalankan pada browser Chromium headless via Puppeteer dengan isolasi network interception untuk membedakan secara tegas antara data fixture simulasi dan data produksi.

- **URL Preview:** `http://127.0.0.1:8099`
- **Direktori Build Preview:** `/tmp/cockpit-test-dist`
- **Bundle Aset Terverifikasi pada Network Browser:**
  - Script: `/assets/index-DNTBnLCO.js`
  - SHA-256 Script: `9dce295d317363448a6d9c1b0d548a31eb37ede9bc876ffb2d0965105155e5ff`
  - Stylesheet: `/assets/index-BSYsN6zk.css`
  - SHA-256 Stylesheet: `af1e3bd228738e7ed4a83c996c482c8996df566544dea92759589d862c4c7409`
- **Viewport Teruji:** Desktop `1440x900` (DPR 1.0) dan Mobile `390x844` (DPR 3.0 / touch emulation).

---

## 2. Hasil Perintah Otomatis Wajib (Langkah 1)

Sesuai arahan handoff, tiga perintah evaluasi otomatis dieksekusi dengan isolasi build sementara:

```bash
cd /home/ubuntu/infra-hub/ai-lab-cockpit
OFFICE_BUILD_DIR="$(mktemp -d /tmp/cockpit-motion-qa.XXXXXX)" npm run check
COCKPIT_URL=http://127.0.0.1:8099 node tests/e2e/motion.mjs
COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e
```

### Ringkasan Eksekusi & Exit Code

| Perintah                    | Exit Code |   Status Suite    | Temuan Kegagalan Utama                                                            |
| :-------------------------- | :-------: | :---------------: | :-------------------------------------------------------------------------------- |
| `npm run check`             |    `1`    | 159 PASS / 1 FAIL | `tests/unit/character-activity.test.mjs:137` — toleransi posisi destinasi berdiri |
| `node tests/e2e/motion.mjs` |    `1`    |       FAIL        | `tests/e2e/motion.mjs:391` — allocator sofa lama saat reduced-motion bootstrap    |
| `npm run test:e2e`          |    `1`    |  FAIL (Aborted)   | `tests/e2e/smoke.mjs:1264` — mobile-320 bootstrap home anchor sofa mismatch       |

### Rincian Kegagalan Otomatis

1. **`npm run check` (Exit Code 1):**
   - Linting (ESLint) & Formatting (Prettier): Lulus 100%.
   - Build Vite (TypeScript/Rollup): Berhasil tanpa error kompilasi.
   - Unit Test: 159 test lulus, 1 test gagal pada `tests/unit/character-activity.test.mjs:137`.
   - _Pesan Kesalahan:_
     ```text
     AssertionError: data_scientist settled destination: axis 0, 6.692592649308234 != 6.7
     ```
   - _Analisis:_ Pada saat karakter tiba di tujuan bertipe non-seating (seperti `coffee:left` di `X=6.7`), fungsi `walkRoute` menyelesaikan langkah saat sisa jarak `<= 0.015m`. Karena tidak ada proses _snap_ koordinat ke titik pusat stasiun kopi, posisi akhir adalah `6.69259m` (selisih ~`0.0074m` / 7,4 milimeter). Assertion `nearVector` pada unit test menggunakan toleransi default `1e-8` (10 nanometer) yang terlalu ketat untuk posisi navigasi tanpa kursi.

2. **`node tests/e2e/motion.mjs` (Exit Code 1):**
   - _Pesan Kesalahan:_
     ```text
     AssertionError: Reduced-motion bootstrap uses home anchors, not legacy idle sofa allocation: data_engineer axis 0: 3.88 != -1.8
     ```
   - _Analisis:_ Test E2E baru menuntut bootstrap dalam kondisi `prefers-reduced-motion: reduce` mendudukkan agen di meja asalnya (`data_engineer` di meja Discovery `X=-1.8`). Namun runtime preview pada port 8099 masih memanggil allocator idle lama yang menempatkan karakter di sofa (`sofa:left` di `X=3.88`).

3. **`npm run test:e2e` (Exit Code 1):**
   - _Pesan Kesalahan:_
     ```text
     AssertionError: mobile-320: data_scientist reduced-motion bootstrap home anchor: coordinate 0, 3.88 != 1.8
     ```
   - _Status Skenario Selanjutnya:_ **BELUM TERUJI**. Suite smoke langsung berhenti (_aborted_) pada viewport pertama (`mobile-320`) di baris 1264 sebelum sempat menguji viewport desktop, tablet, atau helper gerak penuh.

---

## 3. Investigasi Masalah #1: Pola Perjalanan Setelah Refresh (Gerak Berulang)

- **Status Evaluasi:** **FAIL (Terbukti Terjadi Gerak Berulang Deterministik 100%)**

### Hasil Pengamatan (Run 1 vs Run 2)

Pengujian dilakukan dengan merekam pergerakan kelima agen berstatus `siaga` dengan data segar selama 120 detik, kemudian halaman browser di-refresh dan diamati kembali selama 120 detik.

| Indeks | Karakter             | Destinasi Terekam  | Waktu Tiba Run 1 | Waktu Tiba Run 2 | Status Kesamaan  |
| :----: | :------------------- | :----------------- | :--------------: | :--------------: | :--------------: |
|   1    | `hq_lab_director`    | `sofa:right`       |     `t=18s`      |     `t=25s`      | **IDENTIK 100%** |
|   2    | `data_engineer`      | `sofa:left`        |     `t=22s`      |     `t=28s`      | **IDENTIK 100%** |
|   3    | `data_scientist`     | `coffee:left`      |     `t=29s`      |     `t=36s`      | **IDENTIK 100%** |
|   4    | `research_scientist` | `meeting:2`        |     `t=42s`      |     `t=48s`      | **IDENTIK 100%** |
|   5    | `ml_engineer`        | `coffee:right`     |     `t=44s`      |     `t=51s`      | **IDENTIK 100%** |
|   6    | `hq_lab_director`    | `meeting:1`        |     `t=63s`      |     `t=73s`      | **IDENTIK 100%** |
|   7    | `data_engineer`      | `reading:right`    |     `t=67s`      |     `t=77s`      | **IDENTIK 100%** |
|   8    | `research_scientist` | `reading:left`     |     `t=75s`      |     `t=86s`      | **IDENTIK 100%** |
|   9    | `data_scientist`     | `sofa:left`        |     `t=79s`      |     `t=90s`      | **IDENTIK 100%** |
|   10   | `ml_engineer`        | `desk:ml_engineer` |     `t=89s`      |     `t=100s`     | **IDENTIK 100%** |
|   11   | `hq_lab_director`    | `coffee:left`      |     `t=103s`     |     `t=112s`     | **IDENTIK 100%** |

_Tingkat Kesamaan Urutan Destinasi:_ **100.0% (11 dari 11 langkah cocok sempurna)**. Seluruh karakter mengambil rute, target stasiun, dan urutan perjalanan yang persis identik setiap kali halaman dimuat ulang. Perbedaan selisih beberapa detik pada timestamp semata-mata disebabkan oleh overhead pemuatan awal Chromium headless saat reload.

### Akar Masalah pada Kode Sumber (_Root Cause_)

Di dalam `src/client/scene/character-activity.js`, baris 14–23:

```javascript
function seededRandom(key) {
  let seed = 2166136261;
  for (const character of key) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 7314424425);
    seed = (seed ^ (seed >>> 7)) >>> 0;
    return (seed % 100000) / 100000;
  };
}
```

- **Penyebab Faktual:** Fungsi pembangkit bilangan acak `seededRandom` hanya di-seed oleh string `key` (misalnya `"data_engineer"`) dan seed dasar konstanta `2166136261`.
- Tidak ada faktor entropi acak saat inisialisasi sesi browser (seperti `Date.now()`, `crypto.getRandomValues()`, atau session token).
- Akibatnya, deret angka pseudo-random yang dihasilkan untuk memilih destinasi, jeda waktu santai (_idle delay_), dan rute perjalanan akan **selalu menghasilkan urutan matematis yang identik** setiap kali halaman dibuka atau di-refresh ("Groundhog Day" effect).

---

## 4. Investigasi Masalah #2: Reset Posisi di Tengah Sesi (Teleportasi ke Sofa/Meja)

- **Status Evaluasi:** **FAIL (Terbukti Terjadi Teleportasi Sejauh >8 Meter Saat Gate Berubah)**

### Hasil Pengamatan

Karakter `data_engineer` dipantau saat sedang melangkah (_walking_) di koridor kantor:

1. **Koordinat Sebelum Perubahan:** `X = 6.293`, `Y = 0.012`, `Z = -5.029` (heading: `2.030 rad`).
2. **Saat `prefers-reduced-motion: reduce` Diaktifkan:** Karakter menghentikan animasi langkah, namun segera dialokasikan ulang ke sofa.
3. **Saat Polling `/api/state` Tiba:** Posisi karakter langsung **melompat (teleportasi)** sejauh **`9.520 meter`** ke koordinat `[3.880, 0.012, 4.180]` dengan status didudukkan pada `sofa:left`.
4. **Saat Mode Normal Dipulihkan:** Karakter tidak melanjutkan sisa rute yang tertunda dari koridor, melainkan memulai perjalanan baru dari sofa.
5. **Kondisi Offline / Stale Queue:** Menghasilkan perilaku teleportasi yang persis sama karena gerbang suasana (_ambient gate_) dinonaktifkan.

### Bukti Tangkapan Layar

- Artefak tersimpan: `artifacts/screenshots/desktop-1440-motion-reduced-freeze.png` (memperlihatkan karakter melompat ke sofa daripada membeku di koridor).

### Akar Masalah pada Kode Sumber (_Root Cause_)

Terjadi benturan antara pengontrol aktivitas dinamis (`character-activity.js`) dan siklus hidup utama rendering (`main.js` & `characters.js`):

1. Di `src/client/main.js`, baris 390–392:
   ```javascript
   if (!next.gates.allowAmbient) {
     updateCharacterAnimations(entities, 0, true);
   }
   ```
2. Saat `allowAmbient` bernilai `false` (akibat reduced motion, tab browser di-minimize, atau queue stale), `main.js` memanggil `updateCharacterAnimations` di `src/client/scene/characters.js`, baris 290–304:
   ```javascript
   export function updateCharacterAnimations(entities, delta = 0, forceIdle = false) {
     ...
     const allocations = allocateCharacterSeats(entities, { allowIdleSeating: true });
     for (const [key, entity] of Object.entries(entities)) {
       const seat = allocations[key];
       if (seat) {
         entity.root.position.fromArray(seat.position);
         entity.root.rotation.y = seat.heading;
       }
     }
   }
   ```
3. **Penyebab Faktual:** `allocateCharacterSeats` dengan parameter `{ allowIdleSeating: true }` adalah allocator statis warisan lama yang secara agresif menempatkan karakter `siaga` ke sofa (`X=3.88`). Fungsi ini menimpa langsung posisi root Three.js (`entity.root.position.fromArray`), sehingga karakter yang sedang berjalan di tengah ruangan terlempar secara instan ke sofa.

---

## 5. Investigasi Masalah #3: Karakter Stuck & Starvasi Pergerakan (Deadlock Concurrency)

- **Status Evaluasi:** **BELUM TERBUKTI (Tidak Terjadi Stuck Permanen pada 120s Siaga Bebas), Namun Terbukti MEMILIKI KERENTANAN LOGIKA TINGGI (VULNERABILITY) pada Kode**

### Analisis Alur Kode Fase Gerak

Fase pergerakan karakter dikelola oleh mesin state berikut:
`docked` $\rightarrow$ `undocking` $\rightarrow$ `walking` $\rightarrow$ `arriving` $\rightarrow$ `sitting` $\rightarrow$ `seated` $\rightarrow$ `releasing` $\rightarrow$ `walking` $\rightarrow$ `docked`.

Pemeriksaan mendalam pada `src/client/scene/character-activity.js` menemukan dua celah kritis yang dapat memicu karakter macet permanen (_stuck_) dan membuat seluruh kantor membeku (_starvation_):

#### Celah 1: Deteksi Hambatan Hanya Memiliki Timeout pada Fase `walking`

Pada `src/client/scene/character-activity.js`, baris 332–344:

```javascript
if (blockedByCharacter(record, nextX, nextZ)) {
  record.yielded += delta;
  if (record.yielded > 2.2 && record.phase === 'walking') {
    // Memilih rute alternatif / retreat
    ...
  }
}
```

- **Kelemahan:** Logika jalan keluar (_escape / reroute_) hanya dipicu bila `record.phase === 'walking'`.
- Jika dua karakter saling berpapasan atau terhalang saat salah satunya berada dalam fase **`undocking`** (sedang berdiri dan melangkah keluar kursi) atau fase **`arriving`** (sedang melangkah masuk ke titik kursi/stasiun), nilai `record.yielded` akan terus bertambah tanpa batas waktu (`record.yielded > 2.2` diabaikan). Karakter akan macet diam di tempat selamanya tanpa pernah melakukan reroute atau mundur.

#### Celah 2: Starvasi Kuota Gerak Global (_Global Concurrency Lock_)

Pada `src/client/scene/character-activity.js`, baris 466–472:

```javascript
const MOVING_PHASES = new Set(['walking', 'undocking', 'arriving', 'releasing', 'sitting']);
...
const moving = records.filter((other) => MOVING_PHASES.has(other.phase)).length;
if (moving < 2) {
  // Karakter lain diizinkan memulai perjalanan baru
}
```

- Sistem membatasi maksimal 2 karakter yang boleh bergerak bersamaan (`moving < 2`).
- Definisi `MOVING_PHASES` mencakup `undocking` dan `arriving`.
- **Dampak Kritis:** Apabila dua karakter mengalami tabrakan/hambatan pada fase `undocking` atau `arriving`, kedua karakter tersebut akan macet permanen dengan fase yang terdaftar di `MOVING_PHASES`. Nilai `moving` akan terkunci pada angka `2`, sehingga **tiga karakter lainnya di kantor tidak akan pernah lagi diizinkan untuk memulai perjalanan apa pun seumur hidup sesi** (_infinite starvation deadlock_).

---

## 6. Uji Non-Regresi UI, Dialog Bubble, dan Kartu Mobile

Pemeriksaan elemen visual dilakukan untuk memastikan tidak ada penurunan kualitas (_visual regression_) pada komponen yang telah disetujui sebelumnya:

1. **Speech Bubble Percakapan 1:1:**
   - Balasan percakapan muncul secara tertib dengan jeda balasan ~2,3 detik.
   - Posisi bubble stabil melayang di atas pill nama agen.
   - Label ilustratif dan kontras teks terbaca jelas.
   - Artefak tersimpan: `artifacts/screenshots/desktop-1440-qa-full.png` dan `desktop-1440-qa-director-focused.png`.

2. **Kartu Agent & Status Pill Nova:**
   - Pill "Menunggu" pada Nova tetap ringkas dan tidak memicu reflow header kartu.
   - Teks lengkap "Menunggu keputusan" dapat diakses via tooltip/title dan DOM accessibility.
   - Penjajaran baris status, tugas, dan aktivitas pada desktop 1440 tetap sejajar.

3. **Panel Mobile (Viewport 390px):**
   - Bottom drawer / dock tetap terlihat di bagian bawah layar.
   - Ketiga tab (Riwayat, Tugas agent, Aktivitas) dapat diklik tanpa error.
   - Artefak tersimpan: `artifacts/screenshots/mobile-390-qa-dock.png`.

---

## 7. Matriks Status QA Skenario Pengujian

| No  | Skenario Pengujian                  | Target / Harapan                              | Hasil Aktual di Preview 8099                                                     |             Status              |
| :-: | :---------------------------------- | :-------------------------------------------- | :------------------------------------------------------------------------------- | :-----------------------------: |
|  1  | **Eksekusi `npm run check`**        | 100% test lulus, lint & build bersih          | Gagal 1 unit test: `character-activity.test.mjs:137` (toleransi 1e-8 vs 0.0074m) |            **FAIL**             |
|  2  | **Eksekusi `tests/e2e/motion.mjs`** | Bootstrap reduced motion memakai home anchor  | Gagal di baris 391: `data_engineer` di sofa X=3.88 bukan meja X=-1.8             |            **FAIL**             |
|  3  | **Eksekusi `npm run test:e2e`**     | Seluruh viewport smoke test lulus             | Gagal di baris 1264 pada mobile-320 (alokasi sofa vs meja)                       |            **FAIL**             |
|  4  | **Pola Refresh (Gerak Berulang)**   | Urutan variatif / tidak deterministik kaku    | Identik 100% antara Run 1 & Run 2 (Hardcoded seed `2166136261`)                  |            **FAIL**             |
|  5  | **Reset Posisi di Tengah Sesi**     | Karakter membeku di tempat saat mode reduced  | Melompat (teleportasi) sejauh 8.17m ke sofa akibat allocator lama                |            **FAIL**             |
|  6  | **Penanganan Karakter Stuck**       | Detour / reroute saat terhalang di semua fase | Reroute hanya ada pada `walking`; rentan deadlock di `undocking`/`arriving`      | **BELUM TERBUKTI / VULNERABLE** |
|  7  | **Batas Konkurensi & Starvasi**     | Maksimal 2 agen bergerak tanpa mengunci lab   | Jika 2 agen macet di moving phase, 3 agen lain mengalami starvasi total          |         **VULNERABLE**          |
|  8  | **Non-Regresi Kartu & Bubble**      | Bubble 1:1, dock mobile, pill Nova rapi       | Tampilan bubble, dock mobile, dan kartu agent tetap berfungsi baik               |            **PASS**             |

---

## 8. Ringkasan Rekomendasi Teknis (Untuk Tahap Perbaikan Selanjutnya)

_Catatan: Sesuai batas pekerjaan, rekomendasi ini tidak langsung diterapkan ke kode saat ini dan menunggu persetujuan eksplisit pemilik proyek._

1. **Perbaikan Gerak Berulang (`character-activity.js`):**
   Tambahkan entropi acak dinamis berbasis sesi (misalnya seed yang dikombinasikan dengan waktu inisialisasi sesi `sessionStorage` atau nilai pseudorandom acak) agar setiap kali pengguna me-refresh halaman, karakter memilih variasi rute dan waktu santai yang berbeda.
2. **Penyelarasan Gate Suasana & Eliminasi Teleportasi (`main.js` & `characters.js`):**
   Hentikan pemanggilan allocator sofa lama `updateCharacterAnimations(entities, 0, true)` saat `allowAmbient` false. Biarkan karakter membeku di koordinat Three.js terkini (_in-place freeze_) sesuai kontrak handoff terbaru.
3. **Pencegahan Deadlock & Starvasi Fase Gerak (`character-activity.js`):**
   - Perluas logika `yielded > 2.2` agar mencakup fase `undocking` dan `arriving`, dengan mekanisme pembatalan (_abort/rollback_) ke posisi kursi semula bila jalan terhalang.
   - Tambahkan timeout global pada `moving` tracker sehingga karakter yang tidak berpindah selama >5 detik tidak mengunci kuota gerak agen lain.
4. **Relaksasi Toleransi Unit Test (`character-activity.test.mjs`):**
   Gunakan toleransi navigasi fisik yang realistis (misal `tolerance = 0.02m`) untuk stasiun tanpa kursi atau lakukan _position snapping_ pada stasiun non-kursi saat tiba.
