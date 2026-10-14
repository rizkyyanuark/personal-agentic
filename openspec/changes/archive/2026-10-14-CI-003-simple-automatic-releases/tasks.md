# Tasks: CI-003 follow-up — preflight, state dan diagnosis

Issue: [GitLab #5](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/5).
Kontrak: [proposal](proposal.md); arah desain: [ADR 0001](../../../../docs/decisions/0001-personal-agentic-architecture-contract.md).
Fase release/merge berada pada Issue. Checklist ini menerima skenario yang benar-benar
dijalankan; [verification](verification.md) memisahkan hasil lokal dan operasional.

- [x] T-CI003-1 / R3: reject source/key/disk invalid sebelum shutdown. Main
  orchestration diuji dengan SQLite nyata dan boundary Docker eksternal. Recover
  existing tidak meminta kapasitas backup baru atau key sumber baru. Promote dan
  rollback mempunyai pemeriksaan sebelum stop dan saat backup.
- [x] T-CI003-2 / R3: inventaris mount serta writable layer produksi. Backup
  menyimpan tiga volume, home controller, Compose/env dan selected runtime key.
  Format 2 dan legacy empat arsip mempunyai exact supported archive sets;
  hash/config/schema/journal yang invalid ditolak. Legacy path hanya ada pada
  validator, tidak menjadi prasyarat source proyek eksternal.
- [x] T-CI003-3 / R3: safe stage/category/reference pada client; root-private
  command diagnostics termasuk kedua penyebab bila recovery sekunder gagal.
  Guard refusal juga mempertahankan context yang diizinkan. Secret fixture
  tidak masuk public proof atau pesan client.
- [x] T-CI003-4 / R2,R3: Linux helper alignment 46 dan client 11 test; isolated Docker backup
  memakai image ARM64 nyata, org/SQLite aplikasi nyata, actual Compose quoted-key
  resolution termasuk key nested, owner/mode bootstrap, stopped home copy,
  private archive validation dan cleanup.
- [x] T-CI003-5 / R3 (14 Oktober 2026): source resume setelah stop/backup gagal
  memakai start existing containers, mempertahankan writable home dan guard
  image/schema/state/journal. Actual Docker init-change reproduction dan
  absent-service refusal Passed; main/backup regression menangani start success
  serta failure dengan private incomplete archive dan kedua diagnostic.
  Helper follow-up 47 tests/9.603s, source 6e2dbe68; aktivasi normal tetap up setelah
  backup berhasil. Installed helper dan CI/release mempunyai proof terpisah.

Bukti dan identitas source: [ev-011](../../../../docs/evidence/ev-011-ci-003-managed-state-backup.md).
Koreksi atas patch sebelumnya tetap tersimpan pada [ev-006](../../../../docs/evidence/ev-006-current-contract-review.md)
dan [laporan awal](../../../../docs/evidence/ev-010-ci-003-initial-preflight-report.md).
Installed-helper, main image dan deployment berikutnya dilacak terpisah dari
penerimaan lokal ini; tidak menggunakan keberhasilan pipeline 61 sebagai proof
patch follow-up.
