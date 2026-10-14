# Kontrak perubahan personal-agentic

Gunakan [PRD](../PRD.md) untuk kebutuhan produk, [arsitektur](../ARCHITECTURE.md) untuk kondisi source, [development](../docs/development.md) untuk urutan kerja, [testing](../docs/testing-guide.md) untuk panduan pengujian & laporan MR, [deployment](../docs/deployment.md) untuk rilis produksi, serta [AGENTS](../AGENTS.md) untuk aturan agen dan proof contract.

Pola ini menggunakan Markdown dan tidak membutuhkan toolkit OpenSpec. GitLab Issues menyimpan antrean, dependensi dan fase pekerjaan; indeks ini hanya menautkan kontrak, tanpa menyalin status Issue/pipeline.

Folder change adalah kontrak perubahan, bukan pengganti GitLab Issue. [ADR](../docs/decisions/README.md) menyimpan keputusan dan alasannya; change menyimpan scope, requirement, desain, tasks dan acceptance; [evidence](../docs/evidence/README.md) menyimpan bukti bertanggal. Gunakan tautan silang agar alasan, pekerjaan dan hasil tidak disalin ke beberapa tempat.

## Pekerjaan terkait

- [ARF-001: artefak run Antigravity](changes/ARF-001-antigravity-run-artifacts/proposal.md), [Issue 1](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/1).
- [CAT-001: katalog model sesuai runtime](changes/CAT-001-runtime-model-catalog/proposal.md), [Issue 6](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/6).
- [CI-003: CI sederhana dan deployment otomatis](changes/CI-003-simple-automatic-releases/proposal.md), [Issue 5](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/5).
- [DEP-001: deployment readiness dan recovery](changes/DEP-001-deployment-readiness-recovery/proposal.md), [Issue 3](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/3).
- [DEP-002: deployment drain](changes/DEP-002-deployment-drain/proposal.md), [Issue 4](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/4).
- [OPS-001: maintenance host dan resource governance](changes/OPS-001-host-hygiene-and-resource-governance/proposal.md), [Issue 7](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/7).
- [AGT-001: audit konkurensi subagent dan ownership proses](changes/AGT-001-subagent-concurrency-and-process-guard/proposal.md), [Issue 8](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/8).
- [Issue 2: kontrak development](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/2).

Issue menyimpan fase dan tindak lanjut aktual; link tidak menyatakan implementasi atau release telah selesai.

DEP-002 dipertahankan sebagai kontrak historis. CI-003 menggantikan perilaku drain DEP-002 pada kontrak/source; bukti DEP-002 tetap berlaku untuk revisi yang dicatat. Keberadaan keduanya tidak mewajibkan penerapan bersamaan dan tidak menetapkan versi yang sedang deployed.

## Memulai perubahan

Untuk perubahan berisiko, salin [template change](templates/change.md) ke `changes/<id>-<slug>/proposal.md` dan tautkan dari Issue serta MR. Pisahkan design, tasks dan verification jika ukuran perubahan memerlukannya. Perubahan kecil dapat memakai kontrak singkat di Issue/MR sesuai development guide.

Tautkan ADR yang berlaku jika perubahan mengikuti keputusan penting yang berumur panjang atau memengaruhi beberapa capability. ADR bersifat opsional; tidak perlu membuat ADR baru untuk setiap change atau menyalin requirement/tasks ke dalam ADR.

Requirement memiliki ID dan scenario; tasks menyebut dependency serta bukti penerimaan. Tandai hasil `Passed`, `Inspected`, `Not run` atau `Inferred` dengan scope yang jelas. ADR `Accepted`, kontrak accepted, implementasi verified dan deployment adalah hasil berbeda; persetujuan keputusan atau kontrak tidak menggantikan bukti implementasi, CI atau produksi.

## Capability dan arsip

Kontrak baru tetap dalam change sampai penerimaan terbukti. Setelah implementasi dan acceptance, perbarui capability spec dalam `specs` sesuai perilaku yang telah dibuktikan, lalu arsipkan change dengan tanggal dan slug. Merge/deployment yang masih pending tetap tercatat pada Issue/MR dan release evidence.

Tidak ada capability spec baru yang dinyatakan verified hanya karena struktur dokumentasi ini dibuat. Perubahan yang sudah diimplementasikan sebelum dokumen ini menggunakan bukti aktual dan menyatakan sejarahnya secara jujur.
