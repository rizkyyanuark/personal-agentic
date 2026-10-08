# ADR 0011: cadence gerak dan dialog kantor-agent

Tanggal: 3 Oktober 2026 (WIB).
Status: keputusan dikonfirmasi pemilik dan diterapkan lokal; penerimaan menunggu kolega.

## Konteks dan konfirmasi

Pemilik meminta bubble, kecepatan, jenis gerak dasar, dan pola percakapan
mendekati kantor-agent. Popup mengonfirmasi parameter rujukan, kegiatan dasar
dahulu, serta logika komentar saat tiba seperti referensi. Sequential-thinking
digunakan sebelum perubahan. Pengujian tetap diserahkan kepada kolega.

Rujukan MIT dikunci pada `ad92a7a473b3d0e769281d552cee74cbb4004a54`;
main yang diperiksa masih commit yang sama. Style berasal dari
`runtime/views/page.html:140`; gerak/dialog dari `runtime/public/assets/kantor.js`
pada fungsi `updateActor`, `walkPose`, `spotPose`, `lounge`, `arrive`, dan `chatter`.
Atribusi dipertahankan pada THIRD_PARTY_NOTICES.md. Runtime/transcript reader
dan vendor tree tidak disalin.

## Keputusan

Kecepatan jalan mengikuti 1,6 unit/detik dan heading memakai shortest-angle
interpolation dengan faktor 7 saat berjalan serta 4 ketika menyelaraskan arah
akhir. Gait dan pose ritmis diadaptasi ke IK serta panjang anggota badan lokal,
bukan menyalin rotasi rig yang berbeda. Clearance, akses kursi, reservasi,
yield, transisi duduk/berdiri, dan batas dua perpindahan dekoratif dipertahankan.
Jadwal tujuan 38 sampai 72 detik mengikuti dispatch; perjalanan yang terlambat
harus tetap memberi kesempatan berdiri/duduk sebelum keberangkatan berikutnya.
Kopi, sofa/TV-balapan, membaca, dan meeting dipoles; game/gitar, air, dan
peregangan belum dikerjakan.

Scheduler tetap memakai clock aplikasi dan seed stabil. Percobaan pertama
setelah 4 detik, berikutnya tiap 7 sampai 11,5 detik. Pembuka bertahan 4,8
detik; balasan dimulai 2,3 detik kemudian dan bertahan 4,2 detik. Pasangan
harus siaga, diam, dekat, dan satu zona. Ini sengaja lebih kontekstual daripada
CHAT global referensi. Komentar tunggal mengikuti peluang 55% saat kedatangan
fisik baru dengan lifetime 4,2 detik jika role tidak sedang berbicara.
Arrival ID lokal mencegah polling, bootstrap, atau resume memutar komentar lama.
Tidak ada model call, detail pekerjaan buatan, atau penulisan event ledger.

Waktu foreground untuk dialog/deadline memakai elapsed frame tanpa clamp
gerak. Gerak dibatasi delta 0,25 detik seperti referensi; hidden/resume dan
perubahan reduced motion mereset timestamp agar waktu tersembunyi tidak menjadi
utang animasi. Ini menjaga cadence saat frame rate turun tanpa menambah timer
atau render loop. Clamp di bawah 4 FPS tetap dapat memperlambat jarak berjalan.

Bubble menyalin ukuran dan style referensi, tetapi tetap memakai provenance
terlihat dan DOM textContent. Lebar 220px desktop/150px mobile, font relatif,
permukaan putih, border krem, tail, padding, dan shadow mendukung keterbacaan
ucapan serta membedakannya dari name tag role. Selected/work priority tetap;
balasan menang saat prioritas setara. Kuota dua/satu dan penghindaran HUD dapat
membatasi lifetime yang benar-benar terlihat. DOM mencatat ucapan yang telah
terjadi, termasuk komentar seorang karakter, tanpa live-region berulang.

Status/task dari API tidak berubah. Gate data segar, tab terlihat, reduced
motion, pembatalan peserta, dan lifecycle tetap membatasi suasana. Tidak ada
field publik baru, dependency, aset baru, perubahan backend, atau deployment.

## Bukti dan konsekuensi

Parameter awal santai diganti, bukan dianggap telah diuji. Handoff L2 serta
handoff L3 sampai L5 pertama tetap bukti historis, tidak ditimpa. Build lokal
dan pemeriksaan source tidak membuktikan grounding, tempo visual, pose, atau
placement. Check, unit test, e2e, browser, screenshot, console, dan benchmark
menunggu kolega; penerimaan serta deployment memerlukan review pemilik.
Detail build dan arahan pengujian tersimpan pada
[handoff revisi](../reports/2026-10-03-reference-motion-bubbles-handoff.md).
