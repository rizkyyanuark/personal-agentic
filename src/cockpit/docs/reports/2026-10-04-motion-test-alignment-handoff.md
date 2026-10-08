# Handoff: penyelarasan test gerak dan reduced motion

Tanggal: 4 Oktober 2026 (WIB).
Target: preview lokal `http://127.0.0.1:8099`.
Status: perubahan test disiapkan; belum dijalankan atau diterima.

Pemilik menyetujui penyelarasan test dan arahan uji ulang. Pengujian tetap
dilakukan kolega. Tidak ada perubahan desain, gerak, dialog, backend, aset,
dependency, build preview, layanan, ledger, atau produksi dalam pekerjaan ini.

## Koreksi terhadap laporan sebelumnya

Laporan `2026-10-03-reference-motion-bubbles-qa.md` milik kolega mencatat
`npm run check` lulus dan E2E gagal. Kegagalan anchor tersebut terjadi pada
halaman dengan `prefers-reduced-motion: reduce`, bukan bukti karakter sedang
berkeliling. X=3,88 berasal dari kursi `sofa:left`; X=1,80 adalah meja Atlas.
Harapan allocator lama tidak sama dengan kontrak controller aktif.

Workspace sekarang juga memuat perubahan kolega yang lebih baru, dicatat
di WORK_LOG sebagai revisi percakapan dan bubble 1:1. Perubahan itu tetap utuh.
Build/hash dan klaim lulus pada catatan lama tidak membuktikan test baru ini
sudah lulus. Cocokkan laporan berikutnya dengan source dan build yang diuji.

## Perubahan test

- `tests/e2e/smoke.mjs` memakai home assignment dengan
  `allowIdleSeating: false` untuk bootstrap reduced motion, sambil tetap
  memeriksa posisi, heading, jenis kursi, identitas, dan membership scene.
- Setelah mode gerak diaktifkan lalu dihentikan, test membandingkan posisi
  aktual dengan snapshot sebelum handler perubahan media berjalan. Setelah
  lebih dari 45 detik, kelima karakter harus tetap berada pada anchor beku
  tersebut, tidak dipaksa kembali ke papan/meja.
- Observer pada test hanya mencatat posisi/heading saat perubahan media.
  Ia meneruskan `matchMedia` native dan tidak memindahkan karakter, mengubah
  status, atau memanggil controller produksi.
- `tests/e2e/motion.mjs` menyediakan fixture browser yang juga dapat dijalankan
  sendiri. Fixture hanya mengintersepsi GET `/api/state` pada tab pengujian,
  memakai schema publik dan penanda fixture. Tidak ada perubahan ledger.
- `tests/unit/character-activity.test.mjs` menambah lima test controller:
  bootstrap reduced motion; freeze setelah perpindahan nyata; tujuan, kursi,
  okupansi, arrival ID dan kecepatan; serta kembali home saat bekerja dan
  menunggu keputusan. Waktu simulasi hanya berjalan saat test dieksekusi.

Assertion identitas, empat meja, lima karakter, kontrol, kamera, resize/DPR,
overflow, dan pembesaran teks pada suite utama tetap dipertahankan. Tidak ada
perubahan assertion privasi atau kontrak publik untuk mendapat hasil hijau.

Inspeksi source menegaskan jalur yang perlu diuji: `main.js` memanggil
`updateCharacterAnimations(entities, 0, true)` ketika suasana tidak diizinkan;
fungsi di `characters.js` memakai allocator idle lama dan menulis ulang posisi
serta heading. Test baru tidak menganggap hasil reset itu sebagai baseline yang
sah. Dampak runtime tetap harus dibuktikan kolega; aplikasi tidak diperbaiki
diam-diam dalam pekerjaan khusus test ini.

`npm run test:e2e` menjalankan smoke dan helper gerak yang baru dipanggilnya.
`tests/e2e/seating.mjs` dan `tests/e2e/office-experience.mjs` adalah suite
terpisah yang masih memiliki harapan lama, termasuk sofa deterministik dan
kontrol tersembunyi. Keduanya tidak diubah dalam scope ini dan bukan bukti
acceptance controller aktif. Jangan mengklaim keduanya lulus hanya karena
smoke lulus.

## Perintah untuk kolega

Jalankan ketika diminta pemilik. Jangan memperbaiki produk, menghapus assertion,
memanggil worker/model, membaca vault, memodifikasi ledger, atau melakukan
restart/deployment produksi sebagai bagian QA.

```bash
cd /home/ubuntu/infra-hub/ai-lab-cockpit
OFFICE_BUILD_DIR="$(mktemp -d /tmp/cockpit-motion-qa.XXXXXX)" npm run check
COCKPIT_URL=http://127.0.0.1:8099 node tests/e2e/motion.mjs
COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e
```

Catat output lengkap dan exit code masing-masing perintah. Jalankan test gerak
mandiri juga bila smoke berhenti sebelum memanggil helper. Jumlah test mengikuti
hasil aktual, bukan otomatis mengulang angka 153 dari laporan lama.

Helper mandiri memakai viewport desktop 1440 dan menyimpan bukti di
`artifacts/motion/desktop-1440-regression.json`, termasuk saat FAIL. Screenshot
berawalan `artifacts/screenshots/desktop-1440-motion-` mencatat freeze, kembali
bekerja/menunggu, atau kegagalan jika screenshot dapat diambil. Pemanggilan lewat
smoke memakai desktop 1440 bila dipilih, selain itu viewport pertama dari filter;
nama artefak mengikuti viewport tersebut. Toleransi dan world-space shoe bounds
disimpan dalam JSON, bukan disimpulkan dari posisi root.

Check membangun ke direktori sementara, bukan mengganti build preview. Catat
JS/CSS yang benar-benar dilayani 8099 beserta hash. Bila source dan preview
berbeda, tandai blocker dan minta arahan pemilik sebelum mengganti artefak.

## Bukti terarah yang masih diperlukan

### 1. Posisi dan gerak

Bedakan tiga skenario:

1. Bootstrap dengan reduced motion: posisi home dan pose netral, tanpa trip.
2. Reduced motion diaktifkan setelah berjalan: posisi/heading aktual membeku,
   termasuk setelah poll berikutnya; tidak teleport ke sofa atau home.
3. Gerak diaktifkan lagi: tujuan valid, okupansi kursi unik, transisi aman;
   state bekerja/menunggu berubah segera pada DOM, lalu karakter kembali home.

Laporan harus memuat role, fase, arrival ID, posisi, heading, timestamp sebelum/
sesudah, dan jumlah respons API yang diamati. Jika polling atau handler media
memindahkan root, itu temuan integrasi produk, bukan alasan mengganti expected
position menjadi posisi baru. Source `main.js` masih memanggil allocator lama
ketika gate suasana ditutup; test harus mengungkap bila ini menimbulkan teleport.

Ukur sol dalam koordinat dunia menggunakan bounds sepatu setelah world matrix
diupdate. RootY atau koordinat lokal sepatu relatif terhadap hips tidak cukup.
Pisahkan kaki tumpu dan kaki ayun; kaki ayun boleh terangkat. Ambil beberapa fase
langkah dan belokan, catat minimum worldY, toleransi, serta screenshot/video.
Ukur kecepatan pada segmen lurus tanpa yield/docking, bukan dari konstanta source.

### 2. Percakapan dan bubble

Simpan screenshot saat bubble benar-benar terlihat, bukan hanya saat ada
kandidat ucapan di DOM. Ambil satu pasangan pembuka/balasan dengan dua nama,
conversation ID jika tersedia, zona/topik, timestamp muncul/hilang, dan jeda
balasan. Bedakan jadwal kandidat (4,8 / 2,3 / 4,2 detik) dari lama tampil aktual,
yang dapat dibatasi kuota atau visibilitas label.

Periksa maksimal dua bubble desktop dan satu mobile, prioritas pilihan/kerja,
serta ketersediaan rincian di panel. Catat penanda Suasana ilustratif pada jalur
yang benar-benar terlihat. Revisi bubble terbaru berasal dari kolega; jika
penanda atau bubble mobile hilang, laporkan perbedaan itu tanpa mengubah desain
atau mengasumsikan screenshot lama berlaku.

### 3. Panel dan aksesibilitas

Bubble memiliki `aria-hidden`; node tersembunyi yang masih menyimpan textContent
bukan bukti screen reader dapat membacanya. Pilih karakter, buka panel rincian,
dan buktikan teks kegiatan/ucapan yang sudah terjadi tersedia sebagai DOM
terbaca. Catat navigasi keyboard, tab aktif, label panel, serta accessibility
tree bila mengklaim aksesibilitas. Jangan membuat klaim WCAG penuh.

### 4. Gate dan regresi

Laporkan transisi bekerja, menunggu keputusan, gagal, stale, offline, hidden tab,
reduced motion, dan pemulihan. Balasan lama tidak boleh diputar ulang. Periksa
320, 390, 768, 1024, dan 1440 px: kartu/pill Nova, dock/tab mobile, wallpaper,
papan, fokus/reset, jam WIB, dan console. Tidak ada janji bebas kebocoran memori
atau performa smooth tanpa pengukuran yang sesuai.

## Format laporan berikutnya

Simpan di `docs/reports/2026-10-04-motion-test-alignment-qa.md` dengan:

- URL, source/build/hash, browser, viewport dan DPR yang diuji.
- Perintah, exit code, output lengkap, serta test yang belum mencapai eksekusi.
- Matriks PASS / FAIL / BELUM TERBUKTI; jangan menyebut semua lulus bila E2E gagal.
- Bukti posisi/sol, pasangan dialog, panel DOM dan screenshot bubble terlihat.
- Untuk setiap FAIL: expected/actual, role/fase/status, langkah reproduksi,
  screenshot/log, dan apakah sumbernya kontrak test atau aplikasi.

Jangan menimpa laporan 3 Oktober atau menyatakan deployment siap hanya dari
inspeksi source. Handoff ini belum merupakan bukti runtime; penerimaan tetap
menunggu hasil kolega dan review pemilik.
