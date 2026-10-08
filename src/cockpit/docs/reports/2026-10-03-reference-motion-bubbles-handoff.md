# Handoff revisi: bubble dan cadence kantor-agent

Tanggal: 3 Oktober 2026 (WIB).
Target: preview lokal http://127.0.0.1:8099, bukan produksi.
Status: implementasi lokal diterapkan dan preview dikompilasi; seluruh pengujian menunggu kolega.

## Keputusan pemilik

Popup mengonfirmasi parameter gerak/dialog rujukan dan kegiatan dasar dahulu.
Jawaban tentang komentar tunggal meminta logika referensi: peluang 55% saat
tiba, lifetime 4,2 detik, tidak menimpa ucapan aktif. Teks tetap sesuai tempat
dan Suasana ilustratif, bukan komunikasi agent AI. Game/gitar, air, dan
peregangan belum masuk revisi ini. Tidak ada perubahan denah, kartu/pill L1,
identitas role, kamera, backend, ledger, endpoint, dependency, atau aset baru.

Rujukan adalah commit MIT `ad92a7a473b3d0e769281d552cee74cbb4004a54`.
Main yang diperiksa masih commit tersebut. Bubble mengambil page.html:140–142,
178; motion dan cadence mengambil fungsi updateActor/spotPose/lounge/arrive/
chatter pada kantor.js. Atribusi ada di THIRD_PARTY_NOTICES.md.

| Parameter        | Nilai revisi                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Jalan            | 1,6 unit/detik; heading interpolation 7 berjalan / 4 penyelarasan akhir                  |
| Gait             | Fase setara 8 rad/detik saat jalan nominal, disesuaikan dengan IK lokal                  |
| Jadwal tujuan    | 38–72 detik dari dispatch; grace minimum 8 detik saat tiba setelah rute tertunda         |
| Percobaan dialog | Awal 4 detik, berikutnya tiap 7–11,5 detik                                               |
| Pembuka          | 4,8 detik                                                                                |
| Balasan          | Mulai 2,3 detik setelah pembuka; lifetime 4,2 detik                                      |
| Komentar tiba    | Peluang 55%; lifetime 4,2 detik; arrivalId lokal baru, bukan polling                     |
| Bubble           | Lebar maksimum 220px desktop / 150px sampai 820px; font setara 11,5px / 10,5px dalam rem |
| Permukaan        | Putih, border krem #eadfce, padding 6px 10px, radius 12px, tail dan shadow rujukan       |

Aturan pasangan tetap satu zona, diam, siaga, dan berjarak maksimal 2,5 unit.
Ini adaptasi kontekstual yang diminta pemilik, bukan CHAT global lintas ruang.
Jalur aman, reservasi, maksimal dua perpindahan dekoratif, transisi kursi, dan
gate data segar/visibility/reduced motion tetap. Perjalanan kembali bekerja
tidak tertahan kuota dekoratif. Tidak ada event/model call untuk obrolan.

Desktop dapat menampilkan pembuka dan balasan yang overlap. Mobile satu slot
normalnya berganti ke balasan saat dimulai, tetapi karakter terpilih dan kerja
tetap lebih prioritas. Occlusion/kuota dapat menyembunyikan ucapan; tidak ada
janji kedua bubble tampil penuh. Panel Tugas memuat ucapan yang telah terjadi,
termasuk komentar tunggal, tanpa live-region berulang atau feed palsu.

## Bukti implementasi dan batas pengiriman

`OFFICE_BUILD_DIR=/tmp/cockpit-test-dist npm run build`: exit 0. Vite 7.3.6
mengompilasi 44 modul. Peringatan chunk lebih dari 500 kB tetap ada; JavaScript
947,10 kB belum menjadi bukti performa atau regresi runtime.

Preview 8099 yang sudah berjalan memakai `/tmp/cockpit-test-dist`; tidak
direstart. Build lama disalin ke
`/tmp/cockpit-reference-revision-backup.63HqTu/cockpit-test-dist` sebelum
artefak preview diganti. Respons HTTP/browser untuk build baru belum diperiksa.

| Artefak            | SHA-256                                                          |
| ------------------ | ---------------------------------------------------------------- |
| index.html         | fa61a7fd27e9f2861bcdc7d0e2ea5e3d99c335a9101ccd48b4e0f5ec212a6a43 |
| index-BI_SDMpZ.js  | 778e8072daa2c2986ec268d3795eed6278916fc3adcad90def02a57627e46d22 |
| index-GVQea0lM.css | 29458704eac4b3bb6d8e14a4ddfb4f8e4d08cb65ff9b2d752d97ada965ceada2 |

Perubahan source: `main.js`, `scene/character-activity.js`,
`scene/character-pose.js`, `ui/ambient-dialogue.js`, `ui/bubble-coordinator.js`,
`ui/hud.js`, dan bagian coordinated-bubble pada `styles/main.css`.
Waktu foreground untuk dialog/deadline dipisahkan dari delta gerak maksimum
0,25 detik. Visibility/pageshow/reduced-motion mereset timestamp frame;
tidak ada utang waktu hidden tab yang memutar dialog lama. Pada frame di bawah
4 FPS, clamp gerak masih membatasi jarak seperti referensi. Timing aktual dan
hasil pose tetap perlu diperiksa, bukan dijamin oleh parameter source.

Codex tidak menjalankan `npm run check`, lint, format-check, `npm test`, e2e,
browser, screenshot, console, atau benchmark, sesuai instruksi pemilik.
Formatting dan kompilasi adalah langkah implementasi, bukan bukti kelayakan.
Tidak ada assertion/rule yang dihapus atau dilonggarkan. Blocker QA historis
tidak dinyatakan hilang.

Handoff L2 dan handoff L3 sampai L5 pertama tetap utuh sebagai riwayat build
sebelumnya. Angka cadence santai di handoff lama bukan target revisi terbaru.
SHA-256 L2 tetap `7bf2b662a9dc79f25fbdfc63a4298d4f1c60b01401054ebb2814724834203c34`;
handoff L3 sampai L5 pertama tetap `89d0788f96601c62aed38052a9d22f6e2e18155d656a16570afc582c00185542`.
Tidak ada restart, commit, deployment, atau perubahan produksi.

Gate antislop belum diterima: alasan visual, provenance, scope, dan boundaries
tercatat di source/ADR 0011; layout, kontras aktual, keyboard, zoom, motion,
dan interaksi masih menunggu bukti kolega. Tidak ada klaim AA atau smooth/FPS.

## Arahan pengujian untuk kolega

Jalankan hanya ketika pemilik meminta. Jangan mengubah kode produk untuk
mendapatkan hasil hijau, menjalankan worker/training, membaca vault/payload,
memodifikasi ledger, atau menyentuh layanan produksi. Fixture hanya intersepsi
`/api/state` di browser, jelas dibedakan dari snapshot live. Catat JS/CSS yang
benar-benar disajikan dan gunakan hard refresh sebelum membandingkan visual.

Perintah yang harus dicatat beserta exit code dan ringkasan output:

```bash
OFFICE_BUILD_DIR="$(mktemp -d /tmp/cockpit-reference-qa.XXXXXX)" npm run check
COCKPIT_URL=http://127.0.0.1:8099 npm run test:e2e
```

1. Periksa 320, 390, 768, 1024, dan 1440 px; panel terbuka/dock, desktop
   tersembunyi, resize, zoom teks 200%, dan fokus kartu/tubuh/tag. Kartu/pill,
   papan, wallpaper, kamera, dan layout hasil pemilik tidak boleh regresi.
2. Gunakan fixture valid lima role siaga dengan `queue.stale=0`. Amati
   beberapa perjalanan. Ukur jarak/waktu di segmen lurus tanpa yield untuk
   kecepatan 1,6; pisahkan docking/putaran/yield dari jalan nominal. Periksa
   langkah, sol di lantai, panjang kaki, arah badan, transisi, clearance, dan
   reservasi. Catat aktivitas/fase/arrivalId dari `window.__characters`.
3. Periksa pose kopi: reach awal 2,5 detik, lalu sip 1,8 detik per 6 detik;
   membaca, meeting, dan sofa punya gerak kecil rujukan. Mug/buku tidak
   melayang, tangan tidak putus atau menembus badan, dan tidak ada game/gitar.
   Sofa terisi memicu TV balapan; kosong kembali katalog.
4. Catat jadwal dialog: attempt awal 4 detik, cadence 7–11,5 detik saat gate
   terbuka, pembuka 4,8 detik, balasan setelah 2,3 detik selama 4,2 detik.
   Attempt tidak menjamin dialog bila peserta tidak cocok atau sedang bicara.
   Teks lounge tentang sofa/balapan, pantry kopi, rak membaca, meeting santai;
   pasangan jawaban harus nyambung dan label Suasana ilustratif terlihat.
5. Komentar hanya pada arrivalId baru, tidak setiap polling/frame/resume.
   Peluang 55% bukan janji setiap kedatangan berbicara; gunakan seed/arrival
   yang cukup atau laporkan cakupan belum tercapai. Lifetime 4,2 detik dan
   peserta yang sudah berbicara tidak ditimpa. Tidak ada komentar bootstrap.
6. Batas total dua bubble desktop/satu mobile berlaku pada campuran kerja,
   riwayat, dan dialog. Pada prioritas setara mobile beralih ke balasan;
   pilihan/work dapat menundanya. Periksa penempatan, tail, HUD/tag/body,
   safe area dan clipping. Kalimat terpilih tetap ada di DOM bila tersembunyi.
7. Ubah peserta ke bekerja/menunggu/gagal, pindah zona, stale/error/offline,
   hidden tab, reduced motion, lalu resume valid. Balasan dan komentar lama
   dibatalkan, tidak diputar ulang; status API tetap diperbarui. Kerja tidak
   diberi rincian rekaan. Status DOM langsung berubah sebelum pose kembali.
8. Pastikan API tidak menambah arrivalId/activity/dialogue; feed tetap event
   publik nyata. Amati request jaringan, console error, BFCache/disposal,
   performa navigasi, dan kartu/panel tidak dirender ulang saat isi sama.

Laporan harus menyebut bundle/hash, command + exit, fixture vs live, viewport,
screenshot, timestamp/role/fase pada temuan, expected vs actual, severity,
console/network, serta hal yang belum tercakup. Pisahkan defect dari belum
terverifikasi. Jangan menyatakan lulus penuh bila kegiatan belum terlihat.
