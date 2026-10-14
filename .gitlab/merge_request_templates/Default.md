## Masalah dan hasil perubahan

Jelaskan trigger pengguna, perilaku sebelum/sesudah, scope dan risiko material. Tautkan Issue serta kontrak perubahan bila diperlukan. Deskripsi mengikuti implementasi akhir.

## Verifikasi

Catat commit/environment yang diuji, command dan user flow nyata, output relevan serta proof tersanitasi. Nyatakan dependency nyata, mocks dengan alasan bila ada, dan pemeriksaan yang belum dijalankan. Pipeline terbaru dan review melengkapi local proof.

## Review

Pertahankan Draft sampai scope dan bukti lokal siap ditinjau. Readiness untuk merge memerlukan review dan hasil CI commit terbaru; pemeriksaan berikut diisi dari bukti, bukan dicentang otomatis.

- [ ] Scope dan acceptance sesuai hasil pengguna.
- [ ] Diff, file baru dan kontrak/UI/API/auth/persistence yang relevan ditinjau.
- [ ] Perubahan izin/akses menguji penolakan lintas workspace/group dan akses yang telah dicabut ketika relevan.
- [ ] Bukti perilaku tersedia; failure/boundary yang relevan diperiksa.
- [ ] Secret, runtime state, backup dan generated output tidak ikut source.
- [ ] Dokumen/rute baca sesuai perubahan akhir; risiko dan keterbatasan jelas.

## Release dan handoff

Jelaskan kebutuhan migrasi/config/release serta rollback. Jangan menandai produksi selesai dari local proof atau merge. Image/smoke main dan manual production gate mengikuti `docs/deployment.md`; pekerjaan tanpa release menyatakan batasnya. Catat next action atau blocker yang tersisa.
