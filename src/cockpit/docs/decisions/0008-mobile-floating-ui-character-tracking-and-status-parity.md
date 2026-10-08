# ADR 0008: HUD kantor-agent, fokus karakter, dan arti tampilan publik

- Status: Accepted untuk keputusan preferensi; penerimaan implementasi terpisah.
- Tanggal catatan awal: 2026-10-02.
- Pembaruan dan konfirmasi: 2026-10-03.
- Pembuat keputusan: pemilik proyek melalui jawaban percakapan dan popup.

## Konteks dan sumber konfirmasi

WORK_LOG kolega mencatat hasil UI dan scene yang lebih dekat dengan
[kantor-agent commit ad92a7a](https://github.com/humaedihume/kantor-agent/tree/ad92a7a473b3d0e769281d552cee74cbb4004a54).
Pemilik menyatakan hasil kolaborasi sesuai preferensinya dan meminta dokumen
diselaraskan. Jawaban teks "semua" mengonfirmasi opsi 2 untuk tiga pertanyaan:
nama Uji QA dengan keterangan sumber, Istirahat/teks dekoratif dengan penanda,
serta reset tanpa tombol terlihat. Tiga jawaban popup lanjutan menetapkan
Rencana Belum tersedia, satu sticky agregat, dan label metrik yang sesuai sumber.

Enam jawaban popup berikutnya menetapkan reflow pill, dialog lokal, fallback
bubble kerja, subteks aktivitas visual, kuota bubble, dan kegiatan dasar sebelum
game/gitar. Keputusan subteks ini mengganti pilihan narasi generik sebelumnya;
rencana implementasinya berada pada bagian 11 kebutuhan v3 dan belum dieksekusi.

Keputusan ini memperbarui kebutuhan v3, PRD, DESIGN, arsitektur, dan checklist.
Status Accepted tidak membuktikan keberhasilan migrasi Hermes, QA model,
kepatuhan aksesibilitas, atau deployment.

## Keputusan

### Papan empat kolom dan ringkasan agregat

Urutan kolom ialah Rencana, Dikerjakan, Uji QA, Selesai. Dikerjakan membaca
`queue.running`, Uji QA membaca `queue.waiting_approval`, dan Selesai membaca
`totals.completed`. Nama Uji QA dipertahankan dengan keterangan terlihat
"Antrean persetujuan pemilik; bukan hasil QA". Angka itu tidak membuktikan
pengujian berlangsung, validasi lulus, atau gerbang host sudah tersedia.

Rencana belum memiliki sumber planning dan bertanda Belum tersedia, termasuk
ketika `queue.queued` positif. Kolom tanpa sumber atau dengan nol nyata tetap
bersih. Kolom bersumber dengan jumlah positif menampilkan satu sticky ringkasan
jumlah/status. Tidak ada ID QA-01/RUN-01, judul buatan, atau sticky individual
hasil rekaan. Waktu pembaruan hanya memakai timestamp sinkron nyata; keadaan
belum tersinkron tidak memakai waktu contoh.

### Status dan suasana

State API tetap `siaga`, `bekerja`, `menunggu_persetujuan`, dan `gagal`. Label
UI-nya ialah Istirahat, Bekerja, Menunggu keputusan, dan Gagal. Istirahat berarti
role tanpa tugas aktif, bukan jadwal istirahat nyata. Konfirmasi awal
mempertahankan teks generik Santai di lounge dan Memantau aktivitas lab.
Klarifikasi lanjutan menggantinya: subteks kini mengikuti aktivitas visual lokal
karakter saat ini, misalnya Menikmati kopi atau Membaca, tetap berlabel Suasana
ilustratif. Aktivitas scene bukan pekerjaan agent nyata dan tidak masuk ledger.

Dot status mengikuti state, dengan abu-abu untuk siaga, hijau untuk bekerja,
amber untuk menunggu keputusan, dan merah untuk gagal. Narasi suasana tidak
menggantikan status API. Data tidak segar dan reduced motion tetap menghentikan
gerak non-esensial sesuai kebutuhan v3.

### Bubble dan urutan kegiatan

Dialog dibuat lokal, bergantian antar-karakter berdekatan, sesuai kegiatan
visual, dan berlabel Suasana ilustratif; tidak memanggil model. Bubble kerja
memakai informasi tugas publik yang informatif bila tersedia. API sekarang
hanya menyediakan teks status generik, sehingga fallback-nya Bekerja dan uraian
role statis berlabel Deskripsi peran. Event lama bukan pekerjaan aktif, dan
fitur ini tidak membuka goal/payload atau menambah field API.

Semua jenis bubble berbagi kuota maksimal dua desktop/satu ponsel, dengan
prioritas karakter terpilih atau status kerja. Name tag dan pill kartu tidak
dihitung. Bubble tidak keluar area terbaca atau menutup HUD/label, sementara
rincian tetap tersedia dalam DOM. Perubahan state/koneksi membersihkan bubble
dan balasan tertunda; reduced motion menghentikan dialog berulang, bukan polling.

Berjalan, sofa/TV-balapan, kopi, membaca, dan interaksi meeting dikerjakan lebih
dulu. Game/gitar menyusul setelah gerak serta pose dasar stabil. Seluruh kegiatan
tetap dekoratif, tunduk pada freshness, dan tidak membuktikan aktivitas kerja.

### Kamera dan akses reset

Kartu Nova, Atlas, Lyra, dan Axiom tetap menuju meja asal; kartu Orion menuju
tengah ruang. Klik meja menuju workstation. Klik tubuh atau name tag menuju
karakter dan meneruskan pelacakan. Pola lokal memakai offset `(2.2, 2.6, 4.4)`
dan pelacakan `lerp 0.05`; orbit/pan melepaskannya. Transisi fokus memakai 1,2
detik cubic ease-out, dipersingkat pada reduced motion.

Pemilik memilih tanpa tombol reset terlihat. Jalur reset ialah klik ulang
pilihan aktif, double-click canvas, atau Escape. Panel ponsel terbuka menangani
Escape terlebih dahulu untuk menciutkan panel. Reset memulihkan kamera,
selection, dan fokus tab Orion. Penemuan gestur serta kesetaraan sentuh tanpa
tombol adalah keterbatasan yang diterima untuk pola ini dan perlu dicatat dalam
hasil pengujian; tidak ada klaim akses DOM setara atau WCAG penuh.

### HUD, waktu, dan detail meja

Desain terbaru kolega tetap menjadi acuan: krem hangat, warna role, nameplate
akrilik, name tag kapsul interaktif, dan kartu dengan nama utuh. Jabatan boleh
disembunyikan ketika ruang sempit dan tetap tersedia dalam DOM. Sticky monitor
tiga lembar pastel kosong hanya dipakai Atlas dan Lyra; Nova dan Axiom bersih.
Wallpaper memakai gradien diagonal warna role ke krem `#f3eee6`.

Pill status tetap satu baris bersama nama bila muat, lalu turun baris ketika
kartu sempit. Nama/status utuh dan tinggi kartu adaptif, tanpa clipping atau
ellipsis status. Pemilik melaporkan overflow pada kode saat ini; keputusan ini
adalah kebutuhan perbaikan, bukan klaim bahwa masalah tersebut sudah diselesaikan.

Desktop memiliki panel Aktivitas kiri dan tab Riwayat/`Tugas <Nama>` di kanan.
Layar sempit memindahkan Aktivitas ke tab ketiga pada drawer sekitar 38vh yang
bisa diciutkan menjadi dock. Header ponsel tidak memiliki toggle utama. Tombol
chevron drawer tetap tersedia dengan target 44 x 44 CSS pixel. Rasio metrik
ponsel `1.45fr 1fr 1fr` tetap menjadi arah layout untuk menjaga ruang waktu Live.

Live memakai waktu snapshot tersinkron berformat WIB `HH:mm:ss`; Riwayat/feed
memakai `HH.mm`. Jam WIB memakai jam perangkat yang diformat Asia/Jakarta dan
tidak membuktikan koneksi API masih segar.

Layout metrik tetap dipertahankan dengan label Proporsi tugas selesai untuk
`100 * totals.completed / totals.tasks` saat total positif dan snapshot segar,
Total tugas untuk `totals.tasks`, serta Jam WIB untuk jam perangkat. Token
bertanda Belum tersedia. Loading/gagal/offline atau data usang tidak berubah
menjadi nol, termasuk badge tab; proporsi dengan total nol juga Belum tersedia.
Proporsi ini bukan roadmap, progres training, atau ukuran produktivitas.

## Bukti dan pekerjaan lanjutan

WORK_LOG memuat laporan kolega tentang 84 unit test dan smoke pada lima viewport
di preview port 8099. Hasil tersebut tetap diatribusikan ke kolega dan build/
tanggal yang dicatat; penyelarasan dokumen ini tidak menjalankan ulang tes.
Ukuran target 44 x 44 dan smoke PASS tidak membuktikan kepatuhan WCAG penuh.

Koreksi Rencana, timestamp, sticky agregat, keterangan Uji QA, metrik, dan penanda
teks dekoratif masih perlu diterapkan serta diperiksa terhadap kebutuhan terbaru.
Reflow pill, controller kegiatan dasar, subteks visual, dialog, fallback kerja,
dan kuota/penempatan bubble juga belum diterapkan dalam pembaruan dokumentasi.
Pemilik menetapkan kode hasil kolaborasi tetap utuh; koreksi tersebut dicatat
sebagai belum diterapkan, bukan instruksi perubahan kode dalam langkah ini.
Pembaruan ini hanya Markdown. Ia tidak mengubah kontrak publik, menjalankan
worker, memberi approval, atau mengizinkan restart/deployment produksi.
