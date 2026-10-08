# ADR 0012: posisi tunggal dan pemulihan rute terhalang

Tanggal: 4 Oktober 2026 (WIB).
Status: implementasi source lokal atas konfirmasi pemilik; belum diuji kolega.
Melengkapi [ADR 0010](0010-scene-activity-and-shared-bubble-coordination.md)
dan mempertahankan cadence pada [ADR 0011](0011-reference-motion-and-dialogue-cadence.md).

## Konteks dan persetujuan

Laporan investigasi 4 Oktober mencatat kegagalan bootstrap reduced motion,
allocator lama yang menimpa posisi, serta kedatangan 7,4 mm sebelum tujuan.
Stuck permanen belum direproduksi; rute terhalang pada fase masuk/keluar kursi
tidak memiliki pemulihan dan dapat menghabiskan dua slot perpindahan.

Pemilik menyetujui tiga perbaikan tersebut dengan desain dipertahankan.
Pengujian tetap dilakukan kolega. Perubahan seed sesi belum disetujui dan
tidak termasuk keputusan ini. Sequential-thinking digunakan sebelum perubahan.

## Keputusan

- Setelah bootstrap, controller aktivitas menjadi satu-satunya penulis posisi
  dan heading karakter. Reconciliation tidak memanggil allocator kursi lama.
- Gate tertutup membekukan transform aktual dan menyimpan fase/rute tertunda.
  Koridor akses kursi dan waypoint yang telah dicapai disimpan terpisah dari
  pose duduk. Resume tidak menghitung pause sebagai kedatangan baru.
- Waypoint terakhir dicapai melalui langkah biasa maksimal `1.6 × delta`;
  koordinat endpoint dipakai persis hanya setelah pemeriksaan hambatan.
  Radius penghentian 15 mm dihapus, bukan ditutupi dengan toleransi test baru.
- Jalan bebas mempertahankan replan setelah 2,2 detik terhalang. Setelah
  5 detik tanpa progres, masuk/keluar fixture melakukan `recovering` melalui
  checkpoint akses yang benar-benar telah dilewati. Keluar kursi kembali
  ke kursi asal; masuk kursi kembali ke titik pendekatan. Tidak ada teleport,
  pencarian rute global dari dalam fixture, atau klaim arrival pada rollback.
- Rollback yang ikut terhalang, atau jalan bebas yang tetap terhalang,
  masuk `waiting-route`: posisi diam, pose netral, konteks rute dipertahankan.
  Retry setelah `3 + index × 0.4` detik harus mengambil slot gerak kembali.
  `recovering` tetap dihitung sebagai perpindahan aktif; fase diam tidak.
  Setelah rollback berhasil, cooldown `6 + index × 0.4` detik mencegah
  percobaan dekoratif berulang seketika. Kepulangan operasional tetap prioritas.
- Reservasi akses fixture dipertahankan sampai benar-benar keluar. Reservasi
  tujuan yang belum ditempati dapat dilepas saat menunggu/paused dan diperiksa
  lagi sebelum melanjutkan. Pelepasan selalu memeriksa pemilik reservasi.
- `update(0)` dari polling tidak mereset timer hambatan. Timer hanya direset
  oleh progres fisik, perpindahan fase pemulihan, atau pause eksplisit.

## Batas dan bukti

Desain kartu, bubble, name tag, layout, palette, kamera, rig, kecepatan,
wallpaper, dan cadence dialog tidak berubah. Tidak ada field API, dependency,
akses model/worker, perubahan ledger, atau deployment.

Inspeksi source dan formatting bukan bukti bahwa gerak bebas macet atau smooth.
Check, unit test, browser, E2E, build, screenshot, dan benchmark belum dijalankan
Codex sesuai mandat pemilik. Preview 8099 masih perlu dibangun dari source ini
sebelum pengujian; produksi tidak disentuh. Acceptance menunggu hasil kolega
dan review pemilik, terutama hambatan bersamaan serta pause/status di tengah
akses fixture.
