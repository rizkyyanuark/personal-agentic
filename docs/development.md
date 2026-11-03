# Development: dari issue sampai rilis

Panduan ini adalah rujukan proses lintas agen dan chat. Aturan Git/MR ada di
[CONTRIBUTING](../CONTRIBUTING.md), bukti aplikasi di
[VERIFICATION](../src/VERIFICATION.md), dan operasi rilis di
[deployment](deployment.md). Alur ini tidak memerlukan branch develop permanen
atau server staging tambahan.

## Scope dan kontrak

Mulai dari issue berisi masalah, hasil yang diinginkan, acceptance criteria,
batas scope dan risiko. Audit source dan alur nyata sebelum menetapkan solusi.
Explore dipakai untuk menguji asumsi dan mengklarifikasi kebutuhan.

Perubahan perilaku, API, data, akses, runtime atau deployment memerlukan kontrak
yang disetujui: gunakan OpenSpec lokal untuk proposal, design, delta specs dan
tasks. Koreksi kecil tanpa perubahan kontrak cukup memakai scope dan checklist
MR. Jangan membuat seluruh artefak hanya untuk koreksi ejaan.

Ringkas kontrak yang disetujui dalam issue/MR agar agen lain dapat melanjutkan
tanpa chat privat. OpenSpec lokal bukan satu-satunya informasi review. Jika
kontrak lokal tidak tersedia, gunakan ringkasan bersama yang lengkap atau minta
kebutuhan yang kurang sebelum coding. Jangan unggah OpenSpec otomatis atau
menghapus riwayat tracked sebagai housekeeping.

## Batas kewenangan

| Tahap | Agen boleh melanjutkan | Persetujuan yang diperlukan |
| --- | --- | --- |
| Audit/perencanaan | Membaca source/state relevan, menyusun scope/rencana | Implementasi menunggu scope/rencana disetujui |
| Implementasi lokal | Branch, coding, tes relevan, review dan pembersihan dalam scope | Perubahan scope, tindakan destruktif atau infrastruktur di luar izin |
| Publikasi | Menyiapkan diff dan rencana commit konkret | Izin commit/push/MR sebagai satu tahap; izin parsial tetap parsial |
| Setelah publikasi diizinkan | Pantau CI sampai selesai; perbaiki, commit dan push koreksi dalam scope | Scope tambahan atau tindakan di luar izin |
| Merge | Menyajikan bukti akhir dan kesiapan rilis | Izin eksplisit pemilik; sekaligus izin deploy otomatis setelah pemeriksaan main |
| Setelah merge diizinkan | Pantau main dan smoke non-destruktif sesuai scope | Task agen, provider berbayar, uji data-changing atau pemulihan di luar izin |

Instruksi aktif seperti "jangan commit", "jangan akses produksi" atau "berhenti
memantau" membatasi kewenangan di atas. Jangan mewariskan larangan atau izin dari
chat lama tanpa dasar yang berlaku. Panduan tidak melewati batas sandbox, izin
tool atau kebutuhan autentikasi.

## Siapkan checkout sebelum coding

1. Baca tugas, [README](../README.md), [PRD](../PRD.md),
   [arsitektur](../ARCHITECTURE.md), [AGENTS](../AGENTS.md), kontrak dan konfigurasi
   terdampak. Cari instruksi direktori yang relevan.
2. Catat checkout, branch, HEAD, remote, status dirty dan worktree. Bedakan GitLab
   canonical dari mirror/upstream. Jangan menganggap remote selalu origin atau
   local main sudah terbaru.
3. Fetch main GitLab, lalu buat branch pekerjaan dari revisi tersebut. Checkout
   bersih boleh memakai folder yang sama. Jika dirty/dipakai proses aktif, pilih
   worktree terpisah dan transfer hanya diff relevan. Jangan reset/clean atau
   stash seluruh pekerjaan tanpa dasar otorisasi.
4. Tentukan file minimum dan jalur UI/API/CLI yang berubah. Pertahankan routing,
   auth, persistence dan ownership request yang ada.

## Implementasi dan verifikasi lokal

Implementasikan perilaku pada jalur aplikasi sebenarnya. Tes mendukung
implementasi. Gunakan fixture disposable terpisah dari state kerja/produksi;
simpan bukti pada lokasi ignored seperti .state/ atau scratch/. Task agen dan
provider nyata hanya dipanggil jika termasuk izin pengujian. Laporkan prasyarat
yang tidak tersedia; jangan mengklaim fake sebagai bukti end-to-end.

Pilih pemeriksaan sesuai dampak: happy/failure path, batas input, auth, kontrak
UI/API, persistence/state dan regresi relevan. Untuk kode, gunakan jalur nyata
atau integrasi tertinggi yang memungkinkan. Catat mocks beserta alasannya.
Screenshot atau checkbox tasks sendiri tidak membuktikan integrasi.

Perintah dasar dari src: `cargo fmt --all --check`,
`cargo test --workspace --locked`, `npm run lint --workspace frontend` dan
`npm run build --workspace frontend`. Gunakan skenario/prasyarat pada panduan
verifikasi; perubahan cockpit juga mengikuti pemeriksaan workspace cockpit.
Pisahkan bundle dan state tes dari aplikasi pengguna yang sedang berjalan.
Sesudah edit terakhir, ulang pemeriksaan yang terdampak.

Untuk dokumentasi saja, periksa diff, tautan, perintah dan kesesuaian source.
Tidak perlu menyalakan aplikasi/provider untuk membuktikan perubahan teks.
Namun CI saat ini tidak mengecualikan docs-only: merge tetap dapat memicu build,
image smoke dan deploy otomatis. Jangan melewati atau mengubah pipeline sebagai
bagian pemeriksaan dokumentasi. Jangan menyebut pemeriksaan statis sebagai bukti
perilaku produksi.

## Review dan publikasi

Cocokkan diff dengan scope/acceptance criteria. Hilangkan debug, temporary dan
dead code dalam perubahan; jangan merapikan tugas lain diam-diam. Pastikan daftar
commit tidak memuat credential, state privat, cache dependency atau build output.
Siapkan ringkasan dan pembagian commit, lalu minta izin publikasi atas hasil itu.

Setelah diizinkan, commit file eksplisit, push ke GitLab dan buat MR ke main
sesuai template. Gunakan Ready setelah review lokal selesai; Draft hanya untuk
pekerjaan belum selesai atau instruksi pemilik. Tidak wajib satu push final:
koreksi CI dapat membutuhkan push berikutnya.

Pantau pipeline SHA terbaru sampai terminal. Jika gagal, baca log, bedakan bug
dari prasyarat/infrastruktur, perbaiki dalam scope dan ulang pemeriksaan relevan.
Jangan melemahkan assertion, menghapus tes atau menyembunyikan gagal awal.
Jangan retry tanpa batas. Bila perlu izin/perubahan eksternal, laporkan blocker
dan tindakan minimum. Instruksi berhenti dan batas tool tetap berlaku. Pipeline
hijau SHA lama tidak membuktikan revisi terakhir lulus.

## Merge, rilis dan penutupan

Sebelum meminta izin merge: pipeline terbaru sukses, review selesai, konflik
terselesaikan, dampak/rollback tercatat, squash dan hapus source branch dipilih.
Ready atau CI hijau bukan izin merge. Jangan aktifkan auto-merge tanpa izin.

Izin merge mencakup deploy otomatis pada protected main. Jika diminta merge
tetapi dilarang deploy, jangan merge; jelaskan konflik dan minta keputusan.
Ikuti [runbook](deployment.md) sampai bukti produksi tersedia. Bedakan status
implemented, CI passed, merged, deployed dan verified. Deployment gagal bukan
rilis selesai.

Koreksi source setelah merge memakai branch/MR baru dari main terbaru, dengan
scope dan izin publikasi/merge yang sesuai. Jangan direct push ke main atau
menganggap izin publikasi MR yang sudah merged berlaku untuk pekerjaan baru.

Setelah produksi diterima, catat SHA, pipeline/deployment, hasil smoke dan batas
bukti pada issue/MR. Jika memakai OpenSpec, sync living specs dan archive lokal
setelah kontrak terpenuhi. Raw evidence tetap ignored; ringkasannya dibaca
bersama. GitLab dapat menutup issue lewat Closes #N saat merge, tetapi itu bukan
bukti deploy sukses. Catat kegagalan/tindak lanjut rilis secara eksplisit.
Hapus branch lokal hanya jika seluruh pekerjaan aman dan tidak dipakai
worktree/proses lain.
