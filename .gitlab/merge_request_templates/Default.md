## Ringkasan Perubahan

<!-- Tuliskan 1-2 kalimat ringkas mengenai apa yang berubah dan apa manfaatnya bagi pengguna atau sistem. Hindari kata hiasan tanpa bukti seperti seamless, robust, atau cutting-edge. -->

## Kategori Perubahan

- [ ] `feat`: Penambahan fungsionalitas atau fitur baru
- [ ] `fix`: Perbaikan bug atau kesalahan logika
- [ ] `chore`: Pemeliharaan, dependensi, atau konfigurasi repositori
- [ ] `refactor`: Perapihan struktur kode tanpa mengubah perilaku luar
- [ ] `docs`: Pembaruan dokumentasi atau panduan kerja

## Bukti Pengujian Nyata

Semua perubahan wajib melalui pengujian nyata sebelum merge disetujui. Lengkapi tabel berikut dengan perintah aktual yang dijalankan dan hasil konkretnya:

| No | Cakupan / Skenario | Perintah yang Dijalankan | Hasil (Exit Code / Status) | Bukti / Catatan Singkat |
|---|---|---|---|---|
| 1 | Uji fungsional / unit | `npm test` atau `cargo test` | Pass (exit code 0) | Seluruh test suite lulus |
| 2 | Verifikasi integrasi | `curl` endpoint atau CLI run | HTTP 200 / output valid | Bukti payload terverifikasi |

## Dampak Produksi dan Rencana Rollback

- **Dampak sistem**: Apakah perubahan ini membutuhkan migrasi data, variabel lingkungan (`.env`) baru, atau restart container?
- **Rencana rollback**: Jika verifikasi pasca rilis gagal, tindakan konkret apa yang harus dilakukan (contoh: revert commit, gunakan image sebelumnya)?
