# T01: Review denah kantor

Status: draf denah di workspace; verifikasi browser parsial, belum siap untuk deployment.
Tanggal pembaruan: 29 September 2026 (UTC).
Scope: denah dan navigasi pertama, bukan penyelesaian seluruh office experience v2.

## Hasil tahap ini

Enam workstation ditempatkan dalam dua klaster, masing-masing tiga meja. Tujuh
karakter dan kartu role tetap tersedia. HQ berdiri dekat papan tanpa meja;
fokus kartu HQ menuju anchor karakter, bukan workstation semu.

Meeting berada di kiri, lounge di depan dan menghadap TV, pantry di kanan
belakang. Bookshelf mengikuti dinding kiri. Tiga pot utama berada di kiri sofa,
kanan depan, dan samping bookshelf. Jendela dipindahkan ke kanan papan.

Alasannya: komposisi mengikuti keputusan Q01/Q04/Q09/Q46 dan menyisakan ruang
antar-klaster agar workstation tidak saling menutup. Bentuk furniture yang ada
dipakai kembali; detail model bukan scope review denah ini.

## Anchor kanonis

Koordinat menggunakan sumbu ruang Three.js, bukan piksel gambar. Sumber tunggal
berada di `src/client/scene/office-layout.js`.

| Zona             | Anchor x / z                         | Peran                                    |
| ---------------- | ------------------------------------ | ---------------------------------------- |
| Klaster belakang | -3.2 / -4.8; -0.2 / -4.8; 2.8 / -4.8 | DE, DS, RS                               |
| Klaster depan    | -3.2 / -1.4; -0.2 / -1.4; 2.8 / -1.4 | MLE, MV, OPS                             |
| HQ               | -5.7 / -6.0                          | Berdiri dekat papan                      |
| Papan            | -2.4 / -7.34                         | Isi papan masih baseline; T07 berikutnya |
| Meeting          | -6.8 / 0.3                           | Kiri workstation                         |
| Lounge / TV      | 3.3 / 4.3; 3.3 / 1.95                | Sofa menghadap TV                        |
| Pantry           | 7.2 / -6.76                          | Counter di kanan belakang                |
| Bookshelf        | -9.08 / 3.5                          | Dinding kiri                             |
| Pot              | 1.5 / 4.35; 7.8 / 4.8; -8.35 / 5.35  | Kiri sofa, kanan depan, bookshelf        |

Audit bounds memakai transform node GLB, bukan hanya accessor vertex. Offset
model sofa, kursi, dan bookshelf dipertahankan karena file mempunyai origin
berpusat. Jarak antar-klaster menyisakan sekitar 1.66 unit ruang setelah footprint
meja/kursi. Bagian belakang counter mempunyai celah sekitar 0.045 unit dari trim
dinding; dispenser berada di luar footprint kabinet.

Kamera home dan tujuh focus dihitung dari bounds serta aspect stage. Resize
mempertahankan preset aktif; Sudut awal dan Escape membersihkan selection dan
memulihkan posisi serta target. Pada stage sempit, label overview disembunyikan
agar scene tidak tertutup; fokus menampilkan jabatan role terpilih. DOM tetap
menyediakan nama role dan status lengkap.

## Bukti pemeriksaan

Build tidak ditulis ke dist production. Layanan verifikasi terpisah memakai
loopback port 8096 dan proyeksi ledger aktual, bukan aktivitas fixture.

```sh
OFFICE_BUILD_DIR=/tmp/ai-lab-cockpit-verify.6feBrs/dist npm run check
COCKPIT_URL=http://127.0.0.1:8096 npm run test:e2e
```

- `npm run check`: PASS. ESLint, Prettier, 12 tes unit/integrasi, dan Vite build lulus.
- `npm run test:e2e`: percobaan terbaru TERHENTI dengan exit 143 sebelum lima
  viewport selesai. Desktop 1440 lulus seluruh assertion, termasuk DPR dan HQ
  stability. Mobile 320 lulus panel/tab; capture home dan focus HQ/DE tersedia,
  tetapi seluruh assertion viewport belum selesai. Mobile 390, tablet 768,
  dan desktop 1024 belum diverifikasi ulang pada build terakhir.
- Console/request errors: tidak ada pada desktop 1440 yang selesai; viewport
  lain belum dapat dinyatakan bersih seluruhnya.
- Screenshot terbaru yang ditinjau: desktop 1440 home, focus HQ/DE, dan mobile
  320 home. Tiga screenshot ukuran lain masih berasal dari percobaan sebelumnya.

Tes unit mencakup enam meja versus tujuh role, dua klaster, seluruh focus,
bounds kamera pada aspect 0.65 sampai 3, dan anchor karakter yang deterministik
pada lima status termasuk offline, dengan dan tanpa reduced motion. Tes batas
publik tetap membuktikan sanitasi ledger dan kegagalan proyeksi yang fail-closed.
Empat tes tambahan membuktikan clamp DPR, rearming observer pada resolusi native,
pelepasan listener lama, dan cleanup tanpa listener yang menumpuk.

Matriks browser memeriksa posisi scene aktual, tujuh kartu, seluruh focus/reset,
Enter/Space, Escape, pointer/touch, panel hide/show, shortcut H, minimize/restore,
dan tab antrean/informasi dengan arrow/Home/End. Pemeriksaan juga mengukur buffer
kanvas terhadap CSS pada DPR 1/1.5/2, sebelum serta setelah resize, dan memeriksa
teks tombol panel agar tidak keluar dari bounds tombol.

Probe terpisah membuktikan bug DPR-only: pada viewport 390 x 844 yang tidak
berubah, native DPR berubah ke 1.5 tetapi buffer tetap DPR 1. Media query ikut
berubah tanpa event change atau resize pada Chrome headless. Perbaikan menambah
observer native dan pemeriksaan pada loop render yang sudah ada; buffer diubah
sekali lewat setDrawingBufferSize. Assertion browser tetap memakai timeout
10 detik dan sekarang juga mengharuskan viewport aktual sama dengan viewport
yang diminta, agar ukuran lama tidak dianggap lulus.

Uji DPR-only setelah perbaikan: PASS pada viewport 390 x 844 tanpa event resize.
Host scene tetap 370 x 422 CSS pixel; buffer mengikuti 555 x 633 pada DPR 1.5,
740 x 844 pada DPR 2, dan kembali 370 x 422 pada DPR 1. Renderer, diagnostic
dataset, serta rasio native sama; context WebGL tidak lost. Ini bukti regresi
terarah, bukan pengganti matriks browser lengkap atau benchmark GPU pengguna.

Capture home yang harus ditinjau:

1. `artifacts/screenshots/mobile-320.png`
2. `artifacts/screenshots/mobile-390.png`
3. `artifacts/screenshots/tablet-768.png`
4. `artifacts/screenshots/desktop-1024.png`
5. `artifacts/screenshots/desktop-1440.png`

Capture review scene: `artifacts/screenshots/desktop-1440-scene.png`.
Capture tambahan mencakup HQ/DE pada seluruh viewport, tujuh focus desktop,
focus animasi, dan DPR setelah resize. Nama Nova/Orion belum dimigrasikan pada
T01; nama file masih memakai key ledger kanonis.

## Delivery Gate antislop

MENUNGGU: laporan empat blok akan diselesaikan oleh agent utama setelah capture,
click-through, dan seluruh assertion browser final berhasil. Gate ini hanya
mencakup perubahan T01, bukan sertifikasi seluruh asset baseline atau T02-T10.
Hasil parsial tidak dinyatakan sebagai delivery yang selesai.

## Production dan batas data

Tidak ada restart, deployment, perubahan unit systemd, dependency baru, field
API baru, ataupun write ke ledger. Data yang diperiksa dari API tetap memiliki
enam field tingkat atas: connection, now, totals, queue, agents, feed.

Production tetap memakai MainPID 1426768, aktif sejak 18:30:41 UTC. Hash
dist/index.html sebelum dan setelah isolated check sama:
`3bc28f7ef8e51753e66131c954332ac04e3e2519e7295b00316d952883905e95`.

Audit template menemukan drift yang sudah ada antara
`deploy/systemd/ai-lab-office.service` dan unit terpasang. ExecStart,
WorkingDirectory, Restart, RestartSec, dan PORT sama. Unit terpasang belum
memuat NODE_ENV, OFFICE_BIND_HOST, NoNewPrivileges, PrivateTmp, ProtectSystem,
ProtectHome, dan ReadOnlyPaths dari template. Drift dicatat, tidak diperbaiki
atau dijadikan alasan untuk me-restart production pada T01.

## Batas hasil dan langkah berikutnya

- Pose anggota tubuh kursi/sofa dan alokasi seat belum diperbaiki; itu T02.
- Nama Orion/Nova/Atlas/Lyra/Axiom/Vega/Echo, dekor enam meja, jam WIB, monitor
  per-role, papan empat kolom berdata, TV occupancy, dan detail pantry berikutnya
  belum dinyatakan selesai.
- Status karakter tidak lagi dipadatkan menjadi siaga. Timer jalan acak dan
  percakapan dekoratif dihapus; penempatan tetap deterministik sesuai Q27.
- Reduced motion mempertahankan penempatan karakter, bukan menghilangkan pose.
- Verifikasi memakai Chrome headless Linux ARM dengan software rendering.
  Ini bukan benchmark GPU Chrome Windows scaling 150% yang dipilih pada Q43.
- Vite masih melaporkan bundle sekitar 865 kB minified. Tidak ada klaim perbaikan
  FPS, GPU memory, atau waktu startup dari hasil ini.
- Tool sequential-thinking tidak callable dalam sesi ini. Urutan kerja mengikuti
  task T01-T10 pada PRD, tanpa mengklaim penggunaan tool tersebut.
- Restart/deploy production membutuhkan persetujuan pemilik terpisah.

Gate berikutnya: pemilik meninjau dan menyetujui denah ini sebelum T02 dimulai.
