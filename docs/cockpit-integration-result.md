# Hasil integrasi kantor 3D

Perubahan terbaru mengembalikan desain virtual-kantor asli dan mempertahankan
header Live Preview.
Bagian compact di bawah merupakan bukti tahap sebelumnya.

Tanggal: 6 Oktober 2026. Preview aktif:
[Organization → Live Preview](http://localhost:18766/organization/live-preview).

## Perilaku produk

Organization membuka kantor 3D sebagai overlay hampir layar penuh, dengan margin,
bayangan, dan Organization yang tetap terlihat redup di belakang. Login, workspace
aktif, filter Groups/Projects, dan pengaturan profil memakai alur aplikasi.
Klik kartu mengarahkan kamera ke meja; klik karakter/tag mengikuti karakter.
Klik kartu lagi, double-click scene, dan Escape dari cockpit mengembalikan kamera
atau menutup panel mobile sesuai perilaku asli. Escape dari toolbar, tombol X,
dan klik latar menutup overlay serta mengembalikan fokus ke tombol Live Preview.
Konfigurasi profil hanya dibuka melalui kontrol pengaturan di toolbar integrasi.
Live Preview memakai toolbar satu baris dengan ikon Refresh berputar, pengaturan,
dan tutup. Deskripsi workspace tetap tersedia untuk screen reader. Density ringkas
hanya berlaku pada `presentation: 'preview'`; layout standalone tidak berubah.
Kartu ponsel berjarak dari panel bawah, sedangkan landscape pendek memakai panel
kanan agar isi riwayat tetap terbaca. Kamera, gestur, dan handler panel asli tetap
dipakai. Browser Back juga dilindungi dari efek normalisasi URL milik render lama.
Scene mengambil projection Rust setiap dua detik saat tab terlihat; koneksi
putus, sesi berakhir, dan status yang belum diketahui ditampilkan secara eksplisit.

Lima slot dipetakan dengan ID profile melalui metadata workspace. Setup eksplisit
membuat Orion, Nova, Atlas, Lyra, dan Axiom tanpa memulai run. Orion melapor ke
Workspace Owner; empat spesialis melapor ke Orion. Nama, jabatan, deskripsi peran,
dan warna awal mengikuti cockpit. Profil existing tetap ada dan dapat dipilih
melalui form mapping. Remapping menjaga profil serta reporting line existing.

Pada preview default sekarang terdapat tujuh agent: dua existing dan lima baru.
Dua run existing tetap tersimpan. Kelima profil baru belum aktif dan belum memiliki
runtime/workdir/model; pilih pengaturan di Organization sebelum menjalankan tugas.
Auto arrange existing digunakan sekali agar kartu baru tidak bertumpuk dengan
layout yang sebelumnya tersimpan.

## Codebase dan build

Source perubahan berada di worktree
`C:\Users\rizky\.codex\worktrees\d38a\personal-agentic`.
Perubahan Antigravity yang sudah ada di checkout utama dipertahankan di worktree.
Checkout utama di `Documents\GitHub\personal-agentic` menyediakan konfigurasi
Compose lokal dan `.env` existing; image aktif dibangun dari worktree ini.

- `src/backend/src/cockpit.rs`: projection aman, setup, mapping, dan kontrak HTTP.
- `src/frontend/src/LivePreview.tsx`: route, polling, auth, workspace, dan konfigurasi.
- `src/cockpit`: paket Three.js dengan mount/update/dispose dan library build.
- `src/frontend/public/cockpit-assets`: satu lokasi asset kanonis.
- `src/package.json` dan `src/package-lock.json`: satu instalasi npm workspace.
- `src/Dockerfile`: satu frontend bundle, backend Rust, dan target verifikasi.

Rust membaca Store workspace sebenarnya. Projection tidak mengirim prompt,
instructions, output agent, credential, atau path filesystem. Akses V1 mengikuti
Organization: hanya owner workspace. Phase pekerjaan berbeda dari ketersediaan
runtime, termasuk antrean, memulai, bekerja, menunggu jawaban manusia, dan menunggu
delegasi. Pekerjaan parallel dan pekerjaan aktif di luar 100 run terbaru tetap
terhitung. Backlog/scheduled tidak dipresentasikan sebagai pekerjaan berjalan.

Nama dan jabatan kartu/tag berasal dari Organization `name` dan `position`.
Deskripsi `role` tidak menjadi jabatan; posisi kosong tidak menambah separator
atau badge kosong. Label HUD asli dipulihkan: Status, Tugas selesai, Aktif sekarang,
Token diproses, dan Sesi kerja. Sesi kerja mempertahankan jam perangkat dalam WIB.
Token dijumlah dari usage run yang tersimpan dan termasuk scope mapping/team;
projection hanya mengirim total serta jumlah run dengan receipt yang dikenal.
Tanpa receipt atau ketika penjumlahan melampaui batas angka aman, nilai tampil
sebagai em dash. Nol terukur tetap nol. Title metrik menjelaskan cakupan parsial;
angka ini bukan estimasi kuota atau biaya provider.

Express/ledger lama menjadi fixture test di `src/cockpit/tests/legacy`. Deployment
systemd/CI pendahulu diarsipkan. Production memakai Rust, tanpa service Node
cockpit tambahan. Route lazy memuat scene ketika dibuka dan melepas RAF, timer,
listener, observer, model, texture, geometry, material, control, dan WebGL context
ketika ditinggalkan.

Untuk build berikutnya, jalankan dari `src` worktree ini:

```powershell
$env:PUPPETEER_SKIP_DOWNLOAD = 'true'
npm ci
npm run check
docker build --target platform --tag agentic-enterprise-platform:latest .
```

Selama source masih di worktree, gunakan build context ini. Build dari checkout
utama memakai source checkout utama. Compose preview existing dapat mengaktifkan
image hasil build tanpa membangun ulang melalui `up -d --no-build --no-deps platform`.

## Bukti nyata

### Koreksi posisi, token, dan density preview

Build terakhir lulus smoke layanan utama `http://localhost:18766` dan kandidat
terisolasi. Log utama `scratch/cockpit-verification/compact-deployed/result.log`
mencatat 7 profil, 5 slot terpetakan, 2 run existing, dan 0 run baru. Profil dan
ID run sebelum/sesudah smoke tetap sama. Kamera Nova mengubah 43,91% piksel scene
dan menggeser tag 122,11 px; canvas dan pilihan kamera yang sama bertahan saat
resize desktop → ponsel → desktop. Refresh normal/reduced motion, Browser Back,
focus trap, tracking, reset, panel, dan penutupan overlay lulus melalui browser
serta HTTP Rust sebenarnya.

Ukuran berikut berasal dari hit testing HUD dan bounding box browser utama;
rasio ialah area scene yang tidak tertutup HUD, bukan estimasi screenshot.

| Viewport  | Toolbar | Kartu tertinggi | Scene terbuka |
| --------- | ------- | --------------- | ------------- |
| 320×844   | 53 px   | 61,6 px         | 65,83%        |
| 390×844   | 53 px   | 47,6 px         | 65,63%        |
| 768×1000  | 49 px   | 47,6 px         | 70,00%        |
| 1024×1000 | 49 px   | 63,6 px         | 60,42%        |
| 1440×1000 | 49 px   | 50,6 px         | 51,25%        |
| 1848×930  | 49 px   | 50,6 px         | 58,54%        |
| 1280×720  | 49 px   | 63,6 px         | 45,63%        |
| 390×600   | 53 px   | 47,6 px         | 50,63%        |
| 844×390   | 49 px   | 47,6 px         | 42,08%        |

Strip kartu berada setidaknya 8 px dari panel dan di bawah 25% tinggi host pada
semua ukuran. Context sentuh asli pada 390×600 dan 844×390 lulus tap kartu/tag,
tap tutup, serta target kontrol 44 px. Toolbar landscape sentuh 57 px; panel
landscape yang dibuka masih menyisakan 42,08% scene. Screenshot utama berada di
`scratch/cockpit-verification/compact-deployed/`, termasuk
`deployed-live-preview-1848x930.png`, `deployed-live-preview-390x600.png`,
`deployed-live-preview-844x390.png`, `touch-expanded-landscape.png`,
`camera-home.png`, `camera-nova.png`, dan dua `selected-nova-resize-*.png`.

Default mapping utama memiliki 0 receipt dari 0 run dalam scope, sehingga token
tampil `—`. Pembuktian angka memakai receipt native yang sudah tersimpan:
30.124 token, cakupan 1/1 run, dari
`scratch/cockpit-verification/compact-native-final.log` dan screenshot
`compact-native-final/native-token-receipt.png`. Koreksi ini tidak memanggil
provider atau membuat run baru. Receipt berasal dari pembuktian provider
integrasi awal yang dijelaskan di bawah.

Kandidat juga lulus setup/mapping/filter, offline/recovery, remount, isolasi
workspace, dan session expiry: `compact-release-candidate/result.log`.
`compact-npm-check-final.log` mencatat frontend lint/type/build, cockpit
lint/format/library build, dan 199 tes lulus tanpa gagal atau skip.
`token-rust-force-compile.log` mencatat format serta 87 tes Rust lulus dengan
SQLite dan ONNX Runtime sebenarnya. Seluruh path log tersebut berada di
`scratch/cockpit-verification/`. Image rollback koreksi ini ialah
`agentic-enterprise-platform:pre-compact-20261006`; volume data tetap dipertahankan.

Bukti rollout terpisah `scratch/cockpit-verification/compact-rollout-proof.json`
lulus: profil lengkap, dua ID run, dan kelima ID mapping tidak berubah;
7 agent/5 terpetakan/2 run, 0 run aktif, 0 run baru, dan HTTP 200. Sembilan
screenshot utama serta tiga screenshot sentuh sudah ditinjau. Volume kandidat
dan record provider awal tetap dipertahankan.
Container kandidat terbaru `ae-cockpit-candidate` sudah dihapus sesudah verifikasi;
layanan utama tetap berjalan dengan HTTP 200 dan Matrix tetap healthy.

### Bukti integrasi dan floating sebelumnya

Koreksi UI floating sebelumnya diverifikasi pada layanan utama port 18766. Smoke browser
`cockpit-deployed.mjs` lulus: 7 profil/5 slot/2 run, seluruh profil dan ID run tetap
sama, serta 0 run baru saat preview dibuka. Kamera Nova mengubah 39,73% piksel
scene dan menggeser koordinat tag 115,20 px. Kelima kartu, tracking tag, orbit,
Escape/double-click reset, panel, focus trap/return, tiga cara penutupan, dan
buka-tutup pada lebar 320/390/768/1024/1440 lulus. Filter Team tetap terlihat
dengan lebar minimal 120 px pada setiap ukuran. Smoke workspace terisolasi
`cockpit-live.mjs` juga lulus setup/mapping/filter, offline/recovery, isolasi
workspace, dan session expiry melalui HTTP Rust/SQLite sebenarnya.
Pada tahap floating tersebut, static checks mencatat 86 tes Rust dan 195 tes cockpit.

Bukti floating sebelumnya: `scratch/cockpit-verification/floating-deployed/result.log`,
`deployed-live-preview.png`, `camera-home.png`, `camera-nova.png`, serta screenshot
lima ukuran layar. Perbandingan state sebelum/sesudah rollout disimpan sebagai
`scratch/cockpit-verification/floating-rollout-proof.json`. Image rollback untuk
perubahan UI ini: `agentic-enterprise-platform:pre-floating-20261006`.

| Pemeriksaan                          | Hasil                                                                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker build --target verification` | Pada tahap floating: Rust format dan 86 tes lulus; SQLite/ONNX Runtime sebenarnya                                                                                                                                 |
| `npm run check`                      | Pada tahap floating: frontend lint/type/build; cockpit lint/format/build dan 195 tes lulus                                                                                                                        |
| `cockpit-live.mjs`                   | HTTP Rust + SQLite + Edge: overlay/focus trap/kamera asli, setup idempotent, mapping UI, filter/reload, offline/recovery, remount, 5 ukuran layar, workspace isolation, session expiry; 0 run saat preview dibuka |
| `cockpit-agent-run.mjs`              | Satu Direct run Nova melalui chat/API, model yang diiklankan CLI sebenarnya, UI menangkap Bekerja lalu hasil selesai                                                                                              |
| `cockpit-deployed.mjs`               | Preview utama memiliki 7 profile/5 slot/2 run, hierarchy benar, WebGL benar-benar render, overlay dan kamera bekerja; membuka scene tidak mengubah profile atau membuat run                                       |
| Restart container utama              | HTTP 200 dan mapping kelima ID tetap sama                                                                                                                                                                         |
| Pemulihan backup terisolasi          | Arsip diekstrak ke volume baru, aplikasi Rust lama membuka kembali 2 agent dan 2 run `succeeded` melalui HTTP; container/volume pemulihan dibersihkan                                                             |

Run nyata pada kandidat terisolasi port 18768:
`72dca1a3-f4ee-4a61-8a76-210652c958bc`, `succeeded`, exit code `0`, model
`gemini-3.8-flash-high`, native session
`e969bfe9-7ef9-4106-a31d-ae68196416fa`.
Agent membaca file fixture dua baris menggunakan CLI Antigravity dan mengembalikan
baris pertama `Cockpit integration smoke` serta jumlah dua baris nonempty.
Profile Nova pada kandidat dipulihkan ke konfigurasi awal sesudah run selesai.

Evidence lokal berada di `scratch/cockpit-verification` (diabaikan Git):
`real-agent-run.json`, `real-agent-working.png`, `real-agent-completed.png`,
`deployed-organization.png`, `deployed-live-preview.png`, dan screenshot lebar
320, 390, 768, 1024, 1440, serta `backup-restore-proof.json`.
Alur HTTP/browser/provider tersebut tidak memakai mock.
Tes scene memakai fixture canvas, waktu, dan randomness untuk pemeriksaan
deterministik; file GLB dan resource Three.js juga diuji langsung.

## Rollout dan batasan

Pada integrasi awal, preview diperbarui setelah memastikan tidak ada run aktif dan membackup volume
dengan service berhenti. Volume `agentic-enterprise_platform-data` tetap digunakan;
Matrix tetap berjalan. Mount lokal mengikuti `compose.override.yaml` existing.
Credential tidak dimasukkan ke source, image, URL, snapshot cockpit, atau evidence.

Backup lokal:
`scratch/backups/platform-data-20261006-pre-cockpit.tgz` (29.334 byte), SHA256
`172f85fe312ddc5e34d52a1185a038e9c2dbd25330c325db75805e93bf629fb4`.
Image rollback: `agentic-enterprise-platform:pre-cockpit-20261006`.
Backup berisi state/credential aplikasi dan tetap di folder lokal yang diabaikan Git.
Container kandidat integrasi awal port 18768 telah dihentikan dan dibersihkan setelah bukti
disimpan; volume kandidat disimpan untuk mempertahankan record run uji.

Polling dua detik dapat melewatkan phase antrean yang sangat singkat. Runtime lokal
tanpa heartbeat terdaftar ditandai belum pasti ketika idle; run nyata tetap tampil
bekerja. Readiness dari heartbeat/catalog tidak menjanjikan provider selalu
berhasil. Scene lazy 818,45 KB sebelum gzip (220,95 KB gzip); build masih memberi
peringatan ukuran chunk. Projection membaca history Store lengkap; optimasi query
layak dilakukan saat jumlah run/event membesar.

Langkah berikutnya adalah memilih runtime, model, workdir, dan instructions yang
sesuai untuk kelima agent, lalu mengaktifkan mereka. Preview sudah membaca pekerjaan
yang dijalankan melalui chat/Actions existing; viewer tetap baca-saja.
