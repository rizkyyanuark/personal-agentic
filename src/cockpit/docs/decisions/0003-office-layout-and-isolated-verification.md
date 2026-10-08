# ADR 0003: Enam workstation dan verifikasi build terisolasi

Status: diterima untuk implementasi T01 berdasarkan keputusan pemilik Q04/Q46.

## Keputusan

Tujuh role tetap mempunyai karakter, kartu, dan key ledger yang sama. Hanya enam
role selain HQ mempunyai workstation, dalam dua klaster masing-masing tiga meja.
HQ berdiri dekat papan; focus kartu HQ menuju anchor karakter itu.

`src/client/scene/office-layout.js` menjadi sumber koordinat untuk meja, karakter,
zona furniture, papan/jendela, dan acuan kamera. Konfigurasi tidak disalin ke
modul furniture atau karakter. Pose rinci dan alokasi sofa adalah slice T02
setelah review denah, bukan aktivitas runtime yang dibuat-buat.

Home/focus kamera dihitung dari bounds dan aspect stage agar resize tidak
memotong ruangan. Reset memulihkan position, target, serta state seleksi.

DPR dibatasi 1 sampai 2 dan diamati lewat media query resolusi native yang
dipasang ulang setiap perubahan, mengikuti [dokumentasi MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio).
Probe Chrome headless memperlihatkan bahwa emulasi DPR dapat mengubah nilai
native dan hasil media query tanpa mengirim event change atau resize. Karena
itu loop render yang sudah ada juga membandingkan DPR sebelum menggambar;
tidak ada timer atau loop render kedua. Resize memakai setDrawingBufferSize
sekali dan melewatkan alokasi buffer jika ukuran, aspect, dan DPR sudah sama.

## Batas verifikasi dan deployment

Layanan production 8095 menjalankan workspace/server.js dan membaca workspace/dist.
Menjalankan build ke dist akan memperbarui tampilan publik walaupun tidak ada
restart. Karena itu Vite menerima `OFFICE_BUILD_DIR` sebagai override outDir;
default production tetap dist. Verifikasi memakai direktori sementara yang
dibuat dengan mktemp, lalu layanan loopback terpisah melalui
`createApp({ distDirectory })`. Endpoint API menggunakan proyeksi ledger yang sama.

Contoh pemeriksaan memakai path sementara yang telah divalidasi:

```sh
OFFICE_BUILD_DIR=/tmp/ai-lab-cockpit-verify.6feBrs/dist npm run check
COCKPIT_URL=http://127.0.0.1:8096 npm run test:e2e
```

Override hanya untuk build lokal terisolasi. Jangan menggunakan path luas atau
direktori berisi data pengguna sebagai outDir karena Vite mengosongkan direktori
output. Direktori deployment, unit systemd, dan production tidak berubah sampai
pemilik mengotorisasi deployment. Tidak ada dependency atau field API baru.
