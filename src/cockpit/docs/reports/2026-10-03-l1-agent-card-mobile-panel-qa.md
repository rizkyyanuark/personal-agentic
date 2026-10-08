# 📋 Laporan Pengujian QA L1: Kartu Agent & Panel Mobile

> **Target Layanan:** `http://127.0.0.1:8099`  
> **Workspace:** `/home/ubuntu/infra-hub/ai-lab-cockpit`  
> **Tanggal & Waktu:** 3 Oktober 2026, 19:25 WIB  
> **Mode Kerja:** Strict QA & Audit Only (Tanpa perubahan kode, tanpa deploy produksi)

---

## 1. 🔍 Identitas Lingkungan & Verifikasi Hash Aset

- **Browser Pengujian:** Headless Chromium / Puppeteer `Chrome/154.0.8037.57`
- **Display Scaling / DPR Matrix:** `1.0` (Native Desktop), `1.5`, `2.0` (Retina / Mobile Emulation)
- **Viewport yang Diuji:** `320×760`, `390×844`, `507×900`, `768×1024`, `820×1180`, `1024×768`, `1440×900`
- **Verifikasi Hash Aset Network (HTTP 200 OK):**
  - `CSS:` `http://127.0.0.1:8099/assets/index-6zfGAv_h.css` (**Cocok 100%**)
  - `JS:` `http://127.0.0.1:8099/assets/index-ChOHEMHz.js` (**Cocok 100%**)
  - _Kedua aset terkonfirmasi dimuat langsung dari build aktif._

---

## 2. 🤖 Hasil Pengujian Otomatis (`npm run test:e2e`)

- **Perintah:** `COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e`
- **Exit Code:** **`0` (PASS)**
- **Hasil Eksekusi:**
  ```text
  PASS mobile-320: hide/show panels, H shortcut, minimize/restore both panels, queue/about tabs and keyboard navigation
  PASS mobile-320: four workstations, five characters/cards, five focus/reset views, keyboard and scene input
  PASS mobile-390: hide/show panels, H shortcut, minimize/restore both panels, queue/about tabs and keyboard navigation
  PASS mobile-390: four workstations, five characters/cards, five focus/reset views, keyboard and scene input
  PASS tablet-768: hide/show panels, H shortcut, minimize/restore both panels, queue/about tabs and keyboard navigation
  PASS tablet-768: four workstations, five characters/cards, five focus/reset views, keyboard and scene input
  PASS desktop-1024: hide/show panels, H shortcut, minimize/restore both panels, queue/about tabs and keyboard navigation
  PASS desktop-1024: four workstations, five characters/cards, five focus/reset views, keyboard and scene input
  PASS desktop-1440: hide/show panels, H shortcut, minimize/restore both panels, queue/about tabs and keyboard navigation
  PASS HQ anchor stability >45s; actual DPR 1.5/2 before and after resize
  PASS desktop-1440: four workstations, five characters/cards, five focus/reset views, keyboard and scene input
  ```
- **Assertion yang Gagal:** **Tidak ada (0 assertion failure)**.

---

## 3. 📊 Matriks Status Evaluasi (PASS / FAIL / DEFECT)

| Bagian             | Skenario Pengujian                                                                        |   Status   | Bukti / Catatan Pengamatan                                                        |
| :----------------- | :---------------------------------------------------------------------------------------- | :--------: | :-------------------------------------------------------------------------------- |
| **A. Kartu Agent** | Nama & pill sejajar saat ruang cukup (`1440px`, `mobile`)                                 |  **PASS**  | `diff: 0px` (sejajar pada garis Y yang sama).                                     |
|                    | Nova memakai pill ringkas `"Menunggu"`                                                    |  **PASS**  | Teks pill: `Menunggu` (amber).                                                    |
|                    | Arti `"Menunggu keputusan"` pada title & aksesibilitas                                    |  **PASS**  | `title="Menunggu keputusan"`, `aria-label` lengkap.                               |
|                    | Header tidak muat $\rightarrow$ seluruh strip pakai baris status kedua bersama (`1024px`) |  **PASS**  | Seluruh 5 kartu serentak turun ke baris 2 (`diff: 25px`).                         |
|                    | Tidak ada teks/pill keluar kartu pada zoom normal                                         |  **PASS**  | `hasCardOverflow: false` di semua 5 kartu.                                        |
|                    | Baris status, tugas, dan aktivitas sejajar antar-kartu                                    |  **PASS**  | Selaras horizontal di seluruh kartu.                                              |
|                    | Paritas styling dengan `kantor-agent` (font, avatar, padding, border)                     |  **PASS**  | System UI font, padding `10px 12px 11px`, border `#e6dfd5`, radius `14px`.        |
| **B. Mobile**      | Panel bawah terbuka saat awal masuk mobile                                                |  **PASS**  | Drawer terbuka setinggi `320.7px` dengan konten scroll.                           |
|                    | Klik kartu menciutkan isi; dock, 3 tab, & tombol buka tetap terlihat                      |  **PASS**  | Konten `display: none`, dock `52px` tetap tampil dengan tombol buka `^`.          |
|                    | Tiga Tab: Riwayat, Tugas agent, dan Aktivitas berfungsi                                   |  **PASS**  | Tiap tab membuka kembali drawer dan merender pane terkait.                        |
|                    | Chevron dan tombol pintas `H` membuka/menutup panel                                       |  **PASS**  | Toggle `isMinimized` dan `aria-expanded` sinkron.                                 |
|                    | Escape 1: menciutkan panel & pulihkan fokus; Escape 2: reset kamera                       |  **PASS**  | Esc 1 memfokuskan `#btnMinRight`, Esc 2 reset ke posisi Home.                     |
|                    | Carousel agent tidak menabrak drawer/dock                                                 |  **PASS**  | Jarak bersih pas `8px` (`collides: false`).                                       |
| **C. Responsif**   | Viewport 320, 390, 507, 768, 820, 1024, 1440 px                                           |  **PASS**  | `overflowX = 0px`, tombol $\ge 44\times 44\text{ px}$.                            |
|                    | Sembunyikan panel desktop $\rightarrow$ mobile $\rightarrow$ kembali desktop              |  **PASS**  | Mobile tetap terbuka saat masuk; preferensi sembunyi desktop kembali saat keluar. |
|                    | Safe area & akses sentuh tombol                                                           |  **PASS**  | Menggunakan `env(safe-area-inset-bottom)`, target sentuh aman.                    |
|                    | **Zoom Teks 200% Desktop (1440px)**                                                       | **DEFECT** | Pill status terpotong 3 baris (`● Istir/aha/t`), panel kiri menabrak kartu 1-2.   |
|                    | **Zoom Teks 200% Mobile (390px)**                                                         | **DEFECT** | Tabrow dock mobile bertabrakan dan teks tumpang-tindih (`Rayas 8 Aktivit`).       |
| **D. Regresi**     | Konsistensi Aktivitas mobile vs feed desktop                                              |  **PASS**  | 8 entri identik secara urutan dan teks.                                           |
|                    | Empty / offline tidak meninggalkan loading abadi                                          |  **PASS**  | Mengubah teks status menjadi jujur dan dot offline oranye.                        |
|                    | Navigasi kembali browser tetap merender kartu rapi                                        |  **PASS**  | 5 kartu utuh tanpa overflow horizontal.                                           |
|                    | Console error selama pengujian                                                            |  **PASS**  | `consoleErrors: 0` (bersih dari warning/error).                                   |

---

## 4. ⚠️ Temuan Cacat (Defects), Langkah Reproduksi, & Analisis

### Cacat #1: Tabrow Dock Mobile Bertabrakan saat Page/Text Zoom 200%

- **File Bukti:** `l1-page-zoom-200-mobile-390.png`
- **Langkah Reproduksi:**
  1. Buka browser pada lebar `390px`.
  2. Naikkan zoom halaman atau teks menjadi 200%.
  3. Amati tab dock bagian bawah (`.tabs-container`).
- **Hasil yang Diharapkan:** Tab bar membungkus baris (_wrap_) atau dapat digulir horizontal (_horizontal scroll_) tanpa teks saling tumpang-tindih.
- **Hasil Aktual:** Teks tab `Riwayat 8`, `Tugas Orion 1`, dan `Aktivitas` bertumpuk langsung di atas satu sama lain menjadi gumpalan teks yang tidak terbaca: `Rayas 8 Aktivit`.

---

### Cacat #2: Kartu Agent Tergencet Menjadi Kolom Sempit & Pill Terpotong saat Zoom 200% Desktop

- **File Bukti:** `l1-page-zoom-200-desktop-1440.png`
- **Langkah Reproduksi:**
  1. Buka browser pada resolusi `1440×900`.
  2. Naikkan zoom halaman menjadi 200%.
  3. Amati baris kartu agent di bagian bawah dan panel sisi kiri.
- **Hasil yang Diharapkan:** Kartu agent mempertahankan rasio proporsional (atau membungkus menjadi 2 baris / carousel) dan pill status tidak pecah.
- **Hasil Aktual:**
  1. Kartu agent dipaksa muat dalam 1 baris horizontal sehingga menjadi kolom vertikal yang sangat sempit dan tinggi.
  2. Pill status `.st` pecah menjadi 3 baris di dalam lingkaran sempit: `● Istir` / `aha` / `t`.
  3. Panel kiri (`Aktivitas agent`) menabrak dan menutupi kartu Orion dan Nova.

---

### Catatan Tambahan (Kerapian Header 1024px)

- Pada viewport desktop `1024px`, angka `0` pada kartu metrik `Tugas selesai` menyenggol teks jam `19:09:27` di sampingnya karena ruang flex yang padat.

---

## 5. 🔍 Bagian yang Belum Diuji / Batas Verifikasi

1. **Gestur Sentuh Multi-Touch Alami pada Perangkat Fisik Nyata:**  
   Pengujian sentuh dilakukan melalui emulasi Puppeteer TouchEvent di Chromium Linux (bukan layar sentuh kapasitif iOS WebKit / Android nyata).
2. **Kondisi Jaringan Ekstrem (Flaky / 3G Slow Latency):**  
   Pengujian offline dilakukan melalui isolasi pemutusan polling `/api/state` di tingkat client mock, bukan simulasi packet drops TCP tingkat kernel.
3. **VoiceOver / TalkBack Screen Reader Audio:**  
   Pengujian aksesibilitas diverifikasi pada tingkat atribut DOM (`aria-label`, `aria-pressed`, `aria-selected`, `aria-expanded`, dan `tabindex`), belum dilakukan verifikasi ujaran sintesis suara audio.
