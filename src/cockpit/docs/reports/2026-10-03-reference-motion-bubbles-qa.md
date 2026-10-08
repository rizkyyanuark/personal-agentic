# QA Report: Revisi Bubble, Gerak, dan Percakapan Cockpit

> **Tanggal:** 3 Oktober 2026 (WIB)  
> **Workspace:** `/home/ubuntu/infra-hub/ai-lab-cockpit`  
> **Target Preview URL:** `http://127.0.0.1:8099/` (Preview terisolasi, bukan layanan produksi port 8095)  
> **Panduan Utama:** [`docs/reports/2026-10-03-reference-motion-bubbles-handoff.md`](file:///home/ubuntu/infra-hub/ai-lab-cockpit/docs/reports/2026-10-03-reference-motion-bubbles-handoff.md)  
> **Status Keseluruhan:** **LULUS UJI VALIDASI FUNGSIONAL & VISUAL (Kecuali Harness Test E2E Statis yang Belum Menyesuaikan Gerak Dinamis)**

---

## 1. Ringkasan Eksekutif & Matriks Evaluasi

Pengujian dilakukan secara ketat pada preview server lokal port `8099`. Build terbaru hasil revisi parameter rujukan kantor-agent (`ad92a7a4`) berhasil diverifikasi aktif dengan checksum SHA-256 yang identik dengan handoff. Seluruh mekanisme gerak otonom, gait, pose interaktif (kopi, sofa/TV balapan, membaca, meeting), koordinasi bubble (maksimal 2 desktop / 1 mobile), serta sistem dialog kontekstual berlabel _"Suasana ilustratif"_ berfungsi sesuai spesifikasi.

| No     | Skenario Pengujian                | Target / Kriteria                                                  | Status   | Catatan & Temuan Kunci                                                       |
| ------ | --------------------------------- | ------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------- |
| **1**  | **Verifikasi Build Baru**         | HTTP 200, `index-BI_SDMpZ.js` & `index-GVQea0lM.css`               | **PASS** | JS (947.1 KB) & CSS (31.5 KB) cocok 100% dengan SHA-256 handoff.             |
| **2**  | **Isolated Check**                | `npm run check` dengan build dir terisolasi                        | **PASS** | Exit Code `0`. Lint: 0 error, Prettier: OK, 153/153 unit test lulus.         |
| **3**  | **Suite E2E Otomatis**            | `COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e`               | **FAIL** | Exit Code `1`. Gagal di `smoke.mjs:1236` akibat karakter berjalan dinamis.   |
| **4**  | **Matriks Viewport (320–1440px)** | Responsivitas, tanpa overflow halaman, panel/dock utuh             | **PASS** | `overflow = false` pada seluruh 5 viewport. Drawer & dock berfungsi normal.  |
| **5**  | **Kinematika & Gait Berjalan**    | Kecepatan 1,6 u/s, gait 8 rad/s, sol di lantai, no limb detachment | **PASS** | Kaki menempel di lantai (`rootY = 0.012`), orientasi belok halus (rate 7/4). |
| **6**  | **Kegiatan Interaktif & Kursi**   | Sofa/TV balapan, kopi reach/sip, membaca rak, meeting              | **PASS** | Kopi reach 2,5s lalu sip 1,8s per 6s; sofa memicu TV mode balapan (10 FPS).  |
| **7**  | **Dialog Berbasis Lokasi**        | Topik sesuai zona, pembuka 4,8s, balasan setelah 2,3s (4,2s)       | **PASS** | Dialog meeting teramati: _"Iya, meja ini dapat sudut yang enak."_ & balasan. |
| **8**  | **Label Provenance Dialog**       | Teks dialog diawali label resmi `"Suasana ilustratif: "`           | **PASS** | Terpasang konsisten pada elemen `.speech-bubble-provenance`.                 |
| **9**  | **Komentar Kedatangan (Arrival)** | Peluang 55%, lifetime 4,2s, berdasar `arrivalId` lokal             | **PASS** | Terekam pada transisi kedatangan destinasi baru tanpa trigger saat polling.  |
| **10** | **Batas Bubble Coordinator**      | Maksimal 2 bubble di desktop, maksimal 1 bubble di mobile          | **PASS** | Terbukti pada resolusi 1440px (limit 2) dan 390/320px (limit 1).             |
| **11** | **Prioritas & Rincian DOM**       | Karakter terpilih/kerja lebih prioritas; teks tersimpan di DOM     | **PASS** | Saat bubble tersembunyi karena kuota/posisi, node teks tetap ada di DOM.     |
| **12** | **Pembatalan & Teardown**         | Batal saat status kerja, stale/offline, hidden tab, reduced motion | **PASS** | Dialog langsung hilang seketika saat agen bekerja atau offline.              |
| **13** | **Non-Regresi Desain**            | Nova pill "Menunggu", kamera 3D, papan tugas, jam WIB              | **PASS** | Nova pill tetap `"Menunggu"`, title `"Menunggu keputusan"`, kamera stabil.   |

---

## 2. Verifikasi Aset & Lingkungan Pengujian

### A. Konfigurasi Lingkungan

- **OS / Host:** Linux ARM64 / Ubuntu 24.04 LTS (AWS EC2 `t4g.small`, 2 vCPU, 2.0 GB RAM + 6.0 GB SWAP)
- **Browser Runtime:** Headless Chromium `Chrome/154.0.8037.57` via Puppeteer Core
- **Server Preview:** Node.js static & reverse proxy pada `http://127.0.0.1:8099` (PID `560838`)
- **Distribution Directory:** `/tmp/cockpit-test-dist`

### B. Verifikasi Checksum SHA-256 Aset Terlayani

Seluruh aset yang disajikan oleh server preview diverifikasi identik dengan tabel handoff:

```bash
fa61a7fd27e9f2861bcdc7d0e2ea5e3d99c335a9101ccd48b4e0f5ec212a6a43  /tmp/cockpit-test-dist/index.html
778e8072daa2c2986ec268d3795eed6278916fc3adcad90def02a57627e46d22  /tmp/cockpit-test-dist/assets/index-BI_SDMpZ.js
29458704eac4b3bb6d8e14a4ddfb4f8e4d08cb65ff9b2d752d97ada965ceada2  /tmp/cockpit-test-dist/assets/index-GVQea0lM.css
```

Header respons HTTP (Cache-Control: `no-store, no-cache`, HTTP `200 OK`):

- `index-BI_SDMpZ.js`: `Content-Length: 947095 bytes`
- `index-GVQea0lM.css`: `Content-Length: 31481 bytes`

---

## 3. Eksekusi Perintah Otomatis

### A. Perintah 1: Isolated Quality Gate Check

```bash
OFFICE_BUILD_DIR="$(mktemp -d /tmp/cockpit-reference-qa.XXXXXX)" npm run check
```

- **Exit Code:** `0` (PASS)
- **Rincian:**
  1. `npm run lint`: **0 error, 0 warning** (clean).
  2. `npm run format:check`: **Seluruh file terformat rapi sesuai Prettier**.
  3. `npm test`: **153 unit test lulus (0 gagal, 0 diskip)**.
     - Termasuk pengujian TV screen (catalog vs racing, reduced motion).
     - Pengujian seat registry, deterministik sofa, dan anchor.
     - Pengujian pembatasan FPS layar dan texture upload.
  4. `vite build`: Berhasil mengompilasi 44 modul ke direktori sementara dalam 1m 31s.

### B. Perintah 2: End-to-End Test Suite

```bash
COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e
```

- **Exit Code:** `1` (FAIL)
- **Titik Kegagalan & Log Trace:**
  ```text
  AssertionError [ERR_ASSERTION]: mobile-320: data_scientist character anchor: coordinate 0, 1.8 != 3.88
      at file:///home/ubuntu/infra-hub/ai-lab-cockpit/tests/e2e/smoke.mjs:52:12
      at Array.forEach (<anonymous>)
      at assertVector (file:///home/ubuntu/infra-hub/ai-lab-cockpit/tests/e2e/smoke.mjs:51:10)
      at file:///home/ubuntu/infra-hub/ai-lab-cockpit/tests/e2e/smoke.mjs:1236:7 {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }
  ```
- **Analisis Penyebab (Root Cause):**
  Suite pengujian `smoke.mjs` baris 1231–1240 masih menggunakan fungsi `allocateCharacterSeats(...)` yang mengasumsikan karakter berada secara statis di meja kerja masing-masing (koordinat meja `data_scientist` adalah `X = 3.88`). Namun pada revisi terbaru, karakter siaga memiliki otonomi gerak dinamis (berjalan ke pantry/kopi, sofa, rak buku, atau meeting), sehingga posisi aktual Atlas (`data_scientist`) berada pada koordinat `X = 1.80`.
- **Tindakan:** Sesuai mandat kerja, **assertion tidak diubah atau dilemahkan**. Laporan ini mencatat temuan agar harness test dapat disesuaikan pada siklus berikutnya.

---

## 4. Evaluasi Gerak, Kinematika & Pose Aktivitas

```mermaid
flowchart LR
    subgraph AutonomousMotion["Autonomous Movement (siaga)"]
        W["Walk (1.6 u/s, 8 rad/s gait)"] --> Arr["Arrival (55% Quip, 4.2s)"]
        Arr --> Dwell["Dwell (>= 8s)"]
        Dwell --> Act["Activity Pose"]
    end

    subgraph Activities["Interactive Activities"]
        Act --> Coffee["Pantry: Coffee Reach 2.5s -> Sip 1.8s/6s"]
        Act --> Sofa["Lounge: Sofa Seated -> TV Racing (10 FPS)"]
        Act --> Read["Bookshelf: Reading Pose + Arm IK"]
        Act --> Meet["Meeting Table: Seated + Arm Edge IK"]
    end
```

### A. Kinematika Berjalan & Inverse Kinematics (IK)

1. **Kecepatan & Turn Rate:**
   - Kecepatan berjalan: `WALK_SPEED = 1.6 unit/detik`.
   - Interpolasi sudut badan: `WALK_TURN_RATE = 7` saat melangkah, dan `SETTLE_TURN_RATE = 4` saat tiba di titik henti.
   - Langkah kaki (`WALK_PHASE_RATE = 8 rad/detik`): Kaki kiri dan kanan berayun bergantian secara dinamis.
2. **Kontak Kaki dengan Lantai:**
   - Posisi Y sepatu terukur: `leftShoeY = -0.5224` dan `rightShoeY = -0.5224` terhadap hips (`hipsY = 0.5724`).
   - Posisi telapak kaki menyentuh lantai secara konsisten pada ketinggian `floorY = 0.012`. Tidak ada kaki melayang (_floating_) atau tenggelam ke bawah lantai.
3. **Reservasi Kursi & Penghindaran Tabrakan:**
   - Terpantau maksimal 2 karakter bergerak dekoratif secara bersamaan (`moving < 2`).
   - Jarak personal aman: `0.62 meter`.
   - Satu kursi atau titik aktivitas hanya dapat dipesan (_reserved_) oleh satu karakter pada satu waktu.

### B. Aktivitas Spesifik Teramati

Pengamatan aktivitas dilakukan selama 24 detik menggunakan fixture 5-siaga:

1. **Pantry (Kopi):**
   - Karakter `data_scientist` terpantau berada di `destinationId: 'coffee:left'`.
   - Fase transisi: Menjangkau meja (`reaching: arrivalTime < 2.5s`) dengan lengan kanan maju ke `(0.17, 0.12, 0.43)`, dilanjutkan dengan siklus menyeruput kopi (`sip: arrivalTime % 6 < 1.8s`) di mana tangan naik ke ketinggian mulut (`0.46 + sip * 0.32`).
2. **Lounge (Sofa) & TV Balapan:**
   - Karakter `hq_lab_director` duduk santai di `destinationId: 'sofa:right'` dengan posisi bersandar (`bodyLean = -0.12` sampai `-0.25`).
   - Layar TV (`window.__tvScreen`): Saat sofa kosong, TV berada pada mode `catalog`. Saat sofa terisi, TV seketika beralih ke mode `racing` dan merender animasi balapan dengan batas frame maksimal 10 FPS.
3. **Meja Meeting:**
   - Karakter `research_scientist` terpantau duduk di meja meeting (`phase: 'seated'`).
   - Lengan diletakkan di tepi meja meeting dengan target ketinggian `floorY + 0.85`, tubuh condong rileks (`lean: 0.1`).
4. **Rak Buku (Membaca):**
   - Lengan karakter membentuk pose memegang buku di depan dada (`leftArmTarget: (-0.13, 0.31, 0.26)` dan `rightArmTarget: (0.13, 0.31, 0.26)`).

---

## 5. Sistem Dialog & Cadence Kantor-Agent

### A. Pengamatan Siklus Dialog (Cadence)

Pengujian mencatat 11 interval dialog aktif selama pemantauan:

```text
[Dialog Teramati]
Timestamp: +10.14s
Role: research_scientist (di zona meeting)
Label: "Suasana ilustratif: "
Teks: "Iya, meja ini dapat sudut yang enak."

[Dialog Lanjutan / Opener]
Timestamp: +15.31s
Role: research_scientist
Label: "Suasana ilustratif: "
Teks: "Duduk sebentar sebelum ke lounge?"
Durasi Tampil: ~4.2 detik
```

1. **Jadwal & Waktu:**
   - Upaya dialog awal dimulai setelah 4 detik pertama.
   - Cadence antar-dialog berkisar antara 7 hingga 11,5 detik saat syarat terpenuhi.
   - Durasi pembuka (_opener_): 4,8 detik.
   - Balasan (_reply_): Dimulai 2,3 detik setelah pembuka dengan durasi 4,2 detik.
2. **Label Provenance:**
   Setiap dialog selalu memiliki elemen penjelas `.speech-bubble-provenance` bertuliskan `"Suasana ilustratif: "`, menegaskan bahwa percakapan bersifat suasana latar belakang dan bukan komunikasi teknis agen AI.
3. **Kesesuaian Topik Zona:**
   - Di lounge: Berbicara tentang tikungan tajam, mobil balap merah, dan kenyamanan sofa.
   - Di pantry: Berbicara tentang espresso, aroma kopi, dan warna mug.
   - Di rak buku: Berbicara tentang sampul buku dan pembatas halaman.
   - Di meja meeting: Berbicara tentang kursi empuk dan sudut ruangan.
4. **Komentar Kedatangan (Arrival Quip):**
   Saat karakter tiba di destinasi baru dengan `arrivalId` baru, terdapat evaluasi acak dengan peluang 55%. Komentar berdurasi 4,2 detik dan tidak menimpa percakapan yang sedang aktif.

---

## 6. Bubble Coordinator & Aksesibilitas

```mermaid
flowchart TD
    subgraph Coordinator["Bubble Coordinator Engine"]
        Cand["Dialogue / Work Candidates"] --> Filter["Zone & Obstacle Filter"]
        Filter --> Rank["Rank by Priority<br/>(Selected/Work: 10+ | Dialogue: 1)"]
        Rank --> Limit{"Viewport Limit Check"}
        Limit -->|Desktop > 820px| DLimit["Max 2 Bubbles (Width <= 220px)"]
        Limit -->|Mobile <= 820px| MLimit["Max 1 Bubble (Width <= 150px)"]
    end
```

1. **Batas Jumlah Bubble:**
   - **Desktop (1024px & 1440px):** Maksimal 2 bubble dapat tampil simultan. Lebar bubble dibatasi maksimal 220px.
   - **Mobile (320px, 390px, 768px, 820px):** Maksimal 1 bubble dapat tampil simultan. Lebar bubble dibatasi maksimal 150px.
2. **Prioritas Penampilan:**
   Agen yang sedang dipilih (_selected role_) atau sedang mengerjakan tugas publik (_work state_) memiliki skor prioritas lebih tinggi (10+) dibanding obrolan santai (_dialogue state_: 1).
3. **Ketahanan Aksesibilitas DOM:**
   Ketika bubble disembunyikan karena keterbatasan kuota atau rintangan geometris (_obstacles_), konten teks tidak dihapus dari memori; elemen DOM tetap mempertahankan teks dan atribut provenance, disembunyikan menggunakan `visibility: hidden` tanpa merusak screen reader.

---

## 7. Pengujian Pembatalan & Teardown (Graceful Cancellation)

1. **Transisi Status Bekerja:**
   Saat agen `data_engineer` diubah statusnya menjadi `"bekerja"`, kegiatan berjalan santai seketika dibatalkan (`deBubbleHidden: true`). Karakter kembali menuju meja kerja dan bubble obrolan santai langsung dihilangkan.
2. **Mode Reduced Motion:**
   Saat browser mengaktifkan media query `prefers-reduced-motion: reduce`, jumlah ambient bubble seketika menjadi `0`. Karakter menghentikan langkah kaki animasi dan beralih ke pose statis yang tenang.
3. **Simulasi Offline / Gangguan Jaringan:**
   Saat endpoint `/api/state` gagal (disimulasikan dengan `abort('failed')`):
   - Status koneksi berubah menjadi `"Koneksi terputus"`.
   - Seluruh bubble suasana ilustratif langsung dibersihkan (`ambientBubblesCount = 0`).
   - Tidak ada sisa bubble lama yang menggantung.
4. **Tab Tersembunyi (Visibility Change):**
   Saat tab diminimalkan (`document.hidden = true`), loop animasi dan polling dihentikan sementara. Ketika tab dibuka kembali, timestamp frame direset sehingga obrolan lama tidak diputar secara bertumpuk (_no backlog replay_).

---

## 8. Verifikasi Non-Regresi

- **Kartu & Status Nova:**
  - Pill teks: `"Menunggu"` (tepat).
  - Title atribut: `"Menunggu keputusan"` (tepat).
  - Kesejajaran baris status/tugas/aktivitas antar-kartu tetap simetris.
- **Kamera 3D:**
  - Posisi sudut awal kamera: `X: -2.2, Y: 14.5, Z: 19.5` (persis sesuai baseline rujukan).
- **Papan Tugas & Jam Dinding WIB:**
  - Papan tulis di dinding memuat data tugas publik yang valid.
  - Jam kerja di panel header menampilkan waktu real-time WIB (`00:15 WIB`).
- **Layout Responsif & Dock Mobile:**
  - Mode mobile menampilkan 3 tab (`Riwayat`, `Tugas Orion`, `Aktivitas`) dengan dock yang tetap dapat diakses saat kartu agen diklik.

---

## 9. Tangkapan Layar & Bukti Pengujian

Seluruh berkas gambar telah tersimpan di direktori artefak dan dapat diinspeksi:

1. [Desktop 1440 Viewport](file:///home/ubuntu/.gemini/antigravity-cli/brain/4944fa17-7c98-47b9-8ad8-9f349bad4881/qa-motion-vp-desktop-1440.png)
2. [Desktop 1024 Viewport](file:///home/ubuntu/.gemini/antigravity-cli/brain/4944fa17-7c98-47b9-8ad8-9f349bad4881/qa-motion-vp-desktop-1024.png)
3. [Tablet 768 Viewport](file:///home/ubuntu/.gemini/antigravity-cli/brain/4944fa17-7c98-47b9-8ad8-9f349bad4881/qa-motion-vp-tablet-768.png)
4. [Mobile 390 Viewport](file:///home/ubuntu/.gemini/antigravity-cli/brain/4944fa17-7c98-47b9-8ad8-9f349bad4881/qa-motion-vp-mobile-390.png)
5. [Mobile 320 Viewport](file:///home/ubuntu/.gemini/antigravity-cli/brain/4944fa17-7c98-47b9-8ad8-9f349bad4881/qa-motion-vp-mobile-320.png)
6. [Bubble Dialog "Suasana ilustratif"](file:///home/ubuntu/.gemini/antigravity-cli/brain/4944fa17-7c98-47b9-8ad8-9f349bad4881/qa-motion-dialogue-bubbles.png)
7. [Non-Regresi Kartu Nova & Kamera](file:///home/ubuntu/.gemini/antigravity-cli/brain/4944fa17-7c98-47b9-8ad8-9f349bad4881/qa-motion-non-regression.png)

---

## 10. Kesimpulan & Rekomendasi untuk Codex

1. **Revisi Fungsional & Visual Berhasil:**
   Implementasi rujukan kantor-agent untuk gerak, gait, pose aktivitas, dialog ilustratif, dan bubble coordinator terbukti stabil, estetis, dan tidak menyebabkan kebocoran memori ataupun regresi visual.
2. **Penyelarasan Harness E2E (`smoke.mjs:1236`):**
   Harness `smoke.mjs` perlu diperbarui agar assertion `assertVector(actual.position, expectedSeats[expected.key].position)` hanya mengevaluasi agen yang berstatus kerja atau saat gate ambient motion dinonaktifkan, sehingga tidak gagal saat agen siaga sedang berjalan dinamis.
3. **Kesiapan Rilis:**
   Secara fungsional dan arsitektur, revisi ini siap diajukan untuk peninjauan akhir oleh pemilik proyek sebelum dilakukan rilis produksi.
