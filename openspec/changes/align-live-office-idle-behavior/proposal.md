> Status kontrak: implementasi awal dan bukti historis. `describe-live-office-work-activity` menggantikan feed santai dengan riwayat kerja nyata. `refine-live-office-presentation` menggantikan pilihan label kartu, status selesai sementara, bubble dan pose gitar. Baca [aturan efektif](../../README.md) sebelum memakai task/spec awal sebagai acceptance saat ini.

# Proposal

## Why

Live Office belum menyelaraskan pose gitar, aktivitas karakter yang terlihat, dan keterangan UI. Pemilik meminta enam perbaikan agar kegiatan santai terbaca jelas dan perilaku visual mengikuti kantor-agent pada revisi tetap, dengan pantry serta pot menggunakan posisi referensi.

## What Changes

- Selaraskan attachment, orientasi, dan titik pegangan gitar dengan rig karakter lokal.
- Tampilkan kegiatan dan tujuan karakter pada kartu serta detail: lounge/TV, PS, kopi, air, gitar, jendela, membaca, meeting, dan perpindahan.
- Tambahkan feed visual sementara untuk transisi kegiatan; tidak menyimpan riwayat setelah reload.
- Hapus desk mat pada seluruh workstation dan sesuaikan tinggi keyboard/mouse terhadap permukaan meja.
- Tempatkan pantry/counter pada X/Z (8.2, -6.45) dan pot samping pantry pada (6.6, -6.4), mengikuti referensi; sesuaikan prop, target interaksi, dan collider agar tetap aman pada ruang lokal.
- Samakan scheduler percakapan: pemicu awal 4 detik, interval percobaan 7–11.5 detik, pembuka 4.8 detik, balasan mulai 2.3 detik sejak pembuka dan tampil 4.2 detik; selaraskan peserta serta celetukan kedatangan.

## Capabilities

### New Capabilities

Inventaris spec worktree ini masih kosong. Capability berikut baru didokumentasikan di OpenSpec, sedangkan implementasi Live Office sudah ada:

- `live-office-scene`: pose/properti gitar, permukaan workstation, dan posisi pantry/pot beserta navigasi terkait.
- `live-office-idle-activity`: keterangan kegiatan scene yang konsisten pada kartu, detail, dan feed sementara.
- `live-office-ambient-dialogue`: isi, peserta, penjadwalan, dan penghentian percakapan santai.

### Modified Capabilities

Tidak ada capability spec terdahulu di root ini. Delta tidak mengklaim audit seluruh perilaku Live Office yang sudah ada.

## Impact

- Target source: `src/cockpit/src/client/scene/{characters,character-pose,character-activity,office-layout,office-navigation,furniture,workstation}.js`, `src/cockpit/src/client/ui/{office-presentation,hud,ambient-dialogue}.js`, dan `src/cockpit/src/client/mount.js` bila diperlukan untuk wiring/lifecycle.
- Perlu regression pada suite cockpit yang ada, browser proof melalui aplikasi Rust/React, serta pembaruan dokumentasi perilaku dan verifikasi terkait.
- Tidak merencanakan dependency baru, migrasi DB, perubahan API publik, auth, queue, harness, atau perhitungan run/token. Kegiatan santai adalah presentasi scene, bukan bukti pekerjaan agen.
- Tidak mencakup seluruh layout ruangan, AI-generated dialogue, persistensi riwayat santai, publikasi GitLab, commit/push, atau deployment.
- Referensi: https://github.com/humaedihume/kantor-agent/blob/ad92a7a473b3d0e769281d552cee74cbb4004a54/skills/kantor-agent/runtime/public/assets/kantor.js . Identitas agen, batas data, dan arsitektur personal-agentic tetap berlaku. Pelaporan per-spot adalah enhancement pemilik; kartu upstream memakai teks idle umum.


Follow-up: `describe-live-office-work-activity` supersedes the original memory-only
idle-feed requirement following owner review. Idle activity belongs on cards/details;
the left panel retains descriptive, traceable real work history after completion.
The linked verification.md records the original acceptance, not the superseding presentation.
