# Keputusan 0001: State platform, release, dan katalog runtime

- Tanggal keputusan: 13 Oktober 2026 (Asia/Jakarta).
- Penataan ADR: 14 Oktober 2026.
- Status: `Accepted`.

Pemilik keputusan: pemilik repository, melalui klarifikasi pada percakapan review 13–14 Oktober 2026; batas backup dan multi-harness dicatat dalam [ev-004](../evidence/ev-004-architecture-proposal-review.md). Persetujuan ini menerima arah desain, bukan hasil implementasi, CI, merge, atau deployment.

## Konteks

Kegagalan release sebelum penggantian image menunjukkan kebutuhan pemeriksaan prasyarat sebelum service dihentikan dan diagnosis yang aman. Review source juga menemukan pemanggilan katalog controller yang tidak selalu mengikuti workstation dan harness pilihan pengguna. Temuan serta batas buktinya dicatat dalam [ev-004](../evidence/ev-004-architecture-proposal-review.md) dan [review lanjutan ev-006](../evidence/ev-006-current-contract-review.md); temuan inspeksi tidak membuktikan semua jalur runtime berhasil.

## Keputusan

- Release memeriksa prasyarat sesuai jenis operasi sebelum service dihentikan. Kegagalan menyediakan tahap dan kategori diagnosis yang berguna tanpa mengekspos output atau konfigurasi privat.
- Backup mencakup seluruh state yang dikelola platform: database, attachment, workdir internal, konfigurasi, dan kunci runtime yang diperlukan untuk pemulihan. Source proyek eksternal mengikuti backup proyeknya sendiri. Batas ini ditentukan melalui inventaris state dan kebutuhan recovery, bukan hanya nama path.
- Platform tetap mendukung beberapa harness. Ketersediaan harness dan model mengikuti effective runtime/workstation yang dipilih: lokal, SSH, atau registered worker. Kegagalan pada konteks lain tidak boleh merusak alur yang valid, dan runtime lokal tidak memerlukan `ssh_host`.
- Seluruh direktori kredensial host `.codex` tidak di-mount ke kontainer platform sebagai solusi katalog. Akses katalog dan autentikasi mengikuti adapter runtime dengan batas akses yang sesuai.

## Alternatif dan alasan

Backup database saja tidak mencakup state lain yang diperlukan untuk recovery. Menghapus arsip workdir lama tanpa inventaris juga dapat menghilangkan state yang masih diperlukan. Karena itu, perubahan cakupan atau format backup harus mempertahankan kompatibilitas backup/journal yang masih didukung.

Memaksa Antigravity sebagai satu harness global bertentangan dengan pilihan workstation pengguna. Mount seluruh `.codex` memperluas akses ke kredensial host untuk menyelesaikan masalah resolusi katalog; konteks runtime dan adapter menyediakan batas yang lebih tepat.

## Konsekuensi

Release dan katalog dapat dikerjakan sebagai change terpisah dengan keputusan arsitektur yang sama. Inventaris state dan kompatibilitas recovery membatasi perubahan backup. Detail endpoint, algoritme preflight, kategori diagnosis, skenario penerimaan, dan pembuktiannya berada dalam kontrak perubahan.

## Rujukan

- [CI-003: release otomatis dan follow-up preflight/recovery](../../openspec/changes/CI-003-simple-automatic-releases/proposal.md).
- [CAT-001: katalog model sesuai runtime](../../openspec/changes/CAT-001-runtime-model-catalog/proposal.md).
- [PRD](../../PRD.md), [review awal ev-004](../evidence/ev-004-architecture-proposal-review.md), dan [review lanjutan ev-006](../evidence/ev-006-current-contract-review.md).

Fase pekerjaan, owner implementasi, MR, dan tindak lanjut dikelola pada Issue yang ditautkan dari kontrak. Hasil pemeriksaan tetap berada dalam verification/evidence.
