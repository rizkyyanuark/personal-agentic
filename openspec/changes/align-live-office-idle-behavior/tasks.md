> Status kontrak: implementasi awal dan bukti historis. `describe-live-office-work-activity` menggantikan feed santai dengan riwayat kerja nyata. `refine-live-office-presentation` menggantikan pilihan label kartu, status selesai sementara, bubble dan pose gitar. Baca [aturan efektif](../../README.md) sebelum memakai task/spec awal sebagai acceptance saat ini.

# Tasks

Checkbox ditandai setelah implementasi dan verifikasi; bukti serta batas pengujian dicatat pada `verification.md`. Setiap kelompok menjalankan `npm run check --workspace cockpit` dari `src` setelah perubahan finalnya; task dinyatakan selesai hanya dengan hasil dan bukti yang dicatat.

## 1. Proyeksi kegiatan visual ke kartu dan detail

- [x] 1.1 Hubungkan data `kind/zone/phase/destinationId/arrivalId` dari controller scene ke proyeksi presentasi bersama, termasuk TV/PS, kopi/air, gitar, jendela, membaca, meeting, tujuan berjalan, dan fallback unknown; verifikasi melalui regression behavior pada `office-presentation` dan `hud-presentation` serta kartu/detail aplikasi yang sama maknanya dengan scene.
- [x] 1.2 Terapkan prioritas state operasional dan lifecycle terhadap keterangan santai; verifikasi regression working, failure, awaiting-answer/delegates, stale/offline, hidden, dan reduced motion tanpa perubahan kontrak snapshot Rust atau counter run.
- [x] 1.3 Perbarui dokumentasi presentasi kegiatan di `src/cockpit/docs/architecture.md` serta checklist visual terkait; verifikasi teks menguraikan sumber scene dan operational state secara benar dan jalankan check cockpit.

## 2. Feed visual sementara

- [x] 2.1 Tambahkan buffer transisi memory maksimum 100 entri pada instance cockpit dan tampilkan dengan label kegiatan visual di panel aktivitas yang ada; verifikasi satu entri per start-walking/arrival, tidak ada histori placement awal atau duplikasi polling/frame, dan eviction entri ke-101 melalui regression perilaku.
- [x] 2.2 Bersihkan buffer/dedupe/callback pada reload/remount, workspace/filter switch, dan dispose; verifikasi browser pada aplikasi nyata tidak membawa entri antar konteks, tidak memakai storage browser/server, dan event serta angka pekerjaan tetap utuh.
- [x] 2.3 Dokumentasikan lifecycle dan batas feed di panduan cockpit dan `src/VERIFICATION.md`; verifikasi langkah pengujian dapat dijalankan terhadap kandidat nyata lalu jalankan check cockpit.

## 3. Kontak karakter dan gitar

- [x] 3.1 Selaraskan attachment torso dan orientasi gitar pada `characters.js`; gunakan anchor neck/strum yang ditransformasikan ke solver tangan pada `character-pose.js`; verifikasi regression kontak selama beberapa fase petikan dan visibilitas prop ketika datang, berjalan, serta menerima kerja.
- [x] 3.2 Periksa semua profil visual karakter yang dapat menggunakan gitar dalam scene aplikasi, simpan screenshot kamera utama/depan/samping pada beberapa fase, dan koreksi penetrasi atau tangan salah sisi; verifikasi bukti memenuhi `live-office-scene` tanpa mengganti rig atau dependency.
- [x] 3.3 Perbarui checklist pose gitar dan petunjuk pengambilan bukti di dokumentasi visual/verification; verifikasi tautan bukti serta jalankan check cockpit setelah final edit.

## 4. Workstation dan area pantry

- [x] 4.1 Hapus desk mat bersama dan material tak terpakai di `workstation.js`, sesuaikan posisi keyboard/mouse terhadap permukaan meja aktual; verifikasi empat meja melalui regression bounds dan screenshot close-up, termasuk fokus kamera meja yang tetap berfungsi.
- [x] 4.2 Set world anchor counter X/Z (8.2, -6.45) dan pot (6.6, -6.4), hentikan koreksi akhir yang menggeser anchor, dan sesuaikan prop pantry dalam bounds ruang lokal; verifikasi world position dengan toleransi 0.01 serta clearance kabinet/pot/dispenser/dinding melalui regression geometri dan render nyata.
- [x] 4.3 Selaraskan obstacle serta tujuan/arah hadap kopi dan air dengan layout aktual; verifikasi karakter mendekat, berinteraksi dan pergi tanpa penetrasi/stuck, termasuk dua pengguna pantry dan jalur pot pada scene aplikasi.
- [x] 4.4 Perbarui dokumentasi layout pantry/pot dan permukaan workstation dengan koordinat serta batas adaptasi prop lokal; verifikasi dokumen cocok dengan world position terukur dan jalankan check cockpit.

## 5. Percakapan sesuai referensi

- [x] 5.1 Selaraskan scheduler dengan first attempt 4 detik, interval 7–11.5 detik, pembuka 4.8 detik, reply mulai 2.3 detik dan tampil 4.2 detik; pisahkan waktu scheduler dari delta pose yang dibatasi; verifikasi boundary tepat sebelum/pada/sesudah deadline, no-eligible retry, overlap, dan render stall melalui regression clock deterministik.
- [x] 5.2 Selaraskan peserta idle termasuk gitar/jendela, aturan bubble aktif, cabang peer 70/30, katalog CHAT/QUIPS dari commit referensi, serta probabilitas kedatangan 55 persen; hilangkan timer quip 14 detik dan anti-repeat nonreferensi; verifikasi pilihan acak terkontrol dan arrival-only tanpa mengubah nama agen lokal.
- [x] 5.3 Pastikan bubble arbitration dan lifecycle membatalkan dialog/reply saat kerja, berjalan, hidden, stale/offline, reduced motion, switch konteks, atau dispose; verifikasi regression tidak ada overwrite bubble aktif dan callback instance lama tidak mengeluarkan bubble.
- [x] 5.4 Perbarui dokumentasi timing, overlap 2.5 detik, dan label suasana ilustratif; verifikasi sedikitnya lima percakapan aplikasi nyata memakai timestamp bubble dengan toleransi observasi 250 ms, kemudian jalankan check cockpit.

## 6. Integrasi aplikasi dan bukti penerimaan

- [x] 6.1 Dari `src`, jalankan final `npm run check --workspace cockpit`, `npm run lint --workspace frontend`, dan `npm run build --workspace frontend`; verifikasi seluruh command exit 0 setelah edit terakhir dan catat revisi serta output ringkas tanpa artefak build masuk Git.
- [x] 6.2 Jalankan `npm run test:e2e --workspace cockpit` untuk halaman kantor mandiri terhadap kandidat Rust/React terisolasi dengan kredensial privat sesuai `src/VERIFICATION.md`; verifikasi entrypoint Organization ke `/office` serta `/organization/live-preview`, data API nyata tanpa interception, kamera empat meja, desktop/mobile, auth, remount serta workspace isolation. Pertahankan suite overlay lama sebagai `test:e2e:legacy` dan catat incompatibility-nya (penyesuaian disetujui pemilik 2026-11-02).
- [x] 6.3 Kumpulkan screenshot/trace seluruh jenis kegiatan, konsistensi kartu/detail/feed, gitar tiga sudut, empat meja, koordinat dan navigasi pantry, serta lima timeline dialog; verifikasi feed reset dan counter/run tidak berubah hanya karena membuka/mengamati scene, dengan receipt terikat revisi build yang diuji.
- [x] 6.4 Buktikan interupsi santai oleh run nyata yang diotorisasi pada runtime terkonfigurasi, termasuk pembatalan balasan; verifikasi run/status backend dan scene, lalu laporkan keterbatasan bila dependency/runtime tidak tersedia tanpa mengganti proof dengan provider/API mock.
- [x] 6.5 Inspeksi diff final, pastikan tidak ada debug/dead code atau perubahan API/DB tak direncanakan, dan susun laporan SUMMARY/PROOF/NEXT beserta risiko; verifikasi semua acceptance scenario mempunyai bukti atau blocker eksplisit sebelum mengklaim implementasi selesai.

## Workflow follow-up

- Setelah artefak ditinjau, implementasi dimulai hanya atas permintaan baru melalui `$openspec-apply-change`.
- Publikasi issue GitLab, versioning folder OpenSpec yang saat ini di-ignore, commit/push, dan deployment berada di luar otorisasi planning ini.
- Archive hanya setelah implementasi, review, dan bukti penerimaan selesai sesuai workflow proyek.
