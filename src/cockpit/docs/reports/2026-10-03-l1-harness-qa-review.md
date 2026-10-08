# Review uji ulang L1 dan koreksi harness

Tanggal: 3 Oktober 2026 (WIB). Review ini memakai laporan dan artefak kolega;
Codex tidak menjalankan browser. Penerimaan L1 penuh belum dinyatakan lulus.

## Temuan yang dapat dipakai

Laporan `l1-reflow-qa-test-report.md` mengikat pengujian ke build
`index-DCvnlAGa.css` / `index-C8_QeM3h.js`. Log menunjukkan lima viewport normal
lulus, kemudian pembesaran sintetis 320 px lulus dan 390 px gagal: computed
font `small-0` tetap 10,5 px, bukan 21 px. Ini kegagalan prasyarat pembesaran
dalam harness, belum bukti bahwa layout gagal setelah teks benar-benar membesar.

Kesimpulan laporan bahwa CSS mobile mengalahkan injeksi belum terbukti. Aturan
font mobile tersebut tidak memakai `!important`, sedangkan injeksi memakainya.
HUD juga tidak mengganti elemen `<small>Status</small>` saat polling. Penyebab
runtime tepat belum ditentukan tanpa diagnostik browser lanjutan.

Koreksi hanya menyentuh harness pengujian:

- Fixture menangkap semua ukuran awal dan referensi elemen sebelum mengubah
  font, sehingga pewarisan font tidak membuat anak membesar empat kali.
- Font diterapkan langsung pada elemen asli dengan inline `!important`.
  Tidak ada stylesheet injeksi atau penanda dataset yang perlu dicari kembali.
- Assertion penggandaan, batas teks, viewport/DPR, dan interaksi tetap berlaku.
  Assertion baru mendeteksi elemen terlepas/diganti serta membuktikan cleanup.
- `finally` memulihkan nilai dan priority font inline asli sebelum viewport
  berikutnya, tanpa menghapus perubahan style lain. Polling tetap aktif.

Tujuh unit test mencakup pewarisan, pemulihan priority, style lain, atribut
kosong, viewport berurutan, identitas elemen, cleanup saat apply gagal, serta
serialisasi fungsi untuk konteks browser. Unit test bukan bukti E2E lulus.

## Koreksi pembacaan bukti kolega

- Klaim delapan event tetap tampil offline tidak didukung bukti. JSON mencatat
  `eventsCount: 0`, tetapi script menghitung class yang tidak digunakan renderer.
  HUD justru mengganti feed offline dengan pesan tidak tersedia dan menyalinnya
  ke feed mobile. Teks koneksi terputus, warna amber, lalu pemulihan Live/hijau
  merupakan pengamatan yang tercatat dan dapat dipakai.
- Array event BFCache kosong berarti tidak ada `persisted: true` yang tercatat.
  Itu tidak membuktikan `persisted: false` diamati atau semua headless browser
  tidak mendukung BFCache.
- Metadata CDP membuktikan visual scaling, bukan native page zoom: viewport
  layout/font/DPR tetap. Screenshot zoom diambil setelah scale dikembalikan
  ke 1, sehingga tidak menggambarkan keadaan scale 2.

Laporan asli dan script QA kolega tidak diubah.

## Uji ulang oleh kolega

Build preview tetap sama karena tidak ada perubahan kode aplikasi. Jalankan
dari root proyek; tidak perlu rebuild atau restart preview untuk perubahan test.

Untuk diagnosis transisi yang sebelumnya gagal:

```sh
COCKPIT_URL=http://127.0.0.1:8099 COCKPIT_VIEWPORTS=mobile-320,mobile-390 npm run test:e2e
```

Setelah itu jalankan suite penuh tanpa filter:

```sh
COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e
```

Pastikan semua viewport pembesaran sintetis benar-benar lulus, cleanup kembali
ke ukuran awal, dan screenshot diperiksa. Jangan menghapus atau melemahkan
assertion. Simpan log/exit code serta screenshot pada kegagalan.

Untuk offline, pilih tab Aktivitas dan periksa `#feedList > li` serta
`#feedListMobile > li`, membedakan `.empty-state` dari event. Bandingkan kedua
feed, pesan tidak tersedia, lalu tunggu teks `Live` dan dot hijau saat pulih.
Jangan menyimpulkan retensi event dari selector class yang tidak ada.
Untuk Back, pasang pencatatan `pageshow` pada setiap document sebelum navigasi;
hanya `persisted: true` membuktikan BFCache. Native zoom tetap ditandai belum
terverifikasi bila tidak dapat dijalankan. Ambil screenshot simulasi CDP saat
scale masih 2 dan beri label simulasi, bukan native.

Hasil pemeriksaan kode dan blocker check menyeluruh dicatat di `docs/WORK_LOG.md`.
L2 memerlukan konfirmasi popup pemilik; produksi tidak disentuh.
