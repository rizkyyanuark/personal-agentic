# Keputusan arsitektur (ADR)

ADR mencatat keputusan penting, alasan pemilihannya, alternatif, dan konsekuensi. Dokumen ini menjaga konteks saat implementasi atau kebutuhan berubah.

| Informasi | Tempat utama |
| --- | --- |
| Keputusan dan alasan | ADR dalam direktori ini |
| Scope perubahan, requirement, skenario penerimaan, desain, dan tugas | Kontrak dalam [openspec/changes](../../openspec/changes/) |
| Prioritas, penanggung jawab, dependensi, dan fase pekerjaan aktual | GitLab Issue yang menautkan kontrak |
| Hasil pemeriksaan pada source atau runtime tertentu | Verification change dan [docs/evidence](../evidence/) |
| Commit, hasil CI, merge, dan release aktif | MR/pipeline serta evidence dan manifest release |

Satu ADR dapat menjadi dasar beberapa change. Satu change dapat merujuk beberapa ADR. Perubahan kecil tanpa keputusan arsitektur baru cukup memakai kontrak Issue/MR sesuai [development guide](../development.md).

## Status keputusan

| Status | Arti |
| --- | --- |
| `Proposed` | Pilihan dan konsekuensinya masih dibahas; belum menjadi arah yang disepakati. |
| `Accepted` | Pemilik menerima keputusan desain. Persetujuan ini tidak membuktikan implementasi, pengujian, CI, merge, atau deployment. |
| `Superseded` | Keputusan digantikan ADR lain; cantumkan tautan pengganti dan pertahankan alasan historis. |
| `Deprecated` | Keputusan tidak lagi berlaku, tanpa keputusan pengganti; catat alasan dan konteksnya. |

Status ADR berbeda dari fase pekerjaan pada Issue dan hasil `Passed`, `Failed`, `Inspected`, `Not run`, atau `Inferred` pada verification/evidence. Misalnya, keputusan backup dapat `Accepted` sementara implementasi recovery masih gagal dalam pengujian.

## Cara menulis dan memperbarui

Gunakan bagian singkat: tanggal dan status, konteks, keputusan, alternatif beserta alasan, konsekuensi, dan rujukan. Catat siapa yang menerima keputusan dan dasar persetujuannya. Tautkan source atau evidence yang mendukung konteks, serta change yang menerapkannya.

Simpan requirement dan acceptance terperinci dalam change; simpan checklist implementasi dalam tasks; simpan perintah, hasil, identitas source/runtime, serta keterbatasan proof dalam verification/evidence. ADR merujuk dokumen tersebut tanpa menyalin checklist, fase Issue, atau status pipeline. Inspeksi source harus dinyatakan sebagai inspeksi, bukan keberhasilan runtime.

Jika keputusan berubah secara substantif, tulis ADR pengganti dan tandai ADR lama `Superseded`. Koreksi penulisan dan tautan dapat diperbarui pada ADR yang sama. Perubahan implementasi yang masih mengikuti keputusan cukup memperbarui kontrak dan evidence terkait.

## Keputusan yang dicatat

- [0001: State platform, release, dan katalog runtime](0001-personal-agentic-architecture-contract.md).
- [0002: Maintenance host dan penggunaan resource](0002-host-hygiene-and-resource-governance.md).
- [0003: Paralelisme agen, ownership proses, dan audit](0003-subagent-concurrency-and-process-guard.md).
