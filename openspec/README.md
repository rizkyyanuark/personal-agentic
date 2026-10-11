# Kontrak perubahan personal-agentic

Gunakan [PRD](../PRD.md) untuk kebutuhan produk, [arsitektur](../ARCHITECTURE.md) untuk kondisi source, [development](../docs/development.md) untuk urutan kerja, serta [AGENTS](../AGENTS.md) untuk aturan agen dan proof contract.

Pola ini menggunakan Markdown dan tidak membutuhkan toolkit OpenSpec. GitLab Issues menyimpan antrean, dependensi dan fase pekerjaan; indeks ini hanya menautkan kontrak, tanpa menyalin status Issue/pipeline.

## Pekerjaan terkait

- [Issue 2: kontrak development](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/2).
- [Issue 1: artefak run Antigravity](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/1).

Kedua Issue menyimpan fase dan tindak lanjut aktual; link tidak menyatakan implementasi atau release telah selesai.

## Memulai perubahan

Untuk perubahan berisiko, salin [template change](templates/change.md) ke `changes/<id>-<slug>/proposal.md` dan tautkan dari Issue serta MR. Pisahkan design, tasks dan verification jika ukuran perubahan memerlukannya. Perubahan kecil dapat memakai kontrak singkat di Issue/MR sesuai development guide.

Requirement memiliki ID dan scenario; tasks menyebut dependency serta bukti penerimaan. Tandai hasil `Passed`, `Inspected`, `Not run` atau `Inferred` dengan scope yang jelas. Persetujuan kontrak tidak berarti implementasi, CI atau produksi selesai.

## Capability dan arsip

Kontrak baru tetap dalam change sampai penerimaan terbukti. Setelah implementasi dan acceptance, perbarui capability spec dalam `specs` sesuai perilaku yang telah dibuktikan, lalu arsipkan change dengan tanggal dan slug. Merge/deployment yang masih pending tetap tercatat pada Issue/MR dan release evidence.

Tidak ada capability spec baru yang dinyatakan verified hanya karena struktur dokumentasi ini dibuat. Perubahan yang sudah diimplementasikan sebelum dokumen ini menggunakan bukti aktual dan menyatakan sejarahnya secara jujur.
