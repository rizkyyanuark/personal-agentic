# Keputusan 0003: Paralelisme agen, ownership proses, dan audit

- Tanggal keputusan: 13 Oktober 2026 (Asia/Jakarta).
- Penataan ADR: 14 Oktober 2026.
- Status: `Accepted`.

Pemilik keputusan: pemilik repository, melalui klarifikasi untuk mempertahankan paralelisme dan menggunakan worktree bagi pekerjaan menulis bila perlu. Pilihan tersebut dicatat dalam [ev-004](../evidence/ev-004-architecture-proposal-review.md). Persetujuan arah audit tidak membuktikan seluruh mekanisme proses telah lulus pengujian runtime.

## Konteks

[PRD](../../PRD.md) mengizinkan main chat dan side chat berjalan paralel serta meminta isolasi penulisan yang sesuai. Inspeksi source menemukan antrean, ownership process tree, timeout, process-group cleanup, dan batas routing yang sudah ada. Keberadaan kontrol tersebut adalah temuan source; cancellation, disconnect, dan ownership pada setiap transport masih membutuhkan proof. Temuan dan batasnya dicatat dalam [ev-004](../evidence/ev-004-architecture-proposal-review.md) serta [ev-006](../evidence/ev-006-current-contract-review.md).

## Keputusan

- Pertahankan paralelisme main/side chat dan perilaku antrean yang sah. Bila pekerjaan menulis pada proyek yang sama memerlukan isolasi, gunakan worktree terpisah yang dipilih secara eksplisit.
- Audit mekanisme existing dan batas ownership pada jalur runtime yang digunakan sebelum menambah mekanisme baru. Jangan menerapkan lock universal satu folder yang menolak seluruh aktivitas bersamaan.
- Perubahan pengaman baru harus memiliki defect yang direproduksi, entrypoint yang terdampak, dan kebutuhan perilaku yang jelas. Temuan satu jalur tidak menjadi bukti keselamatan semua transport atau semua rantai invocation.

## Alternatif dan alasan

Lock universal mengubah paralelisme yang disengaja dan dapat memblokir pekerjaan yang tidak konflik. Mengganti process spawning atau menambah pengaman serupa dari nol juga menduplikasi kontrol sebelum celahnya diketahui. Audit kontrol existing menjaga perilaku produk sekaligus menghasilkan dasar untuk koreksi yang terarah.

## Konsekuensi

AGT-001 merupakan audit dan regresi, dengan implementasi hanya jika ada defect yang terbukti. Hasil audit boleh menyatakan batas yang belum tercakup atau tidak menemukan defect; tidak perlu membuat kode baru agar audit dianggap selesai. Detail matriks transport/OS, ownership run, lifecycle, routing, dan acceptance berada dalam kontrak audit.

## Rujukan

- [AGT-001: audit keselamatan proses dan konkurensi](../../openspec/changes/AGT-001-subagent-concurrency-and-process-guard/proposal.md).
- [Remote bridge](../../src/backend/src/remote_bridge.py), [runtime](../../src/backend/src/runtime.rs), [process ownership](../../src/backend/src/process_tree/spawn.rs), dan [coordination](../../src/backend/src/coordination.rs) sebagai source yang diinspeksi.
- [PRD](../../PRD.md), [review awal ev-004](../evidence/ev-004-architecture-proposal-review.md), dan [review lanjutan ev-006](../evidence/ev-006-current-contract-review.md).

Fase dan penanggung jawab audit dikelola pada Issue yang ditautkan dari kontrak. Proof proses dan defect yang direproduksi disimpan dalam verification/evidence.
