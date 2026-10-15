# Panduan Kontribusi personal-agentic

Panduan ini mengatur standar alur kerja Git, konvensi penamaan branch, dan pembuatan Merge Request untuk pengembang maupun agen AI.

## 1. Konvensi Penamaan Branch

Setiap perubahan dibuat pada branch terpisah sebelum digabungkan ke branch `main`. Penamaan branch menggunakan format baku:

```text
<type>/<slug>
```

- Huruf kecil penuh (*lowercase*) dipisahkan dengan tanda hubung (*kebab-case*).
- Tidak mewajibkan nomor issue tiket.

### Kategori Tipe Branch (`<type>`):
- `feat/`: Penambahan fungsionalitas atau fitur baru (contoh: `feat/custom-model-catalog`).
- `fix/`: Perbaikan bug atau kesalahan logika (contoh: `fix/process-cleanup`).
- `chore/`: Pemeliharaan repositori, konfigurasi tooling, atau dependensi (contoh: `chore/gitlab-mr-governance`).
- `refactor/`: Penataan ulang kode tanpa mengubah perilaku sistem (contoh: `refactor/database-queries`).
- `docs/`: Pembaruan dokumentasi atau panduan kerja (contoh: `docs/deployment-runbook`).

## 2. Alur Merge Request (MR) di GitLab

1. **Branch Utama Terproteksi**: Branch `main` hanya menerima perubahan melalui Merge Request yang telah disetujui.
2. **Template Laporan Wajib**: Setiap MR baru otomatis memuat format dari `.gitlab/merge_request_templates/Default.md`. Isi seluruh bagian dengan informasi yang akurat:
   - Ringkasan dampak perubahan bagi pengguna.
   - Tabel bukti uji nyata (perintah yang dijalankan, exit code, dan ringkasan output/verifikasi).
   - Catatan rilis dan langkah mitigasi/rollback.
3. **Gaya Penulisan**: Tuliskan deskripsi secara lugas, berbasis bukti konkret, dan hindari kata hiasan kosong seperti *seamless*, *robust*, atau *revolutionary*.
4. **Kebijakan Penggabungan**:
   - Seluruh pipeline verify wajib lulus (berstatus hijau) sebelum tombol merge aktif.
   - Penggabungan menggunakan opsi **Squash commits** agar riwayat branch `main` tetap bersih berupa satu commit per fitur.
   - Branch sumber otomatis dihapus setelah merge selesai.

## 3. Tata Kelola Server GitLab dan Mirror GitHub

Pengaturan berikut dikonfigurasi pada antarmuka web GitLab oleh Maintainer:

### A. Isolasi Push Mirror ke GitHub (Settings -> Repository -> Mirroring repositories)
- **Only mirror protected branches**: Wajib dicentang.
- Hasil: GitLab hanya mem-push branch `main` ke GitHub; branch kerja sementara (`feat/*`, `fix/*`, `chore/*`) tidak akan pernah bocor ke GitHub.

### B. Proteksi Merge Request (Settings -> Merge requests)
- **Pipelines must succeed**: Centang opsi ini agar merge terhalang jika verifikasi CI gagal.
- **Enable "Delete source branch" option by default**: Centang opsi ini agar branch sementara otomatis terhapus setelah penggabungan.
- **Squash commits when merging**: Pilih opsi *Encourage* atau *Require* agar commit branch fitur dipadatkan menjadi satu commit bersih di branch `main`.
