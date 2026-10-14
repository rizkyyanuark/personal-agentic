# Verification: CI-003 follow-up — preflight dan diagnosis release

Issue: [GitLab #5](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/5) | [Proposal](proposal.md) | [Tasks](tasks.md).

Pemeriksaan terbaru berada pada [ev-011](../../../docs/evidence/ev-011-ci-003-managed-state-backup.md): helper43/client11 tests, actual stopped-container backup serta installed helper/legacy-production-backup validation Passed. CI dan main activation mempunyai gate terpisah. Fase pekerjaan berada pada Issue.

## Review historis sebelum perbaikan

Tabel berikut berlaku pada patch awal, bukan source follow-up terbaru. [ev-006](../../../docs/evidence/ev-006-current-contract-review.md) merekam regresi yang kemudian diperbaiki; [laporan awal](../../../docs/evidence/ev-010-ci-003-initial-preflight-report.md) tetap disimpan.

## Hasil per pemeriksaan

| Pemeriksaan | Hasil | Bukti dan batas |
| --- | --- | --- |
| Suite helper rilis | Passed, dilaporkan | 38 test/33.783s pada log historis di bawah; tidak dijalankan ulang pada penataan dokumentasi ini. |
| Suite client deploy | Passed, dilaporkan | 10 test/1.875s pada log historis di bawah; bukan acceptance seluruh diagnosis. |
| Fungsi preflight menolak disk kurang/key tidak ada | Passed, dilaporkan | Test fungsi langsung; kapasitas disk diganti pada boundary filesystem. Tidak menjalankan main orchestration atau membuktikan urutan stop. |
| Orchestration menolak sebelum stop | Not run | Test yang dilaporkan tidak memeriksa main/Compose stop; klaim Pass sebelumnya dikoreksi pada review 14 Oktober. |
| Penghapusan referensi fixed runtime path | Inspected | Log grep nol matches membuktikan referensi hilang, bukan inventaris state atau kompatibilitas backup. |
| Pemetaan error Preflight failed | Inspected | Pemetaan source ditemukan; kategori/tahap untuk semua kegagalan belum dibuktikan. |
| Recovery menerima format backup legacy yang valid | Failed | ev-006: fixture empat arsip diterima helper baseline dan ditolak source revisi; reproduction tanpa mocks atau kontak production. |
| Recovery memakai prasyarat sesuai operasi | Inspected | ev-006 menemukan capacity preflight sebelum cabang recover; skenario runtime penerimaan perbaikan belum dijalankan. |
| Inventaris seluruh state platform vs source eksternal | Not run | Penghapusan path/arsip belum dilengkapi inventory yang dipersyaratkan ADR 0001. |
| Installed helper dan deployment source follow-up | Not run | Proof historis pada proposal memakai source berbeda; penataan dokumentasi ini tidak memasang helper atau menjalankan deploy. |

## Identitas dan koreksi

Log suite awal dicatat oleh pemeriksa sebelumnya. SHA ec70e3287682fdc3c6a86df03054a38fe6e92817 adalah SHA dasar checkout; patch release/client/test belum committed. Log awal belum mencatat identitas patch yang lengkap.

Reproduction dalam ev-006 memakai release.py SHA256 1d9a49deefdb125657a95a050ba44812d5ed91376427b3e0b3d3d5eef6dae722 dan mencatat environment/dependency/batasnya. Hasil itu berlaku pada source yang diuji, bukan otomatis pada revisi berikutnya.

Koreksi bertanggal 14 Oktober 2026 mempertahankan output suite awal dan membatasi kesimpulannya. Penerimaan desain ADR, hasil suite, penerimaan kontrak dan deployment adalah hasil yang berbeda.

## Log suite historis yang dilaporkan


### Bukti Eksekusi Test Suite (WSL Ubuntu 24.04 as root)
```text
# wsl -u root python3 -B infra/production/tests/release_test.py
Ran 38 tests in 33.783s
OK

# wsl python3 -B infra/ci/tests/deploy_test.py
Ran 10 tests in 1.875s
OK

# wsl grep -rn "workspace/production" infra/production/release.py
(0 baris ditemukan, exit code 1)
```
