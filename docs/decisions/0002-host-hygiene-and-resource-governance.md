# Keputusan 0002: Maintenance host dan penggunaan resource

- Tanggal keputusan: 13 Oktober 2026 (Asia/Jakarta).
- Penataan ADR: 14 Oktober 2026.
- Status: `Accepted`.

Pemilik keputusan: pemilik repository, melalui klarifikasi bahwa otomatisasi hanya mencakup cache/image yang terverifikasi aman; volume dan riwayat chat tetap manual. Pilihan tersebut dicatat dalam [ev-004](../evidence/ev-004-architecture-proposal-review.md). Persetujuan desain tidak berarti cleanup atau pengukuran kapasitas telah dijalankan.

## Konteks

Production, Matrix, dan CI menggunakan resource host bersama. Source Compose dan runner sudah memiliki batas per service/job, tetapi batas tersebut tidak membuktikan headroom seluruh host saat beberapa workload berjalan. Angka kapasitas dalam notulensi adalah snapshot historis; klaim kapasitas saat ini membutuhkan pengukuran baru. [Ev-004](../evidence/ev-004-architecture-proposal-review.md) dan [ev-006](../evidence/ev-006-current-contract-review.md) mencatat hasil inspeksi dan risiko cleanup.

## Keputusan

- Otomatisasi cleanup hanya mencakup cache dan image yang kepemilikan serta keamanannya untuk dihapus telah diverifikasi. Usia, status dangling, atau angka reclaimable saja tidak cukup.
- Volume Docker, riwayat chat, data persisten, backup, konfigurasi, dan kunci tidak masuk cleanup otomatis. Perubahan retensi atau penghapusan data tersebut tetap menjadi tindakan manual dengan kewenangan yang jelas.
- Image current, previous, dan pending serta resource proyek lain dilindungi. Cleanup menunda operasi yang konflik dengan build/deploy aktif atau perubahan referensi release.
- Anggaran dan kapasitas host dinilai dari workload serta jendela pengamatan yang disebutkan secara eksplisit. Batas existing dipertahankan sampai pengukuran membenarkan perubahan.

## Alternatif dan alasan

Prune seluruh daemon dapat menghapus image rollback yang tidak direferensikan container aktif atau resource proyek lain. Volume yang tidak digunakan container juga belum tentu tidak bernilai. Retensi chat otomatis merupakan perubahan data dan berada di luar scope yang dipilih pemilik.

Menetapkan kapasitas dari satu snapshot idle atau menjumlahkan batas container mengabaikan service lain dan overlap lintas project. Pengukuran workload memberi dasar untuk menentukan batas serta tindak lanjut tanpa menjanjikan headroom yang belum dibuktikan.

## Konsekuensi

Cleanup membutuhkan inventaris, kandidat spesifik, dan referensi yang dilindungi; tidak adanya kandidat aman merupakan hasil yang valid. Pengukuran membatasi kesimpulan kapasitas pada workload yang diamati. Detail seleksi, dry-run, operasi, threshold, dan acceptance disimpan pada OPS-001.

## Rujukan

- [OPS-001: maintenance dan penggunaan resource host](../../openspec/changes/OPS-001-host-hygiene-and-resource-governance/proposal.md).
- [Compose production](../../infra/production/compose.yaml) dan [panduan runner](../../infra/gitlab-runner/README.md) sebagai source konfigurasi yang perlu diperiksa saat implementasi.
- [Review awal ev-004](../evidence/ev-004-architecture-proposal-review.md) dan [review lanjutan ev-006](../evidence/ev-006-current-contract-review.md).

Fase pekerjaan dikelola pada Issue yang ditautkan dari kontrak. Reclaimed bytes, identitas resource, dan hasil kapasitas disimpan dalam verification/evidence setelah benar-benar diukur.
