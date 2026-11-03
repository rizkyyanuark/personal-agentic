## Ringkasan Perubahan

<!-- Jelaskan masalah, perilaku sebelum/sesudah dan manfaatnya dalam 1-2 kalimat. -->

## Scope dan Kriteria Selesai

<!-- Tautkan issue; gunakan Closes #N bila merge menyelesaikannya. Ringkas scope,
acceptance criteria, keputusan penting dan yang di luar scope. Review harus cukup
tanpa chat privat atau OpenSpec lokal. -->

## Kategori Perubahan

- [ ] `feat`: Fungsionalitas baru
- [ ] `fix`: Perbaikan perilaku atau logika
- [ ] `chore`: Pemeliharaan, dependency atau konfigurasi
- [ ] `refactor`: Penataan kode tanpa perubahan perilaku luar
- [ ] `docs`: Dokumentasi

## Bukti Pengujian Nyata

<!-- Isi baris sesuai scope dengan perintah, exit code/status dan hasil aktual.
Jangan mempertahankan contoh hasil seolah sudah diuji. Untuk docs-only, catat
pemeriksaan diff/link/source dan bahwa runtime tidak berubah. Sebutkan dependency
nyata, mocks beserta alasan, kegagalan awal dan batas bukti. Raw state/log privat
tetap ignored; jangan unggah credential. -->

| Cakupan / Skenario | Perintah / Jalur yang Diuji | Exit Code / Status | Hasil Aktual dan Bukti |
| --- | --- | --- | --- |

## Dampak Produksi dan Rencana Rollback

- Dampak UI/API dan pekerjaan aktif:
- Migrasi, kompatibilitas schema, env/config atau dependency baru:
- Worker yang membutuhkan paket/upgrade, atau tidak terdampak:
- Smoke pasca rilis dan batas izin pengujiannya:
- Tindakan rollback, target/kompatibilitas dan risiko data:

<!-- Isi setiap poin; "tidak ada" jika sudah diverifikasi. Merge ke protected main
memicu deploy otomatis setelah pemeriksaan main sukses. Jangan menjanjikan
rollback image membalik migrasi atau memulihkan database. -->

## Kesiapan Merge

- [ ] Diff direview; hanya file dalam scope, tanpa credential/state/build.
- [ ] Bukti lokal sesuai revisi; keterbatasan dinyatakan.
- [ ] Pipeline MR SHA terbaru lulus dan temuan review diselesaikan.
- [ ] Squash commits dan Delete source branch dipilih.
- [ ] Pemilik memberi izin merge dengan memahami deploy otomatis setelahnya.

<!-- Buat Ready setelah review lokal; CI boleh masih berjalan. Checklist merge
tidak otomatis selesai saat MR dibuat. Draft untuk pekerjaan yang belum selesai
atau permintaan eksplisit. Jangan aktifkan auto-merge tanpa izin. -->
