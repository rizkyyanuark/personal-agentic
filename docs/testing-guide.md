# Panduan Pengujian personal-agentic

Panduan ini mengatur standar eksekusi pengujian untuk setiap perubahan kode di repositori `personal-agentic`. Seluruh hasil pengujian harus dicatat menggunakan [Template Laporan Pengujian](testing-report-template.md) yang kemudian disematkan pada catatan **Merge Request (MR)** sebagai artefak verifikasi resmi.

---

## 1. Prinsip dan Tangga Verifikasi

Sesuai aturan [AGENTS.md](../AGENTS.md), pengujian bertujuan membuktikan **perilaku produk nyata**, bukan sekadar membuat test unit lulus dengan mock. Gunakan tingkatan pengujian tertinggi yang memungkinkan:

1. **Level 1: Real Product Smoke Test (Wajib)**
   - Menjalankan aplikasi nyata (backend Rust + frontend React/Cockpit).
   - Melakukan interaksi melalui browser nyata atau pemanggilan API (`curl`) ke endpoint nyata.
   - Menguji alur happy path dan failure path utama.
2. **Level 2: Integration Tests**
   - Menjalankan test suite integrasi backend (`cargo test --locked`).
   - Menjalankan skrip browser smoke test (`node frontend/tests/native-smoke.mjs basic`).
3. **Level 3: Static Checks & Lints**
   - Pemformatan Rust (`cargo fmt --all --check`).
   - Pemeriksaan lint frontend (`npm run lint --workspace frontend`).
   - Typecheck cockpit Three.js (`npm run check --workspace cockpit`).
4. **Level 4: Release Preflight Checks** *(Wajib jika mengubah file `infra/` atau pipeline CI/CD)*
   - Menjalankan suite pengujian helper rilis dan client deploy.

---

## 2. Perintah Pengujian Standar

Jalankan perintah berikut sesuai modul yang diubah:

### A. Backend (Rust)
Dijalankan dari direktori `src/`:

```powershell
# Format check
cargo fmt --all --check

# Test suite backend
cargo test --workspace --locked
```

### B. Frontend & 3D Cockpit (TypeScript / React / Three.js)
Dijalankan dari direktori `src/`:

```powershell
# Instalasi dependensi
npm ci

# Lint frontend
npm run lint --workspace frontend

# Typecheck cockpit 3D
npm run check --workspace cockpit

# Build production bundle frontend
npm run build
```

### C. Browser Smoke Test (Jalur Produk Nyata)
Dijalankan dari direktori `src/frontend`:

```powershell
# Jalankan smoke test dasar
node tests/native-smoke.mjs basic
```

*Catatan: Variabel lingkungan `AE_TEST_ORG` dan `AE_TEST_URL` dapat diset untuk mengarahkan pengujian ke instance lokal terisolasi.*

### D. Infrastruktur & Rilis (Python & Shell)
Dijalankan dari root repositori (di lingkungan Linux / WSL / runner):

```sh
# Pengujian rilis helper
python3 -B infra/production/tests/release_test.py

# Pengujian client deployment CI
python3 -B infra/ci/tests/deploy_test.py

# Validasi sintaks shell scripts
bash -n infra/production/bootstrap.sh infra/ci/build-backend.sh infra/ci/publish-image.sh infra/ci/smoke-image.sh
sh -n infra/production/deploy-command.sh infra/ci/buildkit-runc.sh
```

---

## 3. Aturan Sanitasi Bukti Pengujian (Sanitization Rules)

Seluruh artefak uji (screenshot, potongan log, output JSON, atau curl response) yang disimpan di repositori maupun yang ditempel di deskripsi Merge Request **WAJIB** disanitasi:

1. **Dilarang Menyertakan Kredensial**:
   - `API Key` (OpenAI, Gemini, Anthropic, SiliconFlow, dll.)
   - `JWT Secret Key` atau `Bearer Token` autentikasi
   - Private key SSH (`.pem`, `.key`, `id_ed25519`)
   - Password database, password akun user/owner
   - Cookie sesi aktif
2. **Redaksi Data Sensitif**:
   - Ganti token dengan teks redaksi seperti `[REDACTED_TOKEN]` atau `[BEARER_XXX]`.
   - Gunakan URL loopback/lokal (`http://localhost:18766`) atau domain publik non-kredensial.
3. **Penyimpanan Bukti Permanen**:
   - Bukti log atau data hasil uji yang relevan disimpan di folder `docs/evidence/` dengan format nama: `ev-<nomor-issue>-<deskripsi-singkat>.md`.

---

## 4. Alur Pembuatan Laporan Uji untuk Merge Request (MR)

Setiap Merge Request yang diajukan harus menyertakan laporan pengujian terstandarisasi:

1. Buka [docs/testing-report-template.md](testing-report-template.md).
2. Simpan laporan bertanggal sebagai `docs/evidence/ev-<NNN>-<change-slug>.md` di branch kerja, lalu tautkan dari verification change dan deskripsi MR. Pertahankan hasil lama beserta identitas source-nya.
3. Isi kolom **Identitas Pengujian** (Commit SHA, Tester, Environment, dll.).
4. Jalankan pengujian dan perbarui status pada **Matriks Kasus Uji** (`Pass`, `Fail`, `Blocked`, `Not run`).
5. Jika menemukan kegagalan atau bug, catat detailnya pada bagian **Temuan Masalah (BUG-001)** beserta langkah reproduksi dan screenshot/log bukti.
6. Berikan kesimpulan dan rekomendasi pengujian di bagian akhir.
