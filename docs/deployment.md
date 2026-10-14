# Deployment personal-agentic

GitLab adalah sumber release; GitHub adalah mirror. Setup lokal dan worker ada
di [src/DEPLOYMENT](../src/DEPLOYMENT.md), sedangkan pemeriksaan aplikasi ada di
[VERIFICATION](../src/VERIFICATION.md). Instalasi produksi tetap berada di
`/opt/personal-agentic`.

## Alur release

1. Branch `codex/*` menjalankan verifikasi melalui MR. Maintainer meninjau diff,
   kontrak dan bukti sebelum merge ke protected `main`.
2. Pipeline main memverifikasi source, mempublish image Linux ARM64 dengan SHA
   penuh, lalu menjalankan smoke pada image dan state terisolasi.
3. Deploy client memastikan SHA masih main terbaru, lalu mengirim digest, SHA
   dan hash SVG ke akun SSH terbatas. Deploy otomatis berjalan sesudah merge.
4. Helper memegang `release.lock`, memeriksa identitas release dan pekerjaan
   aktif, mempersiapkan image, serta memeriksa source dan kapasitas backup sebelum
   menghentikan service.
5. Platform dan Matrix berhenti selama backup. Setelah backup, helper
   mengaktifkan image dan memeriksa health, login, state, cockpit, aset, UI dan
   revocation setelah logout. Jurnal `current/previous/pending` menyimpan hasil.

Stop/backup/restart mempunyai jeda layanan. Drain sengaja dihapus; pekerjaan
yang masuk antara busy check dan stop masih dapat terinterupsi. Gunakan waktu
sepi. Busy work atau main usang menolak release secara terlihat; retry setelah
selesai atau gunakan pipeline terbaru. Resource group dan lock menserialisasi
release, bukan pekerjaan semua proyek pada host.

[Compose](../infra/production/compose.yaml) membatasi masing-masing service ke
0,5 CPU, RAM 512 MiB dan RAM+swap 1 GiB. Reverse proxy dikelola terpisah. Runner
personal-agentic memakai satu manager concurrency satu; manager proyek lain
tetap dapat beroperasi bersamaan.

## State dan backup

Backup mencakup seluruh volume platform-data (identity/workspace SQLite,
attachment, session dan konfigurasi), matrix-data (database, media dan homeserver
config), platform-workdir internal, home controller, production.env, Compose dan
runtime key terpilih. Source proyek pada workstation eksternal mengikuti backup
proyeknya sendiri; provider authentication di runtime eksternal bukan state
controller. Jangan mount seluruh direktori kredensial `.codex` host untuk katalog.

Format 2 memuat tiga arsip volume serta `platform-home.tar`; private config/key
dan setiap arsip mempunyai hash. Home disalin dari container yang sudah berhenti
melalui Docker cp, sehingga konfigurasi di writable layer juga tercakup.
Validator tetap menerima format legacy empat arsip yang berisi tiga volume dan
`runtime-workdirs.tar.gz` dari path legacy tetap. Format lain, tambahan arsip,
symlink, permission terlalu luas, perubahan hash atau schema/journal tidak sesuai
ditolak. Backup/journal lama tetap disimpan; maintenance tidak menghapusnya.

Recover memverifikasi backup dan journal existing; operasi ini tidak membuat
backup baru atau memerlukan kapasitas untuk salinan state tambahan. Kapasitas
backup baru diperiksa sebelum stop dan sekali lagi dalam stopped state. Sediakan
logical file size ditambah cadangan 512 MiB, bukan ukuran gzip sebelumnya.
Ukuran home diukur sebelum stop; perubahan sesudah pengukuran tetap dapat membuat
backup gagal, sehingga kegagalan dan restart source ditangani secara eksplisit.

## Kegagalan dan recovery

CI menampilkan kategori, tahap dan reference yang tersanitasi. Catatan privat
`releases/release-<id>.json` berizin root 0600 menyimpan detail operasi/exit serta
maksimal 16 KiB stderr per kegagalan command. Detail tersebut dapat berisi
konfigurasi privat; jangan menyalinnya ke issue atau CI log. Kegagalan pemulihan
sekunder juga dicatat. Reference tidak memberikan akses file.

Kegagalan sebelum image diganti hanya memulai ulang source jika image, schema,
jurnal dan state tetap sama serta source sebelumnya verified. Kandidat yang
gagal mempertahankan pending record dan backup. Tidak ada automatic DB restore.

Status nyata, termasuk smoke login/logout:

```sh
printf '%s\n' '{"action":"status"}' | sudo python3 -I /usr/local/sbin/personal-agentic-release
```

Recover memverifikasi kandidat yang sudah berjalan dan journal/backup sesuai
digest, SHA dan SVG, lalu menyelesaikan journal. Tidak ada restart service atau
restore DB pada recover. Rollback memerlukan previous verified, schema kompatibel
dan `acknowledge_database_risk: true`. Rollback image tidak membalikkan migrasi
atau mutasi data. Jangan gunakan `docker compose down -v`.

Restore state adalah operasi administrator terpisah setelah validasi backup.
Selain volume dan private config/key, pulihkan home controller dari arsipnya
sebelum memakai konfigurasi atau session controller tersebut. Writable home belum
menjadi volume persistent; backup menyimpan salinannya untuk pemulihan manual.

Saat mengganti helper, simpan source lama secara privat, tahan release lock,
pasang source baru atomik root:root 0755, cocokkan hash, lalu jalankan status dan
catat identitas image/journal serta restart count sebelum/sesudah. Pemasangan
helper berbeda dari deployment image aplikasi.

## Snapshot release

Main `ec70e3287682fdc3c6a86df03054a38fe6e92817` telah aktif melalui pipeline
[#61](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/pipelines/61),
deploy job 261 verified pada 13 Oktober 2026. Inventaris 14 Oktober menemukan
digest `sha256:84cae56460603822e5eee645c634fcc64f7c125ca108b6259f5f800aa2c4cf9e`,
dua service running, OOM false dan restart count nol. Ini snapshot;
[verification CI-003](../openspec/changes/archive/2026-10-14-CI-003-simple-automatic-releases/verification.md)
mencatat bukti follow-up secara terpisah.
