# Handoff: perbaikan posisi, rute terhalang, dan kedatangan

Tanggal: 4 Oktober 2026 (WIB).
Target QA: preview lokal, bukan produksi 8095.
Status: perubahan source disiapkan; belum diuji atau diterima.

Pemilik menyetujui tiga perbaikan dengan desain tetap. Pengujian tetap milik
kolega. Codex tidak menjalankan check, lint, format-check, unit, E2E, browser,
build, screenshot, atau benchmark. Formatting file yang diubah dan inspeksi
source dilakukan; keduanya tidak membuktikan hasil runtime.

Perintah formatting source/test dan handoff saja:

```bash
npx prettier --write src/client/main.js src/client/scene/character-activity.js tests/e2e/motion.mjs tests/unit/character-activity.test.mjs docs/reports/2026-10-04-motion-fixes-handoff.md
```

Exit code: 0. Ini bukan `format:check`, bukan test, dan bukan bukti PASS untuk
quality gate. Gate antislop/visual tetap belum diverifikasi sesuai pembagian
pengujian yang diminta pemilik.

## Perubahan yang perlu dibuktikan

- `src/client/main.js` tidak lagi memanggil allocator kursi pada gate tertutup.
  Bootstrap di `characters.js` tetap utuh.
- `character-activity.js` membekukan posisi/heading aktual dan mempertahankan
  fase, rute, serta progres akses fixture saat pause. Resume aman juga berlaku
  untuk karakter yang belum selesai masuk atau keluar kursi.
- Jalan bebas mempertahankan replan 2,2 detik. Hambatan 5 detik pada akses
  memicu rollback melalui checkpoint yang sudah dilewati, maksimal 1,6
  unit/detik. Rollback tidak menambah arrival ID.
- `recovering` tetap mengambil slot gerak. Jika tetap terhalang,
  `waiting-route` benar-benar diam dan netral; retry perlu mengambil slot
  kembali. Tujuan kosong dapat dilepas, tetapi reservasi akses fixture tetap
  dimiliki sampai keluar. Tidak ada jalur rollback teleport.
- Poll/reconciliation dengan `update(0)` tidak menghapus timer hambatan.
- Kedatangan mencapai waypoint persis melalui langkah normal dan collision
  check. Assertion posisi 1e-8 pada unit test tetap dipertahankan.
- Unit regresi mencakup akses parsial, hambatan, pause/resume, dan perubahan
  status. Helper browser menghitung `recovering` dalam batas dua perpindahan
  dekoratif; assertion lain tidak dilonggarkan.

Perubahan hanya menyentuh main/controller, test terkait, dan dokumentasi.
Kartu/pill, bubble, HUD/dock, name tag, wallpaper, papan, kamera, rig, API,
ledger, dependency, dan hasil desain kolega tidak diubah. Seed role tetap,
jadi urutan setelah refresh masih boleh berulang. Perubahan variasi sesi
memerlukan keputusan pemilik terpisah.

## Membaca laporan sebelumnya

Laporan `2026-10-04-motion-reset-stuck-qa.md` tetap disimpan sebagai riwayat.
Ada tiga hal yang harus diperjelas pada laporan uji ulang:

- Cuplikan RNG laporan bukan xorshift yang ada pada source saat ini; prinsip
  seed role stabil memang benar. Jangan memakai cuplikan itu sebagai bukti
  versi bundle yang diuji.
- Bagian reset mencatat 9,520 m, sementara matriks masih mencatat 8,17 m.
  Gunakan pasangan posisi/timestamp dari artefak mentah untuk angka final.
- `npm run check` berhenti ketika unit test gagal karena script memakai `&&`.
  Build hanya boleh disebut sukses bila ada perintah/output build terpisah.

Stuck permanen belum dibuktikan pada pengamatan 120 detik. Bedakan risiko
source, skenario unit adversarial, dan kegagalan runtime yang direproduksi.

## Arahan untuk kolega

Laksanakan setelah pemilik meminta. Jangan mengubah kode aplikasi/assertion,
menjalankan model/worker, membaca vault, memodifikasi ledger, atau restart/
deploy produksi. Temuan gagal dilaporkan, bukan disamarkan sebagai baseline.

### 1. Check dan build terisolasi

```bash
cd /home/ubuntu/infra-hub/ai-lab-cockpit
MOTION_QA_BUILD_DIR="$(mktemp -d /tmp/cockpit-motion-fixes-qa.XXXXXX)"
OFFICE_BUILD_DIR="$MOTION_QA_BUILD_DIR" npm run check
```

Catat direktori, output lengkap, jumlah test aktual dan exit code. Bila check
gagal sebelum build, jangan menyebut build lulus. Jangan mengganti preview
8099 dengan source yang gagal quality gate.

Jika check lulus, jalankan preview terpisah dari build hasil check, tanpa
mengganti folder build 8099 atau unit layanan yang sedang berjalan:

```bash
PORT=8100 OFFICE_BIND_HOST=127.0.0.1 OFFICE_DIST_DIR="$MOTION_QA_BUILD_DIR" node server.js
```

Pastikan 8100 kosong sebelum memulai; jika terpakai, pilih port loopback kosong
dan sesuaikan `COCKPIT_URL`. Jalankan server itu pada terminal terpisah dan
pertahankan variabel/path build yang sama. Setelah QA, hentikan hanya proses
preview yang baru dibuat, misalnya Ctrl+C pada terminalnya. Produksi dan
preview 8099 tetap utuh. Catat aset JS/CSS yang benar-benar diunduh browser
beserta SHA-256. Build lama 8099 bukan bukti source perbaikan ini.

### 2. Test browser dan regresi menyeluruh

```bash
cd /home/ubuntu/infra-hub/ai-lab-cockpit
COCKPIT_URL=http://127.0.0.1:8100 node tests/e2e/motion.mjs
COCKPIT_URL=http://127.0.0.1:8100 npm run test:e2e
```

Jalankan helper mandiri meskipun smoke berhenti lebih awal. Simpan exit code
dan output masing-masing. Artefak helper:
`artifacts/motion/desktop-1440-regression.json` serta screenshot berawalan
`artifacts/screenshots/desktop-1440-motion-`.

### 3. Bukti terarah

1. Reduced-motion bootstrap: lima home anchor, empat meja/HQ tanpa meja.
2. Setelah karakter berjalan: snapshot sebelum handler reduced motion,
   sesudah handler, sesudah poll dan setelah lebih dari 45 detik harus
   mempertahankan posisi/heading aktual. Ulangi saat akses kursi parsial.
3. Resume: rute/akses valid, tidak berpindah seketika ke sofa/home, tidak
   mengulang arrival ID hanya karena polling atau buka/tutup gate.
4. Hambatan: laporkan fase awal, blocker, waktu terhalang, rollback/wait,
   reservasi/okupansi, serta gerak sesudah jalan bebas. Moving rollback
   dihitung dalam batas dua; karakter `waiting-route` benar-benar diam.
   Kasus adversarial di unit menggunakan blocker fixture, bukan memindahkan
   root produksi atau memanggil controller browser untuk memalsukan hasil.
   Unit lima-siaga memeriksa batas gerak; fixture hambatan memakai blocker
   diam. Admission/fairness saat tiga karakter ingin bergerak bersamaan
   belum dibuktikan oleh fixture hambatan dan perlu pemeriksaan tambahan.
   Jika runtime tidak mereproduksi hambatan, tandai BELUM TERBUKTI.
5. Bekerja/menunggu keputusan di tengah akses atau recovery: DOM berubah
   segera; karakter kembali aman sebelum pose kerja. Gagal/stale/offline/
   hidden/reduced motion menghentikan suasana; polling tetap benar.
6. Kecepatan pada segmen lurus tanpa yield maksimal 1,6 unit/detik; sol
   world-space pada langkah/belokan, arah duduk, dan furniture clearance
   dibuktikan dengan beberapa sampel. RootY saja bukan bukti kaki.
7. Tidak ada regresi kartu/pill, dock/tiga tab mobile, bubble berpasangan,
   label ilustratif, name tag, wallpaper, papan, fokus/reset, atau console
   pada 320, 390, 768, 1024, dan 1440 px. Gunakan checklist
   `docs/visual-acceptance.md` dan bukti bubble/DOM pada handoff sebelumnya.

Suite seating/office-experience terpisah masih historis; jangan mengklaim
keduanya otomatis teruji oleh smoke. Refresh dengan seed stabil bukan FAIL
untuk slice ini, tetapi tidak boleh diklaim sudah menjadi variasi sesi baru.

## Laporan yang diminta

Simpan laporan baru di `docs/reports/2026-10-04-motion-fixes-qa.md`, tanpa
menimpa laporan investigasi atau handoff historis. Sertakan:

- Source/build/path/hash, URL, browser, viewport, DPR, serta waktu pengujian.
- Perintah, exit code, output mentah dan kasus yang tidak mencapai eksekusi.
- PASS / FAIL / BELUM TERBUKTI per skenario, dengan expected/actual.
- Posisi, heading, fase, arrival ID, state API dan timestamp sebelum/sesudah
  untuk temuan gerak; screenshot/video yang cocok dengan run tersebut.
- Bukti sol, bubble pembuka/balasan, kuota, provenance dan panel DOM.

Status acceptance masih menunggu QA kolega dan review pemilik. Handoff ini
bukan laporan PASS dan tidak memberikan izin deployment.
