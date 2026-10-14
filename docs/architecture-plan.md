# Peta perubahan arsitektur personal-agentic

Dokumen ini menautkan keputusan dan kontrak perubahan agar pekerjaan yang berkaitan mudah ditemukan. Fase, prioritas dan penanggung jawab aktual dicatat pada GitLab Issue. Scope dan dependency teknis berada pada kontrak; hasil pemeriksaan berada pada verification/evidence.

Panduan: [development](development.md), [keputusan arsitektur](decisions/README.md), [kontrak OpenSpec](../openspec/README.md), [deployment](deployment.md), dan [pengujian](testing-guide.md).

## Peta pekerjaan

| Pekerjaan | Kontrak | Tracking dan bukti |
| --- | --- | --- |
| Release otomatis, preflight dan diagnosis | [CI-003](../openspec/changes/CI-003-simple-automatic-releases/proposal.md) | [Issue #5](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/5), [tasks](../openspec/changes/CI-003-simple-automatic-releases/tasks.md), [verification](../openspec/changes/CI-003-simple-automatic-releases/verification.md) |
| Katalog sesuai runtime/harness | [CAT-001](../openspec/changes/CAT-001-runtime-model-catalog/proposal.md) | Tautan Issue dicatat pada kontrak saat dipublikasikan; [tasks](../openspec/changes/CAT-001-runtime-model-catalog/tasks.md), [verification](../openspec/changes/CAT-001-runtime-model-catalog/verification.md) |
| Maintenance host dan kapasitas | [OPS-001](../openspec/changes/OPS-001-host-hygiene-and-resource-governance/proposal.md) | Tautan Issue dicatat pada kontrak saat dipublikasikan; [tasks](../openspec/changes/OPS-001-host-hygiene-and-resource-governance/tasks.md), [verification](../openspec/changes/OPS-001-host-hygiene-and-resource-governance/verification.md) |
| Audit ownership proses dan konkurensi | [AGT-001](../openspec/changes/AGT-001-subagent-concurrency-and-process-guard/proposal.md) | Tautan Issue dicatat pada kontrak saat dipublikasikan; [tasks](../openspec/changes/AGT-001-subagent-concurrency-and-process-guard/tasks.md), [verification](../openspec/changes/AGT-001-subagent-concurrency-and-process-guard/verification.md) |

Paket memiliki hasil yang dapat diperiksa sendiri; tidak ada rantai wajib CI-003 → CAT-001 → OPS-001 → AGT-001. Dependency konkret dan urutan file yang berbagi penulis ditetapkan dalam kontrak/tugas, sedangkan prioritas operasi ditetapkan pada Issue.

## Keputusan yang menjadi dasar

- [0001: State platform, release dan katalog runtime](decisions/0001-personal-agentic-architecture-contract.md) mendasari CI-003 dan CAT-001.
- [0002: Maintenance host dan penggunaan resource](decisions/0002-host-hygiene-and-resource-governance.md) mendasari OPS-001.
- [0003: Paralelisme agen, ownership proses dan audit](decisions/0003-subagent-concurrency-and-process-guard.md) mendasari AGT-001.

Status keputusan dan alasan berada pada masing-masing ADR. Keputusan yang diterima tidak menyatakan change sudah diimplementasikan atau deployed.

## Rujukan review

- [Review awal 13 Oktober](evidence/ev-004-architecture-proposal-review.md): pemeriksaan draft, source dan pilihan pemilik.
- [Review lanjutan 14 Oktober](evidence/ev-006-current-contract-review.md): pemeriksaan source revisi dan reproduction kompatibilitas backup historis.

Setiap review berlaku pada identitas source yang dicatat di dalamnya. Angka host dan hasil test historis tidak diperlakukan sebagai pengukuran terbaru. Riwayat change lain ditautkan dari [indeks OpenSpec](../openspec/README.md).
