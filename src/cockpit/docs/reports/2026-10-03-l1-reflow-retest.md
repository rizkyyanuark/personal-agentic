# Instruksi uji ulang L1: tab panel dan metrik header

Tanggal: 3 Oktober 2026 (WIB). Pengujian browser dilakukan kolega pemilik.
Status penerimaan visual: menunggu pengujian, bukan PASS.

## Lingkup dan batas

Uji preview `http://127.0.0.1:8099/` dari workspace
`/home/ubuntu/infra-hub/ai-lab-cockpit`. Jangan mengubah source, menghapus
assertion, memasang dependency, melakukan commit, deploy, atau restart produksi.
Boleh menyimpan log, screenshot, script QA terpisah, dan laporan pengujian.

Koreksi ini menjaga tab agar tidak saling menindih, mengizinkan gulir horizontal
di dalam tablist, dan memperbaiki reflow metrik. Panel desktop mengikuti tinggi
header aktual. Kartu agent, data API, dan scene tidak didesain ulang.

## 1. Pastikan build terbaru

Lakukan hard reload dengan cache dinonaktifkan. Catat aset yang benar-benar
dimuat melalui Network beserta HTTP status:

- CSS: `/assets/index-DCvnlAGa.css`.
- JS: `/assets/index-C8_QeM3h.js`.

Jika masih memuat `index-6zfGAv_h.css` atau `index-ChOHEMHz.js`, berhenti dan
laporkan build lama. Jangan menyimpulkan hasil untuk koreksi ini.

Codex telah menjalankan `npm run check` pada build terisolasi: lint, format,
106 unit test, dan build lulus. Itu tidak membuktikan hasil browser.

## 2. Jalankan suite lengkap

Dari root workspace, tanpa filter `COCKPIT_VIEWPORTS`:

```sh
COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e
```

Simpan output lengkap dan exit code. Suite memakai lima viewport screenshot
utama dan resize tambahan 820/507 px. Assertion baru memeriksa batas teks
aktual dengan DOM Range, tab terpilih di dalam scrollport, chevron yang dapat
diklik, dan jarak panel desktop terhadap header. Jangan melemahkan assertion
jika suite gagal; sertakan error serta screenshot pada titik gagal.

Suite juga membuat screenshot `<viewport-name>-synthetic-text-200.png` di
`artifacts/screenshots/`. Ini menggandakan computed font size teks tab/metrik
secara nyata, sementara viewport dan DPR tetap. Ini bukan zoom browser native
dan bukan pengujian pembesaran seluruh kartu agent.

## 3. Periksa visual dan interaksi

Periksa 320×760, 390×844, 507×900, 768×1024, 820×1180, 1024×768, dan 1440×900.
Periksa screenshot yang diminta `docs/visual-acceptance.md` serta screenshot
pembesaran teks yang baru.

1. Pada 1024 px, jam/status koneksi dan angka tugas selesai tidak menindih
   sel tetangga. Label/nilai tetap terbaca setelah reflow.
2. Riwayat, Tugas agent, Aktivitas, dan badge tidak saling menindih.
   Gulir horizontal internal tablist diperbolehkan; halaman tidak meluap.
   ArrowLeft/ArrowRight/Home/End menampilkan tab terpilih dan focus ring.
   Chevron tetap terlihat, dapat diklik, dan minimal 44×44 CSS px.
3. Mobile masuk dengan panel terbuka, termasuk setelah panel desktop
   disembunyikan. Klik kartu menciutkan isi saja; dock dan tiga tab tetap
   tersedia. Tab, chevron, H, dan dua tahap Escape bekerja seperti sebelumnya.
   Carousel tetap berjarak sedikitnya 8 px dari drawer/dock, dengan toleransi
   geometri 1 px.
4. Panel desktop yang terlihat tetap di bawah header, termasuk ketika metrik
   bertambah baris. Target jarak minimal 8 px, toleransi 1 px.
5. Regresi kartu: Nova memakai pill Menunggu; title dan nama aksesibilitas
   tetap Menunggu keputusan. Baris status/tugas/aktivitas sejajar; nama dan
   pill tidak keluar kartu. Ini pemeriksaan, bukan klaim bahwa defect zoom
   kartu pada laporan lama sudah diperbaiki.
6. Gulir tablist secara manual, lalu tunggu beberapa polling dengan label/count
   yang tetap. Scroll tidak boleh ditarik kembali setiap polling identik.
   Pemilihan tab baru tetap menampilkannya di dalam scrollport.

## 4. Lengkapi bukti yang belum kuat pada laporan sebelumnya

- Uji zoom browser native 200% melalui kontrol browser dan catat metodenya.
  Simpan screenshot, `innerWidth`, `innerHeight`, `devicePixelRatio`,
  `visualViewport.width/scale`, dan computed font size sebelum/sesudah.
  Bedakan ukuran jendela fisik dari viewport CSS setelah zoom. Penggantian
  `html.style.fontSize`, CSS `zoom`, atau `deviceScaleFactor` bukan bukti
  zoom browser native. Jika native zoom tidak tersedia, tandai BLOCKED;
  jangan mengganti nama uji sintetis menjadi native.
- Navigasi pergi lalu gunakan Back browser. Catat event `pageshow.persisted`.
  Hanya `true` membuktikan restorasi BFCache. Jika halaman dimuat baru,
  laporkan fresh navigation dan tandai uji BFCache belum terverifikasi.
- Untuk offline, gagalkan GET `/api/state` melalui intersepsi browser atau
  kontrol jaringan, setelah halaman tersambung. Tunggu pembaruan polling,
  lalu periksa status, feed desktop/mobile, dan pesan panel. Jangan memakai
  optional mock hook yang tidak ada. Catat request gagal yang sengaja
  dipicu terpisah dari error yang tidak diharapkan. Pulihkan koneksi dan
  periksa pemulihan. Jangan memodifikasi API/ledger untuk membuat fixture.

## 5. Serahkan laporan

Simpan laporan baru sebagai `l1-reflow-qa-test-report.md`, dengan tautan ke log
dan screenshot. Jangan menimpa laporan awal.

Cantumkan browser/versi, viewport CSS aktual, DPR, metode pembesaran, aset
termuat, perintah/exit code, hasil setiap skenario PASS/FAIL/BLOCKED, console
error, dan langkah reproduksi tiap kegagalan. Nyatakan keterbatasan perangkat
sentuh fisik, screen reader audio, BFCache, dan native zoom apa adanya.
Tidak ada overflow halaman bukan bukti bahwa teks di dalam panel tidak menindih.
Koreksi L1 belum diterima secara visual sampai laporan ini ditinjau pemilik.
