# Panduan kontribusi personal-agentic

GitLab adalah sumber utama repository; GitHub merupakan mirror downstream.
Panduan ini berlaku untuk pengembang dan agen AI. Instruksi pemilik pada tugas
aktif menentukan tindakan yang diizinkan.

## Mulai dari sini

- [Development](docs/development.md): scope, branch, implementasi, tes, review,
  publikasi dan penutupan.
- [Deployment](docs/deployment.md): izin rilis, pipeline main, bukti dan pemulihan.
- [AGENTS.md](AGENTS.md): kewenangan agen dan kontrak pelaporan bukti.
- [Verifikasi aplikasi](src/VERIFICATION.md): perintah dan prasyarat per fitur.

Alur normal: issue → explore → proposal bila diperlukan → branch → implementasi
→ tes lokal → review → izin publikasi → commit/push/MR Ready → CI dan review
→ izin merge → deploy otomatis → verifikasi produksi → penutupan.

## Branch dan commit

Buat branch sebelum implementasi dari GitLab main terbaru. Gunakan
`<type>/<slug>` dalam huruf kecil dan kebab-case, misalnya
`fix/group-search-query-and-empty-states`. Nomor issue tidak wajib; jangan
menambahkan prefix nama agen. Tipe yang dipakai: `feat`, `fix`, `chore`,
`refactor` atau `docs`.

Periksa remote sebelum fetch/push. Folder yang sama boleh dipakai jika aman;
worktree terpisah membantu saat ada pekerjaan lain atau aplikasi aktif. Jangan
reset, clean atau menyimpan ulang pekerjaan orang lain diam-diam.

Commit memakai `<type>(<scope>): <tindakan>` atau `<type>: <tindakan>`, misalnya
`fix(search): normalize queries before validation`. Jumlah commit mengikuti isi
perubahan, tidak wajib satu atau tiga. Stage daftar file yang direview; jangan
sertakan kredensial, state, hasil build atau perubahan tugas lain.

## Merge request

Target normal adalah main. Judul mengikuti pola commit dan menjelaskan perubahan,
misalnya `fix(search): normalize queries and clarify empty states`. Tautkan issue
di deskripsi; gunakan `Closes #N` bila merge menyelesaikannya.

Gunakan seluruh bagian [template MR](.gitlab/merge_request_templates/Default.md),
termasuk dampak produksi dan rollback. Jika CLI/API menerima deskripsi eksplisit,
baca dan isi template sendiri; jangan menganggap GitLab menyisipkannya otomatis.
Tulis bukti aktual, kegagalan awal dan batas uji.

MR langsung Ready setelah implementasi, tes lokal dan review diff selesai.
Draft untuk pekerjaan/keputusan yang belum selesai atau permintaan eksplisit.
CI boleh masih berjalan saat Ready; merge tetap menunggu pipeline terbaru lulus
dan review selesai. Agen memantau CI setelah publikasi diizinkan, kecuali diminta
berhenti. Auto-merge tetap nonaktif tanpa izin.

Merge membutuhkan izin pemilik yang terpisah dari publikasi. Gunakan **Squash
commits** dan **Delete source branch**. Dengan CI saat ini, merge ke protected
main mengizinkan rangkaian deploy otomatis; baca runbook sebelum merge.

## Pengaturan GitLab yang harus selaras

Maintainer memeriksa pengaturan saat pekerjaan tata kelola diizinkan:

- Protected main: tanpa direct push; perubahan masuk melalui MR.
- Pipeline sukses wajib sebelum merge.
- Squash wajib sebagai kebijakan kontribusi. Pilih Require pada project bila
  pengaturan itu disetujui; jika belum ditegakkan otomatis, periksa opsi MR.
- Hapus source branch setelah merge. Branch lokal hanya dihapus setelah seluruh
  pekerjaan dan referensinya aman.
- Mirror GitHub hanya protected branches. Push langsung ke GitHub bukan langkah
  publikasi biasa.

Ini kebijakan yang harus diverifikasi, bukan klaim semua opsi sudah ditegakkan
server. Mengedit panduan tidak mengubah pengaturan GitLab.

## Kontrak dan bukti

Issue/MR menyimpan scope, acceptance criteria, keputusan dan ringkasan bukti yang
dapat dibaca agen lain. OpenSpec tetap lokal: jangan force-add direktori ignored
atau menghapus kontrak tracked tanpa izin. Raw log, screenshot, model dan state
fixture tetap ignored; sertakan ringkasan cukup untuk review tanpa kredensial.
