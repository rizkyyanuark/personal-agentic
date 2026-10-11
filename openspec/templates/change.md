# Template kontrak perubahan

Salin ke folder change. Isi bagian yang relevan; hapus petunjuk setelah diisi. File ini adalah template, bukan change accepted atau proof implementasi.

## Identitas dan kondisi awal

Catat change ID, tautan GitLab Issue, pemilik scope, tanggal, checkout/worktree, branch dan SHA dasar. Fase pekerjaan utama berada di Issue. Jelaskan dirty changes yang harus dipertahankan, user flow yang bermasalah, source/config yang diperiksa, serta batas proof kondisi awal.

## Masalah, hasil dan scope

Tuliskan hasil pengguna yang diminta, scope dan non-goal, dependency perubahan lain, minimum file set, serta keputusan pemilik yang sudah berlaku. Keputusan terbuka menjadi blocker eksplisit. Cantumkan batas publikasi/release yang sudah diotorisasi.

## Requirement dan scenario

Berikan ID requirement yang stabil. Untuk setiap requirement, tulis perilaku dan scenario GIVEN/WHEN/THEN atau bentuk lain dengan input, tindakan dan output yang dapat diperiksa. Sertakan happy path, failure, auth, boundary dan persistence/state transition yang relevan; hubungkan regresi dengan masalah awal.

## Desain dan risiko

Jelaskan entrypoint UI/API/CLI/job, boundary modul, schema/state/session/permission yang berubah, dependency nyata, alternatif yang diperiksa dan alasan keputusan. Jika ada migrasi, jelaskan compatibility, backup/restore dan rollback. Rujuk source upstream yang benar-benar dibaca; bedakan preseden dari rancangan spesifik aplikasi.

## Tasks dan dependensi

Setiap tugas mempunyai ID, requirement yang ditangani, predecessor, penanggung jawab/file owner, hasil yang konkret, dan bukti penerimaan. Tasks yang berbagi file diurutkan atau diintegrasikan melalui worktree terpisah. Checklist baru selesai setelah proof relevan tersedia; blocker menyebut dependency, bukti, upaya dan tindakan minimum.

## Verifikasi dan bukti

Catat environment/OS/transport, commit atau working-tree identity yang diuji, dependency/config nonsecret, fixture/data uji terisolasi, perintah atau user flow, hasil dan lokasi bukti tersanitasi. Jelaskan mocks serta alasannya bila ada. Jangan menyimpan credentials, database privat, owner key, native session atau backup dalam Git.

| Pemeriksaan | Requirement/scenario | Environment dan versi | Hasil | Bukti dan batas |
| --- | --- | --- | --- | --- |

Gunakan `Passed`, `Inspected`, `Not run` atau `Inferred`; hasil lokal tidak otomatis menjadi hasil CI atau proof produksi. Test skip atau mock sukses tidak menggantikan acceptance yang diwajibkan. Verifikasi setelah edit terakhir sesuai risiko; jangan mengulang pemeriksaan mahal tanpa perubahan atau concern baru.

## Publikasi dan release

Tautkan commit/MR dan pipeline commit terbaru jika sudah ada. Catat merge, image SHA/digest, smoke, manual production gate, backup/rollback dan production proof yang benar-benar dijalankan; nyatakan pending untuk tahap yang belum dilakukan. Untuk pekerjaan tanpa release, jelaskan batas deliverable.

## Penutupan dan handoff

Catat requirement yang diterima/masih terbuka, file berubah, bukti, risiko dan next action. Perbarui capability spec hanya berdasarkan perilaku yang dibuktikan. Handoff menyebut path/branch/SHA, scope, keputusan, file owner, dependency, entrypoint, acceptance, environment uji dan batas kewenangan.
