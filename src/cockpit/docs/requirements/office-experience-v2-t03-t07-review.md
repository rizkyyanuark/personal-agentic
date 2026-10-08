# Review terpadu T03–T07

Status: implementasi ada di workspace dan preview terisolasi; T08 belum lulus seluruhnya, belum di-deploy.
Tanggal: 29 September 2026 (UTC).

## Hasil yang telah diperiksa

- `OFFICE_BUILD_DIR=/tmp/ai-lab-cockpit-v2.oUEcwm/dist npm run check`: PASS. ESLint, Prettier, 76 tes unit (termasuk batas proyeksi publik), dan production build lulus. Peringatan chunk JavaScript >500 kB masih ada; belum dijadikan klaim performa perangkat pengguna.
- `COCKPIT_URL=http://127.0.0.1:8098 node tests/e2e/office-experience.mjs`: PASS pada 320×760, 390×844, 768×1024, 1024×768, dan 1440×900. Suite ini memeriksa enam meja/tujuh identitas, waktu WIB, papan dari kontrak publik, pantry/jendela/pot/bookshelf, TV dan okupansi sofa, kamera/touch/keyboard, offline, reduced motion, serta fallback asset. Data terkontrol suite diberi label fixture dan tidak dianggap aktivitas live.
- API preview pada port loopback 8098 merespons HTTP 200 dengan proyeksi publik enam field tingkat atas. Tidak ada API field atau dependency baru dari T03–T07.
- Screenshot lima viewport dari suite khusus telah ditinjau. Pada 1024 px seluruh ruangan tampak dan rincian papan terbaca di panel bawah. Pada desktop 1440 px panel samping menutup sebagian pantry di sudut awal; ini masih perlu keputusan visual sebelum hasil disebut setara referensi.
- `git diff --check`: PASS. Build verifikasi memakai direktori `/tmp`, bukan `dist` production.

## Pemeriksaan standar yang belum lulus

`COCKPIT_URL=http://127.0.0.1:8098 COCKPIT_VIEWPORTS=desktop-1440 npm run test:e2e` melewati panel, navigasi keyboard, tujuh fokus role/reset, dan interaksi pointer. Pengujian berhenti pada `DPR 2: native buffer` karena `waitForFunction` mencapai batas 10 detik di Chrome headless ARM/SwiftShader. Diagnostik sesudah timeout menunjukkan `devicePixelRatio`, renderer, dan atribut kanvas semuanya 2, buffer 2880×1800 untuk viewport/CSS 1440×900, aspek kamera 1,6, serta konteks WebGL tidak lost. Kondisi tersebut adalah bukti render akhir, tetapi bukan PASS untuk assertion yang waktunya habis. DPR 1,5 sebelum dan sesudah resize telah terlewati. Jangan mengganti hasil tes ini dengan klaim green.

`npm run test:e2e` hanya menjalankan `tests/e2e/smoke.mjs`; suite T03–T07 di atas dijalankan terpisah dan dilaporkan terpisah. Browser headless ARM bukan benchmark Chrome Windows pada display scaling 150% yang diminta PRD.

## Batas produksi dan langkah lanjut

Layanan production tetap aktif dengan MainPID 1426768, tanpa restart atau deploy. Hash `dist/index.html` tetap `3bc28f7ef8e51753e66131c954332ac04e3e2519e7295b00316d952883905e95`. Template systemd dan unit terpasang punya drift konfigurasi yang sudah dicatat pada review T01; tidak diubah di sini.

Sebelum T08 ditutup: selesaikan diagnostik timeout DPR tanpa menghapus syarat assertion, tinjau komposisi desktop 1440 dengan panel terbuka, jalankan ulang cek yang relevan, dan lakukan benchmark perangkat Chrome Windows 150%. Deployment T09 memerlukan otorisasi pemilik secara terpisah.
