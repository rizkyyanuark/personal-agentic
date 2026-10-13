# Pengembangan personal-agentic dengan AI

Panduan ini mengatur pengembangan produk personal-agentic, dari kebutuhan pengguna sampai release. Kedalaman kontrak mengikuti dampak perubahan; GitLab Issues mengatur antrean, sedangkan kontrak teknis dan bukti tersanitasi disimpan bersama source.

## Rute baca

Baca [README](../README.md), [PRD](../PRD.md), [arsitektur](../ARCHITECTURE.md), [AGENTS](../AGENTS.md), lalu kontrak perubahan aktif yang ditautkan Issue. Gunakan [verification](../src/VERIFICATION.md) untuk pemeriksaan dan [runbook dev/prod](DEV-PROD-WORKFLOW.md) untuk release. [UPSTREAM](../src/UPSTREAM.md) mencatat provenance CCCC/Paperclip dan perbedaan adapter; sumber tersebut tidak dianggap mewajibkan workflow ini.

## Sumber kebenaran

| Informasi | Tempat utama |
| --- | --- |
| Tujuan dan kebutuhan produk | PRD; proposal perubahan untuk delta yang sedang dikerjakan |
| Kondisi kode dan batas modul | Kode/config serta ARCHITECTURE yang merujuk source |
| Prioritas, dependensi perubahan, dan fase pekerjaan | GitLab Issue |
| Scope, requirement/scenario, tugas dan penerimaan | Kontrak dalam `openspec/changes` |
| Bukti perintah dan user flow pada versi tertentu | Verification change dan artifact CI yang tersanitasi |
| Hasil CI, source yang dipublish, image dan release aktif | MR/pipeline, commit Git, registry digest, manifest deployment |

Indeks hanya berisi link; fase Issue tidak disalin ke banyak dokumen. Checklist tugas menyimpan penerimaan subtask, bukan status pipeline atau release. Bila kondisi kode bertentangan dengan tulisan, periksa bukti, lalu perbarui kontrak; jangan mengklaim target sebagai kemampuan yang sudah berjalan.

## Urutan dan gate

| Tahap | Bukti untuk lanjut |
| --- | --- |
| Inspect | Checkout, branch, SHA, dirty changes, user flow, source/config dan kondisi awal diketahui |
| Contract accepted | Scope/non-goal, skenario penerimaan, dependensi, minimum file set, risiko dan keputusan penting jelas |
| Implement | Perubahan tersambung ke entrypoint nyata, auth, persistence, runtime dan UI yang relevan |
| Local proof | Pemeriksaan sesuai risiko dan jalur produk nyata selesai; diff ditinjau; batas bukti terlihat |
| Commit/push/Draft MR | Source dan file baru masuk commit; secret/state tidak ikut; publikasi berada dalam kewenangan yang telah dipilih pemilik |
| CI/review | Pipeline commit terbaru lulus; reviewer menilai kontrak, perilaku dan bukti; revisi diverifikasi secara relevan |
| Merge | Maintainer menilai hasil review dan CI sebelum merge ke protected main |
| Main image + smoke | Image ARM64 dari SHA main dipublish; digest tercatat; smoke pada data terisolasi lulus |
| Automatic production deployment | Setelah merge ke protected main dan image smoke lulus, deploy berjalan otomatis; pekerjaan aktif menolak deploy, backup konsisten dan identitas release tetap diwajibkan |
| Production proof | Jalur produksi yang berubah terbukti; SHA/digest, hasil, backup dan keterbatasan tercatat |

Pengujian lokal, sukses CI, merge, dan deployment adalah hasil yang berbeda. Gate release hanya diterapkan ketika pekerjaan mencakup release. Kemampuan belum ditandai deployed sebelum identitas release dan bukti produksi tersedia.

Keputusan implementasi rutin dapat dijalankan dalam scope yang sudah diterima. Konfirmasi tambahan diperlukan ketika perubahan memperluas hasil produk, mengubah keputusan penting, atau melampaui kewenangan yang diberikan; persetujuan yang sudah ada tidak diminta ulang.

## Kontrak proporsional

Untuk koreksi copy/dokumen atau perubahan internal kecil tanpa perubahan perilaku/API/data/akses, Issue/MR cukup memuat masalah, scope, file, risiko dan verifikasi relevan. Tidak wajib membuat paket change baru.

Untuk perubahan data/schema, auth/akses, API, session/run, path/artifact, harness/runtime, CI/deploy, atau UI flow yang memutasi state, gunakan [template change](../openspec/templates/change.md). Pisahkan proposal, design, tasks dan verification ketika ukuran perubahan membutuhkan itu. Requirement mempunyai ID serta scenario; tugas mengacu requirement dan dependensi, bukan hanya daftar file.

Skenario mencakup happy path, failure, boundary, auth, persistence/state transition dan regresi yang relevan. Tests mendukung implementasi, dan bukti jalur produk nyata mengikuti AGENTS. Tidak menambah suite mahal tanpa kaitan dengan risiko perubahan.

## Memilih pekerjaan berikutnya

Koordinator memilih Issue berdasarkan prioritas dan predecessor yang sudah diterima. Satu worktree mempunyai satu change implementasi aktif; subtask independen dalam change tersebut boleh paralel dengan file owner yang jelas. Sebelum berpindah change, catat hasil, bukti dan handoff. Jika terblokir, tulis dependency atau keputusan yang kurang dan alasan mengambil pekerjaan lain; jangan memperluas scope diam-diam.

Inspeksi atau penyusunan kontrak pekerjaan berikut boleh berjalan saat verifikasi berlangsung, selama tidak mengubah source atau acceptance change aktif. Perubahan yang ditemukan oleh review diselesaikan dan diverifikasi sebelum publikasi dinyatakan siap.

## Koordinasi dan handoff agen

Satu koordinator menjaga kontrak dan urutan. Implementer memperoleh scope/file yang jelas; reviewer memeriksa diff dan asumsi secara independen; verifier menilai output dari jalur nyata. Delegasi digunakan untuk pekerjaan yang dapat dipisah. Peran tidak harus menjadi empat agen yang selalu berjalan bersamaan.

Satu file mempunyai satu penulis aktif. Perubahan paralel pada source yang sama diurutkan atau dikerjakan dalam worktree terpisah dengan integrasi eksplisit. Dirty changes dipertahankan sebelum sinkronisasi, pergantian branch atau release.

Handoff memuat Issue/change ID; requirement/scope/non-goal; path checkout, branch dan SHA dasar; dirty changes; file yang boleh diubah; dependensi; entrypoint produk; acceptance dan environment uji; keputusan yang berlaku; batas publikasi/release; hasil, bukti, blocker serta next action.

`Passed` berarti pemeriksaan relevan dijalankan dan output diperiksa; `Inspected` hanya membaca source/config; `Not run` menyebut alasan; `Inferred` menyatakan kesimpulan tidak langsung. Blocker mencatat dependency/keputusan yang hilang, bukti, upaya dan tindakan minimum. Tidak mengganti blocker dengan mock sukses.

## Penutupan dan release

Setelah penerimaan, perbarui capability spec sesuai kontrak yang telah dibuktikan dan arsipkan change. Catat terpisah jika merge atau produksi masih pending. Jangan mengubah sejarah seolah spesifikasi ditulis sebelum implementasi yang sudah ada.

Gunakan runbook yang ada untuk stopped-state backup, image digest, quiet window, smoke dan rollback. Rollback image tidak memulihkan data/skema; kompatibilitas dan restore memerlukan bukti tersendiri. Jangan menghapus volume produksi. Kapasitas runner dan runtime yang berbagi host perlu dinilai dari beban nyata; resource group satu project bukan anggaran host lintas project.

Rujukan operasi: [GitLab MR pipelines](https://docs.gitlab.com/ci/pipelines/merge_request_pipelines/) dan [deployment safety](https://docs.gitlab.com/ci/environments/deployment_safety/). Konfigurasi project dan `.gitlab-ci.yml` menentukan gate yang benar-benar diterapkan.
