# Template Laporan Pengujian personal-agentic

Simpan laporan sebagai `docs/evidence/ev-<NNN>-<change-slug>.md` dan tautkan dari verification change serta deskripsi MR. Gunakan satu file per scope/source pemeriksaan, bukan menimpa laporan semua issue. Ikuti [panduan pengujian](testing-guide.md); bedakan eksekusi nyata, inspeksi, fixture boundary eksternal dan pemeriksaan yang belum dijalankan.

---

## 1. Identitas Pengujian

| Parameter | Rincian |
|---|---|
| **Penguji** | [Nama Penguji / Codex / Antigravity Agent] |
| **Tanggal & Waktu** | [YYYY-MM-DD HH:MM Zona Waktu] |
| **Target Branch / MR** | `[nama-branch]` / MR `#[nomor-mr]` |
| **Commit SHA** | `[commit-sha-lengkap]` |
| **Environment / Base URL** | [Lokal: http://localhost:18766 / Staging / Produksi] |
| **Spesifikasi Host / OS** | [Windows 11 / Ubuntu 24.04 / macOS] |
| **Browser & Versi** | [Chrome / Firefox / Edge / Headless Playwright] |
| **Viewport & Resolusi** | [1280x800 / 390x844 / Zoom 100%] |
| **Role / Akun Uji** | [Owner / Member] *(tanpa kredensial/token)* |

---

## 2. Matriks Kasus Uji

Ganti status awal dengan `Pass`, `Fail`, `Blocked`, atau `Not run`. Setiap status `Pass` harus menyertakan bukti konkret (nama file screenshot di `docs/evidence/`, excerpt log, atau response payload tersanitasi).

| ID | Cakupan / Fitur | Status | Bukti / Catatan Eksekusi / BUG-ID |
|---|---|---|---|
| **STAT-01** | Static check & linting (`cargo fmt`, `npm run lint`, `check`) | Not run | |
| **BUILD-01** | Kompilasi backend & build bundle frontend (`npm run build`, `cargo test`) | Not run | |
| **AUTH-01** | Autentikasi: Owner login, session persistence, dan logout | Not run | |
| **AGENT-01** | Alur Agent: Eksekusi task, streaming respons, dan persistensi run | Not run | |
| **CAT-01** | Model Catalog: Resolusi model runtime, override, dan error handling | Not run | |
| **UI-01** | Antarmuka: Navigasi menu, list workspace/project, state refresh | Not run | |
| **COCKPIT-01**| 3D Cockpit Live Preview: Overlay, seleksi meja, dan viewport reflow | Not run | |
| **REL-01** | Release preflight: Suite `release_test.py` dan `deploy_test.py` | Not run | *(Opsional jika mencakup infra)* |

---

## 3. Temuan Masalah (Bug Tracker)

*Duplikasi bagian ini untuk setiap masalah yang ditemukan. Jika tidak ada temuan bug, tulis "Tidak ada temuan bug."*

### BUG-001: [Judul Singkat Masalah]

| Field | Rincian |
|---|---|
| **Severity** | [S1: Fatal / S2: Major / S3: Minor / S4: Trivial] |
| **Dampak Pengguna** | [Jelaskan dampak nyata terhadap user flow] |
| **Prasyarat** | [Konfigurasi khusus, role, atau data awal] |
| **Frekuensi** | [... dari ... percobaan (misal: 3/3)] |
| **Bukti** | `docs/evidence/BUG-001-...png` atau excerpt log tersanitasi |
| **Workaround** | [Ada / Tidak ada; jelaskan jika ada] |

**Langkah Reproduksi:**
1. [Langkah 1]
2. [Langkah 2]
3. [Langkah 3]

- **Expected:** [Hasil yang seharusnya terjadi]
- **Actual:** [Hasil yang sebenarnya terjadi di sistem]

---

## 4. Ringkasan & Rekomendasi

- **Statistik Kasus:** Pass: `[X]`, Fail: `[Y]`, Blocked: `[Z]`, Not run: `[W]`
- **Keterbatasan Pengujian:** [Fitur/kondisi yang belum tercakup atau dibatasi kuota provider]
- **Data Uji & Cleanup:** [Data uji yang dibuat dan status cleanup sesudahnya]
- **Rekomendasi Penguji:** [**Diterima (Approved)** / **Perlu Perbaikan (Changes Requested)** / **Belum Cukup Bukti (Needs Evidence)**]
- **Alasan Rekomendasi:** [Penjelasan singkat atas rekomendasi di atas]
