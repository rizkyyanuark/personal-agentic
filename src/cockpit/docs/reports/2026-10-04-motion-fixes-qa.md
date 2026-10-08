# Laporan QA Ulang: Verifikasi Perbaikan Gerak Cockpit, Freeze, dan Recovery

Tanggal: 4 Oktober 2026 (WIB)  
Target Evaluasi: Preview Server Mandiri `http://127.0.0.1:8100` (PID `562479`, Server daemon terisolasi)  
Dokumen Panduan: `docs/reports/2026-10-04-motion-fixes-handoff.md`  
Status Uji: **PASS (Seluruh Quality Gate & E2E Lulus 100%)**  
Batas Pekerjaan: Pengujian QA ulang tanpa mengubah kode aplikasi atau assertion, tanpa memodifikasi database ledger, tanpa menjalankan worker/model, dan tanpa menyentuh produksi port 8095 atau preview 8099.

---

## 1. Metadata Lingkungan Pengujian & Bundle Build

Pengujian dijalankan pada browser Chromium headless melalui Puppeteer dengan direktori build terisolasi:

- **Target Preview URL:** `http://127.0.0.1:8100`
- **Direktori Build Terisolasi:** `/tmp/cockpit-motion-fixes-qa.8S8UPJ`
- **Bundle Aset Terverifikasi pada Network Browser:**
  - Script: `/assets/index-DIUvvYeI.js`
  - SHA-256 Script: `95f6f83359f4589b5c3b69a03e506868a74b3768d26192937f0be5462df481b7`
  - Stylesheet: `/assets/index-BSYsN6zk.css`
  - SHA-256 Stylesheet: `af1e3bd228738e7ed4a83c996c482c8996df566544dea92759589d862c4c7409`
- **Viewport Teruji:**
  - `mobile-320` (320x568, DPR 2.0)
  - `mobile-390` (390x844, DPR 3.0)
  - `tablet-768` (768x1024, DPR 2.0)
  - `desktop-1024` (1024x768, DPR 1.0)
  - `desktop-1440` (1440x900, DPR 1.5 & 2.0)

---

## 2. Hasil Perintah Otomatis Wajib

```bash
cd /home/ubuntu/infra-hub/ai-lab-cockpit
MOTION_QA_BUILD_DIR="$(mktemp -d /tmp/cockpit-motion-fixes-qa.XXXXXX)"
OFFICE_BUILD_DIR="$MOTION_QA_BUILD_DIR" npm run check
PORT=8100 OFFICE_BIND_HOST=127.0.0.1 OFFICE_DIST_DIR="$MOTION_QA_BUILD_DIR" node server.js
COCKPIT_URL=http://127.0.0.1:8100 node tests/e2e/motion.mjs
COCKPIT_URL=http://127.0.0.1:8100 npm run test:e2e
```

### Ringkasan Eksekusi & Exit Code

| Perintah                           | Exit Code | Status Suite | Rincian Hasil                                                                                                                                                                                              |
| :--------------------------------- | :-------: | :----------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` (Build terisolasi) |  **`0`**  |   **PASS**   | ESLint lulus, Prettier lulus, 166/166 unit test lulus (durasi: 5,37 detik), build Vite sukses ke `/tmp/cockpit-motion-fixes-qa.8S8UPJ`.                                                                    |
| `node tests/e2e/motion.mjs`        |  **`0`**  |   **PASS**   | 4/4 checkpoint gerak lulus (reduced-motion bootstrap exact 5 home anchors, real displacement + world-space soles + freeze pre-handler & post-poll, safe return bekerja, safe return menunggu_persetujuan). |
| `npm run test:e2e`                 |  **`0`**  |   **PASS**   | Lulus 100% pada seluruh 5 viewport (`mobile-320`, `mobile-390`, `tablet-768`, `desktop-1024`, `desktop-1440`), stabilitas freeze >45s, pembesaran font sintetis 200%.                                      |

---

## 3. Pembuktian Fokus Investigasi

### A. Reduced Motion Membekukan Posisi & Heading Aktual (Termasuk Pasca-Polling)

- **Status:** **PASS**
- **Bootstrap Mode:** Kelima karakter pada reduced-motion bootstrap terbukti berada di home anchor masing-masing (`hq_lab_director` pada anchor berdiri, 4 agen pada kursi meja kerjanya). Tidak ada lagi alokasi sofa lama yang memaksa agen siaga ke `X=3.88`.
- **Freeze In-Place Saat Melangkah:**
  Karakter dipantau saat sedang berjalan dekoratif dan media `prefers-reduced-motion: reduce` diaktifkan:
  - Karakter `data_engineer`:
    - Posisi PRE-handler: `[1.2199676, 0.012, -2.9907595]`, heading: `1.1596 rad`
    - Posisi Immediate: `[1.2199676, 0.012, -2.9907595]`, heading: `1.1596 rad`
    - Posisi Pasca-Poll API: `[1.2199676, 0.012, -2.9907595]`, heading: `1.1596 rad`
  - Karakter `hq_lab_director`:
    - Posisi PRE-handler: `[-1.8308373, 0.012, 0.6506965]`, heading: `0.8371 rad`
    - Posisi Immediate: `[-1.8308373, 0.012, 0.6506965]`, heading: `0.8371 rad`
    - Posisi Pasca-Poll API: `[-1.8308373, 0.012, 0.6506965]`, heading: `0.8371 rad`
  - _Pergeseran Koordinat (Drift):_ **0.000 meter**. Karakter membeku sempurna di koordinat aktual tanpa ada teleportasi 9.52m ke sofa seperti yang terjadi pada build lama.
- **Tangkapan Layar:** `artifacts/screenshots/desktop-1440-motion-frozen.png`.

### B. Pause / Resume pada Koridor Akses Parsial (`undocking` & `arriving`)

- **Status:** **PASS**
- **Bukti Unit Test:** Test `reduced motion preserves a partially traversed undocking/arriving corridor and resumes it safely` membuktikan karakter yang sedang melangkah di koridor akses kursi tetap membeku di titik akses parsial (`distance > 0`).
- Saat mode normal dipulihkan, karakter melanjutkan langkah (_resumed_) ke titik sasaran stasiun dan menduduki kursi secara sah dengan tepat satu penambahan `arrivalId`.

### C. Pemulihan Hambatan (_Blocked Corridor Recovery_) & Batas Konkurensi

- **Status:** **PASS**
- **Mekanisme Rollback:** Pada skenario koridor terhalang (adversarial test dengan rintangan blocker diam), karakter yang tertahan selama batas timeout melakukan _rollback_ teratur menyusuri koridor yang sudah dilalui menuju titik aman asal (_safe origin_) pada kecepatan langkah normal (maksimal 1,6 unit/detik).
- **Arrival ID Imutabel:** Rollback dan pemulihan hambatan terbukti tidak menambah `arrivalId` (`recovering.arrivalId === partial.arrivalId`).
- **Pelepasan Slot Gerak (`waiting-route`):** Jika jalur bolak-balik terhalang sepenuhnya, karakter memasuki fase `waiting-route` dan melepaskan keanggotaannya dari `TRANSITION_PHASES`. Karakter lain tidak terkunci dan batas konkurensi (maksimal 2 agen bergerak bersamaan) tetap terjaga (_zero starvation deadlock_).
- Setelah rintangan meninggalkan koridor, karakter melanjutkan kembali perjalanannya dan tiba di titik sasaran tanpa pergeseran endpoint.

### D. Presisi Kedatangan & Eliminasi Residual Offset Navigasi

- **Status:** **PASS**
- Seluruh 166 unit test berhasil melewati assertion toleransi ketat `1e-8` (`nearVector`).
- Penyesuaian snapping kedatangan dan waypoint terbukti menyelesaikan langkah persis di stasiun non-kursi (`coffee:left`, `coffee:right`, `reading`, dll.) tanpa menyisakan deviasi 7,4 milimeter.

### E. Status Bekerja & Menunggu Keputusan Berubah Segera di DOM

- **Status:** **PASS**
- **Pengamatan Transisi Operasional:**
  1. `data_engineer` berjalan di koridor kantor (`away-before-bekerja` di `[3.546, 0.012, -1.104]`).
  2. Saat status API berubah menjadi `bekerja`, DOM kartu dan status HUD **berubah seketika** menjadi `bekerja` saat karakter masih berada di tengah ruangan (`dom-first-bekerja` di `[4.380, 0.012, 0.713]`).
  3. Karakter memasuki fase `returning` (`[4.213, 0.012, 0.350]`) dan melangkah kembali ke meja kerjanya.
  4. Karakter tiba dengan selamat di meja asalnya (`[-1.800, 0.012, -4.000]`) dan menduduki kursi dalam pose kerja (`returned-bekerja`).
  5. Skenario yang sama terbukti 100% pada transisi `menunggu_persetujuan` (DOM berubah seketika di koridor, lalu karakter kembali aman ke meja Discovery).
- **Tangkapan Layar:**
  - `artifacts/screenshots/desktop-1440-motion-returned-bekerja.png`
  - `artifacts/screenshots/desktop-1440-motion-returned-menunggu_persetujuan.png`

### F. Non-Regresi UI, Kartu, Speech Bubble 1:1, dan Mobile Dock

- **Status:** **PASS**
- **5 Viewport Terverifikasi Penuh:**
  - `mobile-320`: Panel drawer, floating dock, 3 tab (Riwayat, Tugas, Aktivitas), keyboard navigation, dan 5 view focus/reset lulus.
  - `mobile-390`: 4 workstation, 5 kartu agen, avatar, dan responsif sentuh lulus.
  - `tablet-768`: Transisi panel, minimalkan/maksimalkan panel, dan scene Three.js lulus.
  - `desktop-1024`: Layout kartu, wallpaper, papan tugas, dan jam WIB lulus.
  - `desktop-1440`: Reflow header kartu agen, kestabilan 5 karakter beku >45 detik, DPR 1.5/2.0 sebelum dan sesudah resize lulus.
- **Uji Pembesaran Teks Sintetis 200%:** Seluruh 5 viewport lulus uji penggandaan ukuran font tanpa overflow atau kerusakan visual.

---

## 4. Matriks Ringkasan Status Skenario Pengujian

| No  | Aspek Pengujian                      | Kriteria Penerimaan                                   | Hasil Pengujian Runtime 8100                    |      Status       |
| :-: | :----------------------------------- | :---------------------------------------------------- | :---------------------------------------------- | :---------------: |
|  1  | **Isolated Build Check**             | Lint, format, 166 unit test, build Vite               | 166/166 test pass, exit code 0                  |     **PASS**      |
|  2  | **Reduced-Motion Bootstrap**         | 5 karakter berada di home anchor masing-masing        | 5 home anchor tepat, sofa tidak terisi          |     **PASS**      |
|  3  | **Freeze In-Place saat Melangkah**   | Posisi & heading membeku; 0.00m drift pasca-poll      | Posisi persis sama sebelum & sesudah poll       |     **PASS**      |
|  4  | **Akses Kursi Parsial**              | Freeze di koridor akses & resume aman                 | Undocking & arriving membeku & selesai aman     |     **PASS**      |
|  5  | **Penanganan Hambatan**              | Rollback bertahap ke safe origin, arrival ID tetap    | Rollback berjalan tertib, arrivalId konstan     |     **PASS**      |
|  6  | **Pencegahan Deadlock/Starvasi**     | Karakter terhalang masuk `waiting-route` & lepas slot | Kuota moving < 2 tidak terkunci                 |     **PASS**      |
|  7  | **Presisi Endpoint Navigasi**        | Kedatangan tepat di waypoint tanpa drift              | Lulus assertion toleransi 1e-8                  |     **PASS**      |
|  8  | **Transisi Status Bekerja/Menunggu** | DOM update segera; safe return ke meja                | DOM berubah instan, karakter kembali aman       |     **PASS**      |
|  9  | **Uji E2E 5 Viewport**               | 320, 390, 768, 1024, 1440 px bebas regresi            | Seluruh test smoke hijau 100%                   |     **PASS**      |
| 10  | **Variasi Sesi Pasca-Refresh**       | Entropi acak setelah reload halaman                   | Dicatat: Seed role belum diubah (Skop terpisah) | **SKOP TERPISAH** |

---

## 5. Bukti Artefak & File Log

- **File Diagnostik JSON:** `artifacts/motion/desktop-1440-regression.json` (Ukuran: 1,63 MB)
- **Tangkapan Layar Verifikasi:**
  - `artifacts/screenshots/desktop-1440-motion-frozen.png` (Bukti freeze in-place di tengah ruangan)
  - `artifacts/screenshots/desktop-1440-motion-returned-bekerja.png` (Bukti safe return status bekerja)
  - `artifacts/screenshots/desktop-1440-motion-returned-menunggu_persetujuan.png` (Bukti safe return status menunggu keputusan)

---

## 6. Kesimpulan & Penutupan Lingkungan QA

Seluruh perbaikan gerak, pembekuan posisi reduced motion (_freeze in-place_), penanganan rute terhalang (_rollback & recovery_), dan transisi status kerja terbukti **LULUS PENUH (PASS)** pada build baru preview port 8100 tanpa menimbulkan regresi pada tampilan UI, kartu agen, dock mobile, maupun bubble dialog.
